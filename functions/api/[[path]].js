import {
  json, err, requireAuth, verifyPassword, createSession,
  destroySession, sessionCookie, clearCookie,
  slugify, validateSlug, buildLoadstring, buildPublicUrl,
  getBaseUrl, getSession,
} from '../_lib/core.js';
import { obfuscate } from '../_lib/obfuscator.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const parts = path.split('/').filter(Boolean);
  const method = request.method;

  try {
    // ─── POST /api/auth/login ───────────────────────────────
    if (method === 'POST' && parts[0] === 'auth' && parts[1] === 'login') {
      const body = await request.json().catch(() => ({}));
      const { username, password } = body;
      if (!username || !password) return err('Username and password required.');

      const user = await env.DB.prepare(
        'SELECT id, password_hash FROM users WHERE username = ?'
      ).bind(username).first();
      if (!user) return err('Invalid credentials.', 401);

      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) return err('Invalid credentials.', 401);

      const token = await createSession(env, user.id);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': sessionCookie(token),
        },
      });
    }

    // ─── POST /api/auth/logout ──────────────────────────────
    if (method === 'POST' && parts[0] === 'auth' && parts[1] === 'logout') {
      await destroySession(env, request);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': clearCookie(),
        },
      });
    }

    // ─── GET /api/auth/me ───────────────────────────────────
    if (method === 'GET' && parts[0] === 'auth' && parts[1] === 'me') {
      const session = await getSession(env, request);
      if (!session) return err('Not authenticated.', 401);
      const user = await env.DB.prepare(
        'SELECT id, username FROM users WHERE id = ?'
      ).bind(session.userId).first();
      return json({ user });
    }

    // ─── Everything below requires auth ─────────────────────
    const auth = await requireAuth(env, request);
    if (auth.error) return auth.error;
    const userId = auth.session.userId;

    // ─── GET /api/dashboard ─────────────────────────────────
    if (method === 'GET' && parts[0] === 'dashboard') {
      const totalScripts = await env.DB.prepare(
        'SELECT COUNT(*) as n FROM scripts WHERE owner_id = ?'
      ).bind(userId).first();

      const totalRequests = await env.DB.prepare(`
        SELECT COALESCE(SUM(s.request_count), 0) as n
        FROM daily_request_stats s
        JOIN scripts sc ON sc.id = s.script_id
        WHERE sc.owner_id = ?
      `).bind(userId).first();

      const today = new Date().toISOString().slice(0, 10);
      const requestsToday = await env.DB.prepare(`
        SELECT COALESCE(SUM(s.request_count), 0) as n
        FROM daily_request_stats s
        JOIN scripts sc ON sc.id = s.script_id
        WHERE sc.owner_id = ? AND s.date = ?
      `).bind(userId, today).first();

      const recent = await env.DB.prepare(`
        SELECT sc.id, sc.name, sc.slug, sc.enabled,
               (SELECT v.version FROM script_versions v WHERE v.id = sc.current_version_id) as version,
               (SELECT COALESCE(SUM(s.request_count), 0) FROM daily_request_stats s WHERE s.script_id = sc.id) as requests
        FROM scripts sc
        WHERE sc.owner_id = ?
        ORDER BY sc.updated_at DESC
        LIMIT 10
      `).bind(userId).all();

      return json({
        totalScripts: totalScripts.n,
        totalRequests: totalRequests.n,
        requestsToday: requestsToday.n,
        recentScripts: recent.results,
      });
    }

    // ─── GET /api/scripts   &   POST /api/scripts ───────────
    if (parts[0] === 'scripts' && parts.length === 1) {
      if (method === 'GET') {
        const rows = await env.DB.prepare(`
          SELECT sc.id, sc.name, sc.slug, sc.description, sc.enabled, sc.created_at, sc.updated_at,
                 (SELECT v.version FROM script_versions v WHERE v.id = sc.current_version_id) as version,
                 (SELECT COALESCE(SUM(s.request_count), 0) FROM daily_request_stats s WHERE s.script_id = sc.id) as requests
          FROM scripts sc
          WHERE sc.owner_id = ?
          ORDER BY sc.updated_at DESC
        `).bind(userId).all();
        return json({ scripts: rows.results });
      }
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const name = String(body.name || '').trim();
        const slug = String(body.slug || '').trim();
        const description = String(body.description || '').trim();

        if (!name) return err('Name is required.');
        const slugErr = validateSlug(slug);
        if (slugErr) return err(slugErr);

        const existing = await env.DB.prepare('SELECT id FROM scripts WHERE slug = ?').bind(slug).first();
        if (existing) return err('That slug is already taken.');

        const id = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO scripts (id, owner_id, name, slug, description) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, userId, name, slug, description).run();

        return json({ id, name, slug, description });
      }
    }

    // ─── Routes for /api/scripts/:id/* ──────────────────────
    if (parts[0] === 'scripts' && parts.length >= 2) {
      const scriptId = parts[1];
      const script = await env.DB.prepare(
        'SELECT id, owner_id, name, slug, description, enabled, current_version_id FROM scripts WHERE id = ?'
      ).bind(scriptId).first();

      if (!script) return err('Script not found.', 404);
      if (script.owner_id !== userId) return err('Forbidden.', 403);

      // GET /api/scripts/:id
      if (method === 'GET' && parts.length === 2) {
        let currentVersion = null;
        if (script.current_version_id) {
          currentVersion = await env.DB.prepare(
            'SELECT id, version, release_notes, created_at FROM script_versions WHERE id = ?'
          ).bind(script.current_version_id).first();
        }
        const base = getBaseUrl(request, env);
        return json({
          ...script,
          currentVersion,
          publicUrl: buildPublicUrl(base, script.slug),
          loadstring: buildLoadstring(base, script.slug),
        });
      }

      // DELETE /api/scripts/:id
      if (method === 'DELETE' && parts.length === 2) {
        await env.DB.prepare('DELETE FROM scripts WHERE id = ?').bind(scriptId).run();
        return json({ ok: true });
      }

      // GET /api/scripts/:id/versions
      if (method === 'GET' && parts[2] === 'versions' && parts.length === 3) {
        const versions = await env.DB.prepare(`
          SELECT v.id, v.version, v.release_notes, v.created_at, v.bytes_in, v.bytes_out,
                 (SELECT COALESCE(SUM(s.request_count), 0) FROM daily_request_stats s WHERE s.script_id = v.script_id) as requests
          FROM script_versions v
          WHERE v.script_id = ?
          ORDER BY v.created_at DESC
        `).bind(scriptId).all();
        return json({ versions: versions.results, currentVersionId: script.current_version_id });
      }

      // GET /api/scripts/:id/versions/:version  → return source
      if (method === 'GET' && parts[2] === 'versions' && parts.length === 4) {
        const v = await env.DB.prepare(
          'SELECT id, version, source_code, release_notes, created_at FROM script_versions WHERE script_id = ? AND version = ?'
        ).bind(scriptId, parts[3]).first();
        if (!v) return err('Version not found.', 404);
        return json(v);
      }

      // POST /api/scripts/:id/publish
      if (method === 'POST' && parts[2] === 'publish') {
        const body = await request.json().catch(() => ({}));
        const version = String(body.version || '').trim();
        const sourceCode = String(body.sourceCode || '');
        const releaseNotes = String(body.releaseNotes || '').trim();

        if (!/^\d+\.\d+\.\d+$/.test(version)) return err('Version must be in X.Y.Z format.');
        if (!sourceCode || sourceCode.length > 500000) return err('Source code required (max 500KB).');

        const dup = await env.DB.prepare(
          'SELECT id FROM script_versions WHERE script_id = ? AND version = ?'
        ).bind(scriptId, version).first();
        if (dup) return err(`Version ${version} already exists.`);

        let obfuscated;
        try {
          obfuscated = obfuscate(sourceCode);
        } catch (e) {
          console.error('Obfuscation failed:', e.message);
          return err('Publishing failed: obfuscation step failed.', 500);
        }

        const versionId = crypto.randomUUID();
        const bytesIn = new TextEncoder().encode(sourceCode).length;
        const bytesOut = new TextEncoder().encode(obfuscated).length;

        await env.DB.prepare(`
          INSERT INTO script_versions (id, script_id, version, source_code, obfuscated_code, release_notes, bytes_in, bytes_out)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(versionId, scriptId, version, sourceCode, obfuscated, releaseNotes, bytesIn, bytesOut).run();

        await env.DB.prepare(
          "UPDATE scripts SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(versionId, scriptId).run();

        const base = getBaseUrl(request, env);
        return json({
          versionId,
          version,
          publicUrl: buildPublicUrl(base, script.slug),
          loadstring: buildLoadstring(base, script.slug),
          bytesIn,
          bytesOut,
        });
      }

      // POST /api/scripts/:id/enable  |  /disable
      if (method === 'POST' && (parts[2] === 'enable' || parts[2] === 'disable')) {
        const enabled = parts[2] === 'enable' ? 1 : 0;
        await env.DB.prepare(
          "UPDATE scripts SET enabled = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(enabled, scriptId).run();
        return json({ enabled: !!enabled });
      }
    }

    return err('Route not found.', 404);
  } catch (e) {
    console.error('API error:', e);
    return err('Something went wrong.', 500);
  }
}
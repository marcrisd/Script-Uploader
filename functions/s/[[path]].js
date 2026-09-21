import { text, getBaseUrl } from '../_lib/core.js';

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  // Path after "/s/" e.g. "clicker-simulator-rng" or "clicker-simulator-rng/1.4.2"
  const path = url.pathname.replace(/^\/s\/?/, '');
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) {
    return text('Script not found.', 404);
  }

  const slug = parts[0];
  const requestedVersion = parts[1] || null;

  // Cache API check
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const id = cached.headers.get('X-Script-Id');
    if (id) waitUntil(trackRequest(env, id));
    return cached;
  }

  const script = await env.DB.prepare(
    'SELECT id, enabled, current_version_id FROM scripts WHERE slug = ?'
  ).bind(slug).first();

  if (!script) return text('Script not found.', 404);

  if (!script.enabled) {
    return text('This script is currently unavailable.', 200);
  }

  let versionId = script.current_version_id;
  if (requestedVersion) {
    const row = await env.DB.prepare(
      'SELECT id FROM script_versions WHERE script_id = ? AND version = ?'
    ).bind(script.id, requestedVersion).first();
    if (!row) return text(`Version ${requestedVersion} not found.`, 404);
    versionId = row.id;
  }

  if (!versionId) {
    return text('This script is currently unavailable.', 200);
  }

  const version = await env.DB.prepare(
    'SELECT obfuscated_code FROM script_versions WHERE id = ?'
  ).bind(versionId).first();

  if (!version) return text('Script not found.', 404);

  const response = new Response(version.obfuscated_code, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'X-Script-Id': script.id,
      'X-Script-Version': requestedVersion || 'latest',
    },
  });

  waitUntil(cache.put(cacheKey, response.clone()));
  waitUntil(trackRequest(env, script.id));

  return response;
}

async function trackRequest(env, scriptId) {
  if (!scriptId) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    await env.DB.prepare(`
      INSERT INTO daily_request_stats (id, script_id, date, request_count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(script_id, date) DO UPDATE SET request_count = request_count + 1
    `).bind(crypto.randomUUID(), scriptId, today).run();
  } catch (e) {
    console.error('Analytics write failed:', e.message);
  }
}
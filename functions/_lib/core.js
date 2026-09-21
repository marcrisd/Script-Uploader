// Shared helpers: sessions, password hashing, slug validation, responses.

const SESSION_COOKIE = 'sp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// ─── Response helpers ──────────────────────────────────────────
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function err(message, status = 400) {
  return json({ error: message }, status);
}

export function text(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...extraHeaders,
    },
  });
}

// ─── Cookie helpers ────────────────────────────────────────────
export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ─── Password hashing (PBKDF2 via Web Crypto) ──────────────────
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex(salt)}:${hex(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const computed = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === hashHex;
}

// ─── Sessions (stored in D1) ───────────────────────────────────
export async function createSession(env, userId) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(token, userId, expiresAt).run();
  return token;
}

export async function getSession(env, request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT user_id, expires_at FROM sessions WHERE token = ?'
  ).bind(token).first();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return { userId: row.user_id, token };
}

export async function destroySession(env, request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
}

// ─── Auth middleware ───────────────────────────────────────────
export async function requireAuth(env, request) {
  const session = await getSession(env, request);
  if (!session) return { error: err('Authentication required.', 401) };
  return { session };
}

// ─── Slug validation ───────────────────────────────────────────
export function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function validateSlug(slug) {
  if (!slug) return 'Slug is required.';
  if (!/^[a-z0-9-]+$/.test(slug)) return 'Slug may only contain lowercase letters, numbers and hyphens.';
  if (slug.length < 3) return 'Slug must be at least 3 characters.';
  if (slug.length > 80) return 'Slug must be 80 characters or fewer.';
  if (slug.startsWith('-') || slug.endsWith('-')) return 'Slug cannot start or end with a hyphen.';
  return null;
}

// ─── Loadstring ────────────────────────────────────────────────
export function buildLoadstring(baseUrl, slug) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return `loadstring(game:HttpGet("${base}/s/${slug}"))()`;
}

export function buildPublicUrl(baseUrl, slug, version = null) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return version ? `${base}/s/${slug}/${version}` : `${base}/s/${slug}`;
}

// ─── URL parsing ───────────────────────────────────────────────
export function getBaseUrl(request, env) {
  if (env.PUBLIC_BASE_URL) return String(env.PUBLIC_BASE_URL).replace(/\/+$/, '');
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
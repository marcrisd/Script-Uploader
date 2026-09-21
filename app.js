
// ─── API client ────────────────────────────────────────────────
const API = {
  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const ct = res.headers.get('content-type') || '';
    let data;
    if (ct.includes('application/json')) data = await res.json();
    else data = await res.text();
    if (!res.ok) {
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  },
  get(p) { return this.request('GET', p); },
  post(p, b) { return this.request('POST', p, b); },
  del(p) { return this.request('DELETE', p); },
};

// ─── Toast ─────────────────────────────────────────────────────
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ─── Copy helper ───────────────────────────────────────────────
async function copyText(text, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast(label);
  }
}

// ─── Escape HTML ───────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

// ─── Router ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'login') initLogin();
  if (page === 'dashboard') initDashboard();
  if (page === 'new') initNew();
  if (page === 'script') initScript();
});

// ─── Login page ────────────────────────────────────────────────
async function initLogin() {
  // If already logged in, redirect
  try {
    await API.get('/api/auth/me');
    location.href = '/dashboard.html';
    return;
  } catch {}

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const fd = new FormData(form);
    try {
      await API.post('/api/auth/login', {
        username: fd.get('username'),
        password: fd.get('password'),
      });
      location.href = '/dashboard.html';
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

// ─── Dashboard page ────────────────────────────────────────────
async function initDashboard() {
  try {
    const me = await API.get('/api/auth/me');
    document.getElementById('user-name').textContent = me.user.username;
  } catch {
    location.href = '/';
    return;
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await API.post('/api/auth/logout');
    location.href = '/';
  });

  try {
    const data = await API.get('/api/dashboard');
    document.getElementById('stat-scripts').textContent = fmt(data.totalScripts);
    document.getElementById('stat-requests').textContent = fmt(data.totalRequests);
    document.getElementById('stat-today').textContent = fmt(data.requestsToday);
    document.getElementById('stat-active').textContent = fmt(
      data.recentScripts.filter(s => s.enabled).length
    );

    const list = document.getElementById('scripts-list');
    if (data.recentScripts.length === 0) {
      list.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">
        No scripts yet. <a href="/new.html" style="color:var(--accent)">Create your first script →</a>
      </div>`;
    } else {
      list.innerHTML = data.recentScripts.map(s => `
        <div class="script-row">
          <div>
            <a href="/script.html?id=${esc(s.id)}" style="color:var(--text-bright);font-weight:500">${esc(s.name)}</a>
            <div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);margin-top:2px">${esc(s.slug)}</div>
          </div>
          <div style="font-family:var(--font-mono);color:var(--text-secondary);font-size:0.8125rem">
            ${s.version ? 'v' + esc(s.version) : '—'}
          </div>
          <div class="tabular" style="color:var(--text-secondary)">${fmt(s.requests)}</div>
          <div>
            <span class="pill ${s.enabled ? 'pill-live' : 'pill-disabled'}">
              <span class="pulse-dot"></span> ${s.enabled ? 'LIVE' : 'DISABLED'}
            </span>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

// ─── New script page ───────────────────────────────────────────
async function initNew() {
  const nameEl = document.getElementById('name');
  const slugEl = document.getElementById('slug');
  const descEl = document.getElementById('description');
  const verEl = document.getElementById('version');
  const srcEl = document.getElementById('source');
  const notesEl = document.getElementById('notes');
  const publishBtn = document.getElementById('publish-btn');
  const errorEl = document.getElementById('form-error');
  const gutter = document.getElementById('gutter');
  let slugTouched = false;

  // Auto-slug
  nameEl.addEventListener('input', () => {
    if (slugTouched) return;
    slugEl.value = String(nameEl.value || '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  });
  slugEl.addEventListener('input', () => { slugTouched = true; });

  // Line numbers
  function updateGutter() {
    const lines = (srcEl.value.match(/\n/g) || []).length + 1;
    gutter.innerHTML = Array.from({ length: Math.max(lines, 1) }, (_, i) => `<div>${i + 1}</div>`).join('');
  }
  srcEl.addEventListener('input', updateGutter);
  srcEl.addEventListener('scroll', () => { gutter.scrollTop = srcEl.scrollTop; });

  // Tab support
  srcEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = srcEl.selectionStart;
      const end = srcEl.selectionEnd;
      srcEl.value = srcEl.value.substring(0, start) + '  ' + srcEl.value.substring(end);
      srcEl.selectionStart = srcEl.selectionEnd = start + 2;
      updateGutter();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      publishBtn.click();
    }
  });

  updateGutter();

  // Publish
  publishBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    const name = nameEl.value.trim();
    const slug = slugEl.value.trim();
    const version = verEl.value.trim();
    const source = srcEl.value;
    const description = descEl.value.trim();
    const releaseNotes = notesEl.value.trim();

    if (!name || !slug || !version || !source) {
      errorEl.textContent = 'Name, slug, version, and source are required.';
      return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = 'Obfuscating…';

    try {
      const script = await API.post('/api/scripts', { name, slug, description });
      const result = await API.post(`/api/scripts/${script.id}/publish`, {
        version, sourceCode: source, releaseNotes,
      });
      showSuccess(result, script.slug);
    } catch (err) {
      errorEl.textContent = err.message;
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publish Script';
    }
  });

  function showSuccess(result, slug) {
    document.getElementById('form-view').classList.add('hidden');
    const successView = document.getElementById('success-view');
    successView.classList.remove('hidden');
    successView.classList.add('fade-up');
    document.getElementById('result-url').textContent = result.publicUrl;
    document.getElementById('result-loadstring').textContent = result.loadstring;

    document.getElementById('copy-url').addEventListener('click', () => copyText(result.publicUrl, 'URL copied'));
    document.getElementById('copy-loadstring').addEventListener('click', () => copyText(result.loadstring, 'Loadstring copied'));
    document.getElementById('view-script').addEventListener('click', () => location.href = `/script.html?slug=${slug}`);
  }
}

// ─── Script detail page ────────────────────────────────────────
async function initScript() {
  try {
    await API.get('/api/auth/me');
  } catch {
    location.href = '/';
    return;
  }
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await API.post('/api/auth/logout');
    location.href = '/';
  });

  const params = new URLSearchParams(location.search);
  const id = params.get('id');

  // If only slug given, list & filter
  if (!id) {
    try {
      const { scripts } = await API.get('/api/scripts');
      const slug = params.get('slug');
      const match = scripts.find(s => s.slug === slug);
      if (match) return renderScript(match.id);
      document.getElementById('script-body').innerHTML =
        `<div class="text-muted" style="padding:40px;text-align:center">Script not found. <a href="/dashboard.html" style="color:var(--accent)">Back →</a></div>`;
    } catch (e) {
      console.error(e);
    }
    return;
  }

  renderScript(id);
}

async function renderScript(id) {
  try {
    const s = await API.get(`/api/scripts/${id}`);
    document.getElementById('script-name').textContent = s.name;
    document.getElementById('script-slug').textContent = s.slug;
    document.getElementById('script-desc').textContent = s.description || 'No description';

    const statusEl = document.getElementById('script-status');
    statusEl.className = `pill ${s.enabled ? 'pill-live' : 'pill-disabled'}`;
    statusEl.innerHTML = `<span class="pulse-dot"></span> ${s.enabled ? 'LIVE' : 'DISABLED'}`;

    document.getElementById('script-version').textContent =
      s.currentVersion ? 'v' + s.currentVersion.version : 'not published';

    document.getElementById('script-url').textContent = s.publicUrl;
    document.getElementById('script-loadstring').textContent = s.loadstring;

    document.getElementById('copy-url').addEventListener('click', () => copyText(s.publicUrl, 'URL copied'));
    document.getElementById('copy-loadstring').addEventListener('click', () => copyText(s.loadstring, 'Loadstring copied'));

    const toggleBtn = document.getElementById('toggle-btn');
    toggleBtn.textContent = s.enabled ? 'Disable Script' : 'Enable Script';
    toggleBtn.className = `btn ${s.enabled ? 'btn-danger' : 'btn-primary'}`;
    toggleBtn.addEventListener('click', async () => {
      const action = s.enabled ? 'disable' : 'enable';
      await API.post(`/api/scripts/${id}/${action}`);
      location.reload();
    });

    // Load versions
    const { versions, currentVersionId } = await API.get(`/api/scripts/${id}/versions`);
    const list = document.getElementById('versions-list');
    if (versions.length === 0) {
      list.innerHTML = `<div class="text-muted" style="padding:20px">No published versions yet.</div>`;
    } else {
      list.innerHTML = versions.map(v => `
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px">
          <div style="font-family:var(--font-mono);font-weight:500;color:var(--text-bright)">v${esc(v.version)}</div>
          ${v.id === currentVersionId ? '<span class="pill pill-accent">Current</span>' : ''}
          <div style="flex:1;color:var(--text-secondary);font-size:0.8125rem">${esc(v.release_notes || '—')}</div>
          <div class="text-muted" style="font-size:0.75rem">${new Date(v.created_at + 'Z').toLocaleDateString()}</div>
        </div>
      `).join('');
    }

    // Delete button
    document.getElementById('delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this script permanently? This cannot be undone.')) return;
      await API.del(`/api/scripts/${id}`);
      location.href = '/dashboard.html';
    });
  } catch (e) {
    document.getElementById('script-body').innerHTML =
      `<div class="text-muted" style="padding:40px">${esc(e.message)}</div>`;
  }
}

window.copyText = copyText;
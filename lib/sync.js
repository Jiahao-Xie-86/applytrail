// Cloud sync through a private GitHub repository. All data lives in one JSON
// file (job-tracker.json); every push is a commit, so GitHub keeps the history.
// Merge is per record: the newer updatedAt wins, deletions are kept as tombstones.
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});
  const S = JT.store;
  const Y = (JT.sync = {});

  const API = 'https://api.github.com';
  const FILE = 'job-tracker.json';
  const MAX_EVENTS = 300;
  const MAX_SEEN = 3000;

  // Keys whose changes should be pushed. Settings, sync config and scan stats stay per-device.
  Y.isDataKey = (k) => k.startsWith('app:') || k === 'tombstones' || k === 'emailEvents' || k === 'emailSeen';

  const stamp = (x) => (x && (x.updatedAt || x.at)) || '';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---------- merge (pure) ----------

  // local/remote: { apps: {id: app}, tombstones: {id: iso}, emailEvents: [], emailSeen: {key: ms} }
  // Returns { merged, pushNeeded } — pushNeeded when the remote copy lacks something.
  Y.merge = function (local, remote) {
    const r = remote || {};
    const rApps = r.apps || {};
    const rTomb = r.tombstones || {};
    const out = { apps: {}, tombstones: {}, emailEvents: [], emailSeen: {} };
    let pushNeeded = !remote;

    for (const src of [local.tombstones || {}, rTomb]) {
      for (const [id, ts] of Object.entries(src)) if (!out.tombstones[id] || ts > out.tombstones[id]) out.tombstones[id] = ts;
    }
    if (!same(Object.keys(out.tombstones).sort().map((id) => [id, out.tombstones[id]]), Object.keys(rTomb).sort().map((id) => [id, rTomb[id]]))) {
      pushNeeded = true;
    }

    const ids = new Set([...Object.keys(local.apps || {}), ...Object.keys(rApps)]);
    for (const id of [...ids].sort()) {
      const l = (local.apps || {})[id];
      const rem = rApps[id];
      const win = !rem ? l : !l ? rem : stamp(l) > stamp(rem) ? l : rem;
      const deletedAt = out.tombstones[id];
      if (deletedAt && deletedAt >= stamp(win)) {
        if (rem) pushNeeded = true;
        continue; // deleted after its last edit
      }
      out.apps[id] = win;
      if (win !== rem && !same(win, rem)) pushNeeded = true;
    }

    // The same email seen on two computers yields two events with one key — keep the newest.
    const byKey = new Map();
    for (const e of [...(r.emailEvents || []), ...(local.emailEvents || [])]) {
      const k = e.key || e.id;
      const cur = byKey.get(k);
      if (!cur || stamp(e) > stamp(cur)) byKey.set(k, e);
    }
    out.emailEvents = [...byKey.values()]
      .sort((a, b) => (a.at || '').localeCompare(b.at || '') || (a.id || '').localeCompare(b.id || ''))
      .slice(-MAX_EVENTS);
    if (!same(out.emailEvents, r.emailEvents || [])) pushNeeded = true;

    for (const src of [r.emailSeen || {}, local.emailSeen || {}]) {
      for (const [k, v] of Object.entries(src)) if (!(k in out.emailSeen) || v < out.emailSeen[k]) out.emailSeen[k] = v;
    }
    const seenKeys = Object.keys(out.emailSeen);
    if (seenKeys.length > MAX_SEEN) {
      seenKeys.sort((a, b) => out.emailSeen[a] - out.emailSeen[b]).slice(0, seenKeys.length - MAX_SEEN).forEach((k) => delete out.emailSeen[k]);
    }
    const rSeen = r.emailSeen || {};
    if (Object.keys(out.emailSeen).some((k) => rSeen[k] !== out.emailSeen[k]) || Object.keys(rSeen).length !== Object.keys(out.emailSeen).length) {
      pushNeeded = true;
    }

    return { merged: out, pushNeeded };
  };

  // ---------- local side ----------

  async function snapshot() {
    const all = await S.area.get(null);
    const apps = {};
    for (const [k, v] of Object.entries(all)) if (k.startsWith('app:')) apps[k.slice(4)] = v;
    return { apps, tombstones: all.tombstones || {}, emailEvents: all.emailEvents || [], emailSeen: all.emailSeen || {} };
  }

  // Write what the merge brought in. Re-read each record first so an edit made while
  // the request was in flight is never overwritten by an older remote copy.
  async function applyLocal(local, merged) {
    const incoming = Object.keys(merged.apps).filter((id) => merged.apps[id] !== local.apps[id] && !same(merged.apps[id], local.apps[id]));
    const current = incoming.length ? await S.area.get(incoming.map((id) => 'app:' + id)) : {};
    const set = {};
    for (const id of incoming) {
      const now = current['app:' + id];
      if (!now || stamp(now) <= stamp(merged.apps[id])) set['app:' + id] = merged.apps[id];
    }
    if (!same(merged.tombstones, local.tombstones)) set.tombstones = merged.tombstones;
    if (!same(merged.emailEvents, local.emailEvents)) set.emailEvents = merged.emailEvents;
    if (!same(merged.emailSeen, local.emailSeen)) set.emailSeen = merged.emailSeen;
    if (Object.keys(set).length) await S.area.set(set);
    const gone = Object.keys(local.apps).filter((id) => !merged.apps[id]).map((id) => 'app:' + id);
    if (gone.length) await S.area.remove(gone);
    return { received: incoming.length, removed: gone.length };
  }

  // ---------- GitHub ----------

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function b64decode(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function gh(cfg, path, init = {}, accept = 'application/vnd.github.object+json') {
    return fetch(`${API}/repos/${cfg.repo}${path}`, {
      cache: 'no-store', // the contents API is cacheable for 60s; a stale sha would loop on conflicts
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  async function ghError(res) {
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch {}
    if (res.status === 401) return new Error('token 无效或已过期，请重新生成');
    if (res.status === 403) {
      return new Error(/rate limit/i.test(msg) ? 'GitHub 请求太频繁，稍后自动重试' : 'token 没有写入权限：需要这个仓库的 Contents: Read and write');
    }
    if (res.status === 404) return new Error('找不到仓库：检查“用户名/仓库名”，以及 token 是否勾选了这个仓库');
    return new Error(`GitHub 返回 ${res.status}${msg ? '：' + msg : ''}`);
  }

  Y.pull = async function (cfg) {
    const res = await gh(cfg, `/contents/${FILE}`);
    if (res.status === 404) return { sha: null, data: null };
    if (!res.ok) throw await ghError(res);
    const meta = await res.json();
    let text;
    if (meta.encoding === 'base64' && meta.content) {
      text = b64decode(meta.content);
    } else {
      // Over 1 MB the object response has no content; fetch the raw file instead.
      const raw = await gh(cfg, `/contents/${FILE}`, {}, 'application/vnd.github.raw+json');
      if (!raw.ok) throw await ghError(raw);
      text = await raw.text();
    }
    return { sha: meta.sha, data: JSON.parse(text) };
  };

  Y.push = async function (cfg, data, sha) {
    const n = Object.keys(data.apps).length;
    const res = await gh(cfg, `/contents/${FILE}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `sync from ${cfg.device || 'device'} · ${n} 条投递`,
        content: b64encode(JSON.stringify(data)),
        ...(sha ? { sha } : {}),
      }),
    });
    if (res.status === 409) return { conflict: true };
    if (res.status === 422) {
      const body = await res.clone().json().catch(() => ({}));
      if (/sha/i.test(body.message || '')) return { conflict: true };
    }
    if (!res.ok) throw await ghError(res);
    return { sha: (await res.json()).content.sha };
  };

  // ---------- config / state ----------

  Y.config = async () => (await S.area.get('syncConfig')).syncConfig || { enabled: false };
  Y.state = async () => (await S.area.get('syncState')).syncState || {};
  const setState = async (patch) => S.area.set({ syncState: { ...(await Y.state()), ...patch } });

  // ---------- sync ----------

  async function run() {
    const cfg = await Y.config();
    if (!cfg.enabled || !cfg.token || !cfg.repo) return { skipped: true };
    await setState({ syncing: true });
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const remote = await Y.pull(cfg);
        const local = await snapshot();
        const { merged, pushNeeded } = Y.merge(local, remote.data);
        const applied = await applyLocal(local, merged);
        let pushed = false;
        if (pushNeeded) {
          const res = await Y.push(cfg, { app: 'job-tracker', version: 1, updatedAt: new Date().toISOString(), ...merged }, remote.sha);
          if (res.conflict) continue; // another computer pushed in between — merge again
          pushed = true;
        }
        const result = { ...applied, pushed, apps: Object.keys(merged.apps).length };
        await setState({ syncing: false, lastSyncAt: Date.now(), lastError: '', apps: result.apps });
        return result;
      }
      throw new Error('多台电脑同时在同步，稍后会自动重试');
    } catch (e) {
      // fetch rejects with TypeError "Failed to fetch" when offline
      const msg = e && e.name === 'TypeError' && /fetch|network/i.test(e.message) ? '网络连接失败，稍后自动重试' : e.message;
      await setState({ syncing: false, lastError: msg, lastErrorAt: Date.now() });
      throw new Error(msg);
    }
  }

  // Serialised: GitHub rejects concurrent writes, and a second request during a run
  // just schedules one more run afterwards.
  let running = null;
  let again = false;
  Y.syncNow = function () {
    if (running) {
      again = true;
      return running;
    }
    running = run().finally(() => {
      running = null;
      if (again) {
        again = false;
        Y.syncNow().catch(() => {});
      }
    });
    return running;
  };

  // Check the repo, refuse public ones, save the config and do the first sync.
  Y.setup = async function ({ repo, token, device }) {
    repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$|\/$/g, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('仓库格式应为“用户名/仓库名”，例如 jiahao/job-tracker-data');
    const old = await Y.config();
    const cfg = { enabled: true, repo, token: String(token || '').trim() || old.token, device: String(device || '').trim() || old.device || 'device' };
    if (!cfg.token) throw new Error('请填写 token');
    const res = await gh(cfg, '', {}, 'application/vnd.github+json');
    if (!res.ok) throw await ghError(res);
    const info = await res.json();
    if (!info.private) throw new Error('这个仓库是公开的，任何人都能看到你的投递记录。请先在 GitHub 仓库 Settings 里改成 Private');
    await S.area.set({ syncConfig: cfg });
    return Y.syncNow();
  };

  Y.disable = async function () {
    const cfg = await Y.config();
    await S.area.set({ syncConfig: { enabled: false, repo: cfg.repo || '', device: cfg.device || '' } }); // token dropped
    await setState({ syncing: false, lastError: '' });
  };
})();

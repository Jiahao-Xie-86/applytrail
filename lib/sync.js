// Cloud sync through the signed-in Google account (one gzip JSON file in Drive's
// hidden app folder, see lib/google.js). Merge is per record: the newer updatedAt
// wins, deletions are kept as tombstones, so every computer converges.
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});
  const S = JT.store;
  const Y = (JT.sync = {});

  const G = JT.google;
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

  // ---------- config / state ----------

  // syncConfig: { enabled, email } — per computer. The token itself lives in storage.session.
  Y.config = async () => (await S.area.get('syncConfig')).syncConfig || { enabled: false };
  Y.state = async () => (await S.area.get('syncState')).syncState || {};
  const setState = async (patch) => S.area.set({ syncState: { ...(await Y.state()), ...patch } });

  // ---------- sync ----------

  async function run() {
    const cfg = await Y.config();
    if (!cfg.enabled) return { skipped: true };
    await setState({ syncing: true });
    try {
      const files = await G.listFiles(cfg.email);
      // Two computers creating the file at the same moment leave two copies: fold them together.
      let remote = null;
      for (const f of files) {
        const doc = await G.download(cfg.email, f.id);
        remote = remote ? Y.merge(remote, doc).merged : doc;
      }
      const local = await snapshot();
      const { merged, pushNeeded } = Y.merge(local, remote);
      const applied = await applyLocal(local, merged);
      // Drive has no compare-and-swap. If another computer overwrites this upload, our
      // records are still local and newer, so the next sync puts them back.
      const pushed = pushNeeded || files.length > 1;
      if (pushed) {
        await G.upload(cfg.email, files.length ? files[0].id : null, { app: 'job-tracker', version: 1, updatedAt: new Date().toISOString(), ...merged });
        for (const f of files.slice(1)) await G.remove(cfg.email, f.id);
      }
      const result = { ...applied, pushed, apps: Object.keys(merged.apps).length };
      await setState({ syncing: false, lastSyncAt: Date.now(), lastError: '', needsLogin: false, apps: result.apps });
      return result;
    } catch (e) {
      // fetch rejects with TypeError "Failed to fetch" when offline
      const msg = e && e.name === 'TypeError' && /fetch|network/i.test(e.message) ? '网络连接失败，稍后自动重试' : e.message;
      await setState({ syncing: false, lastError: msg, lastErrorAt: Date.now(), needsLogin: !!(e && e.needsLogin) });
      throw Object.assign(new Error(msg), { needsLogin: !!(e && e.needsLogin) });
    }
  }

  // Serialised: a request during a run just schedules one more run afterwards.
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

  // After G.signIn() succeeded (from a click on the dashboard).
  Y.enable = async function (email) {
    await S.area.set({ syncConfig: { enabled: true, email } });
    await setState({ lastError: '', needsLogin: false });
  };

  Y.disable = async function () {
    await G.signOut();
    await S.area.set({ syncConfig: { enabled: false } });
    await setState({ syncing: false, lastError: '', needsLogin: false });
  };
})();

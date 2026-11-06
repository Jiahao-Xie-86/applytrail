// Persistence layer. Each application is stored under its own key "app:<id>"
// in chrome.storage.local so updates don't rewrite the whole dataset.
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});
  const A = JT.analyze;
  const t = (s, v) => JT.t(s, v);

  // Outside the extension (e.g. opening dashboard.html from a local server for
  // a quick preview) fall back to localStorage with the same promise API.
  const area =
    globalThis.chrome && chrome.storage && chrome.storage.local
      ? chrome.storage.local
      : {
          async get(keys) {
            const all = {};
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k.startsWith('jt:')) all[k.slice(3)] = JSON.parse(localStorage.getItem(k));
            }
            if (keys == null) return all;
            const list = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(list.filter((k) => k in all).map((k) => [k, all[k]]));
          },
          async set(obj) {
            for (const [k, v] of Object.entries(obj)) localStorage.setItem('jt:' + k, JSON.stringify(v));
          },
          async remove(keys) {
            for (const k of [].concat(keys)) localStorage.removeItem('jt:' + k);
          },
        };

  const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
  const newId = () =>
    (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function newApp(fields = {}) {
    const now = new Date().toISOString();
    const status = fields.status || 'applied';
    const app = {
      id: newId(),
      company: '',
      title: '',
      location: '',
      jobType: 'fulltime',
      term: '',
      status,
      url: '',
      canonicalUrl: '',
      source: '',
      jobId: '',
      salary: '',
      workMode: '',
      sponsorship: 'unknown',
      sponsorshipNote: '',
      postedDate: '',
      appliedDate: status === 'wishlist' ? '' : today(),
      deadline: '',
      description: '',
      keywords: [],
      requirements: [],
      resumeVersion: '',
      referral: '',
      contacts: '',
      notes: '',
      prepNotes: '',
      interviews: [],
      timeline: [{ at: now, status }],
      starred: false,
      createdAt: now,
      updatedAt: now,
    };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && k in app) app[k] = v;
    app.canonicalUrl = A.canonicalUrl(app.url);
    return app;
  }

  async function all() {
    const data = await area.get(null);
    return Object.entries(data)
      .filter(([k]) => k.startsWith('app:'))
      .map(([, v]) => v)
      .sort((a, b) => (b.appliedDate || b.createdAt).localeCompare(a.appliedDate || a.createdAt));
  }

  async function get(id) {
    const data = await area.get('app:' + id);
    return data['app:' + id] || null;
  }

  async function save(app) {
    app.updatedAt = new Date().toISOString();
    if (app.url) app.url = A.postingUrl(app.url);
    app.canonicalUrl = A.canonicalUrl(app.url);
    await area.set({ ['app:' + app.id]: app });
    return app;
  }

  // Deletions leave a tombstone so cloud sync removes the record on other computers too.
  async function removeMany(ids) {
    if (!ids.length) return;
    const tombstones = (await area.get('tombstones')).tombstones || {};
    const at = new Date().toISOString();
    for (const id of ids) tombstones[id] = at;
    await area.set({ tombstones });
    await area.remove(ids.map((id) => 'app:' + id));
  }

  const remove = (id) => removeMany([id]);

  function applyStatus(app, status, note) {
    if (app.status === status) return app;
    app.status = status;
    app.timeline = app.timeline || [];
    app.timeline.push({ at: new Date().toISOString(), status, ...(note ? { note } : {}) });
    if (status !== 'wishlist' && !app.appliedDate) app.appliedDate = today();
    return app;
  }

  async function setStatus(id, status, note) {
    const app = await get(id);
    if (!app) return null;
    return save(applyStatus(app, status, note));
  }

  function findMatch(job, apps) {
    const canon = job.url ? A.canonicalUrl(job.url) : '';
    if (canon) {
      const byUrl = apps.find((a) => a.canonicalUrl === canon);
      if (byUrl) return byUrl;
    }
    if (job.company && job.title) {
      const key = A.dedupeKey(job.company, job.title);
      return apps.find((a) => A.dedupeKey(a.company, a.title) === key) || null;
    }
    return null;
  }

  // Record an extracted job. Existing record → fill blanks + advance status.
  async function upsertFromJob(job, status) {
    const apps = await all();
    const existing = findMatch(job, apps);
    if (existing) {
      for (const k of ['company', 'title', 'location', 'description', 'salary', 'jobId', 'term', 'workMode']) {
        if (!existing[k] && job[k]) existing[k] = job[k];
      }
      if ((!existing.keywords || !existing.keywords.length) && job.keywords) existing.keywords = job.keywords;
      if (existing.status === 'wishlist' && status && status !== 'wishlist') applyStatus(existing, status);
      return { app: await save(existing), created: false };
    }
    const app = newApp({ ...job, status: status || 'applied' });
    return { app: await save(app), created: true };
  }

  async function getSettings() {
    const data = await area.get('settings');
    return { ...JT.DEFAULT_SETTINGS, ...(data.settings || {}) };
  }

  async function setSettings(patch) {
    const s = { ...(await getSettings()), ...patch };
    await area.set({ settings: s });
    return s;
  }

  // ---------- import / export ----------

  function toJSON(apps) {
    return JSON.stringify({ app: 'job-tracker', version: 1, exportedAt: new Date().toISOString(), apps }, null, 2);
  }

  async function importJSON(text) {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : parsed.apps;
    if (!Array.isArray(list)) throw new Error(t('文件格式不对：找不到 apps 数组'));
    const existing = Object.fromEntries((await all()).map((a) => [a.id, a]));
    let added = 0, updated = 0, skipped = 0;
    const batch = {};
    for (const raw of list) {
      if (!raw || !raw.id || (!raw.company && !raw.title)) { skipped++; continue; }
      const cur = existing[raw.id];
      if (cur && (cur.updatedAt || '') >= (raw.updatedAt || '')) { skipped++; continue; }
      const merged = { ...newApp(), ...raw };
      merged.canonicalUrl = A.canonicalUrl(merged.url);
      batch['app:' + merged.id] = merged;
      cur ? updated++ : added++;
    }
    await area.set(batch);
    return { added, updated, skipped };
  }

  const CSV_COLUMNS = [
    ['Company', (a) => a.company], ['Title', (a) => a.title], ['Type', (a) => JT.label(JT.JOB_TYPES, a.jobType)],
    ['Term', (a) => a.term], ['Location', (a) => a.location], ['Work Mode', (a) => a.workMode],
    ['Status', (a) => JT.label(JT.STATUSES, a.status)], ['Applied Date', (a) => a.appliedDate], ['Source', (a) => t(a.source || '')],
    ['URL', (a) => a.url], ['Salary', (a) => a.salary], ['Sponsorship', (a) => JT.label(JT.SPONSORSHIP, a.sponsorship)],
    ['Resume', (a) => a.resumeVersion], ['Referral', (a) => a.referral], ['Job ID', (a) => a.jobId],
    ['Interviews', (a) => (a.interviews || []).map((r) => `${r.date || ''} ${r.type || ''} ${r.result ? '(' + JT.label(JT.ROUND_RESULTS, r.result) + ')' : ''}`.trim()).join('; ')],
    ['Keywords', (a) => (a.keywords || []).join(', ')], ['Notes', (a) => a.notes], ['Job Description', (a) => a.description],
  ];

  function toCSV(apps) {
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [CSV_COLUMNS.map(([h]) => h).join(',')];
    for (const a of apps) rows.push(CSV_COLUMNS.map(([, f]) => esc(f(a))).join(','));
    return '﻿' + rows.join('\r\n'); // BOM so Excel reads UTF-8 correctly
  }

  JT.store = {
    area, today, newId, newApp, all, get, save, remove, removeMany, setStatus, applyStatus,
    findMatch, upsertFromJob, getSettings, setSettings, toJSON, importJSON, toCSV,
  };
})();

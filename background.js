// Service worker: records auto-detected applications, keeps per-tab "last job
// viewed" cache, and shows a ✓ badge on pages that are already tracked.
importScripts('lib/constants.js', 'lib/i18n.js', 'lib/analyze.js', 'lib/jd.js', 'lib/store.js', 'lib/email.js', 'lib/google.js', 'lib/sync.js');

const A = JT.analyze;
const S = JT.store;
const E = JT.email;
const Y = JT.sync;
const J = JT.jd;
const t = JT.i18n.t;
const langReady = JT.i18n.init();
// Sync errors are stored as text, so let the language load first.
const syncSoon = () => langReady.then(() => Y.syncNow()).catch(() => {});

// Follow the language chosen in the tracker's settings.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) JT.i18n.setLang(((changes.settings.newValue || {}).lang) || 'auto');
});
const SEEN_TTL = 3 * 3600 * 1000;
const DASHBOARD = chrome.runtime.getURL('dashboard/dashboard.html');

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: DASHBOARD + '#welcome' });
  if (reason === 'install' || reason === 'update') injectIntoOpenTabs();
  chrome.alarms.create('jt-sync', { periodInMinutes: 5 });
  syncSoon();
});

// Chrome only adds content scripts to pages loaded after install, and a reload/update cuts off
// the old copies. Inject into the tabs that are already open, following the manifest's rules.
function matchPattern(p) {
  const m = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(p);
  if (!m) return /$^/;
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\*]/g, '\\$&');
  const host = m[2] === '*' ? '[^/]+' : m[2].startsWith('*.') ? `(?:[^/]+\\.)?${esc(m[2].slice(2))}` : esc(m[2]);
  return new RegExp(`^${m[1] === '*' ? 'https?' : m[1]}://${host}${esc(m[3]).replace(/\\\*/g, '.*')}$`);
}

async function injectIntoOpenTabs() {
  const entries = chrome.runtime.getManifest().content_scripts || [];
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).catch(() => []);
  for (const tab of tabs) {
    for (const cs of entries) {
      const hit = (list) => (list || []).some((p) => matchPattern(p).test(tab.url || ''));
      if (!hit(cs.matches) || hit(cs.exclude_matches)) continue;
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: !!cs.all_frames }, files: cs.js }).catch(() => {});
    }
  }
}

// ---------- cloud sync: pull every 5 min / at startup, push shortly after local edits ----------

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('jt-sync', { periodInMinutes: 5 });
  syncSoon();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'jt-sync') syncSoon();
});

let pushTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !Object.keys(changes).some(Y.isDataKey)) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncSoon, 8000);
});

// ---------- per-tab job cache (storage.session survives worker restarts) ----------

async function getSeen(tabId) {
  if (tabId == null) return null;
  const k = 'seen:' + tabId;
  const v = (await chrome.storage.session.get(k))[k];
  return v && Date.now() - v.at < SEEN_TTL ? v.job : null;
}

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove('seen:' + tabId));

// ---------- recently viewed postings (storage.local, this computer only, not synced) ----------
// Lets a confirmation email, or a submit page with no job details, be matched to the posting.
const RECENT_MAX = 40;
const RECENT_TTL = 21 * 864e5;
const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};
const sameCompany = (a, b) => A.dedupeKey(a, '') === A.dedupeKey(b, '');

async function rememberRecent(job) {
  const key = A.canonicalUrl(job.url || '');
  if (!key || !job.title) return;
  const now = Date.now();
  const list = ((await chrome.storage.local.get('recentJobs')).recentJobs || []).filter((j) => j.key !== key && now - j.at < RECENT_TTL);
  const entry = { ...job, description: (job.description || '').slice(0, 20000), key, host: hostOf(job.url), at: now };
  await chrome.storage.local.set({ recentJobs: [entry, ...list].slice(0, RECENT_MAX) });
}

// The posting viewed most recently on the same site (and company), within the last few hours.
async function recentOnSite(url, company) {
  const host = hostOf(url);
  const list = (await chrome.storage.local.get('recentJobs')).recentJobs || [];
  return list.find((j) => j.host === host && Date.now() - j.at < SEEN_TTL && (!company || sameCompany(company, j.company))) || null;
}

// The confirmation page rarely contains the JD. Merge with the job last viewed in this tab,
// in the tab that opened it (LinkedIn "Apply" opens the ATS in a new tab), or on the same site.
async function resolveJob(current, tab) {
  current = current || { url: tab.url };
  if (current.title && (current.description || '').length > 200) return current;
  const seen = (await getSeen(tab.id)) || (await getSeen(tab.openerTabId)) || (await recentOnSite(current.url || tab.url, current.company));
  if (!seen) return current;
  // Different posting than the one cached for this tab → trust the current page.
  if (current.title && A.dedupeKey('', current.title) !== A.dedupeKey('', seen.title)) return current;
  if (current.company && seen.company && !sameCompany(current.company, seen.company)) return current;
  const merged = { ...seen };
  for (const [k, v] of Object.entries(current)) {
    const empty = !merged[k] || (Array.isArray(merged[k]) && !merged[k].length);
    if (v && empty && k !== 'url') merged[k] = v;
  }
  return merged;
}

// The ATS's own copy of the JD (the exact posting text, from Workday, Greenhouse, Lever or Ashby)
// replaces what was read from the page. A record that already existed keeps a JD that looks fine.
async function fillJD(appId, created) {
  try {
    const app = await S.get(appId);
    if (!app || !J.apiName(app.url) || (!created && !J.problem(app.description))) return;
    const got = await J.fetch(app.url);
    const fresh = got && (await S.get(appId)); // undone in the meantime → gone
    if (fresh) await S.save(J.applyTo(fresh, got));
  } catch (e) {
    console.debug('[ApplyTrail] JD fetch failed', e);
  }
}

// The content script only renders; all toast text is built here in the UI language.
// buttons: [{ act: 'open' | 'undo', label, primary }]
function toast(tabId, payload) {
  const msg = { type: 'JT_TOAST', unknownTitle: t('未识别到职位名'), closeLabel: t('关闭'), ...payload };
  chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }).catch(() => {});
}

const handlers = {
  async JT_JOB_SEEN({ job }, sender) {
    if (sender.tab) await chrome.storage.session.set({ ['seen:' + sender.tab.id]: { job, at: Date.now() } });
    await rememberRecent(job);
  },

  async JT_APPLY_DETECTED({ job }, sender) {
    const tab = sender.tab;
    if (!tab || A.isNotJobSite(tab.url)) return; // e.g. a "thank you for applying" email in Gmail
    const settings = await S.getSettings();
    if (!settings.autoDetect) return;
    await langReady;
    const resolved = await resolveJob(job, tab);
    if (!resolved.title && !resolved.company) return;

    const existing = S.findMatch(resolved, await S.all());
    if (existing && existing.status !== 'wishlist') {
      toast(tab.id, {
        mode: 'exists', appId: existing.id, title: existing.title, company: existing.company,
        head: t('✓ 已在追踪中（{status}）', { status: JT.label(JT.STATUSES, existing.status) }),
        buttons: [{ act: 'open', label: t('查看') }],
      });
      return;
    }
    const prevStatus = existing ? existing.status : null;
    const { app, created } = await S.upsertFromJob(resolved, 'applied');
    fillJD(app.id, created);
    toast(tab.id, {
      mode: 'saved', appId: app.id, created, prevStatus, title: app.title, company: app.company,
      head: app.title ? t('✓ 已自动记录投递') : t('✓ 已记录投递，但信息不全'),
      buttons: [
        { act: 'open', label: app.title ? t('编辑') : t('补充信息'), primary: true },
        { act: 'undo', label: t('撤销') },
      ],
    });
  },

  async JT_UNDO({ appId, created, prevStatus }) {
    if (created) return S.remove(appId);
    const app = await S.get(appId);
    if (app && prevStatus) {
      app.status = prevStatus;
      app.timeline.pop();
      if (prevStatus === 'wishlist') app.appliedDate = '';
      await S.save(app);
    }
  },

  async JT_OPEN_DASHBOARD({ appId, hash }) {
    await chrome.tabs.create({ url: DASHBOARD + (appId ? '#id=' + appId : hash ? '#' + hash : '') });
  },

  async JT_GMAIL_SCAN({ emails, rows, opened, account }, sender) {
    await chrome.storage.local.set({ gmailScan: { at: Date.now(), rows, opened } });
    if (!emails.length || !(await S.getSettings()).emailDetect) return;
    await langReady;
    const events = await E.process(emails, account);
    const changed = events.filter((e) => e.state === 'applied');
    for (const e of changed) if (e.created) fillJD(e.appId, true);
    const pending = events.filter((e) => e.state === 'unmatched' || e.state === 'ambiguous');
    if (!sender.tab || (!changed.length && !pending.length)) return;
    const st = (id) => JT.label(JT.STATUSES, id);
    const lines = [
      ...changed.map((e) =>
        e.created
          ? t('{company}：已从邮件创建记录（{status}）', { company: e.company, status: st(e.newStatus) })
          : t('{company}：{from} → {to}', { company: e.company, from: st(e.prevStatus), to: st(e.newStatus) })
      ),
      ...pending.map((e) => t('待确认 · {type}：{who}', { type: E.TYPES[e.type].label, who: e.guessCompany || e.subject })),
    ];
    const undoIds = changed.map((e) => e.id);
    toast(sender.tab.id, {
      mode: 'email',
      head: changed.length ? t('📧 根据邮件更新了 {n} 个投递', { n: changed.length }) : t('📧 有 {n} 封求职邮件待确认', { n: pending.length }),
      lines: lines.length > 5 ? [...lines.slice(0, 4), t('…另外 {n} 条', { n: lines.length - 4 })] : lines,
      buttons: [{ act: 'open', label: t('查看'), primary: true }, ...(undoIds.length ? [{ act: 'undo', label: t('撤销') }] : [])],
      undoIds,
      hash: 'emails',
    });
  },

  async JT_EMAIL_UNDO({ eventIds }) {
    await E.undo(eventIds);
  },

  // The dashboard signs in (needs a click), then hands over the account for syncing.
  async JT_SYNC_ENABLE({ email }) {
    await Y.enable(email);
    await langReady;
    return Y.syncNow();
  },
  JT_SYNC_NOW: () => langReady.then(() => Y.syncNow()),
  JT_SYNC_DISABLE: () => Y.disable(),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg && msg.type];
  if (!handler) return false;
  handler(msg, sender).then(
    (res) => sendResponse({ ok: true, ...(res || {}) }),
    (err) => sendResponse({ ok: false, error: (err && err.message) || String(err) })
  );
  return true;
});

// ---------- badge: ✓ when the current page is already tracked ----------

let urlIndex = null;

async function updateBadge(tabId, url) {
  if (!url || !/^https?:/.test(url)) return chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  if (!urlIndex) {
    const apps = await S.all();
    urlIndex = new Map(apps.filter((a) => a.canonicalUrl).map((a) => [a.canonicalUrl, a.status]));
  }
  const status = urlIndex.get(A.canonicalUrl(url));
  await chrome.action.setBadgeText({ tabId, text: status ? '✓' : '' }).catch(() => {});
  if (status) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: (JT.STATUS_MAP[status] || {}).color || '#16a34a' }).catch(() => {});
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') updateBadge(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) updateBadge(tabId, tab.url);
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !Object.keys(changes).some((k) => k.startsWith('app:'))) return;
  urlIndex = null;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) updateBadge(tab.id, tab.url);
});

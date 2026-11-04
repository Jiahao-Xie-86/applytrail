// Service worker: records auto-detected applications, keeps per-tab "last job
// viewed" cache, and shows a ✓ badge on pages that are already tracked.
importScripts('lib/constants.js', 'lib/analyze.js', 'lib/store.js', 'lib/email.js', 'lib/google.js', 'lib/sync.js');

const A = JT.analyze;
const S = JT.store;
const E = JT.email;
const Y = JT.sync;
const SEEN_TTL = 3 * 3600 * 1000;
const DASHBOARD = chrome.runtime.getURL('dashboard/dashboard.html');

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: DASHBOARD + '#welcome' });
  chrome.alarms.create('jt-sync', { periodInMinutes: 5 });
  Y.syncNow().catch(() => {});
});

// ---------- cloud sync: pull every 5 min / at startup, push shortly after local edits ----------

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('jt-sync', { periodInMinutes: 5 });
  Y.syncNow().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'jt-sync') Y.syncNow().catch(() => {});
});

let pushTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !Object.keys(changes).some(Y.isDataKey)) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => Y.syncNow().catch(() => {}), 8000);
});

// ---------- per-tab job cache (storage.session survives worker restarts) ----------

async function getSeen(tabId) {
  if (tabId == null) return null;
  const k = 'seen:' + tabId;
  const v = (await chrome.storage.session.get(k))[k];
  return v && Date.now() - v.at < SEEN_TTL ? v.job : null;
}

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove('seen:' + tabId));

// The confirmation page rarely contains the JD. Merge with the job last viewed in
// this tab, or in the tab that opened it (LinkedIn "Apply" opens the ATS in a new tab).
async function resolveJob(current, tab) {
  current = current || { url: tab.url };
  if (current.title && (current.description || '').length > 200) return current;
  const seen = (await getSeen(tab.id)) || (await getSeen(tab.openerTabId));
  if (!seen) return current;
  // Different posting than the one cached for this tab → trust the current page.
  if (current.title && A.dedupeKey('', current.title) !== A.dedupeKey('', seen.title)) return current;
  const merged = { ...seen };
  for (const [k, v] of Object.entries(current)) {
    const empty = !merged[k] || (Array.isArray(merged[k]) && !merged[k].length);
    if (v && empty && k !== 'url') merged[k] = v;
  }
  return merged;
}

function toast(tabId, payload) {
  chrome.tabs.sendMessage(tabId, { type: 'JT_TOAST', ...payload }, { frameId: 0 }).catch(() => {});
}

const handlers = {
  async JT_JOB_SEEN({ job }, sender) {
    if (sender.tab) await chrome.storage.session.set({ ['seen:' + sender.tab.id]: { job, at: Date.now() } });
  },

  async JT_APPLY_DETECTED({ job }, sender) {
    const tab = sender.tab;
    if (!tab) return;
    const settings = await S.getSettings();
    if (!settings.autoDetect) return;
    const resolved = await resolveJob(job, tab);
    if (!resolved.title && !resolved.company) return;

    const existing = S.findMatch(resolved, await S.all());
    if (existing && existing.status !== 'wishlist') {
      toast(tab.id, {
        mode: 'exists', appId: existing.id, title: existing.title, company: existing.company,
        statusLabel: JT.label(JT.STATUSES, existing.status),
      });
      return;
    }
    const prevStatus = existing ? existing.status : null;
    const { app, created } = await S.upsertFromJob(resolved, 'applied');
    toast(tab.id, { mode: 'saved', appId: app.id, created, prevStatus, title: app.title, company: app.company });
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
    const events = await E.process(emails, account);
    const changed = events.filter((e) => e.state === 'applied');
    const pending = events.filter((e) => e.state === 'unmatched' || e.state === 'ambiguous');
    if (!sender.tab || (!changed.length && !pending.length)) return;
    const lines = [
      ...changed.map((e) => `${e.company}：${JT.label(JT.STATUSES, e.prevStatus)} → ${JT.label(JT.STATUSES, e.newStatus)}`),
      ...pending.map((e) => `待确认 · ${E.TYPES[e.type].label}：${e.guessCompany || e.subject}`),
    ];
    toast(sender.tab.id, {
      mode: 'email',
      head: changed.length ? `📧 根据邮件更新了 ${changed.length} 个投递` : `📧 有 ${pending.length} 封求职邮件待确认`,
      lines: lines.length > 5 ? [...lines.slice(0, 4), `…另外 ${lines.length - 4} 条`] : lines,
      undoIds: changed.map((e) => e.id),
      hash: 'emails',
    });
  },

  async JT_EMAIL_UNDO({ eventIds }) {
    await E.undo(eventIds);
  },

  // The dashboard signs in (needs a click), then hands over the account for syncing.
  async JT_SYNC_ENABLE({ email }) {
    await Y.enable(email);
    return Y.syncNow();
  },
  JT_SYNC_NOW: () => Y.syncNow(),
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

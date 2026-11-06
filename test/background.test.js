// Loads background.js with an in-memory fake chrome API and drives the message handlers.
const fs = require('fs');
const vm = require('vm');
const ROOT = require('path').join(__dirname, '..') + '/';

function area() {
  const data = {};
  return {
    data,
    async get(keys) {
      if (keys == null) return { ...data };
      const list = [].concat(keys);
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v); },
    async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
  };
}
const local = area();
const session = area();
const toasts = [];
let onMessage = null;
let onInstalled = null;
const injected = [];
const openTabs = [];
const noopEvt = { addListener() {} };
const chrome = {
  storage: { local, session, onChanged: noopEvt },
  runtime: {
    onInstalled: { addListener: (fn) => (onInstalled = fn) }, onStartup: noopEvt, onMessage: { addListener: (fn) => (onMessage = fn) },
    getURL: (p) => 'chrome-extension://x/' + p, getManifest: () => JSON.parse(fs.readFileSync(ROOT + 'manifest.json', 'utf8')),
  },
  scripting: { executeScript: async (opts) => { injected.push(opts); } },
  tabs: {
    onRemoved: noopEvt, onUpdated: noopEvt, onActivated: noopEvt,
    sendMessage: (tabId, msg) => { toasts.push({ tabId, ...msg }); return Promise.resolve(); },
    create: async () => {}, query: async (q) => (q && q.url ? openTabs : []), get: async () => null,
  },
  alarms: { create() {}, onAlarm: { addListener() {} } },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
};
// No network in tests: job APIs answer from fetchReply (404 when it returns nothing).
const fetched = [];
let fetchReply = () => null;
const fakeFetch = async (url) => {
  fetched.push(String(url));
  const body = fetchReply(String(url));
  return { ok: !!body, status: body ? 200 : 404, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body };
};
const ctx = vm.createContext({ chrome, console, crypto, structuredClone, URL, URLSearchParams, Date, setTimeout, clearTimeout, fetch: fakeFetch, AbortController, TextEncoder, TextDecoder, btoa, atob });
ctx.globalThis = ctx;
ctx.importScripts = (...files) => files.forEach((f) => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx));
vm.runInContext(fs.readFileSync(ROOT + 'background.js', 'utf8'), ctx);

const send = (msg, tab) => new Promise((res) => onMessage(msg, { tab }, res));
const apps = () => Object.entries(local.data).filter(([k]) => k.startsWith('app:')).map(([, v]) => v);
let fail = 0;
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra); };

const fullJob = {
  url: 'https://jobs.lever.co/acme/abc-123', title: 'Software Engineer Intern', company: 'Acme', location: 'NYC',
  description: 'Build things. '.repeat(30), jobType: 'intern', keywords: ['Python'], sponsorship: 'unknown',
};

(async () => {
  // The checks below drive automatic recording; the default (button) mode is checked at the end.
  await ctx.JT.store.setSettings({ recordMode: 'auto' });
  // Same-tab flow: view job, then thanks page with no title/JD.
  await send({ type: 'JT_JOB_SEEN', job: fullJob }, { id: 5 });
  await send({ type: 'JT_APPLY_DETECTED', job: { url: 'https://jobs.lever.co/acme/abc-123/thanks', title: '', company: 'Acme', description: '' } }, { id: 5 });
  let list = apps();
  ok('auto-record creates app', list.length === 1 && list[0].title === 'Software Engineer Intern' && list[0].status === 'applied', JSON.stringify(list.map((a) => [a.title, a.status, a.canonicalUrl])));
  ok('toast saved', toasts.at(-1).mode === 'saved' && toasts.at(-1).created === true);

  // Second detection for same job -> "exists", no duplicate.
  await send({ type: 'JT_APPLY_DETECTED', job: { url: 'https://jobs.lever.co/acme/abc-123/thanks', title: '', company: 'Acme' } }, { id: 5 });
  ok('no duplicate', apps().length === 1);
  ok('toast exists', toasts.at(-1).mode === 'exists');

  // Undo removes it.
  await send({ type: 'JT_UNDO', appId: list[0].id, created: true }, { id: 5 });
  ok('undo removes', apps().length === 0);

  // Opener-tab flow: LinkedIn tab 7 -> ATS tab 8 opened from it.
  const li = { ...fullJob, url: 'https://www.linkedin.com/jobs/view/4012345678/', title: 'Data Engineer Intern', company: 'Globex' };
  await send({ type: 'JT_JOB_SEEN', job: li }, { id: 7 });
  await send({ type: 'JT_APPLY_DETECTED', job: { url: 'https://globex.wd1.myworkdayjobs.com/x/job/123/apply', title: '', company: 'Globex' } }, { id: 8, openerTabId: 7 });
  list = apps();
  ok('opener merge', list.length === 1 && list[0].title === 'Data Engineer Intern' && list[0].description.length > 200, JSON.stringify(list.map((a) => a.title)));

  // Different job on confirmation page than cached one -> trust current page.
  await send({ type: 'JT_APPLY_DETECTED', job: { url: 'https://boards.greenhouse.io/initech/jobs/9', title: 'Backend Engineer', company: 'Initech', description: '' } }, { id: 7 });
  ok('different job not merged', apps().some((a) => a.title === 'Backend Engineer' && a.company === 'Initech' && !a.description));

  // Wishlist -> applied, then undo reverts.
  const S = ctx.JT.store;
  const wish = S.newApp({ ...fullJob, url: 'https://jobs.ashbyhq.com/hooli/1', company: 'Hooli', title: 'ML Intern', status: 'wishlist' });
  await S.save(wish);
  await send({ type: 'JT_APPLY_DETECTED', job: { url: 'https://jobs.ashbyhq.com/hooli/1/application', title: 'ML Intern', company: 'Hooli', description: 'x'.repeat(300) } }, { id: 9 });
  let w = await S.get(wish.id);
  ok('wishlist upgraded', w.status === 'applied' && w.appliedDate && toasts.at(-1).prevStatus === 'wishlist');
  await send({ type: 'JT_UNDO', appId: wish.id, created: false, prevStatus: 'wishlist' }, { id: 9 });
  w = await S.get(wish.id);
  ok('undo reverts status', w.status === 'wishlist' && w.appliedDate === '' && w.timeline.length === 1);

  // Workday returns to the job list after submit; a new tab with no cached posting falls back to
  // the posting viewed recently on the same site.
  const unity = { ...fullJob, url: 'https://unitytech.wd1.myworkdayjobs.com/en-US/Unity/job/San-Francisco/Software-Engineer-Intern_JOBREQ-1', company: 'Unity', title: 'Software Engineer Intern, Graphics', source: 'Workday' };
  await send({ type: 'JT_JOB_SEEN', job: unity }, { id: 20 });
  ok('recent posting stored', (local.data.recentJobs || []).some((j) => j.company === 'Unity' && j.host === 'unitytech.wd1.myworkdayjobs.com'));
  await send({ type: 'JT_APPLY_DETECTED', job: { url: 'https://unitytech.wd1.myworkdayjobs.com/en-US/Unity?source=LinkedIn&Job_Application_ID=abc123', company: 'Unity' } }, { id: 21 });
  const u = apps().find((a) => a.company === 'Unity');
  ok('workday list page: recorded with the posting', u && u.title === 'Software Engineer Intern, Graphics' && u.description.length > 200 && /JOBREQ-1/.test(u.url), JSON.stringify(u && [u.title, u.url]));
  // A posting from another company on the same site is not borrowed.
  await send({ type: 'JT_APPLY_DETECTED', job: { url: 'https://unitytech.wd1.myworkdayjobs.com/en-US/Unity?Job_Application_ID=zzz', company: 'Initrode' } }, { id: 22 });
  ok('recent posting of another company not used', apps().some((a) => a.company === 'Initrode' && !a.title));

  // Install / update: inject the content scripts into tabs that are already open.
  openTabs.push(
    { id: 31, url: 'https://job-boards.greenhouse.io/acme/jobs/1' },
    { id: 32, url: 'https://www.linkedin.com/jobs/view/123/' },
    { id: 33, url: 'https://mail.google.com/mail/u/0/#inbox' },
  );
  onInstalled({ reason: 'update' });
  await new Promise((r) => setTimeout(r, 50));
  const by = (id) => injected.filter((x) => x.target.tabId === id);
  ok('inject: ATS tab in all frames', by(31).length === 1 && by(31)[0].target.allFrames === true && by(31)[0].files.includes('content/content.js'), JSON.stringify(by(31)));
  ok('inject: other site top frame', by(32).length === 1 && by(32)[0].target.allFrames === false);
  ok('inject: gmail gets gmail.js too', by(33).some((x) => x.files.includes('content/gmail.js')));

  // Gmail showing a "thank you for applying" email is not an application to Google.
  const gmail = 'https://mail.google.com/mail/u/0/#inbox/FMfcgz';
  await send({ type: 'JT_APPLY_DETECTED', job: { url: gmail, company: 'Google', title: '' } }, { id: 40, url: gmail });
  ok('gmail page: nothing recorded', !apps().some((a) => a.company === 'Google'));

  // Workday: the JD comes from the posting API, replacing text scraped from a /details/ page.
  const WD = 'https://acme.wd5.myworkdayjobs.com/en-US/External';
  fetchReply = (url) =>
    url === 'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/job/ML-Intern_R99'
      ? { jobPostingInfo: { title: 'ML Intern', jobDescription: '<p><b>About the role</b></p><ul><li>Train models in PyTorch</li></ul><p>' + 'We build data platforms. '.repeat(20) + '</p>', location: 'New York, NY', additionalLocations: ['Remote, USA'], timeType: 'Full time', jobReqId: 'R99' } }
      : null;
  const listy = 'Posted Today. Posted Yesterday. Posted 3 Days Ago. 31 JOBS FOUND. ' + 'Some text. '.repeat(40);
  await send({ type: 'JT_JOB_SEEN', job: { url: WD + '/details/ML-Intern_R99?q=ml', title: 'ML Intern', company: 'Acme', location: 'Singapore | 2 Locations | New York, NY', description: listy } }, { id: 41 });
  await send({ type: 'JT_APPLY_DETECTED', job: { url: WD + '?Job_Application_ID=new1', company: 'Acme' } }, { id: 41 });
  await new Promise((r) => setTimeout(r, 50));
  const acme = apps().find((a) => a.company === 'Acme' && a.title === 'ML Intern');
  ok('official JD: fetched from the Workday API', fetched.includes('https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/job/ML-Intern_R99'), JSON.stringify(fetched));
  ok('official JD: replaces the scraped text', acme && /^About the role\n/.test(acme.description) && /• Train models in PyTorch/.test(acme.description) && !/JOBS FOUND/.test(acme.description), acme && JSON.stringify(acme.description.slice(0, 80)));
  ok('official JD: location from the posting', acme && acme.location === 'New York, NY | Remote, USA' && acme.keywords.includes('PyTorch'), acme && acme.location);

  // Default mode: a detected confirmation records nothing; the page button does.
  await S.setSettings({ recordMode: 'button' });
  const before = apps().length;
  const xJob = { ...fullJob, url: 'https://x.com/jobs/1', company: 'X', title: 'Y' };
  await send({ type: 'JT_APPLY_DETECTED', job: xJob }, { id: 10 });
  ok('button mode: detection alone records nothing', apps().length === before);
  let info = await send({ type: 'JT_BUTTON_INFO', url: xJob.url }, { id: 10 });
  ok('button info: labels in the UI language, not tracked yet', info.ok && info.labels.record && !info.appId, JSON.stringify(info.labels));
  const res = await send({ type: 'JT_RECORD', job: xJob }, { id: 10 });
  ok('button: click records as applied', res.state === 'saved' && apps().some((a) => a.id === res.appId && a.status === 'applied' && a.title === 'Y'));
  info = await send({ type: 'JT_BUTTON_INFO', url: xJob.url }, { id: 10 });
  ok('button info: tracked afterwards', info.appId === res.appId);
  const again = await send({ type: 'JT_RECORD', job: xJob }, { id: 10 });
  ok('button: second click finds the record', again.state === 'exists' && apps().length === before + 1);

  // Workday links: /details/ (job search beside the posting) is stored as the posting's /job/ link,
  // and both forms are the same posting.
  const det = 'https://unitytech.wd1.myworkdayjobs.com/en-US/Unity/details/XMLNAME--Req-6087--Software-Developer_JOBREQ-2615965?q=machine+learning&source=LinkedIn&Job_Application_ID=bc8d';
  const r2 = await send({ type: 'JT_RECORD', job: { ...fullJob, url: det, company: 'Unity', title: 'Machine Learning Engineer-Internship' } }, { id: 11 });
  const saved = apps().find((a) => a.id === r2.appId);
  ok('workday link: /job/ instead of /details/', saved && saved.url === 'https://unitytech.wd1.myworkdayjobs.com/en-US/Unity/job/XMLNAME--Req-6087--Software-Developer_JOBREQ-2615965?source=LinkedIn&Job_Application_ID=bc8d', saved && saved.url);
  info = await send({ type: 'JT_BUTTON_INFO', url: 'https://unitytech.wd1.myworkdayjobs.com/Unity/job/Mountain-View-CA-USA/XMLNAME--Req-6087--Software-Developer_JOBREQ-2615965/apply/applyManually' }, { id: 11 });
  ok('workday link: other forms of the posting match it', info.appId === r2.appId);

  // Update: older records with a /details/ link are fixed.
  const old = S.newApp({ ...fullJob, company: 'Old', title: 'Old Intern', status: 'applied' });
  old.url = det;
  await S.save(old);
  onInstalled({ reason: 'update' });
  await new Promise((r) => setTimeout(r, 50));
  ok('update: old /details/ links fixed', (await S.get(old.id)).url.includes('/Unity/job/XMLNAME'), (await S.get(old.id)).url);

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
})();

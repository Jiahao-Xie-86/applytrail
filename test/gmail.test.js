// 1) gmail.js against a Gmail-like DOM  2) background JT_GMAIL_SCAN end-to-end  3) email toast
const { JSDOM } = require('jsdom');
const fs = require('fs');
const vm = require('vm');
const ROOT = require('path').join(__dirname, '..') + '/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra); };

// Markup modeled on Gmail's inbox row / conversation view class names.
const row = (id, name, email, subject, snippet, date) => `
  <tr class="zA zE"><td class="yX xY"><div class="yW"><span class="bA4"><span class="zF" email="${email}" name="${name}">${name}</span></span></div></td>
  <td class="xY a4W"><div class="xS"><div class="xT"><div class="y6"><span class="bog"><span class="bqe" data-thread-id="#thread-f:${id}" data-legacy-thread-id="${id}">${subject}</span></span></div>
  <span class="y2"> - ${snippet}</span></div></div></td><td class="xW xY"><span title="${date}">Nov 3</span></td></tr>`;

const INBOX = `<div role="main"><table><tbody>
  ${row('18c0001', 'Stripe Recruiting', 'no-reply@us.greenhouse-mail.io', 'Your application to Stripe', 'Thank you for your interest in Stripe. Unfortunately, we have decided to move forward with other candidates.', 'Tue, Nov 3, 2026, 4:12 PM')}
  ${row('18c0002', 'Mom', 'mom@example.com', 'Dinner Sunday?', 'Are you coming home', 'Tue, Nov 3, 2026, 5:00 PM')}
  ${row('18c0003', 'Ramp', 'no-reply@ashbyhq.com', 'Next steps with Ramp', 'We invite you to complete a CodeSignal assessment', 'Tue, Nov 3, 2026, 6:00 PM')}
</tbody></table></div>`;

(async () => {
  // ---------- 1) scanner ----------
  const dom = new JSDOM(`<!doctype html><html><body>${INBOX}</body></html>`, { url: 'https://mail.google.com/mail/u/1/#inbox', runScripts: 'outside-only' });
  const w = dom.window;
  const msgs = [];
  w.chrome = { runtime: { id: 'test-ext', sendMessage: (m) => { msgs.push(m); return Promise.resolve(); } }, storage: { local: { get: async () => ({}) } } };
  w.eval(fs.readFileSync(ROOT + 'content/gmail.js', 'utf8'));
  await sleep(1500);
  const first = msgs.find((m) => m.type === 'JT_GMAIL_SCAN' && m.emails.length);
  ok('scanner: sends job-related rows only', first && first.emails.length === 2 && !first.emails.some((e) => e.subject.includes('Dinner')), first ? JSON.stringify(first.emails.map((e) => e.subject)) : 'no message');
  ok('scanner: fields', first && first.account === '/mail/u/1' && first.rows === 3 && first.emails[0].senderEmail === 'no-reply@us.greenhouse-mail.io' && first.emails[0].legacyId === '18c0001' && first.emails[0].dateText.startsWith('Tue') && first.emails[0].body.startsWith('Thank you'), first && JSON.stringify(first.emails[0]));

  // open a conversation
  w.document.body.insertAdjacentHTML('beforeend', `<div><h2 class="hP" data-thread-perm-id="thread-f:18c0009" data-legacy-thread-id="18c0009">Interview Invitation - NVIDIA</h2>
    <div class="adn ads"><span class="gD" email="jane@nvidia.com" name="Jane Doe">Jane Doe</span><span class="g3" title="Wed, Nov 4, 2026, 9:00 AM">9:00 AM</span>
    <div class="a3s aiL">Hi Alex, we would like to schedule a technical phone interview with you. Please share your availability.</div></div></div>`);
  await sleep(3300);
  const opened = msgs.flatMap((m) => m.emails || []).find((e) => e.source === 'open');
  ok('scanner: opened email body', opened && opened.subject.includes('NVIDIA') && opened.body.includes('technical phone interview') && opened.senderEmail === 'jane@nvidia.com');
  const before = msgs.reduce((n, m) => n + (m.emails || []).length, 0);
  w.document.body.appendChild(w.document.createElement('div'));
  await sleep(3300);
  ok('scanner: no resend of same rows', msgs.reduce((n, m) => n + (m.emails || []).length, 0) === before);

  // ---------- 2) background end-to-end ----------
  const area = () => {
    const data = {};
    return {
      data,
      async get(keys) {
        if (keys == null) return structuredClone(data);
        return Object.fromEntries([].concat(keys).filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
      },
      async set(obj) { for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v); },
      async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
    };
  };
  const local = area();
  const toasts = [];
  let onMessage = null;
  const evt = { addListener() {} };
  const chrome = {
    storage: { local, session: area(), onChanged: evt },
    runtime: { onInstalled: evt, onStartup: evt, onMessage: { addListener: (fn) => (onMessage = fn) }, getURL: (p) => p },
    tabs: { onRemoved: evt, onUpdated: evt, onActivated: evt, sendMessage: (id, m) => { toasts.push(m); return Promise.resolve(); }, create: async () => {}, query: async () => [], get: async () => null },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    i18n: { getUILanguage: () => 'zh-CN' },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  };
  const ctx = vm.createContext({ chrome, console, crypto, structuredClone, URL, URLSearchParams, Date, setTimeout, clearTimeout, fetch, TextEncoder, TextDecoder, btoa, atob });
  ctx.globalThis = ctx;
  ctx.importScripts = (...files) => files.forEach((f) => vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx));
  vm.runInContext(fs.readFileSync(ROOT + 'background.js', 'utf8'), ctx);
  const S = ctx.JT.store;
  await S.save(S.newApp({ company: 'Stripe', title: 'Software Engineer Intern', appliedDate: '2026-10-20' }));
  await S.save(S.newApp({ company: 'NVIDIA', title: 'Deep Learning Intern', appliedDate: '2026-10-25', status: 'oa' }));
  const send = (m) => new Promise((res) => onMessage(m, { tab: { id: 3 } }, res));

  const allEmails = msgs.flatMap((m) => m.emails || []);
  await send({ type: 'JT_GMAIL_SCAN', account: '/mail/u/1', rows: 3, opened: true, emails: allEmails });
  const apps = await S.all();
  const status = Object.fromEntries(apps.map((a) => [a.company, a.status]));
  ok('bg: stripe rejected, nvidia interviewing', status.Stripe === 'rejected' && status.NVIDIA === 'interviewing', JSON.stringify(status));
  const t = toasts.at(-1);
  ok('bg: toast payload', t && t.mode === 'email' && t.undoIds.length === 2 && t.lines.length === 3, t && JSON.stringify(t.lines));
  ok('bg: toast text in Chinese', t.head.includes('根据邮件更新了 2 个投递') && t.buttons.map((b) => b.label).join() === '查看,撤销', JSON.stringify([t.head, t.buttons]));
  // switch to English: later toasts are built in English
  await S.setSettings({ lang: 'en' });
  ctx.JT.i18n.setLang('en');
  ok('bg: English label', ctx.JT.label(ctx.JT.STATUSES, 'rejected') === 'Rejected' && ctx.JT.email.TYPES.interview.label === 'Interview invite');
  ctx.JT.i18n.setLang('zh');
  await S.setSettings({ lang: 'auto' });
  ok('bg: scan heartbeat stored', local.data.gmailScan && local.data.gmailScan.rows === 3);

  await send({ type: 'JT_EMAIL_UNDO', eventIds: t.undoIds });
  const after = Object.fromEntries((await S.all()).map((a) => [a.company, a.status]));
  ok('bg: undo restores', after.Stripe === 'applied' && after.NVIDIA === 'oa', JSON.stringify(after));

  await S.setSettings({ emailDetect: false });
  const nToasts = toasts.length;
  await send({ type: 'JT_GMAIL_SCAN', account: '/mail/u/1', rows: 3, opened: false, emails: [{ ...allEmails[0], legacyId: 'other' }] });
  ok('bg: disabled -> no processing', toasts.length === nToasts);

  // ---------- 3) email toast rendering ----------
  const page = new JSDOM('<!doctype html><html><body><p>x</p></body></html>', { url: 'https://mail.google.com/mail/u/0/#inbox', runScripts: 'outside-only' });
  const pw = page.window;
  const sent = [];
  let listener = null;
  pw.chrome = { runtime: { id: 'test-ext', onMessage: { addListener: (fn) => (listener = fn) }, sendMessage: (m) => { sent.push(m); return Promise.resolve(); } }, storage: { local: { get: async () => ({}) } } };
  pw.eval(['lib/analyze.js', 'content/extractors.js', 'content/content.js'].map((f) => fs.readFileSync(ROOT + f, 'utf8')).join('\n;\n'));
  listener(t, {}, () => {});
  const host = [...pw.document.documentElement.children].find((el) => el.shadowRoot);
  const txt = host && host.shadowRoot.textContent;
  ok('toast: email lines shown', txt && txt.includes('根据邮件更新了 2 个投递') && txt.includes('Stripe：已投递 → 被拒'), txt && txt.replace(/\s+/g, ' ').slice(0, 200));
  host.shadowRoot.querySelector('[data-act="undo"]').click();
  await sleep(20);
  ok('toast: undo sends event ids', sent.some((m) => m.type === 'JT_EMAIL_UNDO' && m.eventIds.length === 2));

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(0);
})();

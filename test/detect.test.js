// Simulates content.js in jsdom: job page view -> submit -> confirmation text appears.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const ROOT = require('path').join(__dirname, '..') + '/';
const code = ['lib/analyze.js', 'content/extractors.js', 'content/content.js'].map((f) => fs.readFileSync(ROOT + f, 'utf8')).join('\n;\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fail++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

function makePage(url, bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><head><title>t</title></head><body>${bodyHtml}</body></html>`, { url, runScripts: 'outside-only' });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  const sent = [];
  let listener = null;
  w.chrome = {
    runtime: { id: 'test-ext',
      onMessage: { addListener: (fn) => (listener = fn) },
      sendMessage: (msg) => { sent.push(msg); return Promise.resolve({ ok: true }); },
    },
    storage: { local: { get: async () => ({}) } },
  };
  w.eval(code);
  return { dom, w, sent, listener: () => listener };
}

const JD = '<h2>Responsibilities</h2><p>' + 'Build backend services in Python and Go. '.repeat(10) + '</p><h2>Qualifications</h2><p>' + 'Pursuing a BS in CS. '.repeat(10) + '</p>';

(async () => {
  // 1) Greenhouse: view job, click submit, confirmation text appears (same page)
  {
    const p = makePage('https://job-boards.greenhouse.io/acme/jobs/123', `<div class="job__title"><h1>Software Engineer Intern</h1></div><div class="job__location">New York, NY</div><div class="job__description">${JD}</div><form><button id="submit">Submit application</button></form>`);
    await sleep(1700);
    const seen = p.sent.find((m) => m.type === 'JT_JOB_SEEN');
    ok('greenhouse: job remembered', !!seen, seen ? `${seen.job.title} @ ${seen.job.company}` : '');
    ok('greenhouse: no false trigger on load', !p.sent.some((m) => m.type === 'JT_APPLY_DETECTED'));
    p.w.document.getElementById('submit').dispatchEvent(new p.w.MouseEvent('click', { bubbles: true }));
    p.w.document.body.innerHTML = '<div class="job__title"><h1>Thank you for applying.</h1></div><p>Your application has been submitted.</p>';
    await sleep(1500);
    const det = p.sent.find((m) => m.type === 'JT_APPLY_DETECTED');
    ok('greenhouse: submission detected after click', !!det, det ? `title=${JSON.stringify(det.job.title)} company=${det.job.company}` : '');
    ok('greenhouse: "Thank you" not used as title', det && det.job.title === '');
  }

  // 2) Lever /thanks page loaded fresh -> detected on load
  {
    const p = makePage('https://jobs.lever.co/acme/abc-123/thanks', '<h3>Application submitted!</h3><p>Thank you for your application to Acme.</p>');
    await sleep(1700);
    ok('lever thanks: detected on load', p.sent.some((m) => m.type === 'JT_APPLY_DETECTED'));
  }

  // 3) LinkedIn listing that already shows "Application submitted" badge -> no trigger
  {
    const p = makePage('https://www.linkedin.com/jobs/view/4012345678/', '<h1>Data Analyst</h1><span>Application submitted 3 days ago</span>' + JD);
    await sleep(1700);
    p.w.document.body.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true }));
    await sleep(1400);
    ok('linkedin badge: no false trigger', !p.sent.some((m) => m.type === 'JT_APPLY_DETECTED'));
    // Easy Apply success modal appears after clicking "Submit application"
    p.w.document.body.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true }));
    p.w.document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><h2>Application sent</h2><p>Your application was sent to Acme!</p></div>');
    await sleep(1400);
    ok('linkedin easy apply: detected', p.sent.some((m) => m.type === 'JT_APPLY_DETECTED'));
  }

  // 3b) Workday: posting -> apply steps -> back on the job list with ?Job_Application_ID=… (SPA).
  {
    const p = makePage(
      'https://unitytech.wd1.myworkdayjobs.com/en-US/Unity/job/San-Francisco-CA-USA/Software-Engineer-Intern_JOBREQ-2616001',
      `<h2 data-automation-id="jobPostingHeader">Software Engineer Intern</h2><div data-automation-id="jobPostingDescription">${JD}</div>`
    );
    await sleep(1700);
    const seen = p.sent.find((m) => m.type === 'JT_JOB_SEEN');
    ok('workday: company is the site name, not the tenant id', seen && seen.job.company === 'Unity', seen ? seen.job.company : '');
    p.w.document.body.innerHTML = '<p>136 JOBS FOUND</p><a>Senior Data Engineer</a><p>' + 'Posted Today. '.repeat(30) + '</p>';
    p.w.history.pushState({}, '', '/en-US/Unity?source=LinkedIn&Job_Application_ID=bc8df09d75e2900187b8120f74220000');
    await sleep(2800);
    const hits = p.sent.filter((m) => m.type === 'JT_APPLY_DETECTED');
    ok('workday: submit detected from the URL', hits.length === 1, JSON.stringify(hits.map((m) => m.job)));
    ok('workday: list page sends no title or JD', hits[0] && !hits[0].job.title && !hits[0].job.description && hits[0].job.company === 'Unity');
    p.w.dispatchEvent(new p.w.MouseEvent('click'));
    p.w.document.body.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true }));
    await sleep(1500);
    ok('workday: reported once', p.sent.filter((m) => m.type === 'JT_APPLY_DETECTED').length === 1);
  }

  // 3c) Workday confirmation wording
  {
    const p = makePage('https://acme.wd5.myworkdayjobs.com/en-US/External/job/NY/Analyst_R1', '<p>Review</p>');
    await sleep(1700);
    p.w.document.body.dispatchEvent(new p.w.MouseEvent('click', { bubbles: true }));
    // A space keeps the words apart, as the browser's innerText would (jsdom joins blocks).
    p.w.document.body.insertAdjacentHTML('beforeend', ' <div role="dialog"><h2>You have submitted a Job Application</h2></div>');
    await sleep(1500);
    ok('workday: "You have submitted" detected', p.sent.some((m) => m.type === 'JT_APPLY_DETECTED'));
  }

  // 3d) A copy cut off by an extension reload hands over to a fresh, re-injected copy.
  {
    const p = makePage('https://jobs.lever.co/acme/1', '<p>x</p>');
    const before = p.listener();
    p.w.eval(code); // injected again while the first copy is still connected: ignored
    ok('reinjection: live copy kept', p.listener() === before);
    p.w.chrome.runtime.id = undefined; // extension reloaded: the old copy is orphaned
    p.w.eval(code);
    p.w.chrome.runtime.id = 'test-ext';
    ok('reinjection: new copy takes over', p.listener() !== before);
  }

  // 4) Unrelated site -> content script stays idle
  {
    const p = makePage('https://news.example.com/article/1', '<h1>Thank you for applying sunscreen</h1>');
    await sleep(1700);
    ok('unrelated site: idle', p.sent.length === 0);
  }

  // 5) Toast renders in shadow DOM and undo sends message
  {
    const p = makePage('https://jobs.lever.co/acme/abc-123', '<p>x</p>');
    p.listener()({ type: 'JT_TOAST', mode: 'saved', appId: 'id1', created: true, title: 'SWE Intern', company: 'Acme', head: '✓ 已自动记录投递', buttons: [{ act: 'open', label: '编辑', primary: true }, { act: 'undo', label: '撤销' }], closeLabel: '关闭', unknownTitle: '未识别到职位名' }, {}, () => {});
    const host = [...p.w.document.documentElement.children].find((el) => el.shadowRoot);
    const text = host && host.shadowRoot.textContent;
    ok('toast: rendered', !!text && text.includes('已自动记录') && text.includes('SWE Intern') && text.includes('编辑'));
    host.shadowRoot.querySelector('[data-act="undo"]').click();
    await sleep(50);
    ok('toast: undo message sent', p.sent.some((m) => m.type === 'JT_UNDO' && m.appId === 'id1' && m.created === true));
  }

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(0);
})();

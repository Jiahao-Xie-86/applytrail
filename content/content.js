// Content script: answers the popup's "extract" request, remembers the job
// being viewed, and detects "thanks for applying" screens so the application
// gets recorded automatically.
(function () {
  // After the extension is reloaded or updated, the copy already in the page is cut off from it
  // (chrome.runtime.id is gone) and the background injects a fresh copy, which takes over.
  const alive = () => {
    try {
      return !!chrome.runtime.id;
    } catch {
      return false;
    }
  };
  if (window.__JT_CONTENT_ALIVE__ && window.__JT_CONTENT_ALIVE__()) return;
  window.__JT_CONTENT_ALIVE__ = alive;
  const send = (msg) => {
    if (!alive()) return Promise.resolve();
    try {
      return chrome.runtime.sendMessage(msg).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  };

  const JT = globalThis.JT;
  const A = JT.analyze;
  const isTop = window === window.top;
  const host = location.hostname.toLowerCase();

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'JT_EXTRACT' && isTop) {
      try {
        sendResponse({ ok: true, job: JT.extract(), selection: String(window.getSelection() || '').trim() });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    } else if (msg.type === 'JT_TOAST' && isTop) {
      showToast(msg);
    }
  });

  // ---------- gating: only watch pages that look job-related ----------

  const JOBISH = /(career|jobs?\b|jobs?[/.-]|apply|application|recruit|talent|hiring|position|opening|vacanc|requisition|join-?us|work-?with-?us)/i;
  function isJobRelated() {
    if (A.isKnownJobHost(host)) return true;
    if (!isTop) return false; // iframes: only the ATS hosts listed in the manifest
    return JOBISH.test(location.hostname + location.pathname + location.search) || JT.hasJsonLdJob();
  }

  // ---------- "application submitted" detection ----------

  const STRONG = [
    /thank(s| you)( so much)? for (your )?(appl(ying|ication)|submitting (your|an) application)/i,
    /your application (has been|was|is) (successfully )?(submitted|received|sent|complete)/i,
    /(we['’]ve|we have) (successfully )?received your application/i,
    /your application was sent to/i, // LinkedIn Easy Apply
    /(you['’]ve|you have) successfully (applied|submitted)/i,
    /successfully submitted your application/i,
    /\byou(['’]ve| have) (successfully )?submitted (a |an |your )?(job )?application\b/i, // Workday
    /\bapplication (was |has been )?successfully submitted\b/i,
  ];
  const WEAK = [/\bapplication (submitted|received|complete)\b/i, /\bsuccessfully submitted\b/i];
  // Workday goes back to the job list with ?Job_Application_ID=… right after you submit. Its
  // message differs per employer, so the URL is the reliable signal. The id then stays on every
  // link you open on that site, so only a new id counts: one that was not in the URL before.
  const appId = (search) => (/[?&](?:job_application_id|jobapplicationid)=(\w+)/i.exec(search) || [])[1] || '';
  let knownAppId = appId(location.search);
  try {
    // A full page load straight from the application form still counts.
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (knownAppId && ref && ref.host === location.host && /\/apply(\/|$)/.test(ref.pathname) && appId(ref.search) !== knownAppId) knownAppId = '';
  } catch {}
  // Job boards show "Application submitted" badges on listings, so only trust strong phrases there.
  const BOARD = /linkedin\.com$|indeed\.com$|glassdoor\.(com|ca)$|joinhandshake\.com$/;
  const CONFIRM_URL = /(thank|confirmation|confirm|success|submitted|post-?apply|complete)/i;
  const RANK = { '': 0, weak: 1, strong: 2 };

  let lastState = null;
  const fired = new Set();

  function matchState() {
    const t = document.body ? document.body.innerText : '';
    if (STRONG.some((re) => re.test(t))) return 'strong';
    if (!BOARD.test(host) && WEAK.some((re) => re.test(t))) return 'weak';
    return '';
  }

  function check(reason) {
    if (!alive()) return;
    const id = A.isKnownJobHost(host) ? appId(location.search) : '';
    if (id && id !== knownAppId) {
      knownAppId = id;
      // The confirmation text on this page must not record it a second time.
      fired.add(A.canonicalUrl(location.href));
      lastState = matchState();
      onApplied(true);
      return;
    }
    const st = matchState();
    const prev = lastState;
    lastState = st;
    if (!st) return;
    const urlConfirm = CONFIRM_URL.test(location.pathname + location.search);
    // On first load the text must be strong or the URL must look like a confirmation page;
    // later, any rise (nothing → weak/strong) after a click or navigation counts.
    const fire = reason === 'load' ? st === 'strong' || urlConfirm : RANK[st] > RANK[prev || ''];
    if (!fire) return;
    const key = A.canonicalUrl(location.href);
    if (fired.has(key)) return;
    fired.add(key);
    onApplied();
  }

  function extractSafe() {
    try {
      const job = JT.extract();
      // A confirmation page's h1 is often "Thank you for applying" — not a job title.
      if (job.title && (/^(thank|success|application (sent|submitted|received))/i.test(job.title) || STRONG.some((re) => re.test(job.title)))) {
        job.title = '';
      }
      return job;
    } catch {
      return { url: location.href };
    }
  }

  // listPage: the page after submitting is the employer's job list (Workday). Only the company
  // comes from it; the background fills in the posting viewed earlier in this tab.
  function onApplied(listPage) {
    const job = extractSafe();
    send({ type: 'JT_APPLY_DETECTED', job: listPage ? { url: location.href, company: job.company || '' } : job });
  }

  // Remember the job being viewed so the confirmation page (which usually has
  // no JD) can be matched back to it.
  function rememberJob() {
    if (!alive()) return;
    const job = extractSafe();
    if (job.title && (job.description || '').length > 200) send({ type: 'JT_JOB_SEEN', job });
  }

  async function start() {
    let settings = {};
    try { settings = (await chrome.storage.local.get('settings')).settings || {}; } catch {}
    if (settings.autoDetect === false || !isJobRelated()) return;

    setTimeout(() => { check('load'); rememberJob(); }, 1500);
    setTimeout(() => check('later'), 4000);
    // Slow single-page sites (Workday) render the posting several seconds after load.
    [5000, 12000].forEach((ms) => setTimeout(rememberJob, ms));

    // Confirmations follow a click on "Submit", so only re-check after user actions.
    let timers = [];
    const scheduleChecks = () => {
      timers.forEach(clearTimeout);
      timers = [1200, 3000, 6000].map((ms) => setTimeout(() => check('click'), ms));
    };
    document.addEventListener('click', scheduleChecks, { capture: true, passive: true });
    document.addEventListener('submit', scheduleChecks, { capture: true, passive: true });

    // SPA navigation (LinkedIn job switching, Workday steps, ...).
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      setTimeout(() => check('nav'), 1500);
      [2000, 6000].forEach((ms) => setTimeout(rememberJob, ms));
    }, 1000);
  }

  // ---------- toast (shadow DOM so page CSS can't interfere) ----------

  let toastHost = null;
  let toastTimer = null;

  function showToast(msg) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
      toastHost.attachShadow({ mode: 'open' });
      document.documentElement.appendChild(toastHost);
    }
    const root = toastHost.shadowRoot;
    const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    // All text arrives from the background, already in the UI language.
    const job =
      msg.mode === 'email'
        ? (msg.lines || []).map(esc).join('<br>')
        : `${esc(msg.title) || `<i>${esc(msg.unknownTitle)}</i>`}${msg.company ? ' · ' + esc(msg.company) : ''}`;
    const head = esc(msg.head);
    const buttons = (msg.buttons || [])
      .map((b) => `<button data-act="${b.act === 'undo' ? 'undo' : 'open'}"${b.primary ? ' class="primary"' : ''}>${esc(b.label)}</button>`)
      .join('');
    root.innerHTML = `
      <style>
        .t{font:13px/1.45 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;background:#111827;color:#f9fafb;
           border-radius:10px;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.28);width:300px;}
        .h{font-weight:600;margin-bottom:2px;display:flex;justify-content:space-between;gap:8px}
        .j{color:#d1d5db;margin-bottom:10px;word-break:break-word}
        .x{background:none;border:0;color:#9ca3af;cursor:pointer;font-size:16px;line-height:1;padding:0}
        .b{display:flex;gap:8px}
        button[data-act]{font:inherit;border-radius:6px;border:1px solid #374151;background:#1f2937;color:#f9fafb;padding:4px 10px;cursor:pointer}
        button.primary{background:#2563eb;border-color:#2563eb}
        button[data-act]:hover{filter:brightness(1.15)}
      </style>
      <div class="t"><div class="h"><span>${head}</span><button class="x" data-act="close" title="${esc(msg.closeLabel)}">×</button></div>
      <div class="j">${job}</div><div class="b">${buttons}</div></div>`;

    root.querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'open') send({ type: 'JT_OPEN_DASHBOARD', appId: msg.appId, hash: msg.hash });
        if (act === 'undo') {
          await send(
            msg.mode === 'email'
              ? { type: 'JT_EMAIL_UNDO', eventIds: msg.undoIds }
              : { type: 'JT_UNDO', appId: msg.appId, created: msg.created, prevStatus: msg.prevStatus }
          );
        }
        hideToast();
      })
    );
    const card = root.querySelector('.t');
    const arm = () => { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, msg.mode === 'exists' ? 5000 : msg.mode === 'email' ? 15000 : 12000); };
    card.addEventListener('mouseenter', () => clearTimeout(toastTimer));
    card.addEventListener('mouseleave', arm);
    arm();
  }

  function hideToast() {
    clearTimeout(toastTimer);
    if (toastHost) toastHost.shadowRoot.innerHTML = '';
  }

  start();
})();

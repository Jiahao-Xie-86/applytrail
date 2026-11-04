// Content script: answers the popup's "extract" request, remembers the job
// being viewed, and detects "thanks for applying" screens so the application
// gets recorded automatically.
(function () {
  if (window.__JT_CONTENT_LOADED__) return;
  window.__JT_CONTENT_LOADED__ = true;

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
  ];
  const WEAK = [/\bapplication (submitted|received|complete)\b/i];
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

  function onApplied() {
    chrome.runtime.sendMessage({ type: 'JT_APPLY_DETECTED', job: extractSafe() }).catch(() => {});
  }

  // Remember the job being viewed so the confirmation page (which usually has
  // no JD) can be matched back to it.
  function rememberJob() {
    const job = extractSafe();
    if (job.title && (job.description || '').length > 200) {
      chrome.runtime.sendMessage({ type: 'JT_JOB_SEEN', job }).catch(() => {});
    }
  }

  async function start() {
    let settings = {};
    try { settings = (await chrome.storage.local.get('settings')).settings || {}; } catch {}
    if (settings.autoDetect === false || !isJobRelated()) return;

    setTimeout(() => { check('load'); rememberJob(); }, 1500);
    setTimeout(() => check('later'), 4000);

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
      setTimeout(rememberJob, 2000);
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
    let job = `${esc(msg.title) || '<i>未识别到职位名</i>'}${msg.company ? ' · ' + esc(msg.company) : ''}`;
    let head, buttons;
    if (msg.mode === 'email') {
      head = esc(msg.head);
      job = msg.lines.map(esc).join('<br>');
      buttons = `<button data-act="open" class="primary">查看</button>${msg.undoIds.length ? '<button data-act="undo">撤销</button>' : ''}`;
    } else if (msg.mode === 'exists') {
      head = `✓ 已在追踪中（${esc(msg.statusLabel)}）`;
      buttons = `<button data-act="open">查看</button>`;
    } else {
      head = msg.title ? '✓ 已自动记录投递' : '✓ 已记录投递，但信息不全';
      buttons = `<button data-act="open" class="primary">${msg.title ? '编辑' : '补充信息'}</button><button data-act="undo">撤销</button>`;
    }
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
      <div class="t"><div class="h"><span>${head}</span><button class="x" data-act="close" title="关闭">×</button></div>
      <div class="j">${job}</div><div class="b">${buttons}</div></div>`;

    root.querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'open') chrome.runtime.sendMessage({ type: 'JT_OPEN_DASHBOARD', appId: msg.appId, hash: msg.hash });
        if (act === 'undo') {
          await chrome.runtime.sendMessage(
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

// Gmail content script: reads sender / subject / snippet of inbox rows and the
// body of the opened email, keeps only job-related ones, and hands them to the
// background worker for classification. Nothing leaves the browser.
(function () {
  if (window.__JT_GMAIL_LOADED__ || window !== window.top) return;
  window.__JT_GMAIL_LOADED__ = true;

  const account = (location.pathname.match(/\/mail\/u\/\d+/) || ['/mail/u/0'])[0];
  // Cheap pre-filter so personal mail never reaches the classifier.
  const JOBISH = /(appl(y|ied|ication|ying)|interview|assessment|candida|position|role\b|offer|recruit|hiring|career|talent|opportunit|your interest|hackerrank|codesignal|codility|hirevue|unfortunately|next steps)/i;
  const sent = new Set();
  const txt = (el) => (el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  // Signed-in address, shown in the tab title ("Inbox (2) - you@school.edu - ...").
  const me = () => ((document.title.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [])[0] || '').toLowerCase();
  const emailOf = (el) => ((el && el.getAttribute('email')) || '').toLowerCase();

  function fromRow(tr) {
    // Threads you replied in list you as a participant ("me, Recruiter") — use the other side.
    const spans = [...tr.querySelectorAll('span[email]')];
    const sender = spans.find((s) => emailOf(s) !== me()) || spans[0];
    const idEl = tr.querySelector('[data-legacy-thread-id], [data-thread-id]');
    const dateEl = tr.querySelector('td.xW span[title], .xW span[title], td.xW [title]');
    return {
      source: 'list',
      threadId: ((idEl && idEl.getAttribute('data-thread-id')) || '').replace(/^#/, ''),
      legacyId: (idEl && idEl.getAttribute('data-legacy-thread-id')) || '',
      subject: txt(tr.querySelector('.bog')),
      body: txt(tr.querySelector('.y2')).replace(/^[-–—\s]+/, ''),
      senderName: (sender && (sender.getAttribute('name') || txt(sender))) || '',
      senderEmail: (sender && sender.getAttribute('email')) || '',
      dateText: (dateEl && dateEl.getAttribute('title')) || '',
    };
  }

  // The newest expanded message of the open conversation that you didn't write yourself.
  function fromOpened() {
    const h2 = document.querySelector('h2.hP');
    if (!h2) return null;
    const senderOf = (m) => m.querySelector('span.gD[email]') || m.querySelector('span[email]');
    const msgs = [...document.querySelectorAll('div.adn')].filter((m) => m.querySelector('.a3s') && emailOf(senderOf(m)) !== me());
    const last = msgs[msgs.length - 1];
    if (!last) return null;
    const sender = senderOf(last);
    const dateEl = last.querySelector('span.g3[title]');
    return {
      source: 'open',
      threadId: (h2.getAttribute('data-thread-perm-id') || '').replace(/^#/, ''),
      legacyId: h2.getAttribute('data-legacy-thread-id') || '',
      subject: txt(h2),
      body: txt(last.querySelector('.a3s')).slice(0, 8000),
      senderName: (sender && (sender.getAttribute('name') || txt(sender))) || '',
      senderEmail: (sender && sender.getAttribute('email')) || '',
      dateText: (dateEl && dateEl.getAttribute('title')) || '',
    };
  }

  let lastReport = 0;
  function scan() {
    const rows = document.querySelectorAll('tr.zA');
    const batch = [];
    const take = (em, key) => {
      if (!em || !em.subject || sent.has(key)) return;
      sent.add(key);
      if (JOBISH.test(`${em.subject} ${em.body} ${em.senderName}`)) batch.push(em);
    };
    rows.forEach((tr) => {
      const em = fromRow(tr);
      take(em, `list|${em.legacyId || em.threadId || em.subject + em.senderEmail}|${em.dateText}`);
    });
    const opened = fromOpened();
    if (opened) take(opened, `open|${opened.legacyId || opened.threadId}|${opened.dateText}|${opened.body.length}`);

    // Report at least once a minute so the dashboard can show the scanner is alive.
    if (!batch.length && Date.now() - lastReport < 60000) return;
    lastReport = Date.now();
    chrome.runtime.sendMessage({ type: 'JT_GMAIL_SCAN', account, rows: rows.length, opened: !!opened, emails: batch }).catch(() => {});
  }

  let timer = null;
  let lastRun = 0;
  function schedule() {
    clearTimeout(timer);
    const wait = Math.max(1200, 3000 - (Date.now() - lastRun));
    timer = setTimeout(() => {
      lastRun = Date.now();
      scan();
    }, wait);
  }

  (async () => {
    let settings = {};
    try { settings = (await chrome.storage.local.get('settings')).settings || {}; } catch {}
    if (settings.emailDetect === false) return;
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    schedule();
  })();
})();

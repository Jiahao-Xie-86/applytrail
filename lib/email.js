// Recruiting-email recognition: classify an email (confirmation / OA / interview /
// offer / rejection), match it to a tracked application, and update its status.
// Runs in the service worker; the Gmail content script only collects raw text.
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});
  const A = JT.analyze;
  const S = JT.store;
  const E = (JT.email = {});

  // target status, and the statuses it may move an application from
  E.TYPES = {
    received: { label: '投递确认', target: 'applied', from: ['wishlist'] },
    oa: { label: 'OA 邀请', target: 'oa', from: ['wishlist', 'applied', 'ghosted'] },
    interview: { label: '面试邀请', target: 'interviewing', from: ['wishlist', 'applied', 'oa', 'ghosted'] },
    offer: { label: 'Offer', target: 'offer', from: ['wishlist', 'applied', 'oa', 'interviewing', 'ghosted', 'rejected', 'withdrawn'] },
    rejected: { label: '拒信', target: 'rejected', from: ['wishlist', 'applied', 'oa', 'interviewing', 'ghosted'] },
  };

  // Job alerts / digests that mention companies but say nothing about *your* application.
  const NOISE = /(job alert|jobs? (you may|you might|for you|matching|based on)|recommended (jobs|for you)|new jobs?\b|top job picks|jobs? (like|similar)|is hiring|are hiring|now hiring|people (also )?viewed|newsletter|webinar|info session|career fair|job search)/i;

  // Checked in this order; first type with a hit wins.
  const RULES = [
    ['offer', [
      /\b(pleased|happy|excited|delighted|thrilled) to (extend|offer)\b/i,
      /\boffer letter\b/i,
      /\bextend(ing)? (you )?(an|a verbal|a written) offer\b/i,
      /\b(congratulations|congrats)\b[^.\n]{0,100}\boffer\b/i,
    ]],
    ['rejected', [
      /\bunfortunately\b[^]{0,250}?\b(not|other candidates|decided|unable to (offer|move)|won['’]t be|no longer)\b/i,
      /\b(not|won['’]t) (be )?(moving|move|proceeding|proceed) forward with (your|you)\b/i,
      /\bdecided (not to|to not) (proceed|move forward|pursue|advance|continue)/i,
      /\b(move|moving|proceed|proceeding|go|going) forward with (other|another|different) (candidates?|applicants?)/i,
      /\bpursue other (candidates|applicants)\b/i,
      /\b(you were|you have|have) not (been )?selected\b/i,
      /\bno longer (under consideration|being considered|considering your)/i,
      /\bposition (has|have) (now )?been filled\b/i,
      /\bregret to (inform|let you know)\b/i,
      /\bnot (be )?(progressing|advancing) (with )?your (application|candidacy)/i,
    ]],
    ['oa', [
      /\b(online|coding|technical|skills?|programming) (assessment|challenge|test|exercise)\b/i,
      /\b(hackerrank|codesignal|codility|hirevue|coderpad|testgorilla|pymetrics|imocha|byteboard|mettl|qualified\.io)\b/i,
      /\btake[- ]home (assignment|project|exercise|challenge|assessment)\b/i,
      /\bcomplete (the|an|your|this|our) (assessment|challenge|test)\b/i,
    ]],
    ['interview', [
      /\b(schedule|reschedule|book|set up|arrange|coordinate)\b[^.\n]{0,60}\b(interview|phone screen|call|chat|conversation)\b/i,
      /\byour (upcoming )?interview (with|at|for|on)\b/i,
      /\binterview (invitation|invite|request|confirmation|confirmed|scheduled|availability)\b/i,
      /\binvit(e|ing|ation)\b[^.\n]{0,50}\b(interview|phone screen|onsite|on-site|superday|final round)\b/i,
      /\b(phone|video|technical|virtual|final[- ]round|onsite|on-site|recruiter) (screen|interview)s?\b/i,
      /\bsuperday\b/i,
      /\b(provide|share|send)( us)? your availability\b/i,
      /\b(calendly\.com|goodtime\.io|modernloop|karat)\b/i,
    ]],
    ['received', [
      /\bthank(s| you)( so much)? for (applying|your application|submitting)/i,
      /\b(we['’]ve|we have) (successfully )?received your application\b/i,
      /\byour application (has been|was) (successfully )?(received|submitted)\b/i,
      /\byour application was sent to\b/i,
      /\bapplication (confirmation|received|submitted)\b/i,
    ]],
  ];

  // "We will reach out to schedule an interview if your background matches" is not an invite.
  const CONDITIONAL = /\b(if|should|may|might|once|in the event|will (be in touch|reach out|contact|review)|would like to learn)\b/i;

  E.isNoise = (email) => NOISE.test(email.subject || '');

  E.classify = function (email) {
    if (E.isNoise(email)) return null;
    const text = `${email.subject || ''}\n${email.body || ''}`;
    const sentences = text.split(/\n+|(?<=[.!?])\s+/);
    for (const [type, rules] of RULES) {
      for (const re of rules) {
        if (type === 'oa' || type === 'interview' || type === 'offer') {
          const hit = sentences.find((s) => re.test(s) && !CONDITIONAL.test(s));
          if (hit) return { type, evidence: A.oneLine(hit).slice(0, 200) };
        } else {
          const m = re.exec(text);
          if (m) return { type, evidence: A.oneLine(m[0]).slice(0, 200) };
        }
      }
    }
    return null;
  };

  // Gmail tooltips: "Tue, Nov 3, 2026, 4:12 PM" or "2026年11月3日 下午4:12".
  E.parseDate = function (s) {
    if (!s) return null;
    const t = Date.parse(String(s).replace(/[  ]/g, ' ').replace(/\s+at\s+/i, ' '));
    if (!isNaN(t)) return t;
    const m = /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(?:周.\s*)?(?:(上午|下午)\s*)?(?:(\d{1,2}):(\d{2}))?/.exec(s);
    if (!m) return null;
    let h = +(m[5] || 0);
    if (m[4] === '下午' && h < 12) h += 12;
    if (m[4] === '上午' && h === 12) h = 0;
    return new Date(+m[1], +m[2] - 1, +m[3], h, +(m[6] || 0)).getTime();
  };

  // ---------- matching ----------

  const COMPANY_SUFFIX = /\b(inc|llc|ltd|corp|corporation|co|company|technologies|technology|labs|group|holdings|the|plc|gmbh|usa|us|international)\b/g;
  E.normCompany = (name) =>
    String(name || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(COMPANY_SUFFIX, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Senders whose domain says nothing about the hiring company (ATS, job boards, webmail, tools).
  const ATS_DOMAINS = /@([\w-]+\.)*(greenhouse|lever|myworkday|workday|icims|smartrecruiters|ashbyhq|jobvite|workable|taleo|successfactors|oraclecloud|eightfold|bamboohr|rippling|linkedin|indeed|glassdoor|joinhandshake|handshake|hackerrank|codesignal|hirevue|gmail|googlemail|outlook|hotmail|yahoo|icloud|qq|163|calendly|goodtime)[\w-]*\./i;

  function domainLabels(addr) {
    const host = String(addr || '').split('@')[1] || '';
    return host.toLowerCase().split('.').slice(0, -1).filter((l) => l && !/^(mail|email|e|em|careers?|jobs|talent|recruiting|hire|notifications?|us\d*|smtp)$/.test(l));
  }

  // Returns { app, candidates, stale } — app only when exactly one plausible match.
  E.match = function (email, apps, date) {
    const hay = ` ${E.normCompany(`${email.senderName} ${email.subject} ${email.body}`)} `;
    const labels = ATS_DOMAINS.test(email.senderEmail || '') ? [] : domainLabels(email.senderEmail);
    const byCompany = apps.filter((a) => {
      const key = E.normCompany(a.company);
      if (key.length < 2) return false;
      const compact = key.replace(/ /g, '');
      // stripe.com, stripe-careers.com, janestreetcareers.com — but not metabase.com for "Meta".
      const domainHit = labels.some(
        (l) => l === compact || l.split('-').includes(compact) || new RegExp(`^${compact}(careers?|jobs|recruiting|talent|hr|inc|hq|corp|mail|team|usa?)$`).test(l)
      );
      return hay.includes(` ${key} `) || domainHit;
    });
    // An email older than the application belongs to an earlier cycle.
    const recent = byCompany.filter((a) => !date || !a.appliedDate || date >= new Date(a.appliedDate + 'T00:00:00').getTime() - 2 * 864e5);
    if (!recent.length) return { app: null, candidates: [], stale: byCompany.length > 0 };
    if (recent.length === 1) return { app: recent[0], candidates: recent };

    // Several postings at the same company: prefer the one whose title words appear in the email.
    const STOP = /^(and|the|for|with|intern|internship|engineer|engineering|software|senior|junior|new|grad|summer|fall|spring|winter|full|time|role|position|level|i|ii|iii)$/;
    const scored = recent
      .map((a) => {
        const words = E.normCompany(a.title).split(' ').filter((w) => w.length > 2 && !STOP.test(w) && !/^\d+$/.test(w));
        return { a, score: words.filter((w) => hay.includes(` ${w} `)).length };
      })
      .sort((x, y) => y.score - x.score);
    if (scored[0].score > 0 && scored[0].score > scored[1].score) return { app: scored[0].a, candidates: recent };
    return { app: null, candidates: recent };
  };

  // ---------- guesses for emails that match nothing ----------

  const SENDER_NOISE = /\b(recruiting|recruitment|recruiter|careers?|talent( acquisition)?|hiring( team)?|university|campus|early careers?|jobs|team|hr|people|no-?reply|do not reply|notifications?|via [\w.]+)\b/gi;
  const ATS_NAMES = /^(greenhouse|lever|workday|icims|smartrecruiters|ashby|jobvite|workable|linkedin|indeed|glassdoor|handshake|taleo)$/i;

  E.guessCompany = function (email) {
    const fromName = A.oneLine(String(email.senderName || '').replace(SENDER_NOISE, ' ').replace(/[|@,:()\-–—]+/g, ' '));
    const nameOk = fromName.length > 1 && fromName.split(' ').length <= 4 && !ATS_NAMES.test(fromName);
    // Company's own domain (recruiter@janestreet.com): prefer the display name when it spells the domain.
    const labels = ATS_DOMAINS.test(email.senderEmail || '') ? [] : domainLabels(email.senderEmail);
    if (labels.length) {
      const base = labels[labels.length - 1];
      return nameOk && fromName.toLowerCase().replace(/[^a-z0-9]/g, '') === base ? fromName : A.titleCase(base);
    }
    if (nameOk) return fromName; // "Stripe Recruiting" <no-reply@greenhouse-mail.io>
    const m = /\b(?:to|at|with|from)\s+([A-Z][\w&.'\-]*(?:\s+[A-Z][\w&.'\-]*){0,3})/.exec(email.subject || '');
    return m ? m[1].replace(/[.!,]+$/, '') : '';
  };

  E.guessTitle = function (email) {
    const s = email.subject || '';
    const pats = [
      /\b(?:for|to) (?:the )?(.{3,80}?) (?:position|role|opening|job|opportunity)\b/i,
      /\bapplication (?:for|to) (?:the )?(.{3,80}?)(?: at | with | - | \| |$)/i,
      /\bapplying (?:for|to) (?:the )?(.{3,80}?)(?: at | with | - | \| |[!.]|$)/i,
    ];
    for (const re of pats) {
      const m = re.exec(s);
      // "applying for the X position" — keep only what follows the last for/to.
      const t = m ? A.oneLine(m[1].replace(/^.*\b(?:for|to) (?:the )?/i, '')) : '';
      if (t.length >= 3 && !/^(our|your|a|an|this|us)$/i.test(t)) return t;
    }
    return '';
  };

  // ---------- applying results ----------

  async function loadState() {
    const d = await S.area.get(['emailEvents', 'emailSeen']);
    return { events: d.emailEvents || [], seen: d.emailSeen || {} };
  }

  async function saveState({ events, seen }) {
    const keys = Object.keys(seen);
    if (keys.length > 3000) {
      keys.sort((a, b) => seen[a] - seen[b]).slice(0, keys.length - 3000).forEach((k) => delete seen[k]);
    }
    await S.area.set({ emailEvents: events.slice(-300), emailSeen: seen });
  }

  const localDay = (ms) => new Date(ms).toLocaleDateString('en-CA');

  function applyToApp(app, ev) {
    const rule = E.TYPES[ev.type];
    const note = `📧 ${rule.label}：${ev.subject}`;
    ev.appId = app.id;
    ev.company = app.company;
    ev.title = app.title;
    ev.prevStatus = app.status;
    if (rule.from.includes(app.status)) {
      if (ev.type === 'received' && ev.date && !app.appliedDate) app.appliedDate = localDay(ev.date);
      S.applyStatus(app, rule.target, note);
      ev.newStatus = rule.target;
      ev.changed = true;
    } else {
      app.timeline = app.timeline || [];
      app.timeline.push({ at: new Date().toISOString(), note });
      ev.changed = false;
    }
    ev.timelineAt = app.timeline[app.timeline.length - 1].at;
    ev.state = ev.changed ? 'applied' : 'noop';
  }

  // emails: [{ source, threadId, legacyId, subject, body, senderName, senderEmail, dateText }]
  // Returns the new events (status changes, timeline notes, and unmatched suggestions).
  E.process = async function (emails, account) {
    const state = await loadState();
    const apps = await S.all();
    const out = [];
    for (const em of emails) {
      const c = E.classify(em);
      if (!c) continue;
      const thread = em.legacyId || em.threadId || A.oneLine(`${em.subject}|${em.senderEmail}`);
      const key = `${thread}|${c.type}`;
      if (state.seen[key]) continue;
      state.seen[key] = Date.now();
      const date = E.parseDate(em.dateText);
      const ev = {
        id: S.newId(), key, at: new Date().toISOString(), date, type: c.type, evidence: c.evidence,
        subject: A.oneLine(em.subject).slice(0, 200), senderName: em.senderName || '', senderEmail: em.senderEmail || '',
        account: account || '/mail/u/0', legacyId: em.legacyId || '',
      };
      const { app, candidates, stale } = E.match(em, apps, date);
      if (app) {
        applyToApp(app, ev);
        await S.save(app);
      } else {
        if (stale) continue; // the company's email predates the tracked application
        if (date && Date.now() - date > 60 * 864e5) continue; // too old to suggest
        ev.state = candidates.length ? 'ambiguous' : 'unmatched';
        ev.candidates = candidates.map((a) => a.id);
        ev.guessCompany = E.guessCompany(em);
        const title = E.guessTitle(em);
        // "Thank you for applying to Scale AI" — the "title" is really the company.
        ev.guessTitle = title.toLowerCase() === ev.guessCompany.toLowerCase() ? '' : title;
      }
      state.events.push(ev);
      out.push(ev);
    }
    await saveState(state);
    return out;
  };

  E.events = async () => (await loadState()).events;

  E.undo = async function (eventIds) {
    const state = await loadState();
    for (const id of [].concat(eventIds)) {
      const ev = state.events.find((e) => e.id === id);
      if (!ev || !ev.appId || ev.state === 'undone') continue;
      const app = await S.get(ev.appId);
      if (app) {
        app.timeline = (app.timeline || []).filter((t) => t.at !== ev.timelineAt);
        if (ev.changed && app.status === ev.newStatus) {
          app.status = ev.prevStatus;
          if (ev.prevStatus === 'wishlist') app.appliedDate = '';
        }
        if (ev.created) await S.remove(app.id);
        else await S.save(app);
      }
      ev.state = 'undone';
      ev.updatedAt = new Date().toISOString(); // newer version wins when computers sync
    }
    await saveState(state);
  };

  // action: 'ignore' | 'create' | an application id to link the email to
  E.resolve = async function (eventId, action) {
    const state = await loadState();
    const ev = state.events.find((e) => e.id === eventId);
    if (!ev) return null;
    if (action === 'ignore') {
      ev.state = 'ignored';
    } else if (action === 'create') {
      const rule = E.TYPES[ev.type];
      const app = S.newApp({
        company: ev.guessCompany || ev.senderName || '',
        title: ev.guessTitle || '',
        status: rule.target,
        appliedDate: ev.date ? localDay(ev.date) : S.today(),
        source: '邮件',
        notes: `由邮件创建：${ev.subject}`,
      });
      app.timeline[0].note = `📧 ${rule.label}：${ev.subject}`;
      Object.assign(ev, { appId: app.id, company: app.company, title: app.title, prevStatus: null, newStatus: rule.target, changed: false, created: true, timelineAt: app.timeline[0].at, state: 'applied' });
      await S.save(app);
    } else {
      const app = await S.get(action);
      if (!app) return null;
      applyToApp(app, ev);
      await S.save(app);
    }
    ev.updatedAt = new Date().toISOString();
    await saveState(state);
    return ev;
  };
})();

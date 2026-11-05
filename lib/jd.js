// Gets a posting's job description straight from its ATS (Workday, Greenhouse, Lever, Ashby) through
// the public job API the career page itself loads. That is the exact posting text, so it does not
// depend on the page layout. Other sites: schema.org JobPosting data in the page's HTML.
// No DOM needed, so it also runs in the service worker.
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});
  const J = (JT.jd = {});

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', bull: '•', middot: '·', trade: '™', reg: '®', copy: '©' };
  const decode = (s) =>
    String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
      const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    });

  const clean = (s) => (JT.analyze ? JT.analyze.cleanText(s) : String(s || '').trim());

  J.htmlToText = function (html) {
    const s = String(html || '')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<\/?(p|div|ul|ol|li|h[1-6]|tr|table|section|article|blockquote)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    return clean(decode(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n• \n/g, '\n').replace(/\n{2,}• /g, '\n• '));
  };

  // ---------- ATS job APIs ----------

  const segs = (u) => u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const isLocale = (s) => /^[a-z]{2}-[A-Z]{2}$/.test(s || '');

  const APIS = [
    {
      name: 'Workday',
      // acme.wd5.myworkdayjobs.com/en-US/Site/job/City/Title_R123[/apply]   (also /details/Title_R123)
      // wd5.myworkdaysite.com/en-US/recruiting/acme/Site/job/...
      api(u) {
        const p = segs(u);
        let i = isLocale(p[0]) ? 1 : 0;
        let tenant = u.hostname.split('.')[0];
        if (/myworkdaysite\.com$/.test(u.hostname)) {
          if (p[i] !== 'recruiting') return null;
          tenant = p[i + 1];
          i += 2;
        } else if (!/myworkdayjobs\.com$/.test(u.hostname)) return null;
        const site = p[i];
        if (!site || !['job', 'details'].includes(p[i + 1])) return null;
        const rest = [];
        for (const s of p.slice(i + 2)) {
          if (/^apply$/i.test(s)) break;
          rest.push(s);
        }
        if (!rest.length) return null;
        return `${u.origin}/wday/cxs/${tenant}/${site}/job/${rest.map(encodeURIComponent).join('/')}`;
      },
      read(j) {
        const p = j && j.jobPostingInfo;
        if (!p) return null;
        return {
          title: p.title,
          location: [p.location, ...(p.additionalLocations || [])].filter(Boolean).join(' | '),
          employmentType: p.timeType,
          jobId: p.jobReqId,
          description: J.htmlToText(p.jobDescription),
        };
      },
    },
    {
      name: 'Greenhouse',
      // job-boards.greenhouse.io/acme/jobs/123, boards.greenhouse.io/embed/job_app?for=acme&token=123
      api(u) {
        if (!/(^|\.)greenhouse\.io$/.test(u.hostname)) return null;
        const p = segs(u);
        const q = u.searchParams;
        let board = '';
        let id = '';
        if (p[1] === 'jobs' && /^\d+$/.test(p[2] || '')) [board, id] = [p[0], p[2]];
        else if (q.get('for') && /^\d+$/.test(q.get('token') || '')) [board, id] = [q.get('for'), q.get('token')];
        if (!board || !id) return null;
        const host = /\.eu\.greenhouse\.io$/.test(u.hostname) ? 'boards-api.eu.greenhouse.io' : 'boards-api.greenhouse.io';
        return `https://${host}/v1/boards/${encodeURIComponent(board)}/jobs/${id}`;
      },
      read(j) {
        if (!j || !j.content) return null;
        return { title: j.title, company: j.company_name, location: (j.location || {}).name, description: J.htmlToText(decode(j.content)) };
      },
    },
    {
      name: 'Lever',
      // jobs.lever.co/acme/<uuid>[/apply]
      api(u) {
        if (!/(^|\.)lever\.co$/.test(u.hostname)) return null;
        const p = segs(u);
        if (!p[0] || !/^[0-9a-f-]{36}$/i.test(p[1] || '')) return null;
        const host = /\.eu\.lever\.co$/.test(u.hostname) ? 'api.eu.lever.co' : 'api.lever.co';
        return `https://${host}/v0/postings/${encodeURIComponent(p[0])}/${p[1]}`;
      },
      read(j) {
        if (!j || !j.text) return null;
        const c = j.categories || {};
        const lists = (j.lists || []).map((l) => `${l.text}\n${J.htmlToText(`<ul>${l.content || ''}</ul>`)}`);
        return {
          title: j.text,
          location: (c.allLocations && c.allLocations.length ? c.allLocations : [c.location]).filter(Boolean).join(' | '),
          employmentType: c.commitment,
          workModeHint: j.workplaceType,
          description: clean([j.descriptionPlain || J.htmlToText(j.description), ...lists, j.additionalPlain || J.htmlToText(j.additional)].filter(Boolean).join('\n\n')),
        };
      },
    },
    {
      name: 'Ashby',
      // jobs.ashbyhq.com/acme/<uuid>[/application]: the board API lists every posting.
      api(u) {
        if (!/(^|\.)ashbyhq\.com$/.test(u.hostname)) return null;
        const p = segs(u);
        if (!p[0] || !/^[0-9a-f-]{36}$/i.test(p[1] || '')) return null;
        return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(p[0])}?includeCompensation=true#${p[1]}`;
      },
      read(j, apiUrl) {
        const id = apiUrl.split('#')[1];
        const job = ((j && j.jobs) || []).find((x) => x.id === id);
        if (!job) return null;
        return {
          title: A().oneLine(job.title || ''),
          location: [job.location, ...(job.secondaryLocations || []).map((l) => l.location)].filter(Boolean).join(' | '),
          employmentType: job.employmentType,
          workModeHint: job.workplaceType,
          salaryHint: (job.compensation || {}).compensationTierSummary || '',
          description: job.descriptionPlain ? clean(job.descriptionPlain) : J.htmlToText(job.descriptionHtml),
        };
      },
    },
  ];
  const A = () => JT.analyze;

  function apiFor(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    for (const a of APIS) {
      const api = a.api(u);
      if (api) return { ...a, apiUrl: api };
    }
    return null;
  }

  // Name of the ATS whose API has this posting ('Workday', ...), or ''.
  J.apiName = (url) => (apiFor(url) || {}).name || '';

  async function getText(url, timeoutMs, accept) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { credentials: 'omit', signal: ctl.signal, headers: { Accept: accept } });
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- schema.org JobPosting in the page's HTML ----------

  J.fromHtml = function (html) {
    const found = [];
    const visit = (x) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) return x.forEach(visit);
      const type = [].concat(x['@type'] || []);
      if (type.includes('JobPosting')) found.push(x);
      if (x['@graph']) visit(x['@graph']);
    };
    for (const m of String(html || '').matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try { visit(JSON.parse(m[1].trim())); } catch {}
    }
    const jp = found.find((x) => x.description);
    if (!jp) return null;
    const org = jp.hiringOrganization;
    return { title: decode(jp.title || ''), company: decode((org && (org.name || org)) || ''), description: J.htmlToText(decode(jp.description)) };
  };

  // { title, location, description, via, ... } or null. opts.page: for other sites, read the
  // JobPosting data from the page's HTML (only helps on pages rendered by the server).
  J.fetch = async function (url, opts = {}) {
    const timeoutMs = opts.timeoutMs || 10000;
    const a = apiFor(url);
    let got = null;
    if (a) {
      const text = await getText(a.apiUrl.split('#')[0], timeoutMs, 'application/json');
      try { got = text ? a.read(JSON.parse(text), a.apiUrl) : null; } catch { got = null; }
      if (got) got.via = a.name;
    } else if (opts.page && /^https?:/.test(url || '')) {
      got = J.fromHtml(await getText(url, timeoutMs, 'text/html'));
      if (got) got.via = 'page';
    }
    return got && (got.description || '').length >= 200 ? got : null;
  };

  // What looks wrong with a JD: '' (fine), 'empty', 'short', or 'list' (a job list got mixed in).
  J.problem = function (text) {
    const s = String(text || '').trim();
    if (!s) return 'empty';
    if (s.length < 300) return 'short';
    const listy = s.match(/\b(posted (today|yesterday|\d+\+? days? ago)|\d+ jobs? found|view all \d+ jobs|similar jobs|jump to selected job)\b/gi) || [];
    return listy.length >= 3 ? 'list' : '';
  };

  // Put a fetched JD on a record and refresh what is derived from it. Location only replaces one
  // that is empty or lists more places than the posting (job-list text that got mixed in).
  J.applyTo = function (app, got) {
    const An = A();
    const parts = (s) => String(s || '').split(' | ').filter(Boolean).length;
    app.description = got.description;
    if (!app.title && got.title) app.title = An.oneLine(got.title);
    if (got.location && (!app.location || parts(app.location) > parts(got.location))) app.location = got.location;
    if (!app.jobId && got.jobId) app.jobId = got.jobId;
    app.keywords = An.extractKeywords(`${app.title}\n${app.description}`);
    app.requirements = An.extractRequirements(app.description);
    if (!app.sponsorship || app.sponsorship === 'unknown' || !app.sponsorshipNote) {
      const sp = An.detectSponsorship(app.description);
      if (!app.sponsorship || app.sponsorship === 'unknown') app.sponsorship = sp.value;
      app.sponsorshipNote = sp.note;
    }
    return app;
  };
})();

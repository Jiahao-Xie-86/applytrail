// Pulls job info out of the current page. Order of trust:
//   1. site-specific selectors (LinkedIn, Indeed, Greenhouse, Lever, Workday, ...)
//   2. schema.org JobPosting JSON-LD (most ATS pages embed it)
//   3. generic heuristics (h1, "Location" labels, section headings like "Qualifications")
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});
  const A = JT.analyze;

  const q = (sel, root = document) => {
    try { return root.querySelector(sel); } catch { return null; }
  };
  const qa = (sel, root = document) => {
    try { return [...root.querySelectorAll(sel)]; } catch { return []; }
  };
  const txt = (el) => (el ? A.cleanText(el.innerText || el.textContent || '') : '');
  const first = (sels, root) => {
    for (const s of sels) {
      const t = txt(q(s, root));
      if (t) return t;
    }
    return '';
  };
  const meta = (n) => ((q(`meta[property="${n}"]`) || q(`meta[name="${n}"]`) || {}).content || '').trim();
  const pathSeg = (i) => location.pathname.split('/').filter(Boolean)[i] || '';
  const param = (k) => new URLSearchParams(location.search).get(k) || '';
  const imgAlt = (sel) => ((q(sel) || {}).alt || '').replace(/\s*(company\s*)?logo$/i, '').trim();

  // Value shown next to a label: <dt>Location</dt><dd>NYC</dd>, <h2>Location</h2><p>NYC</p>,
  // or <p><b>Location:</b> NYC</p>.
  function labeled(labels) {
    const re = new RegExp(`^(${labels.join('|')})\\s*:?$`, 'i');
    const els = qa('dt, th, h2, h3, h4, h5, label, strong, b, span, p, div').slice(0, 6000);
    for (const el of els) {
      if (el.children.length > 2) continue;
      const t = A.oneLine(el.textContent);
      if (!t || t.length > 30 || !re.test(t)) continue;
      const sib = el.nextElementSibling;
      const v = sib ? A.oneLine(sib.innerText) : '';
      if (v && v.length < 200) return v;
      const parent = el.parentElement;
      if (parent) {
        const rest = A.oneLine(parent.innerText).slice(t.length).replace(/^[:\s]+/, '');
        if (rest && rest.length < 200) return rest;
      }
    }
    return '';
  }

  // ---------- JSON-LD ----------

  function findJsonLdJob() {
    for (const s of qa('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(s.textContent); } catch { continue; }
      const hit = walk(data);
      if (hit) return hit;
    }
    return null;
    function walk(node) {
      if (!node || typeof node !== 'object') return null;
      if (Array.isArray(node)) {
        for (const n of node) {
          const f = walk(n);
          if (f) return f;
        }
        return null;
      }
      const t = node['@type'];
      if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) return node;
      return node['@graph'] ? walk(node['@graph']) : null;
    }
  }

  function fromJsonLd(jp) {
    const org = jp.hiringOrganization;
    const locs = [].concat(jp.jobLocation || []);
    const location = locs
      .map((l) => {
        const a = (l && l.address) || {};
        if (typeof a === 'string') return a;
        const country = typeof a.addressCountry === 'object' ? a.addressCountry && a.addressCountry.name : a.addressCountry;
        return [a.addressLocality, a.addressRegion, country].filter(Boolean).join(', ');
      })
      .filter(Boolean);
    let salary = '';
    const bs = jp.baseSalary;
    if (bs && typeof bs === 'object') {
      const v = bs.value || {};
      const cur = bs.currency === 'USD' || !bs.currency ? '$' : bs.currency + ' ';
      const fmt = (n) => (n == null || n === '' ? '' : cur + Number(n).toLocaleString('en-US'));
      const lo = fmt(v.minValue != null ? v.minValue : v.value);
      const hi = v.maxValue != null && v.maxValue !== v.minValue ? fmt(v.maxValue) : '';
      if (lo) salary = `${lo}${hi ? ' - ' + hi : ''}${v.unitText ? ' / ' + String(v.unitText).toLowerCase() : ''}`;
    }
    const ident = jp.identifier;
    return {
      title: A.oneLine(jp.title || ''),
      company: A.oneLine(typeof org === 'string' ? org : (org && org.name) || ''),
      location: location.join(' | ') + (jp.jobLocationType === 'TELECOMMUTE' ? (location.length ? ' (Remote)' : 'Remote') : ''),
      description: A.htmlToText(jp.description || ''),
      employmentType: jp.employmentType || '',
      postedDate: String(jp.datePosted || '').slice(0, 10),
      deadline: String(jp.validThrough || '').slice(0, 10),
      jobId: String((ident && typeof ident === 'object' ? ident.value : ident) || ''),
      salary,
      workModeHint: jp.jobLocationType || '',
    };
  }

  // ---------- generic heuristics ----------

  const SECTION_RE = new RegExp(
    '^(about (the|this) (job|role|position|team|opportunity)|job description|description|the role|role overview|' +
      'overview|position summary|job summary|responsibilities|key responsibilities|your responsibilities|' +
      "what you['’]ll do|what you will do|your role|your impact|qualifications|minimum qualifications|" +
      'basic qualifications|preferred qualifications|requirements|required skills|' +
      "what we['’]re looking for|who you are|what you['’]ll bring|nice to haves?|bonus points|about you|" +
      'you have|you might be a good fit if|skills|benefits)\\s*:?$',
    'i'
  );

  function guessDescriptionEl() {
    const anchors = qa('h1,h2,h3,h4,h5,h6,strong,b,u,p,span,div,dt').filter((el) => {
      if (el.children.length > 2) return false;
      const t = el.textContent;
      return t && t.length <= 70 && SECTION_RE.test(A.oneLine(t));
    });
    if (!anchors.length) return null;
    const counts = new Map();
    for (const a of anchors) {
      let el = a.parentElement;
      for (let d = 0; el && el !== document.documentElement && d < 14; d++, el = el.parentElement) {
        counts.set(el, (counts.get(el) || 0) + 1);
      }
    }
    const max = Math.max(...counts.values());
    const need = Math.max(1, Math.ceil(max * 0.6));
    let best = null;
    let bestLen = Infinity;
    for (const [el, c] of counts) {
      if (c < need) continue;
      const len = el.textContent.length;
      if (len < 300 || len > 80000) continue;
      if (len < bestLen) { best = el; bestLen = len; }
    }
    return best;
  }

  function guessTitle() {
    const h1 = qa('h1').map(txt).find((t) => t && t.length < 150);
    if (h1) return h1;
    const og = meta('og:title');
    return (og || document.title).split(/\s[|–—]\s|\s-\s/)[0];
  }

  function generic() {
    const el = guessDescriptionEl();
    return {
      title: guessTitle(),
      location: labeled(['Location', 'Locations', 'Job Location', 'Office Location', 'Work Location']),
      description: el ? txt(el) : '',
    };
  }

  // ---------- site-specific ----------

  const SITES = [
    {
      match: /(^|\.)linkedin\.com$/,
      extract() {
        const pane = q('.jobs-search__job-details--container') || q('.scaffold-layout__detail') || q('.job-view-layout') || document;
        const primary = first([
          '.job-details-jobs-unified-top-card__primary-description-container',
          '.job-details-jobs-unified-top-card__tertiary-description-container',
          '.jobs-unified-top-card__primary-description',
          '.topcard__flavor--bullet',
        ]);
        const insight = [
          '.job-details-fit-level-preferences',
          '.job-details-preferences-and-skills',
          '.job-details-jobs-unified-top-card__job-insight',
          '.jobs-unified-top-card__job-insight',
        ].map((s) => txt(q(s))).join(' ');
        // /jobs/view/ pages: document.title is "Title | Company | LinkedIn"
        const dt = /\/jobs\/view\//.test(location.pathname) ? document.title.replace(/^\(\d+\)\s*/, '').split(' | ') : [];
        const companyLink = qa('a[href*="/company/"]', pane).map(txt).find((t) => t && t.length < 80);
        return {
          title:
            first([
              '.job-details-jobs-unified-top-card__job-title h1',
              '.job-details-jobs-unified-top-card__job-title',
              '.jobs-unified-top-card__job-title',
              'h1.top-card-layout__title',
              '.top-card-layout__title',
            ]) || (dt.length >= 3 ? dt[0] : '') || first(['h1', 'h2'], pane),
          company:
            first([
              '.job-details-jobs-unified-top-card__company-name a',
              '.job-details-jobs-unified-top-card__company-name',
              '.jobs-unified-top-card__company-name a',
              '.jobs-unified-top-card__company-name',
              'a.topcard__org-name-link',
              '.topcard__flavor a',
            ]) || (dt.length >= 3 ? dt[1] : '') || companyLink || '',
          location: primary ? A.oneLine(primary.split('·')[0]) : '',
          description: first([
            '#job-details',
            '.jobs-description__content .jobs-box__html-content',
            '.jobs-description-content__text',
            '.jobs-description__container',
            '.show-more-less-html__markup',
            '.description__text',
          ]).replace(/^About the job\s*/i, ''),
          workModeHint: insight,
          salaryHint: insight,
          employmentType: insight,
        };
      },
    },
    {
      match: /(^|\.)indeed\.com$/,
      extract() {
        const company = first([
          '[data-testid="desktop-job-header"] a[href*="/cmp/"]',
          '[data-testid="inlineHeader-companyName"]',
          '[data-company-name="true"]',
          '.jobsearch-CompanyInfoContainer a',
          '.jobsearch-InlineCompanyRating div',
        ]);
        // 2026 layout: "WEX Inc. · 3.1 \n Remote \n Hybrid work" — drop company, separators and rating.
        const metaLoc = first(['[data-testid="company-info-metadata"]'])
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s && s !== company && s !== '·' && !/^[\d.]+$/.test(s))
          .join(' · ');
        const header = first(['[data-testid="desktop-job-header"]', '#salaryInfoAndJobType', '[data-testid="jobsearch-OtherJobDetailsContainer"]']);
        return {
          title: first([
            '[data-testid="vj-job-title"]',
            '[data-testid="jobsearch-JobInfoHeader-title"]',
            'h1.jobsearch-JobInfoHeader-title',
            '.jobsearch-JobInfoHeader-title',
          ]).replace(/\s*-\s*job post$/i, ''),
          company,
          location:
            first([
              '[data-testid="inlineHeader-companyLocation"]',
              '[data-testid="job-location"]',
              '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
            ]) || metaLoc,
          salaryHint: `${first(['[data-testid="structured-job-summary"]'])}\n${header}`,
          employmentType: header,
          workModeHint: metaLoc,
          description: first([
            '.simple-job-description-html',
            '[data-testid="viewjob-job-content"]',
            '#jobDescriptionText',
            '.jobsearch-jobDescriptionText',
          ]),
        };
      },
    },
    {
      match: /greenhouse\.io$/,
      extract() {
        const slug = param('for') || (pathSeg(0) !== 'embed' ? pathSeg(0) : '');
        return {
          title: first(['.job__title h1', '.job__title', 'h1.app-title', '.app-title', 'h1']),
          company:
            first(['.company-name']).replace(/^at\s+/i, '') || imgAlt('.logo img') || imgAlt('.job__header img') || imgAlt('header img'),
          companyFallback: A.titleCase(slug),
          location: first(['.job__location', '#header .location', '.location', '.job-location']),
          description: first(['.job__description', '#content', '.job-post-content']),
          jobId: (location.pathname.match(/\/jobs\/(\d+)/) || [])[1] || param('token') || param('gh_jid'),
        };
      },
    },
    {
      match: /lever\.co$/,
      extract() {
        const blocks = qa(
          '.posting-page [data-qa="job-description"], .posting-page .section.page-centered, .posting-page [data-qa="closing-description"]'
        ).filter(
          (el) => !el.closest('.posting-headline') && !q('.posting-headline', el) && !q('form', el) && !el.closest('.posting-apply')
        );
        const outer = blocks.filter((el) => !blocks.some((o) => o !== el && o.contains(el)));
        const parts = document.title.split(' - ');
        return {
          title: first(['.posting-headline h2', '.posting-header h2']) || parts.slice(1).join(' - '),
          company: imgAlt('.main-header-logo img') || (parts.length > 1 ? parts[0] : ''),
          companyFallback: A.titleCase(pathSeg(0)),
          location: first(['.posting-categories .location', '.posting-category.location', '.sort-by-location']),
          workModeHint: first(['.posting-categories .workplaceTypes', '.posting-category.workplaceTypes']),
          employmentType: first(['.posting-categories .commitment', '.posting-category.commitment']),
          description: outer.map(txt).filter((t) => t && !/^apply( for this job)?$/i.test(t)).join('\n\n'),
          jobId: pathSeg(1),
        };
      },
    },
    {
      match: /myworkday(jobs|site)\.com$/,
      extract() {
        const dd = (id) => qa(`[data-automation-id="${id}"] dd`).map(txt).filter(Boolean).join(' | ');
        // JSON-LD hiringOrganization is the legal entity ("CN05 NVIDIA Shanghai WFOE"), so derive the
        // name from the URL: nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite -> "NVIDIA".
        const sub = location.hostname.split('.')[0];
        const siteSeg = /^[a-z]{2}-[A-Z]{2}$/.test(pathSeg(0)) ? pathSeg(1) : pathSeg(0);
        const fromSite = siteSeg
          .split(/_|-|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
          .filter((w) => w && !/^(external|career|careers|site|jobs?|experienced|university|campus|portal|global|en|us)$/i.test(w))
          .join('');
        const company = /^wd\d+$/.test(sub) ? A.titleCase(fromSite) : fromSite.toLowerCase() === sub ? fromSite : A.titleCase(sub);
        return {
          title: first(['[data-automation-id="jobPostingHeader"]']),
          company,
          location: dd('locations'),
          employmentType: dd('time'),
          jobId: dd('requisitionId'),
          description: first(['[data-automation-id="jobPostingDescription"]']),
        };
      },
    },
    {
      match: /ashbyhq\.com$/,
      extract() {
        return {
          title: first(['.ashby-job-posting-heading', 'h1[class*="title"]', 'h1']),
          companyFallback: A.titleCase(decodeURIComponent(pathSeg(0))),
          location: labeled(['Location']),
          employmentType: labeled(['Employment Type']),
          workModeHint: labeled(['Location Type', 'Workplace Type']),
          salaryHint: labeled(['Compensation']),
          description: first(['.ashby-job-posting-description', '[class*="_descriptionText_"]', '[class*="descriptionText"]']),
          jobId: pathSeg(1),
        };
      },
    },
    {
      match: /(^|\.)glassdoor\.(com|ca)$/,
      extract() {
        return {
          title: first(['[data-test="job-title"]', '[id^="jd-job-title"]', '[class*="JobDetails_jobTitle"]']),
          company: first(['[data-test="employer-name"]', '[class*="EmployerProfile_employerName"]'])
            .split('\n')[0]
            .replace(/\s*[\d.]+\s*★?$/, ''),
          location: first(['[data-test="location"]', '[class*="JobDetails_location"]']),
          salaryHint: first(['[data-test="detailSalary"]', '[class*="SalaryEstimate"]']),
          description: first(['[class*="JobDetails_jobDescription"]', '.jobDescriptionContent', '#JobDescriptionContainer']),
        };
      },
    },
    {
      match: /joinhandshake\.com$/,
      extract() {
        const employer = qa('a[href*="/e/"], a[href*="/employers/"]').map(txt).find((t) => t && t.length < 80);
        return {
          title: first(['h1']),
          company: employer || '',
          location: labeled(['Location', 'Locations']),
          salaryHint: labeled(['Pay', 'Compensation', 'Salary']),
          employmentType: labeled(['Job type', 'Employment type']),
        };
      },
    },
    {
      match: /amazon\.jobs$/,
      extract() {
        return {
          location: first(['.location-icon .association-content', '.location-icon ul', '.location-icon']),
          jobId: (location.pathname.match(/\/jobs\/(\d+)/) || [])[1] || '',
        };
      },
    },
    {
      match: /smartrecruiters\.com$/,
      extract() {
        return {
          title: first(['h1.job-title', 'h1']),
          company: first(['[itemprop="hiringOrganization"] [itemprop="name"]']) || imgAlt('.header-logo img'),
          companyFallback: A.titleCase(pathSeg(0)),
          location: first(['[itemprop="jobLocation"]', '.job-details .job-detail']),
          description: first(['[itemprop="description"]', '.job-sections']),
        };
      },
    },
  ];

  JT.extract = function () {
    const url = location.href;
    const host = location.hostname.toLowerCase();
    const def = SITES.find((s) => s.match.test(host));
    let site = {};
    try { site = def ? def.extract() : {}; } catch (e) { console.debug('[JobTracker] site extractor failed', e); }
    let ld = {};
    try {
      const jp = findJsonLdJob();
      if (jp) ld = fromJsonLd(jp);
    } catch (e) { console.debug('[JobTracker] JSON-LD parse failed', e); }

    const pick = (...vals) => vals.find((v) => v && String(v).trim()) || '';
    let gen = {};
    if (!pick(site.title, ld.title) || !pick(site.location, ld.location) || pick(site.description, ld.description).length < 300) {
      try { gen = generic(); } catch (e) { console.debug('[JobTracker] generic extractor failed', e); }
    }

    // Prefer DOM text, but if it looks truncated take the longer JSON-LD/heuristic one.
    const descs = [site.description, ld.description, gen.description].filter(Boolean);
    let description = descs[0] || '';
    if (description.length < 300) description = descs.reduce((a, b) => (b.length > a.length ? b : a), '');

    const knownHost = A.isKnownJobHost(host);
    const job = {
      url,
      title: A.oneLine(pick(site.title, ld.title, gen.title)).slice(0, 200),
      company: A.oneLine(pick(site.company, ld.company, site.companyFallback, knownHost ? '' : meta('og:site_name'), A.companyFromHost(url))).slice(0, 120),
      location: A.oneLine(pick(site.location, ld.location, gen.location)).slice(0, 200),
      description: A.cleanText(description),
      jobId: pick(site.jobId, ld.jobId),
      postedDate: pick(site.postedDate, ld.postedDate),
      deadline: pick(ld.deadline),
      salary: pick(ld.salary),
      employmentType: pick(site.employmentType, ld.employmentType),
      workModeHint: `${site.workModeHint || ''} ${ld.workModeHint || ''}`.trim(),
      salaryHint: site.salaryHint || '',
    };
    return A.enrich(job);
  };

  // Cheap check used to decide whether a page is worth caching as "the job being viewed".
  JT.hasJsonLdJob = () => qa('script[type="application/ld+json"]').some((s) => /JobPosting/.test(s.textContent));
})();

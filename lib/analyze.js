// Text analysis helpers: job type / term / sponsorship / salary / keyword
// detection, URL canonicalisation. Pure functions except htmlToText (needs DOM).
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});
  const A = (JT.analyze = {});

  A.cleanText = function (s, max = 60000) {
    if (!s) return '';
    return String(s)
      .replace(/\r/g, '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, max);
  };

  A.oneLine = (s) => (s ? String(s).replace(/\s+/g, ' ').trim() : '');

  // Convert an HTML fragment (e.g. JSON-LD description) to readable text.
  A.htmlToText = function (html) {
    if (!html) return '';
    if (typeof DOMParser === 'undefined') return A.cleanText(String(html).replace(/<[^>]+>/g, '\n'));
    let doc = new DOMParser().parseFromString(String(html), 'text/html');
    // Some sites double-escape the HTML (&lt;p&gt;...), parse once more.
    if (/<\/?(p|li|ul|div|br|strong)\b/i.test(doc.body.textContent || '')) {
      doc = new DOMParser().parseFromString(doc.body.textContent, 'text/html');
    }
    doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
    doc.querySelectorAll('li').forEach((el) => el.prepend('• '));
    doc.querySelectorAll('p,div,li,ul,ol,h1,h2,h3,h4,h5,h6,tr').forEach((el) => el.append('\n'));
    return A.cleanText(doc.body.textContent);
  };

  // ---------- job type / term ----------

  A.detectJobType = function (title, text, employmentType) {
    const t = title || '';
    if (/\bco-?op\b/i.test(t)) return 'coop';
    if (/\bintern(ship)?s?\b/i.test(t)) return 'intern';
    const et = String(Array.isArray(employmentType) ? employmentType.join(',') : employmentType || '')
      .toUpperCase()
      .replace(/[-\s]+/g, '_');
    if (et.includes('INTERN')) return 'intern';
    if (/\b(new grad|university grad|entry[- ]level|early career|graduate)\b/i.test(t)) return 'fulltime';
    if (/\bcontract(or)?\b/i.test(t) || /CONTRACT|TEMPORARY/.test(et)) return 'contract';
    if (/\bpart[- ]time\b/i.test(t) || (et.includes('PART_TIME') && !et.includes('FULL_TIME'))) return 'parttime';
    if (et.includes('FULL_TIME')) return 'fulltime';
    const head = (text || '').slice(0, 1500);
    if (/\b(internship program|summer internship|this internship)\b/i.test(head)) return 'intern';
    return 'fulltime';
  };

  A.detectTerm = function (title, text) {
    const re = /\b(spring|summer|fall|autumn|winter)\s*[-–]?\s*('?\d{2}|20\d{2})\b/i;
    const m = re.exec(title || '') || re.exec((text || '').slice(0, 4000));
    if (m) {
      let season = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      if (season === 'Autumn') season = 'Fall';
      let year = m[2].replace("'", '');
      if (year.length === 2) year = '20' + year;
      return `${season} ${year}`;
    }
    const ng = /\b(20\d{2})\s*(new grad|university grad|graduate)|(new grad|university grad)[^\n\d]{0,12}(20\d{2})/i.exec(title || '');
    if (ng) return `New Grad ${ng[1] || ng[4]}`;
    return '';
  };

  // ---------- visa sponsorship ----------

  const SPONSOR_RULES = [
    ['citizen', /\b(must|required to) be (a )?(u\.?s\.?|united states) citizens?\b/i],
    ['citizen', /\b(u\.?s\.?|united states) citizenship (is )?(required|mandatory)\b/i],
    ['citizen', /\b(active|current|ability to obtain|eligible for|obtain and maintain) (a |an )?(secret|top secret|ts\/sci|security|government) clearance\b/i],
    ['citizen', /\bsecurity clearance (is )?required\b/i],
    ['citizen', /\b(itar|export control)\b[^.]{0,120}\b(u\.?s\.? persons?|citizen|permanent resident)/i],
    ['no', /\b(not|unable to|cannot|can['’]t|won['’]t|will not|do not|does not|are not able to|is not able to)\s+(currently\s+)?(provide|offer|support|consider)?\s*(any\s+)?(visa\s+|immigration\s+|employment\s+|work\s+)?sponsor/i],
    ['no', /\bsponsorship\s+(is\s+|will\s+)?not\s+(be\s+)?(available|provided|offered|considered)/i],
    ['no', /\bno\s+(visa\s+|h-?1b\s+|immigration\s+)?sponsorship\b/i],
    ['no', /\bwithout\s+(the\s+)?(need\s+for|requiring|requirement\s+of|requiring\s+the\s+need\s+for)?\s*(current\s+or\s+future\s+|now\s+or\s+in\s+the\s+future\s+)?(visa\s+|employment\s+|immigration\s+|work\s+)?sponsorship/i],
    ['no', /\bnot\s+eligible\s+for\s+(visa\s+|immigration\s+)?sponsorship/i],
    ['no', /\b(must not|do not|does not|will not|cannot|not)\s+(now\s+or\s+in\s+the\s+future\s+)?require\s+(current\s+or\s+future\s+)?(visa\s+|employment\s+|immigration\s+)?sponsorship/i],
    ['yes', /\b(will|can|able to|happy to|do|does)\s+(provide\s+|offer\s+|support\s+)?(visa\s+|h-?1b\s+|immigration\s+)sponsor/i],
    ['yes', /\b(visa|h-?1b|immigration)\s+sponsorship\s+(is\s+)?(available|provided|offered|supported)/i],
    ['yes', /\b(cpt|opt|stem opt)\b[^.\n]{0,60}\b(welcome|accepted|eligible|considered|supported)/i],
  ];

  // Returns { value, note } — note is the sentence that triggered the match.
  A.detectSponsorship = function (text) {
    if (!text) return { value: 'unknown', note: '' };
    for (const [value, re] of SPONSOR_RULES) {
      const m = re.exec(text);
      if (m) return { value, note: sentenceAround(text, m.index) };
    }
    return { value: 'unknown', note: '' };
  };

  function sentenceAround(text, idx) {
    let start = Math.max(0, text.lastIndexOf('\n', idx), text.lastIndexOf('. ', idx) + 1);
    let end = text.length;
    for (const sep of ['\n', '. ']) {
      const i = text.indexOf(sep, idx);
      if (i !== -1 && i < end) end = i + 1;
    }
    return A.oneLine(text.slice(start, end)).slice(0, 300);
  }

  // ---------- work mode / salary ----------

  A.detectWorkMode = function (location, text, hint) {
    const h = `${hint || ''} ${location || ''}`;
    if (/\bhybrid\b/i.test(h)) return 'hybrid';
    if (/\bremote\b|TELECOMMUTE/i.test(h)) return 'remote';
    if (/\bon-?site\b|in[- ]office/i.test(h)) return 'onsite';
    const t = text || '';
    if (/\bhybrid\b|\b\d\s*(days?|x)\s*(a|per)\s*week\s*(in|at)\s*(the|our)?\s*office/i.test(t)) return 'hybrid';
    if (/\b(fully remote|100% remote|remote[- ]first|this (role|position) is remote|remote position)\b/i.test(t)) return 'remote';
    if (/\b(on-?site|in-office|in office)\b/i.test(t)) return 'onsite';
    return '';
  };

  const MONEY = String.raw`\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s?[kK]?`;
  const UNIT = String.raw`(?:\s*(?:/|per|an|a)\s*(?:year|yr|annum|annually|hour|hr|month|mo)\b)?`;
  const SALARY_RE = new RegExp(`${MONEY}${UNIT}(?:\\s*(?:-|–|—|to)\\s*${MONEY}${UNIT})?`, 'g');

  A.extractSalary = function (text) {
    if (!text) return '';
    let fallback = '';
    for (const m of String(text).matchAll(SALARY_RE)) {
      const s = A.oneLine(m[0]);
      const isRange = /(-|–|—|to)/.test(s.replace(/^\$\s?/, ''));
      const hasUnit = /(year|yr|annum|annually|hour|hr|month|mo)\b/i.test(s);
      const hasK = /\d\s?[kK]\b/.test(s);
      const first = parseFloat(s.replace(/[^\d.]/g, ' ').trim().split(/\s+/)[0]) || 0;
      if (first < 15) continue;
      if (isRange || hasUnit || hasK) return s;
      const val = parseFloat(s.replace(/[$,\s]/g, ''));
      if (!fallback && val >= 20000 && val <= 600000) fallback = s;
    }
    return fallback;
  };

  // ---------- keywords & requirements ----------

  // [display name, regex]. Kept broad: SWE, data, ML, hardware, business tools.
  const KEYWORDS = [
    ['Python', /\bPython\b/i], ['Java', /\bJava\b(?!\s*Script)/i], ['C++', /\bC\+\+/i], ['C#', /\bC#/i],
    ['C', /(?:[,/(]\s*C\b(?![+#])|\bC\s*[,/)](?![+#]))/], ['Go', /(?:[,/(]\s*Go\b|\bGo\s*[,/)])|\bGolang\b/],
    ['Rust', /\bRust\b/], ['JavaScript', /\bJavaScript\b/i], ['TypeScript', /\bTypeScript\b/i],
    ['Kotlin', /\bKotlin\b/i], ['Swift', /\bSwift\b/], ['Scala', /\bScala\b/], ['Ruby', /\bRuby\b/],
    ['PHP', /\bPHP\b/], ['R', /(?:[,/(]\s*R\b(?![&'-])|\bR\s*[,/)](?!\s*&))/], ['MATLAB', /\bMATLAB\b/i],
    ['SQL', /\bSQL\b/], ['Bash/Shell', /\b(Bash|Shell scripting)\b/i], ['Verilog', /\bVerilog\b/i],
    ['SystemVerilog', /\bSystemVerilog\b/i], ['VHDL', /\bVHDL\b/], ['CUDA', /\bCUDA\b/],
    ['React', /\bReact(\.js|JS)?\b(?!\s*Native)/], ['React Native', /\bReact Native\b/i], ['Angular', /\bAngular\b/],
    ['Vue', /\bVue(\.js)?\b/], ['Next.js', /\bNext\.?js\b/i], ['Node.js', /\bNode(\.js|JS)\b/i],
    ['Django', /\bDjango\b/], ['Flask', /\bFlask\b/], ['FastAPI', /\bFastAPI\b/i], ['Spring', /\bSpring( Boot)?\b/],
    ['.NET', /\.NET\b/], ['Ruby on Rails', /\bRails\b/], ['GraphQL', /\bGraphQL\b/i], ['REST API', /\bREST(ful)?\b/],
    ['gRPC', /\bgRPC\b/], ['HTML/CSS', /\b(HTML5?|CSS3?)\b/], ['iOS', /\biOS\b/], ['Android', /\bAndroid\b/],
    ['Flutter', /\bFlutter\b/],
    ['AWS', /\bAWS\b|Amazon Web Services/], ['GCP', /\bGCP\b|Google Cloud/], ['Azure', /\bAzure\b/],
    ['Docker', /\bDocker\b/i], ['Kubernetes', /\bKubernetes\b|\bk8s\b/i], ['Terraform', /\bTerraform\b/i],
    ['CI/CD', /\bCI\s*\/\s*CD\b/i], ['Linux', /\bLinux\b|\bUnix\b/i], ['Git', /\bGit\b(?!Hub|Lab)/],
    ['PostgreSQL', /\bPostgre(SQL|s)\b/i], ['MySQL', /\bMySQL\b/i], ['MongoDB', /\bMongo(DB)?\b/i],
    ['Redis', /\bRedis\b/i], ['DynamoDB', /\bDynamoDB\b/i], ['Cassandra', /\bCassandra\b/], ['NoSQL', /\bNoSQL\b/i],
    ['Elasticsearch', /\bElastic(search)?\b/], ['Kafka', /\bKafka\b/], ['Spark', /\bSpark\b/], ['Hadoop', /\bHadoop\b/],
    ['Airflow', /\bAirflow\b/], ['Snowflake', /\bSnowflake\b/], ['Databricks', /\bDatabricks\b/i],
    ['BigQuery', /\bBigQuery\b/i], ['dbt', /\bdbt\b/], ['ETL', /\bETL\b|\bELT\b/],
    ['Tableau', /\bTableau\b/i], ['Power BI', /\bPower\s?BI\b/i], ['Looker', /\bLooker\b/], ['Excel', /\bExcel\b/],
    ['Pandas', /\bpandas\b/i], ['NumPy', /\bNumPy\b/i], ['scikit-learn', /\bscikit-?learn|sklearn\b/i],
    ['PyTorch', /\bPyTorch\b/i], ['TensorFlow', /\bTensorFlow\b/i], ['JAX', /\bJAX\b/],
    ['Hugging Face', /\bHugging\s?Face\b/i], ['LLM', /\bLLMs?\b|large language models?/i], ['RAG', /\bRAG\b|retrieval[- ]augmented/i],
    ['NLP', /\bNLP\b|natural language processing/i], ['Computer Vision', /\bcomputer vision\b/i],
    ['Deep Learning', /\bdeep learning\b/i], ['Machine Learning', /\bmachine learning\b|\bML\b/i],
    ['Reinforcement Learning', /\breinforcement learning\b/i], ['Generative AI', /\bgenerative ai\b|\bgenai\b/i],
    ['Statistics', /\bstatistic(s|al)\b/i], ['A/B Testing', /\bA\/B test/i], ['Data Structures & Algorithms', /\bdata structures\b|\balgorithms\b/i],
    ['System Design', /\bsystem design\b/i], ['Distributed Systems', /\bdistributed systems?\b/i], ['Microservices', /\bmicroservices?\b/i],
    ['OOP', /\bobject[- ]oriented\b|\bOOP\b/i], ['Operating Systems', /\boperating systems?\b/i], ['Networking', /\bnetworking\b|\bTCP\/IP\b/i],
    ['Embedded', /\bembedded\b/i], ['RTOS', /\bRTOS\b/], ['FPGA', /\bFPGA\b/], ['PCB', /\bPCB\b/],
    ['SolidWorks', /\bSolidWorks\b/i], ['AutoCAD', /\bAutoCAD\b/i], ['Simulink', /\bSimulink\b/i], ['LabVIEW', /\bLabVIEW\b/i],
    ['Agile/Scrum', /\bAgile\b|\bScrum\b/], ['Figma', /\bFigma\b/],
  ];

  A.extractKeywords = function (text) {
    if (!text) return [];
    return KEYWORDS.filter(([, re]) => re.test(text)).map(([name]) => name);
  };

  // [start, end) spans of keyword matches, merged — used to highlight the JD.
  A.keywordRanges = function (text) {
    const ranges = [];
    for (const [, re] of KEYWORDS) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      for (const m of text.matchAll(g)) if (m[0].length) ranges.push([m.index, m.index + m[0].length]);
    }
    ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] < last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r);
    }
    return merged;
  };

  // Short lines about experience / degree / graduation date — handy for prep.
  A.extractRequirements = function (text) {
    if (!text) return [];
    const RE = /\b(\d+\+?\s*(-|to|–)?\s*\d*\+?\s*years?|graduat(e|ing|ion)|bachelor|master['’]?s|ph\.?\s?d|degree in|gpa|currently (pursuing|enrolled))\b/i;
    const out = [];
    for (const raw of text.split(/\n|(?<=\.)\s+/)) {
      const line = A.oneLine(raw.replace(/^[•\-*·]\s*/, ''));
      if (line.length < 12 || line.length > 260) continue;
      if (RE.test(line) && !out.includes(line)) out.push(line);
      if (out.length >= 8) break;
    }
    return out;
  };

  // ---------- URLs / sources ----------

  const SOURCES = [
    [/(^|\.)linkedin\.com$/, 'LinkedIn'], [/(^|\.)indeed\.com$/, 'Indeed'], [/(^|\.)glassdoor\.(com|ca)$/, 'Glassdoor'],
    [/joinhandshake\.com$/, 'Handshake'], [/greenhouse\.io$/, 'Greenhouse'], [/lever\.co$/, 'Lever'],
    [/myworkday(jobs|site)\.com$|workday\.com$/, 'Workday'], [/ashbyhq\.com$/, 'Ashby'], [/smartrecruiters\.com$/, 'SmartRecruiters'],
    [/icims\.com$/, 'iCIMS'], [/jobvite\.com$/, 'Jobvite'], [/workable\.com$/, 'Workable'], [/bamboohr\.com$/, 'BambooHR'],
    [/ziprecruiter\.com$/, 'ZipRecruiter'], [/dice\.com$/, 'Dice'], [/builtin(nyc|sf|la|chicago|boston|seattle|austin|colorado)?\.com$/, 'Built In'],
    [/wellfound\.com$|angel\.co$/, 'Wellfound'], [/simplify\.jobs$/, 'Simplify'], [/jobright\.ai$/, 'Jobright'],
    [/ripplematch\.com$/, 'RippleMatch'], [/ycombinator\.com$|workatastartup\.com$/, 'YC'], [/taleo\.net$/, 'Taleo'],
    [/oraclecloud\.com$/, 'Oracle HCM'], [/successfactors\.(com|eu)$|sapsf\.com$/, 'SuccessFactors'], [/eightfold\.ai$/, 'Eightfold'],
    [/rippling\.com$/, 'Rippling'], [/adp\.com$/, 'ADP'], [/ultipro\.com$|ukg\.net$/, 'UKG'], [/paylocity\.com$/, 'Paylocity'],
    [/breezy\.hr$/, 'Breezy'], [/recruitee\.com$/, 'Recruitee'], [/teamtailor\.com$/, 'Teamtailor'], [/hiring\.cafe$/, 'HiringCafe'],
    [/welcometothejungle\.com$|otta\.com$/, 'Welcome to the Jungle'], [/monster\.com$/, 'Monster'], [/careerbuilder\.com$/, 'CareerBuilder'],
    [/usajobs\.gov$/, 'USAJOBS'], [/levels\.fyi$/, 'Levels.fyi'],
  ];

  // Career sites whose company is implied by the host.
  const HOST_COMPANY = [
    [/amazon\.jobs$/, 'Amazon'], [/metacareers\.com$/, 'Meta'], [/(^|\.)google\.com$|careers\.google\.com$/, 'Google'],
    [/jobs\.apple\.com$/, 'Apple'], [/microsoft\.com$/, 'Microsoft'], [/lifeattiktok\.com$|tiktok\.com$/, 'TikTok'],
    [/bytedance\.com$|joinbytedance\.com$/, 'ByteDance'], [/netflix\.(com|net)$/, 'Netflix'], [/salesforce\.com$/, 'Salesforce'],
    [/uber\.com$/, 'Uber'], [/ibm\.com$/, 'IBM'], [/jpmorganchase\.com$|jpmorgan\.com$/, 'JPMorgan Chase'],
    [/goldmansachs\.com$/, 'Goldman Sachs'], [/qualcomm\.com$/, 'Qualcomm'], [/tesla\.com$/, 'Tesla'], [/spacex\.com$/, 'SpaceX'],
  ];

  A.isKnownJobHost = (host) => SOURCES.some(([re]) => re.test(host)) || HOST_COMPANY.some(([re]) => re.test(host));

  A.sourceFromUrl = function (url) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch { return ''; }
    const hit = SOURCES.find(([re]) => re.test(host));
    return hit ? hit[1] : '公司官网'; // i18n-key (stored as-is, translated when shown)
  };

  A.companyFromHost = function (url) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch { return ''; }
    const hit = HOST_COMPANY.find(([re]) => re.test(host));
    if (hit) return hit[1];
    if (SOURCES.some(([re]) => re.test(host))) return '';
    // careers.acme.com -> Acme
    const parts = host.replace(/^www\./, '').split('.');
    const base = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return A.titleCase(base);
  };

  A.titleCase = (slug) =>
    String(slug || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();

  const TRACKING_PARAMS = /^(utm_\w+|gh_src|source|src|ref|refid|referrer|trk|trackingid|lever-source|lever-origin|ccuid|lipi|eid|from|feed|origin|clickid|iis|iisn|sid|tk|bid|_ga|codes)$/i;
  const TAIL_SEGMENTS = /^(apply|application|applications|thanks|thank-you|thankyou|confirmation|confirm|success|submitted|applymanually|autofillwithresume|usemylastapplication|review)$/i;

  // Stable URL used to de-duplicate a posting across job page / apply page / thanks page.
  A.canonicalUrl = function (url) {
    let u;
    try { u = new URL(url); } catch { return url || ''; }
    const host = u.hostname.toLowerCase();
    if (/linkedin\.com$/.test(host)) {
      const id = (u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/) || [])[1] || u.searchParams.get('currentJobId');
      if (id) return `https://www.linkedin.com/jobs/view/${id}/`;
    }
    if (/indeed\.com$/.test(host)) {
      const jk = u.searchParams.get('jk') || u.searchParams.get('vjk');
      if (jk) return `https://www.indeed.com/viewjob?jk=${jk}`;
    }
    if (/glassdoor\./.test(host)) {
      const jl = u.searchParams.get('jl') || u.searchParams.get('jobListingId');
      if (jl) return `https://${host}/job-listing/?jl=${jl}`;
    }
    const keep = new URLSearchParams();
    for (const [k, v] of u.searchParams) if (!TRACKING_PARAMS.test(k)) keep.append(k, v);
    const segs = u.pathname.split('/').filter(Boolean);
    while (segs.length > 1 && TAIL_SEGMENTS.test(segs[segs.length - 1])) segs.pop();
    const qs = keep.toString();
    return `${u.protocol}//${host}/${segs.join('/')}${qs ? '?' + qs : ''}`;
  };

  A.dedupeKey = (company, title) =>
    `${String(company || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${String(title || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;

  // Fill derived fields on an extracted job without overwriting what is already set.
  A.enrich = function (job) {
    const j = { ...job };
    const text = j.description || '';
    if (j.url) {
      j.url = j.url.split('#')[0];
      if (!j.source) j.source = A.sourceFromUrl(j.url);
    }
    if (!j.company && j.url) j.company = A.companyFromHost(j.url);
    if (!j.jobType) j.jobType = A.detectJobType(j.title, text, j.employmentType);
    if (!j.term) j.term = A.detectTerm(j.title, text);
    if (!j.workMode) j.workMode = A.detectWorkMode(j.location, text, j.workModeHint);
    if (!j.salary) j.salary = A.extractSalary(`${j.salaryHint || ''}\n${text}`);
    if (!j.sponsorship || j.sponsorship === 'unknown') {
      const sp = A.detectSponsorship(text);
      j.sponsorship = sp.value;
      j.sponsorshipNote = sp.note;
    }
    j.keywords = A.extractKeywords(`${j.title || ''}\n${text}`);
    j.requirements = A.extractRequirements(text);
    delete j.employmentType;
    delete j.workModeHint;
    delete j.salaryHint;
    return j;
  };
})();

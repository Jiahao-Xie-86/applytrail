// lib/jd.js: which ATS API serves a posting URL, reading each API's answer, JD sanity checks.
const fs = require('fs');
const vm = require('vm');
const ROOT = require('path').join(__dirname, '..') + '/';

const fetched = [];
let reply = () => null;
const fakeFetch = async (url) => {
  fetched.push(String(url));
  const body = reply(String(url));
  return { ok: body != null, status: body != null ? 200 : 404, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
};
const ctx = vm.createContext({ console, URL, URLSearchParams, setTimeout, clearTimeout, AbortController, fetch: fakeFetch });
ctx.globalThis = ctx;
for (const f of ['lib/analyze.js', 'lib/jd.js']) vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx);
const J = ctx.JT.jd;
const A = ctx.JT.analyze;

let fail = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fail++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
const LONG = 'We build data platforms for analytics and machine learning. '.repeat(8);

(async () => {
  // ---------- URL → API ----------
  const api = async (url) => {
    fetched.length = 0;
    reply = () => null;
    await J.fetch(url);
    return fetched[0] || '';
  };
  ok('workday /job/ page', (await api('https://unitytech.wd1.myworkdayjobs.com/en-US/Unity/job/Mountain-View-CA-USA/ML-Intern_JOBREQ-1')) === 'https://unitytech.wd1.myworkdayjobs.com/wday/cxs/unitytech/Unity/job/Mountain-View-CA-USA/ML-Intern_JOBREQ-1');
  ok('workday /details/ split view', (await api('https://unitytech.wd1.myworkdayjobs.com/en-US/Unity/details/XMLNAME--Req-6087--Software-Developer_JOBREQ-2615965?q=ml&Job_Application_ID=x')) === 'https://unitytech.wd1.myworkdayjobs.com/wday/cxs/unitytech/Unity/job/XMLNAME--Req-6087--Software-Developer_JOBREQ-2615965');
  ok('workday apply steps, no locale', (await api('https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Intern_JR1/apply/applyManually')) === 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Intern_JR1');
  ok('workday myworkdaysite.com', (await api('https://wd5.myworkdaysite.com/en-US/recruiting/acme/Careers/job/NY/Analyst_R2')) === 'https://wd5.myworkdaysite.com/wday/cxs/acme/Careers/job/NY/Analyst_R2');
  ok('workday job list: no API', !(await api('https://unitytech.wd1.myworkdayjobs.com/en-US/Unity?Job_Application_ID=x')));
  ok('greenhouse board', (await api('https://job-boards.greenhouse.io/stripe/jobs/8172510?gh_src=x')) === 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs/8172510');
  ok('greenhouse embed', (await api('https://boards.greenhouse.io/embed/job_app?for=acme&token=123')) === 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/123');
  ok('greenhouse EU', (await api('https://job-boards.eu.greenhouse.io/acme/jobs/5')) === 'https://boards-api.eu.greenhouse.io/v1/boards/acme/jobs/5');
  ok('lever /apply', (await api('https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd/apply')) === 'https://api.lever.co/v0/postings/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd');
  ok('ashby /application', (await api('https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application')) === 'https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=true');
  ok('other sites: no request without opts.page', !(await api('https://careers.acme.com/jobs/1')));
  ok('apiName', J.apiName('https://jobs.lever.co/a/6ed76ce8-4156-4b60-b120-403538bd66cd') === 'Lever' && J.apiName('https://www.linkedin.com/jobs/view/1/') === '');

  // ---------- reading the answers ----------
  reply = () => ({ title: 'Abuse Investigator', company_name: 'Stripe', location: { name: 'Seattle' }, content: '&lt;h2&gt;&lt;strong&gt;Who we are&lt;/strong&gt;&lt;/h2&gt;&lt;p&gt;' + LONG + ' &amp;amp; more&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;/ul&gt;' });
  let got = await J.fetch('https://job-boards.greenhouse.io/stripe/jobs/1');
  ok('greenhouse: escaped HTML turned into text', got && got.via === 'Greenhouse' && /^Who we are\n/.test(got.description) && got.description.includes('& more') && got.description.includes('• Python') && !/[<>]|&lt;/.test(got.description), got && JSON.stringify(got.description.slice(-40)));

  reply = () => ({ text: 'Admin Partner', categories: { commitment: 'Full-time', location: 'Singapore', allLocations: ['Singapore', 'Tokyo'] }, workplaceType: 'onsite', descriptionPlain: LONG, lists: [{ text: 'What We Require', content: '<li>3 years</li><li>English</li>' }], additionalPlain: 'Equal opportunity.' });
  got = await J.fetch('https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd');
  ok('lever: body, lists and closing text', got && got.location === 'Singapore | Tokyo' && /What We Require\n• 3 years\n• English/.test(got.description) && /Equal opportunity\.$/.test(got.description), got && JSON.stringify(got.description.slice(-60)));

  reply = () => ({ jobs: [{ id: 'other', title: 'X', descriptionPlain: LONG }, { id: '34413f8d-26bf-4bbc-8ade-eb309a0e2245', title: ' Security Engineer ', location: 'New York, NY', secondaryLocations: [{ location: 'Remote (US)' }], descriptionPlain: 'Ramp. ' + LONG }] });
  got = await J.fetch('https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245');
  ok('ashby: picks the posting from the board', got && got.title === 'Security Engineer' && got.location === 'New York, NY | Remote (US)' && /^Ramp\./.test(got.description));

  reply = () => ({ jobPostingInfo: { title: 'Intern', jobDescription: '<p>Short.</p>' } });
  ok('too short an answer is not used', !(await J.fetch('https://acme.wd1.myworkdayjobs.com/x/job/y_R1')));
  reply = () => '<html>not json';
  ok('broken answer is not used', !(await J.fetch('https://acme.wd1.myworkdayjobs.com/x/job/y_R1')));

  // Other sites: schema.org JobPosting in the server HTML (inside @graph here).
  reply = () => `<html><head><script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":"JobPosting","title":"Data Analyst","hiringOrganization":{"name":"Acme &amp; Co"},"description":"&lt;p&gt;${LONG}&lt;/p&gt;"}]}</script></head></html>`;
  got = await J.fetch('https://careers.acme.com/jobs/1', { page: true });
  ok('page JSON-LD fallback', got && got.via === 'page' && got.title === 'Data Analyst' && got.company === 'Acme & Co' && got.description.startsWith('We build'));

  // ---------- sanity checks ----------
  ok('problem: empty / short / fine', J.problem('') === 'empty' && J.problem('Too short.') === 'short' && J.problem(LONG) === '');
  ok('problem: job list mixed in', J.problem(LONG + ' 31 JOBS FOUND Posted Today Posted Yesterday Posted 30+ Days Ago') === 'list');

  // ---------- applying to a record ----------
  const app = { title: 'ML Intern', location: 'Singapore | 2 Locations | Mountain View, CA, USA', sponsorship: 'unknown', description: 'junk' };
  J.applyTo(app, { description: 'Train models with PyTorch. ' + LONG, location: 'Mountain View, CA, USA', jobId: 'R1' });
  ok('applyTo: JD, broken location and derived fields', app.location === 'Mountain View, CA, USA' && app.jobId === 'R1' && app.keywords.includes('PyTorch') && app.description.startsWith('Train'));
  const mine = { title: 'ML Intern', location: 'Remote', description: 'x' };
  J.applyTo(mine, { description: LONG, location: 'New York, NY | Remote, USA' });
  ok('applyTo: a location the user set is kept', mine.location === 'Remote');

  // ---------- pages that are not job sites ----------
  const notJob = ['https://mail.google.com/mail/u/0/#inbox/abc', 'https://www.google.com/search?q=application+submitted', 'https://outlook.office.com/mail/', 'https://docs.google.com/forms/d/1', 'https://www.bing.com/search?q=jobs'];
  const job = ['https://www.google.com/about/careers/applications/jobs/results/123', 'https://careers.google.com/jobs/', 'https://job-boards.greenhouse.io/a/jobs/1', 'https://www.microsoft.com/careers'];
  ok('isNotJobSite: webmail and search', notJob.every((u) => A.isNotJobSite(u)), notJob.filter((u) => !A.isNotJobSite(u)).join(' '));
  ok('isNotJobSite: career sites still count', job.every((u) => !A.isNotJobSite(u)), job.filter((u) => A.isNotJobSite(u)).join(' '));
  ok('Gmail is not a known job host', !A.isKnownJobHost('mail.google.com') && !A.isKnownJobHost('teams.microsoft.com') && A.isKnownJobHost('careers.google.com') && A.isCompanyHost('www.google.com'));

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
})();

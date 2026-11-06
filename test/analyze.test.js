require('../lib/constants.js');
require('../lib/analyze.js');
const A = globalThis.JT.analyze;
let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

// sponsorship
eq('sp no 1', A.detectSponsorship('We are unable to sponsor visas for this role.').value, 'no');
eq('sp no 2', A.detectSponsorship('Candidates must be authorized to work in the US without the need for current or future visa sponsorship.').value, 'no');
eq('sp no 3', A.detectSponsorship('Sponsorship is not available for this position.').value, 'no');
eq('sp no 4', A.detectSponsorship('This role is not eligible for visa sponsorship.').value, 'no');
eq('sp no 5', A.detectSponsorship('Applicants must not now or in the future require sponsorship.').value, 'no');
eq('sp no 6', A.detectSponsorship('We will not sponsor H-1B.').value, 'no');
eq('sp citizen', A.detectSponsorship('Must be a U.S. citizen due to ITAR.').value, 'citizen');
eq('sp clearance', A.detectSponsorship('Ability to obtain a security clearance is required.').value, 'citizen');
eq('sp yes', A.detectSponsorship('We do offer visa sponsorship for this role.').value, 'yes');
eq('sp yes2', A.detectSponsorship('H-1B sponsorship available.').value, 'yes');
eq('sp yes cpt', A.detectSponsorship('CPT/OPT candidates are welcome to apply.').value, 'yes');
eq('sp unknown', A.detectSponsorship('Join our team building great software.').value, 'unknown');
console.log('   note:', A.detectSponsorship('Great team.\nCandidates must be authorized to work without sponsorship. Apply now.').note);

// job type / term
eq('type intern', A.detectJobType('Software Engineer Intern - Summer 2027', ''), 'intern');
eq('type coop', A.detectJobType('Hardware Co-op (Fall 2026)', ''), 'coop');
eq('type ng', A.detectJobType('Software Engineer, New Grad 2027', ''), 'fulltime');
eq('type lever commitment', A.detectJobType('Data Analyst', '', 'Intern'), 'intern');
eq('type contract', A.detectJobType('Data Analyst', '', 'Contract'), 'contract');
eq('term 1', A.detectTerm('Software Engineering Intern (Summer 2027)', ''), 'Summer 2027');
eq('term 2', A.detectTerm("ML Intern - Fall '26", ''), 'Fall 2026');
eq('term ng', A.detectTerm('2027 New Grad Software Engineer', ''), 'New Grad 2027');

// salary
eq('sal range', A.extractSalary('The base pay range is $120,000 - $150,000 per year.'), '$120,000 - $150,000 per year');
eq('sal hourly', A.extractSalary('Pay: $45/hr - $55/hr'), '$45/hr - $55/hr');
eq('sal hourly2', A.extractSalary('Hourly rate $40 to $52 per hour'), '$40 to $52 per hour');
eq('sal k', A.extractSalary('Compensation $150K – $180K + equity'), '$150K – $180K');
eq('sal funding ignored', A.extractSalary('We raised $50M from top investors and have $5 coffee.'), '');

// work mode
eq('wm hybrid', A.detectWorkMode('New York, NY', 'We work 3 days per week in the office.'), 'hybrid');
eq('wm remote loc', A.detectWorkMode('Remote - US', ''), 'remote');
eq('wm none', A.detectWorkMode('Seattle, WA', 'You will work with remote teams.'), '');

// keywords
const kw = A.extractKeywords('Experience with Python, Java, C/C++, Go, and SQL. Familiar with React, AWS, Docker and Kubernetes. JavaScript is a plus. R&D background.');
eq('kw', kw, ['Python', 'Java', 'C++', 'C', 'Go', 'JavaScript', 'SQL', 'React', 'AWS', 'Docker', 'Kubernetes']);
eq('kw no false Go/R', A.extractKeywords('Go above and beyond. Our R&D team is great.'), []);

// requirements
console.log('   reqs:', A.extractRequirements("About us.\n• Currently pursuing a Bachelor's or Master's degree in Computer Science\n• Graduating between December 2026 and June 2027\n• 2+ years of experience with Python\nNice team."));

// canonical URL
eq('canon li view', A.canonicalUrl('https://www.linkedin.com/jobs/view/4012345678/?refId=abc&trackingId=x'), 'https://www.linkedin.com/jobs/view/4012345678/');
eq('canon li search', A.canonicalUrl('https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=swe'), 'https://www.linkedin.com/jobs/view/4012345678/');
eq('canon indeed', A.canonicalUrl('https://www.indeed.com/jobs?q=intern&vjk=abc123def'), 'https://www.indeed.com/viewjob?jk=abc123def');
eq('canon gh confirm', A.canonicalUrl('https://job-boards.greenhouse.io/stripe/jobs/123456/confirmation?gh_src=x'), 'https://job-boards.greenhouse.io/stripe/jobs/123456');
eq('canon lever thanks', A.canonicalUrl('https://jobs.lever.co/acme/abc-def/thanks'), 'https://jobs.lever.co/acme/abc-def');
eq('canon lever apply', A.canonicalUrl('https://jobs.lever.co/acme/abc-def/apply?lever-source=LinkedIn'), 'https://jobs.lever.co/acme/abc-def');
// Workday: one key per posting, whatever the link form (locale, city, /details/, apply steps, ids).
const WD_KEY = 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/Intern_JR123';
eq('canon wd apply', A.canonicalUrl('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Intern_JR123/apply/applyManually'), WD_KEY);
eq('canon wd details', A.canonicalUrl('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/details/Intern_JR123?q=ml&Job_Application_ID=abc'), WD_KEY);
eq('posting link wd details', A.postingUrl('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/details/Intern_JR123?q=ml&source=LinkedIn#x'), 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Intern_JR123?source=LinkedIn');
eq('posting link other sites untouched', A.postingUrl('https://stripe.com/jobs/search?gh_jid=555#top'), 'https://stripe.com/jobs/search?gh_jid=555');
eq('canon gh_jid kept', A.canonicalUrl('https://stripe.com/jobs/search?gh_jid=555&utm_source=x'), 'https://stripe.com/jobs/search?gh_jid=555');

// source / company
eq('src', A.sourceFromUrl('https://boards.greenhouse.io/airbnb/jobs/1'), 'Greenhouse');
eq('src wd', A.sourceFromUrl('https://nvidia.wd5.myworkdayjobs.com/x'), 'Workday');
eq('src other', A.sourceFromUrl('https://careers.acme.com/x'), '公司官网');
eq('co host', A.companyFromHost('https://www.metacareers.com/jobs/123'), 'Meta');
eq('co domain', A.companyFromHost('https://careers.acme-robotics.com/x'), 'Acme Robotics');
eq('co board blank', A.companyFromHost('https://www.linkedin.com/jobs/view/1'), '');

// keyword ranges
const t = 'Use Python and AWS daily.';
eq('ranges', A.keywordRanges(t).map(([s, e]) => t.slice(s, e)), ['Python', 'AWS']);

// enrich
const j = A.enrich({
  url: 'https://jobs.lever.co/acme/abc',
  title: 'Software Engineer Intern, Summer 2027',
  company: 'Acme',
  location: 'San Francisco, CA (Hybrid)',
  description: 'Build things in Python. We are unable to sponsor visas. Pay: $50/hr.',
});
eq('enrich', [j.source, j.jobType, j.term, j.workMode, j.sponsorship, j.salary, j.keywords], ['Lever', 'intern', 'Summer 2027', 'hybrid', 'no', '$50/hr', ['Python']]);

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');

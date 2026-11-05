// Unit + flow tests for lib/email.js with an in-memory chrome.storage.local.
const fs = require('fs');
const vm = require('vm');
const ROOT = require('path').join(__dirname, '..') + '/';
const data = {};
const local = {
  async get(keys) {
    if (keys == null) return structuredClone(data);
    return Object.fromEntries([].concat(keys).filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
  },
  async set(obj) { for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v); },
  async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
};
const ctx = vm.createContext({ chrome: { storage: { local } }, console, crypto, structuredClone, URL, URLSearchParams, Date });
ctx.globalThis = ctx;
for (const f of ['lib/constants.js', 'lib/analyze.js', 'lib/store.js', 'lib/email.js']) vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx);
const { email: E, store: S } = ctx.JT;

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};
const cls = (subject, body) => (E.classify({ subject, body }) || {}).type || null;

// ---------- classification ----------
eq('received greenhouse', cls('Thank you for applying to Stripe', 'Hi Alex, Thanks for applying to the Software Engineer Intern role. Our team will review your application and reach out to schedule an interview if there is a fit.'), 'received');
eq('received linkedin', cls('Alex, your application was sent to Ramp', 'Your application was sent to Ramp. Data Scientist Intern · New York'), 'received');
eq('rejected classic', cls('Your application to Datadog', 'Thank you for your interest in Datadog. Unfortunately, we have decided to move forward with other candidates whose experience more closely matches our needs.'), 'rejected');
eq('rejected no unfortunately', cls('Update on your application', 'After careful consideration, we have decided not to proceed with your application at this time.'), 'rejected');
eq('rejected filled', cls('Software Engineer Intern - Meta', 'We wanted to let you know the position has been filled.'), 'rejected');
eq('oa hackerrank', cls('Google Online Assessment Invitation', 'Please complete the online assessment on HackerRank within 7 days.'), 'oa');
eq('oa codesignal', cls('Next steps with Ramp', 'As a next step, we invite you to complete a CodeSignal General Coding Assessment.'), 'oa');
eq('interview schedule', cls('Interview Invitation - NVIDIA', 'We would like to schedule a technical phone interview with you. Please share your availability for next week.'), 'interview');
eq('interview calendly', cls('Next steps', 'Great news! Please pick a time for a 30 minute recruiter call here: https://calendly.com/acme/30min'), 'interview');
eq('interview reschedule not rejection', cls('Re: Interview with Stripe', 'Unfortunately the interviewer is out sick. Could we reschedule your interview to Thursday?'), 'interview');
eq('offer', cls('Congratulations from Jane Street!', 'We are thrilled to extend you an offer for the Quantitative Trader Intern position. Your offer letter is attached.'), 'offer');
eq('noise linkedin alert', cls('"software engineer intern": Google - Software Engineer Intern and more', 'Jobs you may be interested in'), null);
eq('noise is hiring', cls('Stripe is hiring: Software Engineer Intern', 'Apply now'), null);
eq('unrelated', cls('Your Amazon order has shipped', 'Track your package'), null);
eq('conditional interview -> received', cls('Application received', 'If selected, we will contact you to schedule an interview.'), 'received');

// ---------- dates ----------
eq('date en', new Date(E.parseDate('Tue, Nov 3, 2026, 4:12\u202fPM')).toLocaleDateString('en-CA'), '2026-11-03');
eq('date zh', new Date(E.parseDate('2026年11月3日 下午4:12')).getHours(), 16);
eq('date bad', E.parseDate('昨天'), null);

// ---------- guesses ----------
eq('guess company ATS sender', E.guessCompany({ senderName: 'Stripe Recruiting', senderEmail: 'no-reply@us.greenhouse-mail.io', subject: 'x' }), 'Stripe');
eq('guess company own domain', E.guessCompany({ senderName: 'Jane Street Recruiting', senderEmail: 'campus@janestreet.com', subject: 'x' }), 'Jane Street');
eq('guess company recruiter person', E.guessCompany({ senderName: 'Emily Chen', senderEmail: 'emily@mail.robinhood.com', subject: 'x' }), 'Robinhood');
eq('guess company linkedin', E.guessCompany({ senderName: 'LinkedIn', senderEmail: 'jobs-noreply@linkedin.com', subject: 'Alex, your application was sent to Ramp' }), 'Ramp');
eq('guess title', E.guessTitle({ subject: 'Thank you for applying for the Software Engineer Intern position' }), 'Software Engineer Intern');
eq('guess title 2', E.guessTitle({ subject: 'Your application to Data Scientist Intern at Ramp' }), 'Data Scientist Intern');

// ---------- matching ----------
const mk = (company, title, appliedDate, status = 'applied') => S.newApp({ company, title, appliedDate, status });
const apps = [
  mk('Stripe', 'Software Engineer Intern', '2026-10-20'),
  mk('Google', 'Software Engineering Intern, BS/MS', '2026-10-01'),
  mk('Google', 'Data Analyst Intern', '2026-10-02'),
  mk('Jane Street', 'Quantitative Trader Intern', '2026-10-05', 'interviewing'),
  mk('Meta', 'Software Engineer, New Grad', '2026-09-01'),
];
const m = (em, date) => {
  const r = E.match(em, apps, date);
  return r.app ? `${r.app.company}|${r.app.title}` : `none:${r.candidates.length}${r.stale ? ':stale' : ''}`;
};
eq('match ats sender name', m({ senderName: 'Stripe Recruiting', senderEmail: 'no-reply@greenhouse-mail.io', subject: 'Update on your application', body: '' }), 'Stripe|Software Engineer Intern');
eq('match own domain', m({ senderName: 'Recruiting', senderEmail: 'recruiting@janestreet.com', subject: 'Next steps', body: '' }), 'Jane Street|Quantitative Trader Intern');
eq('google ambiguous', m({ senderName: 'Google Careers', senderEmail: 'noreply@google.com', subject: 'Your application', body: 'Thanks for your interest in Google.' }), 'none:2');
eq('google disambiguated by title', m({ senderName: 'Google Careers', senderEmail: 'noreply@google.com', subject: 'Google Data Analyst Intern application', body: '' }), 'Google|Data Analyst Intern');
eq('stale email skipped', m({ senderName: 'Meta', senderEmail: 'no-reply@meta.com', subject: 'Your application', body: '' }, Date.parse('2026-06-01')), 'none:0:stale');
eq('no false match on substring', m({ senderName: 'Metabase', senderEmail: 'hello@metabase.com', subject: 'Metabase update', body: 'metadata' }), 'none:0');

// ---------- end-to-end process / undo / resolve ----------
(async () => {
  for (const a of apps) await S.save(a);
  const recent = 'Tue, Nov 3, 2026, 4:12 PM';
  const evs = await E.process([
    { source: 'list', legacyId: 't1', subject: 'Your application to Stripe', body: 'Unfortunately, we have decided to move forward with other candidates.', senderName: 'Stripe Recruiting', senderEmail: 'no-reply@greenhouse-mail.io', dateText: recent },
    { source: 'list', legacyId: 't2', subject: 'Interview Invitation', body: 'We would like to schedule your onsite interview. Please share your availability.', senderName: 'Jane Street', senderEmail: 'recruiting@janestreet.com', dateText: recent },
    { source: 'list', legacyId: 't3', subject: 'Alex, your application was sent to Ramp', body: 'Your application was sent to Ramp.', senderName: 'LinkedIn', senderEmail: 'jobs-noreply@linkedin.com', dateText: recent },
    { source: 'list', legacyId: 't4', subject: 'Your Amazon order', body: 'shipped', senderName: 'Amazon', senderEmail: 'ship@amazon.com', dateText: recent },
  ], '/mail/u/0');
  eq('process: events', evs.map((e) => [e.type, e.state, e.company || e.guessCompany]), [['rejected', 'applied', 'Stripe'], ['interview', 'noop', 'Jane Street'], ['received', 'unmatched', 'Ramp']]);
  const stripe = (await S.all()).find((a) => a.company === 'Stripe');
  eq('process: stripe rejected', [stripe.status, stripe.timeline.at(-1).note.startsWith('📧 拒信')], ['rejected', true]);
  const js = (await S.all()).find((a) => a.company === 'Jane Street');
  eq('process: jane street note only', [js.status, js.timeline.at(-1).note.startsWith('📧 面试邀请')], ['interviewing', true]);

  const again = await E.process([{ source: 'open', legacyId: 't1', subject: 'Your application to Stripe', body: 'Unfortunately, we have decided to move forward with other candidates.', senderName: 'Stripe Recruiting', senderEmail: 'no-reply@greenhouse-mail.io', dateText: recent }]);
  eq('process: same thread+type not reprocessed', again.length, 0);

  await E.undo(evs[0].id);
  const stripe2 = await S.get(stripe.id);
  eq('undo: status restored', [stripe2.status, stripe2.timeline.some((t) => (t.note || '').startsWith('📧'))], ['applied', false]);

  const created = await E.resolve(evs[2].id, 'create');
  const ramp = await S.get(created.appId);
  eq('resolve create', [ramp.company, ramp.status, ramp.appliedDate, ramp.source], ['Ramp', 'applied', '2026-11-03', '邮件']);

  const amb = await E.process([{ source: 'open', legacyId: 't5', subject: 'Your Google application', body: 'Please complete the online assessment on HackerRank.', senderName: 'Google', senderEmail: 'noreply@google.com', dateText: recent }]);
  eq('ambiguous google', [amb[0].state, amb[0].candidates.length], ['ambiguous', 2]);
  const gid = amb[0].candidates[1];
  await E.resolve(amb[0].id, gid);
  eq('resolve link -> oa', (await S.get(gid)).status, 'oa');
  const events = await E.events();
  eq('events stored', events.length, 4);


  const sc = await E.process([{ source: 'list', legacyId: 'tsc', subject: 'Thank you for applying to Scale AI', body: 'Thanks for applying.', senderName: 'Scale AI Recruiting', senderEmail: 'no-reply@ashbyhq.com', dateText: recent }]);
  eq('unmatched: title guess not a copy of company', [sc[0].guessCompany, sc[0].guessTitle], ['Scale AI', '']);

  // ---------- sender before body; tool names are not employers ----------
  const unityMail = { subject: 'Thank you for applying', body: 'Thank you for applying to Unity. If selected, we will set up a call over Google Meet.', senderName: 'Unity', senderEmail: 'unitytech@myworkday.com' };
  eq('workday email: sender names the company', [E.match(unityMail, apps, null).app, E.guessCompany(unityMail)], [null, 'Unity']);
  const withUnity = [...apps, mk('Unity', 'Software Engineer Intern', '2026-11-02')];
  const meet = { subject: 'Next steps', body: 'We would like to schedule a technical interview. Join with Google Meet: meet.google.com/abc', senderName: 'Jane Doe', senderEmail: 'jane.doe@unity.com' };
  eq('google meet link does not pick google', (E.match(meet, withUnity, null).app || {}).company, 'Unity');
  const invite = { subject: 'Invitation: Interview with Unity @ Tue Nov 10, 2026 2pm', body: 'Join with Google Meet', senderName: 'Google Calendar', senderEmail: 'calendar-notification@google.com' };
  eq('calendar invite: company from subject', [(E.match(invite, withUnity, null).app || {}).company, E.guessCompany(invite)], ['Unity', 'Unity']);
  const personal = { subject: 'Following up', body: 'Great talking about the role at Stripe. Can we schedule a call?', senderName: 'Jane Doe', senderEmail: 'jane.doe@gmail.com' };
  eq('personal mail: body still matches', (E.match(personal, apps, null).app || {}).company, 'Stripe');

  // ---------- a posting viewed recently fills in what the email lacks ----------
  const posting = {
    url: 'https://unitytech.wd1.myworkdayjobs.com/en-US/Unity/job/SF/Software-Engineer-Intern_JOBREQ-1', company: 'Unity', title: 'Software Engineer Intern, Graphics',
    location: 'San Francisco, CA', source: 'Workday', description: 'Build rendering features in C++. '.repeat(20), jobType: 'intern', key: 'k1', host: 'unitytech.wd1.myworkdayjobs.com', at: Date.now(),
  };
  await local.set({ recentJobs: [posting] });
  const conf = await E.process([{ source: 'open', legacyId: 'u1', ...unityMail, dateText: recent }], '/mail/u/0');
  const ua = conf[0] && (await S.get(conf[0].appId));
  eq('confirmation of a viewed posting records it',
    [conf[0] && conf[0].state, conf[0] && conf[0].created, ua && ua.company, ua && ua.title, ua && ua.source, ua && ua.description.length > 200, ua && ua.appliedDate],
    ['applied', true, 'Unity', 'Software Engineer Intern, Graphics', 'Workday', true, '2026-11-03']);
  await E.undo(conf[0].id);
  eq('undo removes the recorded posting', await S.get(conf[0].appId), null);
  const oa = await E.process([{ source: 'open', legacyId: 'u2', subject: 'Unity coding assessment', body: 'Please complete the online assessment on HackerRank.', senderName: 'Unity', senderEmail: 'unitytech@myworkday.com', dateText: recent }], '/mail/u/0');
  eq('other email types only suggest', [oa[0] && oa[0].state, oa[0] && oa[0].guessTitle], ['unmatched', 'Software Engineer Intern, Graphics']);
  const fromOa = await S.get((await E.resolve(oa[0].id, 'create')).appId);
  eq('create uses the viewed posting', [fromOa.title, fromOa.status, fromOa.description.length > 200], ['Software Engineer Intern, Graphics', 'oa', true]);
  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
})();

// Shared constants. Classic script: attaches to globalThis.JT so it works in
// the service worker (importScripts), content scripts and extension pages.
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});
  // Translate through lib/i18n.js when it is loaded; otherwise keep the Chinese text.
  JT.t = (s, v) =>
    JT.i18n ? JT.i18n.t(s, v) : v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s;
  // Labels are getters so they follow the current UI language.
  const t = (s) => JT.t(s);

  JT.STATUSES = [
    { id: 'wishlist', color: '#8a8f98', get label() { return t('想投'); } },
    { id: 'applied', color: '#2f6fde', get label() { return t('已投递'); } },
    { id: 'oa', color: '#8b5cf6', label: 'OA' },
    { id: 'interviewing', color: '#d97706', get label() { return t('面试中'); } },
    { id: 'offer', color: '#16a34a', label: 'Offer' },
    { id: 'rejected', color: '#dc2626', get label() { return t('被拒'); } },
    { id: 'withdrawn', color: '#6b7280', get label() { return t('已放弃'); } },
    { id: 'ghosted', color: '#a1a1aa', get label() { return t('无回音'); } },
  ];
  JT.STATUS_MAP = Object.fromEntries(JT.STATUSES.map((s) => [s.id, s]));
  // Statuses that mean the company responded with a next step.
  JT.PROGRESS_STATUSES = ['oa', 'interviewing', 'offer'];

  JT.JOB_TYPES = [
    { id: 'intern', get label() { return t('实习'); } },
    { id: 'fulltime', get label() { return t('全职'); } },
    { id: 'coop', label: 'Co-op' },
    { id: 'parttime', get label() { return t('兼职'); } },
    { id: 'contract', get label() { return t('合同工'); } },
    { id: 'other', get label() { return t('其他'); } },
  ];

  JT.WORK_MODES = [
    { id: '', get label() { return t('未知'); } },
    { id: 'onsite', label: 'On-site' },
    { id: 'hybrid', label: 'Hybrid' },
    { id: 'remote', label: 'Remote' },
  ];

  JT.SPONSORSHIP = [
    { id: 'unknown', get label() { return t('未提及'); } },
    { id: 'yes', get label() { return t('可 Sponsor'); } },
    { id: 'no', get label() { return t('不 Sponsor'); } },
    { id: 'citizen', get label() { return t('需公民/Clearance'); } },
  ];

  JT.ROUND_TYPES = [
    'OA / Coding Test',
    'Recruiter Screen',
    'Technical Phone Screen',
    'Behavioral',
    'Hiring Manager',
    'Onsite / Final Round',
    'Take-home',
    'Team Match',
    'Other',
  ];

  JT.ROUND_RESULTS = [
    { id: 'pending', get label() { return t('待定'); } },
    { id: 'passed', get label() { return t('通过'); } },
    { id: 'failed', get label() { return t('未通过'); } },
  ];

  JT.DEFAULT_SETTINGS = {
    autoDetect: true, // prompt to record when a "thanks for applying" page is detected
    emailDetect: true, // read recruiting emails in Gmail and update statuses
    defaultStatus: 'applied',
    lang: 'auto', // UI language: 'auto' (follow the browser) | 'zh' | 'en'
    lastBackupAt: null,
  };

  JT.label = (list, id) => (list.find((x) => x.id === id) || {}).label || id || '';
})();

// Shared constants. Classic script: attaches to globalThis.JT so it works in
// the service worker (importScripts), content scripts and extension pages.
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});

  JT.STATUSES = [
    { id: 'wishlist', label: '想投', color: '#8a8f98' },
    { id: 'applied', label: '已投递', color: '#2f6fde' },
    { id: 'oa', label: 'OA', color: '#8b5cf6' },
    { id: 'interviewing', label: '面试中', color: '#d97706' },
    { id: 'offer', label: 'Offer', color: '#16a34a' },
    { id: 'rejected', label: '被拒', color: '#dc2626' },
    { id: 'withdrawn', label: '已放弃', color: '#6b7280' },
    { id: 'ghosted', label: '无回音', color: '#a1a1aa' },
  ];
  JT.STATUS_MAP = Object.fromEntries(JT.STATUSES.map((s) => [s.id, s]));
  // Statuses that mean the company responded with a next step.
  JT.PROGRESS_STATUSES = ['oa', 'interviewing', 'offer'];

  JT.JOB_TYPES = [
    { id: 'intern', label: '实习' },
    { id: 'fulltime', label: '全职' },
    { id: 'coop', label: 'Co-op' },
    { id: 'parttime', label: '兼职' },
    { id: 'contract', label: '合同工' },
    { id: 'other', label: '其他' },
  ];

  JT.WORK_MODES = [
    { id: '', label: '未知' },
    { id: 'onsite', label: 'On-site' },
    { id: 'hybrid', label: 'Hybrid' },
    { id: 'remote', label: 'Remote' },
  ];

  JT.SPONSORSHIP = [
    { id: 'unknown', label: '未提及' },
    { id: 'yes', label: '可 Sponsor' },
    { id: 'no', label: '不 Sponsor' },
    { id: 'citizen', label: '需公民/Clearance' },
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
    { id: 'pending', label: '待定' },
    { id: 'passed', label: '通过' },
    { id: 'failed', label: '未通过' },
  ];

  JT.DEFAULT_SETTINGS = {
    autoDetect: true, // prompt to record when a "thanks for applying" page is detected
    emailDetect: true, // read recruiting emails in Gmail and update statuses
    defaultStatus: 'applied',
    lastBackupAt: null,
  };

  JT.label = (list, id) => (list.find((x) => x.id === id) || {}).label || id || '';
})();

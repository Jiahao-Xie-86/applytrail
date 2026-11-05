const A = JT.analyze;
const S = JT.store;
const t = JT.i18n.t;
const form = document.getElementById('form');
const $ = (id) => document.getElementById(id);

let baseJob = {}; // what was extracted from the page (keeps fields the form doesn't show)
let existing = null;
let selection = '';
let usedSelection = false;

function fillSelect(name, items) {
  form.elements[name].innerHTML = items.map((x) => `<option value="${x.id}">${x.label}</option>`).join('');
}

function setForm(obj) {
  for (const el of form.elements) {
    if (el.name && obj[el.name] != null) el.value = obj[el.name];
  }
  refreshDerived();
}

function refreshDerived() {
  const desc = form.elements.description.value;
  $('jdLen').textContent = desc.length.toLocaleString();
  const kws = A.extractKeywords(`${form.elements.title.value}\n${desc}`);
  $('keywords').innerHTML = kws.map((k) => `<span class="chip">${k}</span>`).join('');
  const sp = A.detectSponsorship(desc);
  const box = $('sponsorNote');
  if (sp.value === 'no' || sp.value === 'citizen') {
    box.textContent = t('⚠ {label}：“{note}”', { label: JT.label(JT.SPONSORSHIP, sp.value), note: sp.note });
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
  }
}

async function extractFromTab(tab) {
  const send = () => chrome.tabs.sendMessage(tab.id, { type: 'JT_EXTRACT' }, { frameId: 0 });
  try {
    const res = await send();
    if (res) return res;
  } catch {}
  // Page was open before the extension was installed/reloaded: inject on demand.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/analyze.js', 'content/extractors.js', 'content/content.js'],
    });
    return await send();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function renderStats(apps) {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toLocaleDateString('en-CA');
  const applied = apps.filter((a) => a.status !== 'wishlist');
  const week = applied.filter((a) => (a.appliedDate || '') >= weekAgo).length;
  const active = apps.filter((a) => JT.PROGRESS_STATUSES.includes(a.status)).length;
  $('stats').textContent = t('已投 {a} · 近 7 天 {w} · 进行中 {p}', { a: applied.length, w: week, p: active });
}

async function init() {
  await JT.i18n.init();
  JT.i18n.apply(document);
  fillSelect('status', JT.STATUSES);
  fillSelect('jobType', JT.JOB_TYPES);
  fillSelect('workMode', JT.WORK_MODES);
  fillSelect('sponsorship', JT.SPONSORSHIP);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [apps, settings] = await Promise.all([S.all(), S.getSettings()]);
  renderStats(apps);
  const resumes = [...new Set(apps.map((a) => a.resumeVersion).filter(Boolean))];
  $('resumeList').innerHTML = resumes.map((r) => `<option value="${r.replace(/"/g, '&quot;')}">`).join('');

  // Gmail, search results: not a job page, so don't record "Google" from the address.
  const notJob = !!tab && A.isNotJobSite(tab.url || '');
  const res = tab && /^https?:/.test(tab.url || '') && !notJob ? await extractFromTab(tab) : null;
  baseJob = res && res.ok ? res.job : { url: notJob ? '' : (tab && tab.url) || '' };
  selection = (res && res.selection) || '';
  if (selection.length > 150) {
    $('useSel').classList.remove('hidden');
    if ((baseJob.description || '').length < 300) {
      baseJob = A.enrich({ ...baseJob, description: A.cleanText(selection), keywords: undefined });
      usedSelection = true;
    }
  }
  if (notJob) {
    $('warn').textContent = t('这是邮箱或搜索页面，不是职位页面：请在职位页面上点插件，或在这里手动填写。');
    $('warn').classList.remove('hidden');
  } else if (!res || !res.ok) {
    $('warn').textContent = t('无法自动读取这个页面，可以手动填写（或先刷新页面再试）。');
    $('warn').classList.remove('hidden');
  } else if (!baseJob.description) {
    $('warn').textContent = t('没抓到 JD：可以在网页上选中职位描述文字，再点开插件。');
    $('warn').classList.remove('hidden');
  }

  existing = S.findMatch(baseJob, apps);
  if (existing) {
    const merged = { ...existing };
    for (const k of ['description', 'location', 'salary', 'jobId', 'term']) if (!merged[k] && baseJob[k]) merged[k] = baseJob[k];
    setForm(merged);
    const st = JT.STATUS_MAP[existing.status] || {};
    const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    $('banner').innerHTML = `<span>${t('已记录')} · <span class="pill"><span class="dot" style="--c:${st.color}"></span>${esc(st.label)}</span>
      ${existing.appliedDate ? ' · ' + esc(t('投递于 {date}', { date: existing.appliedDate })) : ''}</span><button class="link" id="openThis">${t('在追踪表中打开')}</button>`;
    $('banner').classList.remove('hidden');
    $('openThis').onclick = () => openDashboard(existing.id);
    $('saveBtn').textContent = t('更新');
  } else {
    setForm({
      ...baseJob,
      status: settings.defaultStatus,
      appliedDate: settings.defaultStatus === 'wishlist' ? '' : S.today(),
      resumeVersion: resumes[0] || '',
    });
    if (!baseJob.description) $('jdBox').open = true;
  }
  if (res && res.ok) await officialJD();
}

// Postings on Workday, Greenhouse, Lever and Ashby: take the JD from the ATS's job API, which is
// the exact posting text, instead of what was read from the page layout.
async function officialJD() {
  const box = form.elements.description;
  const src = $('jdSource');
  const show = (text, cls) => {
    src.textContent = text;
    src.className = 'jd-src' + (cls ? ' ' + cls : '');
  };
  const site = JT.jd.apiName(baseJob.url);
  const problem = JT.jd.problem(box.value);
  const keepSaved = existing && !JT.jd.problem(existing.description); // already has a good JD
  if (!site || usedSelection || keepSaved) {
    if (problem === 'list' || (problem === 'short' && !usedSelection)) show(t('⚠ 这段 JD 可能不完整（太短，或混进了职位列表）：可以在网页上选中 JD 文字后再点插件。'), 'bad');
    return;
  }
  const before = box.value;
  show(t('正在从 {site} 读取官方 JD…', { site }));
  const got = await JT.jd.fetch(baseJob.url);
  if (box.value !== before) {
    src.className = 'jd-src hidden'; // the user started editing: leave their text alone
    return;
  }
  if (!got) {
    show(problem ? t('⚠ 没能从 {site} 读取官方 JD，网页上读到的 JD 可能不完整。', { site }) : t('没能从 {site} 读取官方 JD，下面是从网页读到的内容。', { site }), problem ? 'bad' : '');
    return;
  }
  const parts = (v) => String(v || '').split(' | ').filter(Boolean).length;
  box.value = got.description;
  if (!form.elements.title.value && got.title) form.elements.title.value = A.oneLine(got.title);
  if (got.location && (!form.elements.location.value || parts(form.elements.location.value) > parts(got.location))) form.elements.location.value = got.location;
  if (!form.elements.jobId.value && got.jobId) form.elements.jobId.value = got.jobId;
  refreshDerived();
  if (/JD/.test($('warn').textContent)) $('warn').classList.add('hidden');
  show(t('✓ JD 取自 {site} 官方职位数据（与职位页原文一致）', { site }), 'ok');
}

function openDashboard(id) {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') + (id ? '#id=' + id : '') });
  window.close();
}

$('openDash').onclick = () => openDashboard();
$('useSel').onclick = () => {
  form.elements.description.value = A.cleanText(selection);
  refreshDerived();
};
form.elements.description.addEventListener('input', refreshDerived);
form.elements.status.addEventListener('change', () => {
  const st = form.elements.status.value;
  if (st === 'wishlist') form.elements.appliedDate.value = '';
  else if (!form.elements.appliedDate.value) form.elements.appliedDate.value = S.today();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = Object.fromEntries(new FormData(form));
  for (const k of Object.keys(v)) if (k !== 'description' && k !== 'notes') v[k] = v[k].trim();
  v.description = A.cleanText(v.description);
  v.keywords = A.extractKeywords(`${v.title}\n${v.description}`);
  v.requirements = A.extractRequirements(v.description);
  if (v.sponsorship === 'unknown') {
    const sp = A.detectSponsorship(v.description);
    v.sponsorship = sp.value;
    v.sponsorshipNote = sp.note;
  }
  try {
    if (existing) {
      const app = { ...existing, ...v, status: existing.status };
      S.applyStatus(app, v.status);
      await S.save(app);
    } else {
      await S.save(S.newApp({ ...baseJob, ...v }));
    }
    $('msg').className = '';
    $('msg').textContent = t('已保存 ✓');
    setTimeout(() => window.close(), 700);
  } catch (err) {
    $('msg').className = 'err';
    $('msg').textContent = t('保存失败：{error}', { error: err.message });
  }
});

init();

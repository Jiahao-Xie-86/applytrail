const A = JT.analyze;
const S = JT.store;
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const opts = (items, sel) =>
  items.map((x) => `<option value="${esc(x.id)}"${x.id === sel ? ' selected' : ''}>${esc(x.label)}</option>`).join('');
const pad = (n) => String(n).padStart(2, '0');
const WEEKDAYS = '日一二三四五六';
const ACTIVE = ['applied', 'oa', 'interviewing'];

const state = { apps: [], status: '', type: '', source: '', sponsor: '', q: '', sort: 'applied', openId: null, tab: 'info', jdEdit: false };
let current = null; // the application open in the drawer (edited in place, autosaved)

// ---------- date helpers ----------

const parseDay = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d) : null);
const daysSince = (d) => {
  const t = parseDay(d);
  return t && !isNaN(t) ? Math.floor((Date.now() - t) / 864e5) : null;
};
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
function fmtWhen(local) {
  const d = new Date(local);
  if (isNaN(d)) return local || '';
  return `${md(d)} 周${WEEKDAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtAt(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : `${d.toLocaleDateString('en-CA')} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function weekStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}
function lastActivity(a) {
  const tl = (a.timeline || []).map((t) => (t.at || '').slice(0, 10));
  return [a.appliedDate || '', ...tl].sort().pop();
}
function upcomingRound(a) {
  const now = Date.now() - 2 * 3600e3;
  return (a.interviews || [])
    .filter((r) => r.date && new Date(r.date).getTime() >= now)
    .sort((x, y) => x.date.localeCompare(y.date))[0];
}
const reachedProgress = (a) =>
  JT.PROGRESS_STATUSES.includes(a.status) ||
  (a.timeline || []).some((t) => JT.PROGRESS_STATUSES.includes(t.status)) ||
  (a.interviews || []).length > 0;

// ---------- overview ----------

function renderTiles() {
  const applied = state.apps.filter((a) => a.status !== 'wishlist');
  const weekAgo = new Date(Date.now() - 6 * 864e5).toLocaleDateString('en-CA');
  const count = (st) => state.apps.filter((a) => st.includes(a.status)).length;
  const rate = applied.length ? Math.round((applied.filter(reachedProgress).length / applied.length) * 100) + '%' : '—';
  const tiles = [
    [applied.length, '已投递'],
    [applied.filter((a) => (a.appliedDate || '') >= weekAgo).length, '近 7 天投递'],
    [count(['applied']), '等待回复'],
    [count(['oa', 'interviewing']), 'OA / 面试中'],
    [count(['offer']), 'Offer'],
    [rate, '进入 OA / 面试比例'],
  ];
  $('tiles').innerHTML = tiles.map(([v, l]) => `<div class="tile"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
}

function renderChart() {
  const svg = $('weekly');
  const W = $('chartWrap').clientWidth || 480;
  const H = $('chartWrap').clientHeight || 170;
  const m = { l: 26, r: 6, t: 16, b: 20 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;

  const thisWeek = weekStart(new Date());
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const s = new Date(thisWeek);
    s.setDate(s.getDate() - 7 * i);
    weeks.push({ start: s, n: 0 });
  }
  for (const a of state.apps) {
    if (a.status === 'wishlist' || !a.appliedDate) continue;
    const ws = weekStart(parseDay(a.appliedDate)).getTime();
    const w = weeks.find((x) => x.start.getTime() === ws);
    if (w) w.n++;
  }
  const max = Math.max(...weeks.map((w) => w.n));
  const step = [1, 2, 5, 10, 20, 50, 100].find((s) => Math.ceil(Math.max(max, 4) / s) <= 4);
  const top = Math.max(step * Math.ceil(Math.max(max, 1) / step), step * 2);
  const y = (v) => m.t + ph - (v / top) * ph;

  let out = '<g class="grid">';
  for (let v = 0; v <= top; v += step) {
    out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"></line><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  out += '</g>';
  const slot = pw / weeks.length;
  const bw = Math.min(30, slot * 0.6);
  weeks.forEach((w, i) => {
    const x = m.l + i * slot + (slot - bw) / 2;
    const yb = y(0);
    if (w.n > 0) {
      const yt = y(w.n);
      const r = Math.min(4, (yb - yt) / 2, bw / 2);
      out += `<path class="bar" d="M${x},${yb}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + bw - r}Q${x + bw},${yt} ${x + bw},${yt + r}V${yb}Z"></path>`;
    }
    const isLast = i === weeks.length - 1;
    if (i % 2 === 1 || isLast) {
      out += `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${isLast ? '本周' : md(w.start)}</text>`;
    }
    if ((isLast || w.n === max) && w.n > 0) {
      out += `<text class="val" x="${x + bw / 2}" y="${y(w.n) - 5}" text-anchor="middle">${w.n}</text>`;
    }
    out += `<rect class="hit" data-i="${i}" x="${m.l + i * slot}" y="${m.t}" width="${slot}" height="${ph}"></rect>`;
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = out;

  const tip = $('chartTip');
  svg.querySelectorAll('.hit').forEach((rect) => {
    rect.addEventListener('mouseenter', () => {
      const i = +rect.dataset.i;
      const w = weeks[i];
      const end = new Date(w.start);
      end.setDate(end.getDate() + 6);
      tip.textContent = `${md(w.start)} – ${md(end)}：投递 ${w.n} 份`;
      tip.style.left = `${m.l + i * slot + slot / 2}px`;
      tip.style.top = `${Math.min(y(w.n), y(0)) - 8}px`;
      tip.classList.remove('hidden');
    });
    rect.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  });
}

function renderUpcoming() {
  const items = [];
  for (const a of state.apps) {
    const now = Date.now() - 2 * 3600e3;
    for (const r of a.interviews || []) if (r.date && new Date(r.date).getTime() >= now) items.push({ a, r });
  }
  items.sort((x, y) => x.r.date.localeCompare(y.r.date));
  $('upcoming').innerHTML = items.length
    ? items
        .slice(0, 10)
        .map(({ a, r }) => `<li data-id="${a.id}"><span class="when">${fmtWhen(r.date)}</span><span class="what">${esc(a.company)} · ${esc(r.type)}</span></li>`)
        .join('')
    : '<li class="empty-up">暂无。打开一条记录 → 面试记录 → 添加一轮，就会出现在这里。</li>';
}

async function renderBackupWarn() {
  const s = await S.getSettings();
  const { syncConfig, syncState } = await S.area.get(['syncConfig', 'syncState']);
  // A working cloud sync is the backup.
  const synced = syncConfig && syncConfig.enabled && syncState && syncState.lastSyncAt > Date.now() - 3 * 864e5;
  const days = s.lastBackupAt ? daysSince(s.lastBackupAt) : null;
  const show = !synced && state.apps.length >= 5 && (days === null || days >= 14);
  const box = $('backupWarn');
  box.classList.toggle('hidden', !show);
  if (show) {
    box.innerHTML = `<span>${days === null ? '还没有备份过' : `上次备份是 ${days} 天前`}。数据只存在这个浏览器里，卸载插件或清除浏览器数据会丢失。</span>
      <button id="backupNow">立即备份</button>`;
    $('backupNow').onclick = exportJson;
  }
}

// ---------- list ----------

function renderStatusTabs() {
  const counts = {};
  for (const a of state.apps) counts[a.status] = (counts[a.status] || 0) + 1;
  const tabs = [
    { id: '', label: '全部', n: state.apps.length },
    { id: 'active', label: '进行中', n: state.apps.filter((a) => ACTIVE.includes(a.status)).length },
    ...JT.STATUSES.map((s) => ({ id: s.id, label: s.label, n: counts[s.id] || 0 })),
  ].filter((t) => t.n > 0 || t.id === '' || t.id === state.status);
  $('statusTabs').innerHTML = tabs
    .map((t) => `<button data-status="${t.id}" class="${t.id === state.status ? 'active' : ''}">${t.label}<span class="n">${t.n}</span></button>`)
    .join('');
}

function renderFilters() {
  const sources = [...new Set(state.apps.map((a) => a.source).filter(Boolean))].sort();
  $('fType').innerHTML = `<option value="">全部类型</option>${opts(JT.JOB_TYPES, state.type)}`;
  $('fSource').innerHTML = `<option value="">全部来源</option>${opts(sources.map((s) => ({ id: s, label: s })), state.source)}`;
  $('fSponsor').innerHTML = `<option value="">签证：全部</option>${opts(JT.SPONSORSHIP, state.sponsor)}`;
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  const list = state.apps.filter((a) => {
    if (state.status === 'active' ? !ACTIVE.includes(a.status) : state.status && a.status !== state.status) return false;
    if (state.type && a.jobType !== state.type) return false;
    if (state.source && a.source !== state.source) return false;
    if (state.sponsor && a.sponsorship !== state.sponsor) return false;
    if (!q) return true;
    return [a.company, a.title, a.location, a.term, a.notes, a.prepNotes, a.description, (a.keywords || []).join(' ')]
      .join('\n')
      .toLowerCase()
      .includes(q);
  });
  const by = {
    applied: (x, y) => (y.appliedDate || y.createdAt).localeCompare(x.appliedDate || x.createdAt),
    updated: (x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || ''),
    company: (x, y) => (x.company || '').localeCompare(y.company || '', 'en', { sensitivity: 'base' }),
  }[state.sort];
  return list.sort((x, y) => (y.starred ? 1 : 0) - (x.starred ? 1 : 0) || by(x, y));
}

function nextStep(a) {
  const up = upcomingRound(a);
  if (up) return `${fmtWhen(up.date)} · ${esc(up.type)}`;
  if (a.status === 'applied') {
    const d = daysSince(lastActivity(a));
    if (d >= 21) return `<span class="stale">${d} 天无回音</span>`;
  }
  if (a.status === 'wishlist' && a.deadline) return `截止 ${esc(a.deadline)}`;
  return '';
}

function rowHtml(a) {
  const st = JT.STATUS_MAP[a.status] || {};
  const sub = [a.term, a.sponsorship === 'no' || a.sponsorship === 'citizen' ? '⚠ ' + JT.label(JT.SPONSORSHIP, a.sponsorship) : '']
    .filter(Boolean)
    .join(' · ');
  return `<tr data-id="${a.id}" class="${a.id === state.openId ? 'selected' : ''}">
    <td class="c-star"><button class="star ${a.starred ? 'on' : ''}" data-act="star" title="标星">${a.starred ? '★' : '☆'}</button></td>
    <td class="company" title="${esc(a.company)}">${esc(a.company) || '—'}</td>
    <td class="title"><span class="t" title="${esc(a.title)}">${esc(a.title) || '—'}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</td>
    <td class="nowrap">${esc(JT.label(JT.JOB_TYPES, a.jobType))}</td>
    <td class="loc" title="${esc(a.location)}">${esc(a.location)}</td>
    <td class="nowrap">${esc(a.source)}</td>
    <td class="nowrap">${esc(a.appliedDate)}</td>
    <td class="nowrap"><span class="pill"><span class="dot" style="--c:${st.color}"></span><select class="status-select" data-act="status">${opts(JT.STATUSES, a.status)}</select></span></td>
    <td class="next">${nextStep(a)}</td>
  </tr>`;
}

function renderRows() {
  const list = filtered();
  $('count').textContent = `${list.length} 条`;
  $('empty').classList.toggle('hidden', list.length > 0 || state.apps.length === 0);
  $('rows').innerHTML = list.map(rowHtml).join('');
}

// ---------- email activity ----------

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  if (m < 48 * 60) return `${Math.round(m / 60)} 小时前`;
  return `${Math.round(m / 1440)} 天前`;
}

function gmailLink(e) {
  const base = `https://mail.google.com${e.account || '/mail/u/0'}/`;
  return /^[0-9a-f]{10,}$/i.test(e.legacyId) ? `${base}#all/${e.legacyId}` : `${base}#search/${encodeURIComponent(`subject:"${e.subject}"`)}`;
}

function evHtml(e, appOptions) {
  const T = JT.email.TYPES[e.type];
  const color = (JT.STATUS_MAP[T.target] || {}).color;
  const st = (id) => esc(JT.label(JT.STATUSES, id));
  const view = `<button data-ev="view">查看</button>`;
  const undo = `<button data-ev="undo">撤销</button>`;
  let main;
  let actions = '';
  if (e.state === 'applied' && e.created) {
    main = `<b>${esc(e.company || '（未知公司）')}</b> 已从邮件创建记录（${st(e.newStatus)}）`;
    actions = view + undo;
  } else if (e.state === 'applied') {
    main = `<b>${esc(e.company)}</b> ${st(e.prevStatus)} → ${st(e.newStatus)}`;
    actions = view + undo;
  } else if (e.state === 'noop') {
    main = `<b>${esc(e.company)}</b> 已记到时间线（状态不变）`;
    actions = view + undo;
  } else if (e.state === 'undone') {
    main = `${esc(e.company || e.guessCompany)} · 已撤销`;
  } else {
    const guess = [e.guessCompany, e.guessTitle].filter(Boolean).map(esc).join(' · ');
    main =
      e.state === 'ambiguous'
        ? '匹配到多个投递，请选择是哪一个'
        : e.type === 'received'
          ? `可能是还没记录的投递${guess ? '：' + guess : ''}`
          : `没找到对应的投递${guess ? '（' + guess + '）' : ''}`;
    const cands = (e.candidates || []).map((id) => state.apps.find((a) => a.id === id)).filter(Boolean);
    const candOpts = cands.map((a) => `<option value="${a.id}">${esc(a.company)} - ${esc(a.title)}</option>`).join('');
    actions = `${e.state === 'unmatched' ? '<button data-ev="create">创建记录</button>' : ''}
      <select data-ev="link"><option value="">关联到…</option>${candOpts ? `<optgroup label="可能是">${candOpts}</optgroup><optgroup label="全部">` : ''}${appOptions}${candOpts ? '</optgroup>' : ''}</select>
      <button data-ev="ignore" class="ghost">忽略</button>`;
  }
  const when = md(new Date(e.date || e.at));
  return `<li class="ev ${e.state}" data-id="${e.id}" data-app="${e.appId || ''}">
    <span class="ev-date">${when}</span>
    <span class="pill"><span class="dot" style="--c:${color}"></span>${esc(T.label)}</span>
    <div class="ev-main"><div>${main}</div>
      <div class="ev-sub"><a href="${esc(gmailLink(e))}" target="_blank" rel="noopener" title="${esc(e.evidence || '')}">${esc(e.subject)}</a></div></div>
    <div class="ev-actions">${actions}</div>
  </li>`;
}

async function renderEmails() {
  const d = await S.area.get(['emailEvents', 'gmailScan', 'settings']);
  const enabled = !d.settings || d.settings.emailDetect !== false;
  const scan = d.gmailScan;
  $('gmailStatus').textContent = !enabled
    ? '已关闭（可在设置中开启）'
    : scan
      ? `Gmail 上次扫描 ${ago(scan.at)} · 当前列表 ${scan.rows} 封`
      : '还没扫描过 · 打开 Gmail 网页版后会自动识别';
  const when = (e) => e.date || Date.parse(e.at);
  const events = (d.emailEvents || [])
    .filter((e) => e.state !== 'ignored')
    .sort((x, y) => when(y) - when(x))
    .slice(0, 60);
  const appOptions = [...state.apps]
    .sort((x, y) => (x.company || '').localeCompare(y.company || ''))
    .map((a) => `<option value="${a.id}">${esc(a.company)} - ${esc(a.title)}</option>`)
    .join('');
  $('emailList').innerHTML = events.length
    ? events.map((e) => evHtml(e, appOptions)).join('')
    : '<li class="ev-empty">识别到的 OA 邀请、面试邀请、拒信和 Offer 会显示在这里。</li>';
}

$('emailList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-ev]');
  if (!btn) return;
  const li = btn.closest('li[data-id]');
  const id = li.dataset.id;
  const act = btn.dataset.ev;
  if (act === 'view') return openDrawer(li.dataset.app, 'timeline');
  if (act === 'undo') await JT.email.undo(id);
  if (act === 'ignore') await JT.email.resolve(id, 'ignore');
  if (act === 'create') {
    const ev = await JT.email.resolve(id, 'create');
    await load();
    if (ev) openDrawer(ev.appId, 'info');
    return;
  }
  load();
});

$('emailList').addEventListener('change', async (e) => {
  if (e.target.dataset.ev !== 'link' || !e.target.value) return;
  await JT.email.resolve(e.target.closest('li[data-id]').dataset.id, e.target.value);
  load();
});

async function load() {
  state.apps = await S.all();
  renderTiles();
  renderChart();
  renderUpcoming();
  renderStatusTabs();
  renderFilters();
  renderRows();
  renderBackupWarn();
  renderEmails();
  $('welcome').classList.toggle('hidden', state.apps.length > 0 && location.hash !== '#welcome');
}

// ---------- drawer ----------

let saveTimer = null;
function scheduleSave() {
  $('saveState').textContent = '保存中…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}
async function flushSave() {
  if (!saveTimer || !current) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  await S.save(current);
  $('saveState').textContent = '已自动保存';
}

async function openDrawer(id, tab) {
  await flushSave();
  const app = await S.get(id);
  if (!app) return;
  current = app;
  state.openId = id;
  state.tab = tab || 'info';
  state.jdEdit = false;
  history.replaceState(null, '', '#id=' + id);
  $('drawer').classList.remove('hidden');
  $('scrim').classList.remove('hidden');
  $('saveState').textContent = '';
  renderDrawer();
  renderRows();
}

async function closeDrawer() {
  if (!current) return;
  await flushSave();
  if (!current.company && !current.title) await S.remove(current.id); // abandoned "手动添加"
  current = null;
  state.openId = null;
  $('drawer').classList.add('hidden');
  $('scrim').classList.add('hidden');
  history.replaceState(null, '', location.pathname);
  renderRows();
}

function renderDrawerHead() {
  const a = current;
  $('dCompany').textContent = a.company || '（未填写公司）';
  $('dTitle').textContent = a.title || '（未填写职位）';
  const meta = [
    a.source && esc(a.source),
    a.appliedDate && '投递于 ' + esc(a.appliedDate),
    a.location && esc(a.location),
    /^https?:/.test(a.url) && `<a href="${esc(a.url)}" target="_blank" rel="noopener">原职位链接 ↗</a>`,
  ].filter(Boolean);
  $('dMeta').innerHTML = meta.join('<span>·</span>');
  $('dStatus').innerHTML = opts(JT.STATUSES, a.status);
  $('dStar').textContent = a.starred ? '★' : '☆';
}

function renderDrawer() {
  renderDrawerHead();
  document.querySelectorAll('#dTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  const a = current;
  const body = { info: infoTab, interviews: interviewsTab, prep: prepTab, jd: jdTab, timeline: timelineTab }[state.tab](a);
  $('dBody').innerHTML = body;
  $('dBody').scrollTop = 0;
}

function infoTab(a) {
  const f = (name, label, cls = '', type = 'text') =>
    `<label class="${cls}">${label}<input type="${type}" data-f="${name}" value="${esc(a[name])}"></label>`;
  const sel = (name, label, items) => `<label>${label}<select data-f="${name}">${opts(items, a[name])}</select></label>`;
  return `<div class="fgrid">
    ${f('company', '公司')}${f('title', '职位', 'span2')}
    ${f('location', '地点')}${sel('jobType', '类型', JT.JOB_TYPES)}${f('term', '学期 / 届')}
    ${sel('workMode', '工作方式', JT.WORK_MODES)}${f('salary', '薪资')}${sel('sponsorship', '签证 Sponsor', JT.SPONSORSHIP)}
    ${f('appliedDate', '投递日期', '', 'date')}${f('postedDate', '发布日期', '', 'date')}${f('deadline', '截止日期', '', 'date')}
    ${f('source', '来源')}${f('jobId', 'Job ID / Req ID')}${f('resumeVersion', '简历版本')}
    ${f('url', '职位链接', 'span3', 'url')}
    ${f('referral', '内推人', 'span3')}
    <label class="span3">联系人（Recruiter / Hiring Manager / 校友：名字、邮箱、LinkedIn）<textarea data-f="contacts" rows="3">${esc(a.contacts)}</textarea></label>
    <label class="span3">备注<textarea data-f="notes" rows="4">${esc(a.notes)}</textarea></label>
  </div>
  ${a.sponsorshipNote ? `<div class="note section">JD 中与签证相关的原文：“${esc(a.sponsorshipNote)}”</div>` : ''}`;
}

function interviewsTab(a) {
  const rounds = a.interviews || [];
  const roundHtml = (r, i) => `<div class="round" data-i="${i}">
    <div class="fgrid">
      <label>轮次<select data-r="type">${JT.ROUND_TYPES.map((t) => `<option${t === r.type ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label>时间<input type="datetime-local" data-r="date" value="${esc(r.date)}"></label>
      <label>结果<select data-r="result">${opts(JT.ROUND_RESULTS, r.result)}</select></label>
      <label>面试官<input data-r="interviewer" value="${esc(r.interviewer)}"></label>
      <label class="span2">地点 / 会议链接<input data-r="where" value="${esc(r.where)}"></label>
      <label class="span3">记录（问了什么、答得怎样、复盘）<textarea data-r="notes" rows="4">${esc(r.notes)}</textarea></label>
    </div>
    <div class="round-actions">
      <button data-act="ics" data-i="${i}">添加到日历 (.ics)</button>
      <button class="danger" data-act="delRound" data-i="${i}">删除这一轮</button>
    </div>
  </div>`;
  return `<button class="primary" data-act="addRound">+ 添加一轮面试 / OA</button>
    <div class="section">${
      rounds.length
        ? rounds.map(roundHtml).join('')
        : '<p class="muted">还没有面试记录。收到 OA 或面试邀请后在这里添加，状态会自动更新，并显示在首页“即将到来的面试”。</p>'
    }</div>`;
}

function prepTab(a) {
  const company = a.company || '';
  const c = encodeURIComponent(company);
  const slug = company.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const g = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const links = [
    ['Glassdoor 面试经验', `https://www.glassdoor.com/Search/results.htm?keyword=${c}`],
    ['LeetCode 公司题', `https://leetcode.com/company/${slug}/`],
    ['一亩三分地 面经', g(`site:1point3acres.com ${company} ${a.jobType === 'intern' ? 'intern ' : ''}面经`)],
    ['Levels.fyi 薪资', `https://www.levels.fyi/companies/${slug}/salaries`],
    ['H1B 记录', `https://h1bdata.info/index.php?em=${c}`],
    ['Blind', `https://www.teamblind.com/search/${c}`],
    ['LinkedIn 找 Recruiter / 校友', `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company + ' recruiter')}`],
    ['搜索面试题', g(`${company} ${a.title} interview questions`)],
  ];
  const reqs = A.extractRequirements(a.description || '');
  const kws = A.extractKeywords(`${a.title}\n${a.description || ''}`);
  const sp = JT.label(JT.SPONSORSHIP, a.sponsorship);
  return `
    <div class="section"><h3>岗位要求摘要</h3>${
      reqs.length ? `<ul class="req">${reqs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p class="muted">JD 里没找到年限 / 学历 / 毕业时间相关的句子。</p>'
    }</div>
    <div class="section"><h3>JD 技能关键词</h3>${
      kws.length ? `<div class="chips">${kws.map((k) => `<span class="chip">${esc(k)}</span>`).join('')}</div>` : '<p class="muted">暂无（先保存 JD）。</p>'
    }</div>
    <div class="section"><h3>签证</h3><span class="pill">${esc(sp)}</span>${
      a.sponsorshipNote ? `<div class="note" style="margin-top:6px">“${esc(a.sponsorshipNote)}”</div>` : ''
    }</div>
    <div class="section"><h3>调研</h3><div class="links">${links
      .map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`)
      .join('')}</div></div>
    <div class="section"><h3>准备笔记</h3><textarea data-f="prepNotes" rows="10"
      placeholder="例如：Why this company / 对应 JD 的项目经历（STAR）/ 要复习的知识点 / 想问面试官的问题">${esc(a.prepNotes)}</textarea></div>
    <div class="section"><button data-act="copyPrompt">复制 AI 面试准备提示词</button>
      <span class="muted">　粘贴给 Claude 等 AI，让它根据 JD 出题、帮你准备</span></div>`;
}

function highlightJD(text) {
  const ranges = A.keywordRanges(text);
  let out = '';
  let pos = 0;
  for (const [s, e] of ranges) {
    out += esc(text.slice(pos, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>';
    pos = e;
  }
  return out + esc(text.slice(pos));
}

function jdTab(a) {
  if (state.jdEdit) {
    return `<div class="jd-tools"><button class="primary" data-act="jdSave">保存 JD</button><button data-act="jdCancel">取消</button></div>
      <textarea id="jdText" rows="28" placeholder="把职位描述粘贴到这里">${esc(a.description)}</textarea>`;
  }
  const d = a.description || '';
  return `<div class="jd-tools"><button data-act="jdEdit">编辑 / 粘贴 JD</button>${d ? '<button data-act="jdCopy">复制全文</button>' : ''}
      <span class="muted">${d.length.toLocaleString()} 字${d ? ' · 高亮为识别出的技能关键词' : ''}</span></div>
    ${d ? `<div class="jd-view">${highlightJD(d)}</div>` : '<p class="muted">还没有 JD。职位下线后原链接就看不到了，建议投递时保存一份。</p>'}`;
}

function timelineTab(a) {
  const items = [
    ...(a.timeline || []).map((t) => ({
      at: t.at,
      text: t.status ? `状态 → ${JT.label(JT.STATUSES, t.status)}${t.note ? ' · ' + t.note : ''}` : t.note,
    })),
    ...(a.interviews || [])
      .filter((r) => r.date && !isNaN(new Date(r.date)))
      .map((r) => ({
        at: new Date(r.date).toISOString(),
        text: `面试：${r.type}${r.result && r.result !== 'pending' ? `（${JT.label(JT.ROUND_RESULTS, r.result)}）` : ''}`,
      })),
  ].sort((x, y) => (x.at || '').localeCompare(y.at || ''));
  return `<ul class="tl">${items.map((i) => `<li><span class="at">${fmtAt(i.at)}</span><span>${esc(i.text)}</span></li>`).join('')}</ul>
    <div class="tl-add"><input id="tlNote" placeholder="添加一条记录，例如：收到 recruiter 邮件 / 发了 thank-you note"><button data-act="tlAdd">添加</button></div>`;
}

function copyPrompt(a) {
  const rounds = (a.interviews || [])
    .map((r) => `- ${r.date ? fmtWhen(r.date) : '时间待定'} ${r.type}${r.result !== 'pending' ? '（' + JT.label(JT.ROUND_RESULTS, r.result) + '）' : ''}${r.notes ? '：' + r.notes : ''}`)
    .join('\n');
  const text = `我正在准备 ${a.company} 的 ${a.title}（${JT.label(JT.JOB_TYPES, a.jobType)}${a.term ? '，' + a.term : ''}）面试。请根据下面的 JD 帮我：
1. 总结这个岗位最看重的 5 项能力 / 技能；
2. 预测可能的技术面试题和行为面试题（各 8 道），并给出答题要点；
3. 结合我的准备笔记，指出我还需要补强的地方；
4. 给我 5 个适合问面试官的问题。

【面试进度】
${rounds || '暂无'}

【我的准备笔记】
${a.prepNotes || '暂无'}

【JD】
${a.description || '（未保存 JD）'}`;
  return navigator.clipboard.writeText(text);
}

function downloadIcs(a, r) {
  if (!r.date) return alert('先填写面试时间');
  const start = new Date(r.date);
  const end = new Date(start.getTime() + 3600e3);
  const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const e = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//JobTracker//CN', 'BEGIN:VEVENT',
    `UID:${r.id}@job-tracker`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`,
    `SUMMARY:${e(`${r.type} - ${a.company}`)}`,
    `DESCRIPTION:${e([a.title, r.interviewer && 'Interviewer: ' + r.interviewer, r.where, a.url].filter(Boolean).join('\n'))}`,
    r.where ? `LOCATION:${e(r.where)}` : '',
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Interview', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  download(`${(a.company || 'interview').replace(/[^\w-]+/g, '_')}-${r.type.replace(/[^\w-]+/g, '_')}.ics`, lines.join('\r\n'), 'text/calendar');
}

// drawer events (delegated)
$('dBody').addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.f) {
    current[el.dataset.f] = el.value;
    if (['company', 'title', 'url', 'appliedDate', 'location', 'source'].includes(el.dataset.f)) renderDrawerHead();
    scheduleSave();
  } else if (el.dataset.r) {
    const i = +el.closest('.round').dataset.i;
    current.interviews[i][el.dataset.r] = el.value;
    if (el.dataset.r === 'type' && current.status === 'oa' && !/^OA/.test(el.value)) {
      S.applyStatus(current, 'interviewing');
      renderDrawerHead();
    }
    scheduleSave();
  }
});

$('dBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const a = current;
  const act = btn.dataset.act;
  if (act === 'addRound') {
    a.interviews = a.interviews || [];
    const type = a.interviews.length ? 'Technical Phone Screen' : 'OA / Coding Test';
    a.interviews.push({ id: S.newId(), type, date: '', result: 'pending', interviewer: '', where: '', notes: '' });
    const target = /^OA/.test(type) ? 'oa' : 'interviewing';
    if (['wishlist', 'applied', 'ghosted'].includes(a.status) || (a.status === 'oa' && target === 'interviewing')) S.applyStatus(a, target);
    renderDrawerHead();
    scheduleSave();
    renderDrawer();
    const rounds = $('dBody').querySelectorAll('.round');
    rounds[rounds.length - 1].scrollIntoView({ block: 'nearest' });
  } else if (act === 'delRound') {
    if (!confirm('删除这一轮面试记录？')) return;
    a.interviews.splice(+btn.dataset.i, 1);
    scheduleSave();
    renderDrawer();
  } else if (act === 'ics') {
    downloadIcs(a, a.interviews[+btn.dataset.i]);
  } else if (act === 'copyPrompt') {
    await copyPrompt(a);
    btn.textContent = '已复制 ✓';
    setTimeout(() => (btn.textContent = '复制 AI 面试准备提示词'), 1500);
  } else if (act === 'jdEdit') {
    state.jdEdit = true;
    renderDrawer();
  } else if (act === 'jdCancel') {
    state.jdEdit = false;
    renderDrawer();
  } else if (act === 'jdSave') {
    a.description = A.cleanText($('jdText').value);
    a.keywords = A.extractKeywords(`${a.title}\n${a.description}`);
    a.requirements = A.extractRequirements(a.description);
    if (a.sponsorship === 'unknown' || !a.sponsorshipNote) {
      const sp = A.detectSponsorship(a.description);
      if (a.sponsorship === 'unknown') a.sponsorship = sp.value;
      a.sponsorshipNote = sp.note;
    }
    state.jdEdit = false;
    scheduleSave();
    renderDrawer();
  } else if (act === 'jdCopy') {
    await navigator.clipboard.writeText(a.description || '');
    btn.textContent = '已复制 ✓';
  } else if (act === 'tlAdd') {
    const note = $('tlNote').value.trim();
    if (!note) return;
    a.timeline.push({ at: new Date().toISOString(), note });
    scheduleSave();
    renderDrawer();
  }
});

$('dBody').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'tlNote') $('dBody').querySelector('[data-act="tlAdd"]').click();
});

$('dTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  state.tab = b.dataset.tab;
  state.jdEdit = false;
  renderDrawer();
});

$('dStatus').addEventListener('change', (e) => {
  S.applyStatus(current, e.target.value);
  renderDrawerHead();
  if (state.tab === 'timeline' || state.tab === 'info') renderDrawer();
  scheduleSave();
});
$('dStar').onclick = () => {
  current.starred = !current.starred;
  renderDrawerHead();
  scheduleSave();
};
$('dClose').onclick = closeDrawer;
$('scrim').onclick = closeDrawer;
$('dDelete').onclick = async () => {
  if (!confirm(`删除 “${current.company} - ${current.title}” 这条记录？此操作不能撤销。`)) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  await S.remove(current.id);
  current.company = current.title = ''; // so closeDrawer doesn't re-save
  await closeDrawer();
  load();
};

// ---------- list events ----------

$('rows').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const act = e.target.closest('[data-act]');
  if (act && act.dataset.act === 'status') return;
  if (act && act.dataset.act === 'star') {
    const app = state.apps.find((a) => a.id === tr.dataset.id);
    app.starred = !app.starred;
    await S.save(app);
    if (current && current.id === app.id) {
      current.starred = app.starred;
      renderDrawerHead();
    }
    return load();
  }
  openDrawer(tr.dataset.id);
});

$('rows').addEventListener('change', async (e) => {
  if (e.target.dataset.act !== 'status') return;
  const id = e.target.closest('tr').dataset.id;
  if (current && current.id === id) {
    S.applyStatus(current, e.target.value);
    renderDrawer();
    scheduleSave();
    await flushSave();
  } else {
    await S.setStatus(id, e.target.value);
  }
  load();
});

$('upcoming').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (li) openDrawer(li.dataset.id, 'interviews');
});

$('statusTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-status]');
  if (!b) return;
  state.status = b.dataset.status;
  renderStatusTabs();
  renderRows();
});
$('q').addEventListener('input', (e) => {
  state.q = e.target.value;
  renderRows();
});
for (const [id, key] of [['fType', 'type'], ['fSource', 'source'], ['fSponsor', 'sponsor'], ['sort', 'sort']]) {
  $(id).addEventListener('change', (e) => {
    state[key] = e.target.value;
    renderRows();
  });
}

// ---------- top bar ----------

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportJson() {
  download(`job-tracker-backup-${S.today()}.json`, S.toJSON(await S.all()), 'application/json');
  await S.setSettings({ lastBackupAt: new Date().toISOString() });
  renderBackupWarn();
}

$('exportJson').onclick = exportJson;
$('exportCsv').onclick = async () => download(`job-applications-${S.today()}.csv`, S.toCSV(await S.all()), 'text/csv;charset=utf-8');
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const r = await S.importJSON(await file.text());
    alert(`导入完成：新增 ${r.added} 条，更新 ${r.updated} 条，跳过 ${r.skipped} 条`);
    load();
  } catch (err) {
    alert('导入失败：' + err.message);
  }
};

$('addBtn').onclick = async () => {
  const app = S.newApp({ status: 'applied' });
  await S.save(app);
  await load();
  await openDrawer(app.id, 'info');
  const input = $('dBody').querySelector('[data-f="company"]');
  if (input) input.focus();
};

async function openSettings(focusSync) {
  const s = await S.getSettings();
  $('sAuto').checked = s.autoDetect;
  $('sEmail').checked = s.emailDetect;
  $('sDefault').innerHTML = opts(JT.STATUSES.filter((x) => ['applied', 'wishlist'].includes(x.id)), s.defaultStatus);
  let usage = `共 ${state.apps.length} 条记录`;
  if (S.area.getBytesInUse) usage += `，占用 ${Math.round((await S.area.getBytesInUse(null)) / 1024)} KB`;
  $('sUsage').textContent = usage;
  await renderSync();
  $('settingsDlg').showModal();
  if (focusSync) ($('sySignIn').classList.contains('hidden') ? $('syNow') : $('sySignIn')).focus();
}

$('settingsBtn').onclick = () => openSettings(false);
$('syncChip').onclick = () => openSettings(true);
$('sAuto').onchange = (e) => S.setSettings({ autoDetect: e.target.checked });
$('sEmail').onchange = (e) => S.setSettings({ emailDetect: e.target.checked });
$('sDefault').onchange = (e) => S.setSettings({ defaultStatus: e.target.value });

// ---------- cloud sync ----------

const sendBg = (msg) =>
  globalThis.chrome && chrome.runtime && chrome.runtime.sendMessage
    ? chrome.runtime.sendMessage(msg)
    : Promise.resolve({ ok: false, error: '只能在插件里使用' });

function setSyncStatus(text, cls) {
  $('syStatus').textContent = text;
  $('syStatus').className = cls || 'muted';
}

async function renderSync() {
  const d = await S.area.get(['syncConfig', 'syncState']);
  const cfg = d.syncConfig || {};
  const st = d.syncState || {};
  let chipText = '☁ 登录同步';
  let cls = '';
  let status = '';
  if (cfg.enabled) {
    if (st.syncing) {
      chipText = '☁ 同步中…';
      status = '正在同步…';
    } else if (st.lastError) {
      chipText = st.needsLogin ? '⚠ 需要重新登录' : '⚠ 同步失败';
      cls = 'err';
      status = `同步失败（${ago(st.lastErrorAt)}）：${st.lastError}`;
    } else if (st.lastSyncAt) {
      chipText = `☁ 已同步 · ${ago(st.lastSyncAt)}`;
      cls = 'ok';
      status = `✓ ${ago(st.lastSyncAt)}同步 · 云端共 ${st.apps || 0} 条`;
    } else {
      chipText = '☁ 等待同步';
    }
  }
  $('syncChip').textContent = chipText;
  $('syncChip').className = 'sync-chip ' + cls;
  $('syIntro').classList.toggle('hidden', !!cfg.enabled);
  $('syAccount').classList.toggle('hidden', !cfg.enabled);
  $('syAccount').textContent = cfg.enabled ? `已登录：${cfg.email || 'Google 账号'}` : '';
  $('sySignIn').textContent = cfg.enabled ? '重新登录' : '用 Google 登录';
  $('sySignIn').classList.toggle('hidden', !!cfg.enabled && !st.needsLogin);
  $('syNow').classList.toggle('hidden', !cfg.enabled);
  $('syOff').classList.toggle('hidden', !cfg.enabled);
  setSyncStatus(status, cls);
}

async function syncAction(btn, msg, okText) {
  btn.disabled = true;
  setSyncStatus('正在同步…');
  const res = await sendBg(msg);
  btn.disabled = false;
  await renderSync();
  if (!res || !res.ok) setSyncStatus('✗ ' + ((res && res.error) || '失败'), 'err');
  else if (okText) setSyncStatus(okText(res), 'ok');
  return res;
}

const syncSummary = (r) =>
  `云端共 ${r.apps} 条${r.received ? `，收到 ${r.received} 条更新` : ''}${r.removed ? `，删除 ${r.removed} 条` : ''}${r.pushed ? '，已上传这台电脑的修改' : ''}`;

$('sySignIn').onclick = async () => {
  if (!(globalThis.chrome && chrome.identity)) return setSyncStatus('只能在插件里使用', 'err');
  const btn = $('sySignIn');
  btn.disabled = true;
  setSyncStatus('请在弹出的 Google 窗口里选择账号并允许…');
  let email;
  try {
    email = await JT.google.signIn(); // the popup must be opened from this click
  } catch (e) {
    btn.disabled = false;
    return setSyncStatus(/did not approve|closed|cancel/i.test(e.message) ? '已取消登录' : '✗ ' + e.message, 'err');
  }
  await syncAction(btn, { type: 'JT_SYNC_ENABLE', email }, (r) => `✓ 已登录 ${email}。${syncSummary(r)}。`);
};
$('syNow').onclick = () => syncAction($('syNow'), { type: 'JT_SYNC_NOW' }, (r) => `✓ 同步完成 · ${syncSummary(r)}`);
$('syOff').onclick = async () => {
  if (!confirm('退出这台电脑的 Google 登录？本地记录和云端数据都会保留，其他电脑不受影响。')) return;
  await syncAction($('syOff'), { type: 'JT_SYNC_DISABLE' }, () => '已退出。本地和云端数据都还在。');
};

$('sClear').onclick = async () => {
  const cfg = (await S.area.get('syncConfig')).syncConfig || {};
  if (!confirm(cfg.enabled ? '确定清空全部记录？已开启云同步：云端和其他电脑上的记录也会被清空。' : '确定清空全部记录？建议先“备份 JSON”。')) return;
  if (!confirm('再确认一次：清空后无法恢复。')) return;
  await S.removeMany(state.apps.map((a) => a.id));
  $('settingsDlg').close();
  await closeDrawer();
  load();
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && current && !$('settingsDlg').open) closeDrawer();
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderChart, 150);
});

// Reflect records saved by the popup / auto-detection while this page is open.
if (globalThis.chrome && chrome.storage && chrome.storage.onChanged) {
  let t = null;
  let full = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // Gmail heartbeat and sync status only need their status lines refreshed.
    full = full || Object.keys(changes).some((k) => !['gmailScan', 'syncState', 'syncConfig'].includes(k));
    clearTimeout(t);
    t = setTimeout(() => {
      if (full) load();
      else {
        renderEmails();
        renderSync();
      }
      full = false;
    }, 200);
  });
}

function routeFromHash() {
  if (location.hash === '#emails') return $('emailCard').scrollIntoView({ block: 'start' });
  const m = location.hash.match(/^#id=([\w-]+)(?:&tab=(\w+))?/); // e.g. #id=<id>&tab=interviews
  if (m && m[1] !== state.openId) openDrawer(m[1], m[2]);
}
window.addEventListener('hashchange', routeFromHash);

load().then(routeFromHash);
renderSync();
// Pull the latest from the cloud whenever the tracker is opened.
S.area.get('syncConfig').then((d) => d.syncConfig && d.syncConfig.enabled && sendBg({ type: 'JT_SYNC_NOW' }));
setInterval(() => renderSync(), 60000); // keep "N 分钟前" fresh

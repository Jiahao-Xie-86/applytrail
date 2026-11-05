// UI language (Chinese / English). UI text is written in Chinese in the code and
// wrapped in t(); EN maps that Chinese text to English. Keys starting with "@" hold
// the English HTML for elements marked data-i18n="<name>" (rich text blocks).
// `node scripts/check-i18n.js` verifies that every Chinese string has a translation.
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});
  const I = (JT.i18n = {});

  const pl = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

  const EN = {
    // ---------- statuses and field values ----------
    '想投': 'Wishlist',
    '已投递': 'Applied',
    '面试中': 'Interviewing',
    '被拒': 'Rejected',
    '已放弃': 'Withdrawn',
    '无回音': 'Ghosted',
    '实习': 'Internship',
    '全职': 'Full-time',
    '兼职': 'Part-time',
    '合同工': 'Contract',
    '其他': 'Other',
    '未知': 'Unknown',
    '未提及': 'Not mentioned',
    '可 Sponsor': 'Sponsors visa',
    '不 Sponsor': 'No sponsorship',
    '需公民/Clearance': 'Citizen / clearance only',
    '待定': 'Pending',
    '通过': 'Passed',
    '未通过': 'Did not pass',
    '公司官网': 'Company site',
    '邮件': 'Email',
    '投递确认': 'Application received',
    'OA 邀请': 'OA invite',
    '面试邀请': 'Interview invite',
    '拒信': 'Rejection',
    '周日': 'Sun',
    '周一': 'Mon',
    '周二': 'Tue',
    '周三': 'Wed',
    '周四': 'Thu',
    '周五': 'Fri',
    '周六': 'Sat',
    '中文': '中文',

    // ---------- common ----------
    '公司': 'Company',
    '职位': 'Title',
    '地点': 'Location',
    '状态': 'Status',
    '类型': 'Type',
    '来源': 'Source',
    '学期 / 届': 'Term / class',
    '工作方式': 'Work mode',
    '投递日期': 'Applied date',
    '签证 Sponsor': 'Visa sponsorship',
    '薪资': 'Salary',
    '简历版本': 'Resume version',
    '备注': 'Notes',
    '保存': 'Save',
    '查看': 'View',
    '撤销': 'Undo',
    '编辑': 'Edit',
    '关闭': 'Close',
    '添加': 'Add',
    '取消': 'Cancel',
    '全部': 'All',
    '设置': 'Settings',
    '完成': 'Done',
    '失败': 'Failed',
    '暂无': 'None yet',
    '投递于 {date}': 'Applied {date}',
    '已复制 ✓': 'Copied ✓',
    '{n} 条': (v) => pl(v.n, 'record', 'records'),

    // ---------- relative time ----------
    '刚刚': 'just now',
    '{n} 分钟前': '{n} min ago',
    '{n} 小时前': (v) => `${v.n} hr ago`,
    '{n} 天前': (v) => `${pl(v.n, 'day', 'days')} ago`,

    // ---------- page toast (background → content script) ----------
    '未识别到职位名': 'Job title not detected',
    '✓ 已在追踪中（{status}）': '✓ Already tracked ({status})',
    '✓ 已自动记录投递': '✓ Application recorded',
    '✓ 已记录投递，但信息不全': '✓ Application recorded, some details missing',
    '补充信息': 'Add details',
    '{company}：{from} → {to}': '{company}: {from} → {to}',
    '待确认 · {type}：{who}': 'Needs review · {type}: {who}',
    '📧 根据邮件更新了 {n} 个投递': (v) => `📧 Updated ${pl(v.n, 'application', 'applications')} from email`,
    '📧 有 {n} 封求职邮件待确认': (v) => `📧 ${pl(v.n, 'recruiting email needs', 'recruiting emails need')} review`,
    '…另外 {n} 条': '…and {n} more',
    '📧 {type}：{subject}': '📧 {type}: {subject}',
    '由邮件创建：{subject}': 'Created from email: {subject}',

    // ---------- errors from storage / Google / sync ----------
    '文件格式不对：找不到 apps 数组': 'Wrong file format: no "apps" list found',
    'Google 登录已过期，请点 “用 Google 登录” 重新登录': 'Your Google sign-in expired. Click "Sign in with Google" to sign in again',
    '还没有配置 Google 登录（lib/google.js 里的 CLIENT_ID 为空）': 'Google sign-in is not configured (CLIENT_ID in lib/google.js is empty)',
    'Google 登录失败：{error}': 'Google sign-in failed: {error}',
    '登录时需要勾选 “查看、创建和删除它自己在 Google 云端硬盘中的配置数据”，否则无法同步。请重新登录并勾选':
      'When signing in, tick "See, create, and delete its own configuration data in your Google Drive", otherwise sync cannot work. Please sign in again and tick it',
    'Google Drive 空间已满，无法同步': 'Your Google Drive is full, so sync cannot save',
    'Google 请求太频繁，稍后自动重试': 'Too many requests to Google; will retry automatically',
    '登录时没有给 Google Drive 权限，请重新登录并勾选': 'Google Drive access was not granted. Please sign in again and tick the Drive permission',
    'Google Drive 返回 {status}': 'Google Drive returned {status}',
    'Google Drive 返回 {status}：{msg}': 'Google Drive returned {status}: {msg}',
    '数据超过 Google Drive 单次上传上限（5 MB 压缩后）': "Data exceeds Google Drive's single-upload limit (5 MB compressed)",
    '网络连接失败，稍后自动重试': 'Network error; will retry automatically',

    // ---------- popup ----------
    '打开追踪表 ↗': 'Open tracker ↗',
    '内推 / 联系人': 'Referral / contact',
    '链接': 'Link',
    '用页面上选中的文字作为 JD': 'Use the text selected on the page as the JD',
    '如 SWE-v3': 'e.g. SWE-v3',
    '谁内推的、HR 名字等': 'Who referred you, recruiter name, etc.',
    '没抓到的话：在网页上选中 JD 文字再打开插件，或直接粘贴到这里':
      'Nothing captured? Select the JD text on the page and open the extension again, or paste it here',
    '@jdSummary': 'Job description (<span id="jdLen">0</span> chars)',
    '⚠ {label}：“{note}”': '⚠ {label}: "{note}"',
    '已投 {a} · 近 7 天 {w} · 进行中 {p}': 'Applied {a} · Last 7 days {w} · Active {p}',
    '无法自动读取这个页面，可以手动填写（或先刷新页面再试）。': "Couldn't read this page automatically. Fill in the form yourself (or refresh the page and try again).",
    '没抓到 JD：可以在网页上选中职位描述文字，再点开插件。': 'No JD captured: select the job description on the page, then open the extension again.',
    '已记录': 'Tracked',
    '在追踪表中打开': 'Open in tracker',
    '更新': 'Update',
    '已保存 ✓': 'Saved ✓',
    '保存失败：{error}': 'Save failed: {error}',

    // ---------- tracker: header and overview ----------
    '求职投递追踪': 'Job Application Tracker',
    '切换语言': 'Switch language',
    '云同步设置': 'Cloud sync settings',
    '☁ 开启云同步': '☁ Cloud sync',
    '+ 手动添加': '+ Add manually',
    '用 Excel / Google Sheets 打开': 'Open in Excel / Google Sheets',
    '导出 CSV': 'Export CSV',
    '完整备份，可再导入': 'Full backup you can import later',
    '备份 JSON': 'Back up JSON',
    '导入备份': 'Import backup',
    '开始使用': 'Getting started',
    '@welcome1':
      '<b>Automatic</b>: after you apply on Greenhouse, Lever, Workday, Ashby, LinkedIn Easy Apply, Indeed and similar sites, the "Thank you for applying" page is detected and the application is recorded. A notice appears in the bottom-right corner (you can undo).',
    '@welcome2':
      '<b>One click</b>: on any job page, click the extension icon in the toolbar (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>). Company, title, location and JD are filled in for you to confirm and save. If the JD is missed, select the JD text on the page first, then click the icon.',
    '@welcome3':
      '<b>Email</b>: in Gmail on the web, OA invites, interview invites, rejections and offers are recognized and the matching application is updated (you can undo).',
    '@welcome4':
      '<b>Interview prep</b>: open any record here to log each interview round, see JD keywords and visa notes, and open interview-report and salary links in one click.',
    '@welcomeSync':
      'Click <b>☁ Sign in to sync</b> at the top right to sign in with Google. Sign in with the same account on another computer and all your records are there.',
    '每周投递数': 'Applications per week',
    '· 近 12 周': '· last 12 weeks',
    '每周投递数柱状图': 'Bar chart of applications per week',
    '即将到来的面试': 'Upcoming interviews',
    '📧 邮件动态': '📧 Email activity',
    '近 7 天投递': 'Applied in last 7 days',
    '等待回复': 'Awaiting reply',
    'OA / 面试中': 'OA / Interviewing',
    '进入 OA / 面试比例': 'Reached OA / interview',
    '本周': 'This week',
    '{from} – {to}：投递 {n} 份': (v) => `${v.from} – ${v.to}: ${pl(v.n, 'application', 'applications')}`,
    '暂无。打开一条记录 → 面试记录 → 添加一轮，就会出现在这里。': 'Nothing yet. Open a record → Interviews → add a round, and it shows up here.',
    '还没有备份过': 'You have never backed up',
    '上次备份是 {n} 天前': (v) => `Last backup was ${pl(v.n, 'day', 'days')} ago`,
    '。数据只存在这个浏览器里，卸载插件或清除浏览器数据会丢失。':
      '. Your data lives only in this browser and is lost if you uninstall the extension or clear browser data. Sign in to cloud sync, or back up.',
    '立即备份': 'Back up now',

    // ---------- tracker: list ----------
    '进行中': 'Active',
    '全部类型': 'All types',
    '全部来源': 'All sources',
    '签证：全部': 'Visa: all',
    '搜索公司 / 职位 / 地点 / JD / 备注': 'Search company / title / location / JD / notes',
    '按投递日期': 'Sort: applied date',
    '按最近更新': 'Sort: last updated',
    '按公司 A→Z': 'Sort: company A→Z',
    '下一步': 'Next step',
    '没有符合条件的记录': 'No matching records',
    '标星': 'Star',
    '{n} 天无回音': (v) => `No reply in ${pl(v.n, 'day', 'days')}`,
    '截止 {date}': 'Due {date}',

    // ---------- tracker: email activity ----------
    '（未知公司）': '(unknown company)',
    '已从邮件创建记录（{status}）': 'record created from email ({status})',
    '已记到时间线（状态不变）': 'added to timeline (status unchanged)',
    '{who} · 已撤销': '{who} · undone',
    '匹配到多个投递，请选择是哪一个': 'Matches several applications. Which one is it?',
    '可能是还没记录的投递': 'Possibly an application you have not tracked',
    '可能是还没记录的投递：{guess}': 'Possibly an application you have not tracked: {guess}',
    '没找到对应的投递': 'No matching application',
    '没找到对应的投递（{guess}）': 'No matching application ({guess})',
    '创建记录': 'Create record',
    '关联到…': 'Link to…',
    '可能是': 'Likely',
    '忽略': 'Ignore',
    '已关闭（可在设置中开启）': 'Off (turn it on in Settings)',
    'Gmail 上次扫描 {ago} · 当前列表 {n} 封': (v) => `Gmail last scanned ${v.ago} · ${pl(v.n, 'email', 'emails')} in view`,
    '还没扫描过 · 打开 Gmail 网页版后会自动识别': 'Not scanned yet · open Gmail on the web and it runs automatically',
    '识别到的 OA 邀请、面试邀请、拒信和 Offer 会显示在这里。': 'OA invites, interview invites, rejections and offers found in your email show up here.',

    // ---------- tracker: drawer ----------
    '职位详情': 'Job details',
    '关闭 (Esc)': 'Close (Esc)',
    '信息': 'Info',
    '面试记录': 'Interviews',
    '面试准备': 'Prep',
    '时间线': 'Timeline',
    '删除这条记录': 'Delete this record',
    '保存中…': 'Saving…',
    '已自动保存': 'Saved',
    '（未填写公司）': '(no company)',
    '（未填写职位）': '(no title)',
    '原职位链接 ↗': 'Original posting ↗',
    '发布日期': 'Posted date',
    '截止日期': 'Deadline',
    '职位链接': 'Job URL',
    '内推人': 'Referrer',
    '联系人（Recruiter / Hiring Manager / 校友：名字、邮箱、LinkedIn）': 'Contacts (recruiter / hiring manager / alumni: name, email, LinkedIn)',
    'JD 中与签证相关的原文：“{note}”': 'Visa-related text in the JD: "{note}"',
    '轮次': 'Round',
    '时间': 'Time',
    '结果': 'Result',
    '面试官': 'Interviewer',
    '地点 / 会议链接': 'Location / meeting link',
    '记录（问了什么、答得怎样、复盘）': 'Notes (questions asked, how it went, takeaways)',
    '添加到日历 (.ics)': 'Add to calendar (.ics)',
    '删除这一轮': 'Delete this round',
    '+ 添加一轮面试 / OA': '+ Add interview round / OA',
    '还没有面试记录。收到 OA 或面试邀请后在这里添加，状态会自动更新，并显示在首页“即将到来的面试”。':
      'No interviews yet. Add one here when you get an OA or interview invite: the status updates automatically and it appears under "Upcoming interviews".',
    'Glassdoor 面试经验': 'Glassdoor interviews',
    'LeetCode 公司题': 'LeetCode company questions',
    '一亩三分地 面经': '1Point3Acres interview posts',
    'Levels.fyi 薪资': 'Levels.fyi salaries',
    'H1B 记录': 'H-1B records',
    'LinkedIn 找 Recruiter / 校友': 'LinkedIn: find recruiters / alumni',
    '搜索面试题': 'Search interview questions',
    '岗位要求摘要': 'Requirements summary',
    'JD 里没找到年限 / 学历 / 毕业时间相关的句子。': 'No sentences about years of experience, degree or graduation date were found in the JD.',
    'JD 技能关键词': 'Skill keywords in the JD',
    '暂无（先保存 JD）。': 'None yet (save the JD first).',
    '签证': 'Visa',
    '调研': 'Research',
    '准备笔记': 'Prep notes',
    '例如：Why this company / 对应 JD 的项目经历（STAR）/ 要复习的知识点 / 想问面试官的问题':
      'e.g. Why this company / projects that match the JD (STAR) / topics to review / questions for the interviewer',
    '复制 AI 面试准备提示词': 'Copy AI interview-prep prompt',
    '粘贴给 Claude 等 AI，让它根据 JD 出题、帮你准备': 'Paste it into an AI assistant such as Claude for practice questions based on the JD',
    '保存 JD': 'Save JD',
    '把职位描述粘贴到这里': 'Paste the job description here',
    '编辑 / 粘贴 JD': 'Edit / paste JD',
    '复制全文': 'Copy all',
    '{n} 字': (v) => pl(v.n, 'char', 'chars'),
    '高亮为识别出的技能关键词': 'highlighted: detected skill keywords',
    '还没有 JD。职位下线后原链接就看不到了，建议投递时保存一份。': 'No JD yet. Postings disappear once they close, so save a copy when you apply.',
    '状态 → {status}': 'Status → {status}',
    '面试：{type}': 'Interview: {type}',
    '（{result}）': ' ({result})',
    '：{notes}': ': {notes}',
    '添加一条记录，例如：收到 recruiter 邮件 / 发了 thank-you note': 'Add a note, e.g. recruiter emailed / sent thank-you note',
    '时间待定': 'Time TBD',
    '（未保存 JD）': '(JD not saved)',
    '先填写面试时间': 'Fill in the interview time first',
    '删除这一轮面试记录？': 'Delete this interview round?',
    '删除 “{name}” 这条记录？此操作不能撤销。': 'Delete "{name}"? This cannot be undone.',

    // ---------- tracker: import / settings / sync ----------
    '导入完成：新增 {added} 条，更新 {updated} 条，跳过 {skipped} 条': 'Import finished: {added} added, {updated} updated, {skipped} skipped',
    '导入失败：{error}': 'Import failed: {error}',
    '检测到 “投递成功” 页面时自动记录': 'Record automatically when an "application submitted" page is detected',
    '识别 Gmail 里的求职邮件（OA / 面试 / 拒信 / Offer）并更新状态': 'Read recruiting emails in Gmail (OA / interview / rejection / offer) and update statuses',
    '插件弹窗里的默认状态': 'Default status in the popup',
    '语言 / Language': 'Language / 语言',
    '跟随浏览器': 'Same as browser',
    '☁ 云同步': '☁ Cloud sync',
    '@syncIntro':
      'Sign in with Google and every computer signed in to the same account syncs automatically. Data is stored in a hidden app folder in your own Google Drive that only this extension can read; it does not appear in your Drive file list.',
    '用 Google 登录': 'Sign in with Google',
    '立即同步': 'Sync now',
    '退出登录': 'Sign out',
    '@shortcut':
      'Shortcut: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd> opens the popup (change it at chrome://extensions/shortcuts).',
    '清空全部数据': 'Delete all data',
    '共 {n} 条记录': (v) => pl(v.n, 'record', 'records'),
    '，占用 {kb} KB': ', {kb} KB used',
    '只能在插件里使用': 'Only works inside the extension',
    '☁ 登录同步': '☁ Sign in to sync',
    '☁ 同步中…': '☁ Syncing…',
    '正在同步…': 'Syncing…',
    '⚠ 需要重新登录': '⚠ Sign in again',
    '⚠ 同步失败': '⚠ Sync failed',
    '同步失败（{ago}）：{error}': 'Sync failed ({ago}): {error}',
    '☁ 已同步 · {ago}': '☁ Synced · {ago}',
    '✓ {ago}同步 · 云端共 {n} 条': (v) => `✓ Synced ${v.ago} · ${pl(v.n, 'record', 'records')} in the cloud`,
    '☁ 等待同步': '☁ Waiting to sync',
    '已登录：{email}': 'Signed in: {email}',
    'Google 账号': 'Google account',
    '重新登录': 'Sign in again',
    '云端共 {n} 条': (v) => `${pl(v.n, 'record', 'records')} in the cloud`,
    '，收到 {n} 条更新': (v) => `, ${pl(v.n, 'update', 'updates')} received`,
    '，删除 {n} 条': ', {n} deleted',
    '，已上传这台电脑的修改': ', changes from this computer uploaded',
    '请在弹出的 Google 窗口里选择账号并允许…': 'Choose your account in the Google window and allow access…',
    '已取消登录': 'Sign-in cancelled',
    '✓ 已登录 {email}。{summary}。': '✓ Signed in as {email}. {summary}.',
    '✓ 同步完成 · {summary}': '✓ Sync complete · {summary}',
    '退出这台电脑的 Google 登录？本地记录和云端数据都会保留，其他电脑不受影响。':
      'Sign out of Google on this computer? Your local records and cloud data are kept, and other computers are not affected.',
    '已退出。本地和云端数据都还在。': 'Signed out. Your local and cloud data are still there.',
    '确定清空全部记录？已开启云同步：云端和其他电脑上的记录也会被清空。':
      'Delete all records? Cloud sync is on, so records in the cloud and on your other computers are deleted too.',
    '确定清空全部记录？建议先“备份 JSON”。': 'Delete all records? Consider "Back up JSON" first.',
    '再确认一次：清空后无法恢复。': 'Are you sure? Deleted records cannot be recovered.',
  };
  I.EN = EN;
  I.lang = 'zh';
  I.pref = 'auto';

  I.uiLang = function () {
    try {
      const l = chrome.i18n.getUILanguage();
      if (l) return l;
    } catch {}
    return (globalThis.navigator && navigator.language) || 'en';
  };

  // pref: 'auto' | 'zh' | 'en' (settings.lang)
  I.resolve = (pref) => (pref === 'zh' || pref === 'en' ? pref : /^zh/i.test(I.uiLang()) ? 'zh' : 'en');

  I.setLang = function (pref) {
    I.pref = pref || 'auto';
    I.lang = I.resolve(I.pref);
    if (globalThis.document && document.documentElement) document.documentElement.lang = I.lang === 'zh' ? 'zh-CN' : 'en';
    return I.lang;
  };

  I.t = function (key, vars) {
    const s = I.lang === 'en' && EN[key] != null ? EN[key] : key;
    if (typeof s === 'function') return s(vars || {});
    return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
  };

  I.init = async function () {
    let pref = 'auto';
    try {
      pref = ((await JT.store.area.get('settings')).settings || {}).lang || 'auto';
    } catch {}
    return I.setLang(pref);
  };

  // Translate static markup in place: [data-i18n] blocks, text nodes, and
  // title / placeholder / aria-label / label attributes whose text is a key.
  I.apply = function (root) {
    if (I.lang !== 'en') return;
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const html = EN['@' + el.dataset.i18n];
      if (html) el.innerHTML = html;
    });
    const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const k = n.nodeValue.trim();
      if (k && typeof EN[k] === 'string') n.nodeValue = n.nodeValue.replace(k, () => EN[k]);
    }
    for (const attr of ['title', 'placeholder', 'aria-label', 'label']) {
      root.querySelectorAll(`[${attr}]`).forEach((el) => {
        const k = el.getAttribute(attr);
        if (typeof EN[k] === 'string') el.setAttribute(attr, EN[k]);
      });
    }
  };
})();

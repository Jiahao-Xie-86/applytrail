# Job Tracker 求职投递追踪

一个 Chrome / Edge 浏览器扩展，用来记录美国求职（实习 + 全职）的每一次投递：公司、职位、地点、JD 全文、薪资、签证 sponsor 情况、面试轮次和准备笔记；还能识别 Gmail 里的 OA / 面试邀请 / 拒信并自动更新状态，并可以用 Google 账号在多台电脑之间同步。没有开发者服务器：数据只存在你的浏览器和你自己的 Google Drive 里。

## 安装

### 从 Chrome 应用商店（上架后）

打开商店链接 → **添加至 Chrome** → 追踪表右上角点 **☁ 登录同步** → 选 Google 账号 → 允许。换任何电脑都是这两步，插件更新会自动推送。

### 上架之前：手动加载

1. 拿到插件文件：这台电脑上就是 `E:\career\job-tracker`；其他电脑用 `dist/job-tracker-<版本>.zip`（`node scripts/pack.js` 生成）解压后的文件夹，或者直接拷整个文件夹
2. 打开 `chrome://extensions`（Edge 用 `edge://extensions`），打开右上角 **开发者模式**
3. 点 **加载已解压的扩展程序**，选择插件文件夹
4. 点浏览器右上角的拼图图标，把 “Job Tracker 求职投递追踪” **固定** 到工具栏
5. 追踪表右上角 **☁ 登录同步**，登录同一个 Google 账号，记录就会同步过来

安装后会自动打开追踪表页面。修改代码后，在 `chrome://extensions` 里点这个扩展的 🔄 刷新即可。

> 安装前已经打开的网页，需要刷新一次后自动检测才会生效（手动点图标记录不受影响）。

> **从旧版本升级时**：这一版给插件固定了 ID（`pbdigaoohikokfaehfdfajdgdlgejmbp`，每台电脑都一样，Google 登录需要）。Chrome 会把它当成一个新插件，旧版本里的记录不会自动带过来：升级前先在旧版追踪表点 **备份 JSON**，升级后点 **导入备份**。之后登录 Google，就不用再手动搬数据了。

## 三种记录方式

| 方式 | 怎么用 |
|---|---|
| **自动记录** | 在 Greenhouse / Lever / Workday / Ashby / LinkedIn Easy Apply / Indeed 等网站点完 Submit，页面出现 “Thank you for applying / Your application has been submitted” 时自动保存为 “已投递”，右下角弹出提示，可以 **撤销** 或 **编辑**。 |
| **一键记录** | 在任何职位页面点工具栏图标（或按 `Alt+Shift+J`），自动抓取信息，确认后保存。也可以先存为 “想投”。 |
| **手动添加** | 追踪表页面右上角 “+ 手动添加”。 |

抓不到 JD 时：在网页上 **选中 JD 文字**，再点图标，会自动用选中的文字作为 JD。

自动记录时，如果确认页本身没有 JD（大多数都没有），会用你在 **同一个标签页**（或打开这个申请页的 LinkedIn 标签页）里最近看过的职位信息补全。

## 邮件识别（Gmail）

用 **Gmail 网页版**（mail.google.com）时，插件会读取收件箱列表里的发件人 / 标题 / 摘要，以及你打开的那封邮件的正文，识别求职邮件并自动更新对应投递：

| 识别为 | 例子 | 状态变化 |
|---|---|---|
| OA 邀请 | HackerRank / CodeSignal / “online assessment” | → OA |
| 面试邀请 | “schedule a phone interview”、Calendly 链接、Superday | → 面试中 |
| 拒信 | “Unfortunately… move forward with other candidates” | → 被拒 |
| Offer | “pleased to extend an offer” | → Offer |
| 投递确认 | “Thank you for applying”、LinkedIn “application was sent” | 想投 → 已投递 |

- 更新后 Gmail 右下角会提示，可以 **撤销**；追踪表里的 **📧 邮件动态** 会列出每一条识别结果（点标题可回到那封邮件），对应投递的时间线也会记一笔
- 怎么匹配到投递：看发件人域名（如 `@nvidia.com`）、发件人名字（如 “Stripe Recruiting”，适用于 Greenhouse 等代发邮件）和邮件里出现的公司名。同一公司投了多个职位时，会用邮件里的职位名区分；分不清就放到 “邮件动态” 里让你选
- 没匹配到的投递确认邮件会显示 “可能是还没记录的投递”，一键 **创建记录**，可以用来补录装插件之前的投递（只看最近 60 天的邮件）
- 不会倒退状态：已经在面试中的投递，再收到 OA 邮件不会改回 OA；比投递日期还早的邮件会被忽略
- 列表里只看得到摘要，有些拒信要 **打开那封邮件** 后才能识别
- 只处理含求职关键词的邮件；邮件正文不会保存，只记录标题、发件人和识别结果
- 可在追踪表 “设置” 里关闭

> 页面结构已在真实的 Gmail 收件箱（2026-11，英文界面）上核对过：列表里的发件人、标题、摘要、日期、会话 ID，以及打开邮件后的正文、发件人、日期都能读到。以后如果 Gmail 改版：追踪表 “邮件动态” 右上角会显示 “Gmail 上次扫描 X 分钟前 · 当前列表 N 封”，Gmail 开着却显示 0 封或一直没扫描，就说明需要更新。只支持 Gmail 网页版，Outlook / 手机 App 里的邮件不会被识别。

## 追踪表（点弹窗里的 “打开追踪表”）

- **概览**：已投递数、近 7 天投递、等待回复、OA/面试中、Offer、进入面试比例；每周投递柱状图；即将到来的面试
- **列表**：按状态分栏、搜索（公司 / 职位 / JD / 备注全文）、按类型 / 来源 / 签证筛选；投递 21 天没进展会提示 “N 天无回音”
- **详情**（点任意一行）
  - 信息：所有字段可编辑，自动保存
  - 面试记录：每一轮的类型、时间、面试官、会议链接、复盘笔记、结果；可导出 `.ics` 加到日历（提前 30 分钟提醒）。添加面试会自动把状态改成 OA / 面试中
  - 面试准备：JD 里的年限 / 学历 / 毕业时间要求、技能关键词、签证原文，一键打开 Glassdoor、LeetCode 公司题、一亩三分地面经、Levels.fyi、H1B 记录、Blind、LinkedIn 找 recruiter；准备笔记；“复制 AI 面试准备提示词”（含 JD 和你的笔记，可直接粘贴给 Claude）
  - JD：保存的 JD 全文（职位下线后也能看），技能关键词高亮
  - 时间线：状态变化、面试、自己加的记录（如 “发了 follow-up”）

## 自动识别的字段

公司、职位、地点、JD、来源网站、Job ID、发布日期、薪资范围、实习/全职/Co-op、学期（如 Summer 2027）、Remote/Hybrid/On-site、**签证 sponsor**（识别 “unable to sponsor”、“without sponsorship”、“U.S. citizen / security clearance” 等说法，并保存原句）、技能关键词。

## 支持的网站

| 网站 | 状态 |
|---|---|
| Greenhouse、Lever、Ashby、Workday、Amazon Jobs | 已在真实职位页面上测试抓取 |
| Indeed | 按 2026 新版页面结构适配（旧版规则保留为备用） |
| LinkedIn（登录后的 job 页 / 搜索页右侧详情）、Glassdoor、Handshake、SmartRecruiters | 有专门规则，未在真实页面验证（这些网站需要登录） |
| 其他公司官网 / ATS（iCIMS、Jobvite、Workable、Oracle、SuccessFactors…） | 通用规则：schema.org JobPosting 数据 + 标题 + “Qualifications / Responsibilities” 等段落识别 |

网站改版后抓取可能失效，弹窗里所有字段都可以手动修改。

## 云同步（Google 账号）

追踪表右上角点 **☁ 登录同步** → 用 Google 登录。所有登录同一个 Google 账号的电脑会自动同步，Chrome 和 Edge 都可以。

- 数据存在 **你自己 Google Drive 的隐藏应用文件夹** 里（gzip 压缩的一个文件）：在 Drive 网页里看不到、不占普通文件列表，只有这个插件能读写。没有开发者服务器
- 修改后约 10 秒自动上传；每 5 分钟、打开浏览器、打开追踪表时自动拉取；也可以在设置里点 **立即同步**
- 右上角的 ☁ 显示状态：已同步 · N 分钟前 / 同步中 / ⚠ 同步失败 / ⚠ 需要重新登录（点开看原因）
- **合并规则**：每条记录各自比较，修改时间较新的那一边为准；两台电脑改了不同的记录，两边的修改都会保留。第一次在新电脑登录时，两边已有的记录会合并，不会互相覆盖
- **删除** 会同步到所有电脑（不会被另一台电脑“复活”）；“清空全部数据” 也会清空云端
- Gmail 里已经在一台电脑上识别过的邮件，另一台不会重复处理
- 登录状态跟着浏览器里的 Google 登录走：浏览器里退出了 Google，插件会提示 “需要重新登录”，点一下即可
- **退出登录** 只影响这台电脑；要彻底撤销插件对 Drive 的访问，去 <https://myaccount.google.com/permissions>
- 登录时如果 Google 显示权限勾选框，要勾上 Google Drive 那一项，否则无法同步

## 数据与备份

- 数据存在本机浏览器；登录 Google 后，你的 Google Drive 里也有一份
- 没登录同步时，**卸载扩展会删除数据**。追踪表右上角 **备份 JSON**（完整备份，可用 “导入备份” 恢复）、**导出 CSV**（用 Excel / Google Sheets 打开）
- 没开同步、记录超过 5 条且 14 天没备份时，追踪表顶部会提醒
- 设置里可以关闭自动记录和邮件识别

## 一次性配置（只做一次，之后任何电脑都不用再配）

### 1. Google 登录（约 10 分钟）

插件要用 Google 登录，需要在 Google Cloud 注册一个 “登录应用”，拿到一个 Client ID。用 **个人 Gmail** 做，学校账号可能被管理员限制。

1. 打开 <https://console.cloud.google.com/projectcreate>，项目名填 `Job Tracker` → **Create**
2. 打开 <https://console.cloud.google.com/apis/library/drive.googleapis.com>（确认左上角选的是刚建的项目）→ **Enable**
3. 打开 <https://console.cloud.google.com/auth/overview> → **Get started**：
   - App name：`Job Tracker`；User support email：你的 Gmail
   - Audience：**External**
   - Contact information：你的 Gmail → 同意条款 → **Create**
4. 左侧 **Data Access** → **Add or remove scopes** → 在筛选框搜 `drive.appdata`，勾选 `.../auth/drive.appdata` → **Update** → **Save**
5. 左侧 **Audience** → Publishing status 下点 **Publish app** → Confirm（变成 In production。这个权限属于 Google 的 “非敏感” 级别，不需要审核；不发布的话每 7 天要重新登录一次）
6. 左侧 **Clients** → **Create client**：
   - Application type：**Web application**；Name：`Job Tracker extension`
   - Authorized redirect URIs → **Add URI**：`https://pbdigaoohikokfaehfdfajdgdlgejmbp.chromiumapp.org/`
   - **Create** → 复制 **Client ID**（形如 `1234…apps.googleusercontent.com`，不是密码，可以公开）
7. 把 Client ID 填进 `lib/google.js` 的 `G.CLIENT_ID = '';`（或者发给我），然后在 `chrome://extensions` 点 🔄

### 2. 上架 Chrome 应用商店（不公开链接）

1. 打开 <https://chrome.google.com/webstore/devconsole>，用 Google 账号注册开发者（一次性 $5）
2. 运行 `node scripts/pack.js`，生成 `dist/job-tracker-<版本>.zip`
3. **New item** → 上传这个 zip
4. 上传后 Package 页会显示商店版本的 **Item ID**（和上面的开发版 ID 不同）。回到 Google Cloud 的 Clients → 刚建的 client → Authorized redirect URIs 再加一条：`https://<商店 Item ID>.chromiumapp.org/` → Save
5. 按 `store/listing.md` 填写商店信息、隐私、发布设置（截图用 `store/screenshot-1.png`、`store/screenshot-2.png`；隐私政策用 `store/privacy-policy.md` 发布成公开网页后的链接）
6. Visibility 选 **Unlisted** → **Submit for review**。审核通过后得到商店链接，换电脑时打开链接安装即可

以后更新插件：改 `manifest.json` 里的 `version`（比如 1.0.1）→ `node scripts/pack.js` → 在开发者后台上传新 zip → 提交审核，各电脑会自动更新。

## 文件结构

```
manifest.json           扩展配置（Manifest V3）
background.js           后台：自动记录、去重、撤销、工具栏 ✓ 角标
content/extractors.js   从网页抓取职位信息（各网站规则 + JSON-LD + 通用规则）
content/content.js      检测 “投递成功” 页面、页面右下角提示
content/gmail.js        读取 Gmail 收件箱 / 打开的邮件，交给后台识别
lib/email.js            求职邮件分类（OA / 面试 / 拒信 / Offer / 确认）、匹配投递、撤销
lib/analyze.js          JD 分析：类型 / 学期 / 签证 / 薪资 / 关键词 / URL 归一化
lib/store.js            数据读写、导入导出
lib/google.js           Google 登录（launchWebAuthFlow）和 Drive 应用数据文件读写
lib/sync.js             云同步：拉取、按记录合并（含删除）、上传
lib/constants.js        状态、类型等常量
popup/                  点击图标时的弹窗
dashboard/              追踪表页面
scripts/pack.js         生成上架用的 zip（dist/），去掉开发用的 key
store/                  上架填写内容、隐私政策、商店截图
```

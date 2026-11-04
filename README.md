# Job Tracker 求职投递追踪

一个 Chrome / Edge 浏览器扩展，用来记录美国求职（实习 + 全职）的每一次投递：公司、职位、地点、JD 全文、薪资、签证 sponsor 情况、面试轮次和准备笔记；还能识别 Gmail 里的 OA / 面试邀请 / 拒信并自动更新状态，并可以通过你自己的 GitHub 私有仓库在多台电脑之间同步。数据只存在你的浏览器和你自己的仓库里，不经过任何第三方服务器。

## 安装（2 分钟）

1. 打开 Chrome，地址栏输入 `chrome://extensions`（Edge 用 `edge://extensions`）
2. 打开右上角 **开发者模式**
3. 点 **加载已解压的扩展程序**，选择文件夹 `E:\career\job-tracker`
4. 点浏览器右上角的拼图图标，把 “Job Tracker 求职投递追踪” **固定** 到工具栏

安装后会自动打开追踪表页面。修改代码后，在 `chrome://extensions` 里点这个扩展的 🔄 刷新即可。

> 安装前已经打开的网页，需要刷新一次后自动检测才会生效（手动点图标记录不受影响）。

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

## 云同步（台式机 + MacBook）

数据同步到 **你自己的 GitHub 私有仓库**，几台电脑填同一个仓库就会自动合并。不经过任何第三方服务器。

### 第一次设置（约 5 分钟，只做一次）

1. **建仓库**：打开 <https://github.com/new>，名字随意（如 `job-tracker-data`），选 **Private**，点 Create repository。空仓库就行，不用加 README
2. **生成 token**：打开 <https://github.com/settings/personal-access-tokens/new>（Fine-grained token）
   - Token name：随意，如 `job-tracker`
   - Expiration：建议选 1 年（过期后在插件里换一个即可）
   - Repository access：选 **Only select repositories**，只勾刚建的仓库
   - Permissions → Repository permissions → **Contents** 选 **Read and write**（Metadata 会自动变成只读，保持即可）
   - 点 Generate token，复制以 `github_pat_` 开头的那串
3. **在插件里开启**：追踪表右上角点 **☁ 开启云同步**，填 `用户名/仓库名`、粘贴 token、给这台电脑起个名字，点 **测试并开启**

### 在 MacBook 上

1. 把整个 `job-tracker` 文件夹拷到 Mac 上（U 盘、网盘都行，Mac 上放在一个不会被删的位置）
2. Mac 的 Chrome 里同样 **加载已解压的扩展程序**（见上面“安装”）
3. 追踪表 → ☁ 开启云同步，填 **同一个仓库**。token 可以用同一个，也可以再生成一个
4. 第一次同步时，两台电脑上已有的记录会自动合并，不会互相覆盖

### 怎么同步

- 修改后约 10 秒自动上传；每 5 分钟、打开浏览器、打开追踪表时自动拉取；也可以在设置里点 **立即同步**
- 右上角的 ☁ 显示状态：已同步 · N 分钟前 / 同步中 / ⚠ 同步失败（点开看原因）
- **合并规则**：每条记录各自比较，修改时间较新的那一边为准；两台电脑改了不同的记录，两边的修改都会保留
- **删除** 会同步到所有电脑（不会被另一台电脑“复活”）；“清空全部数据” 也会清空云端
- Gmail 里已经在一台电脑上识别过的邮件，另一台不会重复处理
- 每次上传都是仓库里的一个 commit，可以在 GitHub 上看历史、恢复任意旧版本（数据在仓库根目录的 `job-tracker.json`）
- 只允许私有仓库；token 只保存在本机插件里，“关闭同步” 会把它从这台电脑删掉

## 数据与备份

- 数据存在本机 `chrome.storage.local`；开启云同步后，GitHub 仓库里也有一份带完整历史的副本
- 没开云同步时，**卸载扩展会删除数据**。追踪表右上角 **备份 JSON**（完整备份，可用 “导入备份” 恢复）、**导出 CSV**（用 Excel / Google Sheets 打开）
- 没开云同步、记录超过 5 条且 14 天没备份时，追踪表顶部会提醒
- 设置里可以关闭自动记录

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
lib/sync.js             GitHub 云同步：拉取、按记录合并、上传、冲突重试
lib/constants.js        状态、类型等常量
popup/                  点击图标时的弹窗
dashboard/              追踪表页面
```

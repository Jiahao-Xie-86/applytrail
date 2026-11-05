# Chrome Web Store listing

> Not submitted: ApplyTrail is distributed through GitHub for now. Kept for a possible store release later.

What to enter in the Developer Dashboard, tab by tab. Upload `dist/applytrail-<version>.zip` from `node scripts/pack.js`.

## Package

- Upload `dist/applytrail-1.1.0.zip`.
- After the upload, note the **Item ID** shown for the item and add `https://<Item ID>.chromiumapp.org/` to the OAuth client's redirect URIs (see DEVELOPMENT.md).

## Store listing

Name and summary come from `_locales/*/messages.json`. Default language: **English**; add **Chinese (Simplified)** as a second language with the Chinese description below.

### Description (English)

```
ApplyTrail keeps track of your internship and full-time job applications, so you always know where you applied, what the job asked for, and what happens next.

RECORDS ITSELF
• After you submit an application on Greenhouse, Lever, Workday, Ashby, LinkedIn Easy Apply, Indeed and similar sites, the "Thank you for applying" page is detected and the application is saved. One click to undo.
• On any job posting, click the toolbar button (Alt+Shift+J): company, title, location, salary, visa sponsorship and the full job description are filled in for you.

FOLLOWS UP THROUGH GMAIL
• In Gmail on the web, online assessments, interview invitations, rejections and offers are recognized and the matching application is updated. Every change can be undone.
• Application confirmations you never tracked are suggested, so you can backfill past applications in one click.

HELPS YOU PREPARE
• The full job description is saved, so you can still read it after the posting is taken down. Skill keywords are highlighted.
• Experience, degree and graduation requirements and the visa sentence are pulled out of the JD.
• Log every interview round with notes and add it to your calendar.
• Open Glassdoor, LeetCode company questions, Levels.fyi, H-1B data, Blind and LinkedIn for the company in one click.
• Copy an interview-prep prompt with the JD and your notes for Claude or another AI assistant.

ONE TRACKER
• Weekly application chart, response rate, upcoming interviews, "no reply in 3 weeks" reminders.
• Filter by status, job type, source and visa; search across companies, titles, JDs and notes.
• Export to CSV, back up to JSON.
• English and Chinese interface.

YOUR DATA STAYS YOURS
• No developer server, no analytics, no ads.
• Optional sync: sign in with Google and your records sync between your computers through a hidden app folder in your own Google Drive that only ApplyTrail can access.
• Open source: https://github.com/Jiahao-Xie-86/applytrail
```

### Description (Chinese, Simplified)

```
ApplyTrail 帮你记录实习和全职求职的每一次投递：投了哪里、职位要求什么、下一步是什么，一目了然。

自动记录
• 在 Greenhouse、Lever、Workday、Ashby、LinkedIn Easy Apply、Indeed 等网站提交申请后，出现 “Thank you for applying” 页面时自动保存，可一键撤销。
• 在任何职位页面点工具栏按钮（Alt+Shift+J），自动填好公司、职位、地点、薪资、签证 sponsor 情况和完整 JD。

从 Gmail 跟进
• 在 Gmail 网页版里识别 OA、面试邀请、拒信和 Offer，自动更新对应投递的状态，每次更新都可撤销。
• 没记录过的投递确认邮件会提示你，一键补录以前的投递。

面试准备
• 保存 JD 全文，职位下线后也能看；技能关键词高亮。
• 从 JD 里提取年限、学历、毕业时间要求和签证相关原句。
• 记录每轮面试和复盘笔记，导出到日历。
• 一键打开这家公司的 Glassdoor、LeetCode 公司题、一亩三分地面经、Levels.fyi、H1B 数据、Blind 和 LinkedIn。
• 复制包含 JD 和你笔记的面试准备提示词，粘贴给 Claude 等 AI。

一张追踪表
• 每周投递柱状图、回复率、即将到来的面试、3 周无回音提醒。
• 按状态、类型、来源、签证筛选；在公司、职位、JD 和笔记里搜索。
• 导出 CSV，备份 JSON。
• 中文和英文界面。

数据只属于你
• 没有开发者服务器，没有统计和广告。
• 可选同步：用 Google 账号登录后，记录通过你自己 Google Drive 里只有 ApplyTrail 能访问的隐藏应用文件夹，在多台电脑之间同步。
• 开源：https://github.com/Jiahao-Xie-86/applytrail
```

### Other fields

- **Category:** Productivity → Workflow & Planning
- **Store icon:** `icons/icon128.png`
- **Screenshots** (1280×800): English listing `store/screenshots/en-1-tracker.png`, `en-2-interview-prep.png`; Chinese listing `zh-1-tracker.png`, `zh-2-interview-prep.png`
- **Small promo tile** (440×280): `store/promo-tile-440x280.png`
- **Homepage URL:** https://jiahao-xie-86.github.io/applytrail/
- **Support URL:** https://github.com/Jiahao-Xie-86/applytrail/issues

## Privacy

- **Single purpose:**

```
Track the user's own job applications: save the job postings the user applies to, keep each application's status up to date (including from recruiting emails in Gmail), and keep interview notes, optionally synced across the user's computers through their own Google Drive.
```

- **Permission justifications:**

| Permission | Justification |
|---|---|
| storage | Stores the user's job application records locally. |
| unlimitedStorage | Records include full job descriptions, which can exceed the default storage quota for active job seekers. |
| activeTab | When the user clicks the toolbar button, reads the job posting on the current tab to fill in company, title and description. |
| scripting | Injects the posting reader into a tab that was already open before the extension was installed, only when the user clicks the toolbar button. |
| alarms | Syncs with the user's own Google Drive every 5 minutes so their other computers stay up to date. |
| identity | Google sign-in for optional sync to the user's own Google Drive app data folder (drive.appdata scope). |
| Host permission (http/https) | Job postings are hosted on thousands of company career sites and applicant tracking systems, so the posting reader and the "application submitted" detection must run on any site the user applies through; it does nothing on pages that are not job-related. It also reads Gmail's web page to recognize recruiting emails (interview invitations, assessments, rejections) about the user's own applications. Nothing is sent to the developer or any third party. |

- **Remote code:** No
- **Data usage** (tick):
  - Personally identifiable information — the Google account email address, shown as the sync account
  - Personal communications — subject, sender and the matching sentence of recognized recruiting emails
  - Website content — job postings the user saves
  - Tick all three certifications (not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending)
- **Privacy policy URL:** https://jiahao-xie-86.github.io/applytrail/privacy.html

## Distribution

- **Payments:** Free
- **Visibility:** Public
- **Regions:** All regions

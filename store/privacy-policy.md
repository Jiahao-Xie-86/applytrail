# Job Tracker — Privacy Policy / 隐私政策

_Last updated: 2026-11-04_

Job Tracker is a browser extension that helps you keep track of your own job applications. It has no server of its own: nothing is sent to the developer or to any third party.

## What the extension reads

- **Job posting pages** you visit (company career sites, LinkedIn, Indeed, Greenhouse, Lever, Workday, Ashby, …): the job title, company, location, salary and job description, so they can be saved when you record an application, and the "application submitted" confirmation so the application can be recorded automatically.
- **Gmail web pages** (mail.google.com) while you have them open: sender, subject, preview text and the body of the email you open, to recognize recruiting emails (online assessments, interview invitations, rejections, offers, application confirmations). This happens entirely inside your browser. Emails that are not job-related are ignored and never stored.
- **Your Google account email address**, only if you choose to sign in with Google for cloud sync, to show which account is syncing.

## What is stored, and where

- Your application records (company, title, job description, status, interview notes, etc.) and, for recognized recruiting emails, the subject, sender and the detected type. Email bodies are not stored.
- Stored in your browser's extension storage on your computer.
- If you sign in with Google, the same data is also stored as one file in the **hidden application data folder of your own Google Drive** (scope `drive.appdata`), which only this extension can access, so your other computers can sync it. The Google access token is kept only in memory for the current browser session.

## What is not done

- No data is sold, shared, or transferred to anyone, and no analytics, advertising or tracking is used.
- The extension does not use your data for any purpose other than tracking your job applications.
- Google user data obtained through Google APIs is used in accordance with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Your control

- Delete any record, or all records ("清空全部数据" in Settings). With sync on, deletions also apply to the copy in your Google Drive.
- Sign out of sync in Settings at any time. To remove the extension's access to your Google Drive completely, visit <https://myaccount.google.com/permissions>.
- Uninstalling the extension removes all data stored in your browser.

## Contact

Questions: <填你愿意公开的联系邮箱 / your contact email>

---

## 中文摘要

- 插件没有自己的服务器，不会把任何数据发给开发者或第三方。
- 读取：你访问的职位页面（用于保存职位信息、识别“投递成功”）；Gmail 网页版里的邮件（只在浏览器里识别求职邮件，非求职邮件直接忽略，正文不保存）；如果你用 Google 登录同步，读取你的账号邮箱用于显示。
- 存储：投递记录保存在本机浏览器；登录 Google 后，同一份数据也保存在你自己 Google Drive 的隐藏应用文件夹里（只有本插件能访问），用于多台电脑同步。
- 不出售、不共享、不做广告或统计。可随时删除记录、退出登录，或在 <https://myaccount.google.com/permissions> 撤销授权。

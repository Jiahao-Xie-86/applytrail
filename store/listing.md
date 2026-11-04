# Chrome Web Store 上架填写内容

按 Developer Dashboard 的标签页顺序。上传包用 `node scripts/pack.js` 生成的 `dist/job-tracker-<版本>.zip`。

## Package（上传）

- 上传 `dist/job-tracker-1.0.0.zip`
- 上传后在 **Package** 页能看到这个商店版本的 **Item ID**，把它发给我（或自己加到 Google Cloud 的 redirect URI，见 README）

## Store listing（商店信息）

- **Description**（复制下面整段）：

```
帮你记录美国求职（实习 + 全职）的每一次投递，换电脑登录 Google 账号就能接着用。

• 一键记录：在 LinkedIn、Indeed、Handshake、Glassdoor 或任何公司官网 / Greenhouse / Lever / Workday / Ashby 职位页点图标，自动抓取公司、职位、地点、薪资和完整 JD
• 自动记录：提交申请后出现 “Thank you for applying” 页面时自动保存，可撤销
• 邮件识别：在 Gmail 网页版里识别 OA 邀请、面试邀请、拒信和 Offer，自动更新状态
• 面试准备：保存 JD 全文（职位下线后也能看）、技能关键词高亮、学历 / 年限 / 毕业时间要求、签证 sponsor 原句提示、面经和薪资调研链接、每轮面试记录、导出日历
• 追踪表：按状态筛选、全文搜索、每周投递统计、即将到来的面试
• 云同步：用 Google 账号登录，数据保存在你自己 Google Drive 的隐藏应用文件夹，台式机和笔记本自动同步
• 隐私：没有开发者服务器，数据只在你的浏览器和你自己的 Google Drive 里

Track every internship and full-time application in one place: capture job posts from LinkedIn, Indeed, Greenhouse, Lever, Workday, Ashby and company career sites; auto-record submissions; recognize interview invites, online assessments and rejections in Gmail; keep JDs and interview notes; sync across computers through your own Google Drive.
```

- **Category**：Productivity → Workflow & Planning
- **Language**：Chinese (Simplified)
- **Store icon**：`icons/icon128.png`
- **Screenshots**：`store/screenshot-1.png`、`store/screenshot-2.png`（1280×800）

## Privacy（隐私）

- **Single purpose description**：

```
Track the user's own job applications: save job postings the user applies to, record each application's status, and keep interview notes, optionally synced across the user's computers through their own Google Drive.
```

- **Permission justification**（每个权限一栏）：

| 权限 | 填写 |
|---|---|
| storage | Stores the user's job application records locally. |
| unlimitedStorage | Records include full job descriptions, which can exceed the default storage quota for active job seekers. |
| activeTab | When the user clicks the toolbar button, reads the job posting on the current tab to fill in company, title and description. |
| scripting | Injects the posting reader into a tab that was already open before the extension was installed, only when the user clicks the toolbar button. |
| alarms | Syncs with the user's Google Drive every 5 minutes so their other computers stay up to date. |
| identity | Google sign-in for optional sync to the user's own Google Drive app data folder (drive.appdata). |
| Host permission (http/https) | Job postings are hosted on thousands of company career sites and applicant tracking systems, so the posting reader and the "application submitted" detection must run on any site the user applies through; it stays idle on pages that are not job-related. It also reads Gmail's web page to recognize recruiting emails (interview invitations, assessments, rejections) for the user's own applications. Nothing is sent to the developer or any third party. |

- **Are you using remote code?**：No
- **Data usage**（勾选）：
  - Personally identifiable information（Google 账号邮箱，仅用于显示同步账号）
  - Personal communications（识别出的求职邮件的标题和发件人）
  - Website content（职位页面内容）
  - 三项声明都勾选：不出售给第三方、不用于与单一用途无关的目的、不用于信用评估
- **Privacy policy URL**：把 `store/privacy-policy.md` 的内容发布成公开网页后填这里（例如 Google 文档 → 文件 → 共享 → 发布到网络）

## Distribution（发布）

- **Visibility**：Unlisted（不公开，只有拿到链接的人能安装）
- **Regions**：All regions

# Development

Plain JavaScript Manifest V3 extension, no build step and no dependencies. Load the folder with **Load unpacked** and click 🔄 in `chrome://extensions` after editing.

## Layout

```
manifest.json           Manifest V3; name/description come from _locales/
_locales/               store name and description (en, zh_CN)
background.js           service worker: auto-recording, undo, Gmail results, sync schedule, ✓ badge
content/extractors.js   reads job postings (site rules → schema.org JobPosting → generic rules)
content/content.js      detects "application submitted" pages; renders the corner notice
content/gmail.js        collects email list rows / the opened email in Gmail for the background
lib/i18n.js             UI language: t() and the English translations
lib/constants.js        statuses, job types and other lists (labels follow the UI language)
lib/analyze.js          JD analysis: job type, term, visa, salary, keywords, URL normalization
lib/store.js            storage, import / export
lib/email.js            recruiting-email classification, matching, undo
lib/google.js           Google sign-in (launchWebAuthFlow) and the Drive app-data file
lib/sync.js             cloud sync: pull, per-record merge with tombstones, push
popup/                  toolbar popup
dashboard/              tracker page (also the options page)
docs/                   website for GitHub Pages: home page and privacy policy
scripts/pack.js         builds the Chrome Web Store zip
scripts/check-i18n.js   translation check
scripts/try-extract.js  runs the extractor on live job postings
test/                   tests (npm test)
store/                  store listing text and screenshots
```

## Translations

UI text is written in Chinese in the code and wrapped in `t()`; `lib/i18n.js` maps it to English:

```js
t('已保存 ✓')                       // → "Saved ✓" in English
t('{n} 天无回音', { n: 21 })        // placeholders work in both languages
```

- Static HTML text is translated by `JT.i18n.apply(document)`: text nodes and `title` / `placeholder` / `aria-label` attributes that match a key, and elements marked `data-i18n="name"` whose English HTML is stored under `'@name'`.
- English values may be functions for plurals: `'{n} 条': (v) => pl(v.n, 'record', 'records')`.
- The service worker builds the notice text shown on web pages, so content scripts carry no translations.
- Values stored in records stay in Chinese (`'公司官网'`, `'邮件'` as the source) and are translated when shown; mark such literals with `// i18n-key`. Mark Chinese that is not UI text (e.g. parsing Gmail's Chinese date format) with `// i18n-skip`.
- `node scripts/check-i18n.js` fails on any Chinese string without `t()` or a translation, mismatched `{placeholders}`, and incomplete `_locales`. `scripts/pack.js` runs it first.

## Google sign-in and sync

- Google Cloud project `job-tracker-513802`, Google Drive API enabled.
- OAuth consent screen: External, scopes `openid`, `email`, `.../auth/drive.appdata` (non-sensitive).
- OAuth client "Job Tracker extension", type *Web application*. Its **Authorized redirect URIs** must contain `https://<extension-id>.chromiumapp.org/` for every extension ID that signs in:
  - `https://pbdigaoohikokfaehfdfajdgdlgejmbp.chromiumapp.org/` — unpacked builds (ID fixed by `"key"` in `manifest.json`)
  - `https://<store item ID>.chromiumapp.org/` — the Chrome Web Store build
- The client ID is in `lib/google.js` (`G.CLIENT_ID`). It is not a secret. The implicit flow needs no client secret.
- The consent screen is **In production** (since 2026-11-05), app name *ApplyTrail*, home page and privacy policy served from `docs/` on GitHub Pages; authorized domains `chromiumapp.org` and `jiahao-xie-86.github.io`. No logo is uploaded: adding one would require Google's brand verification. Only non-sensitive scopes are used, so there is no user cap and no "unverified app" screen.

**Forks:** create your own OAuth client, put its ID in `G.CLIENT_ID`, and either keep the `"key"` (ID `pbdigaoohikokfaehfdfajdgdlgejmbp`) or replace it with your own and register the matching redirect URI.

## Releasing to the Chrome Web Store

1. Bump `version` in `manifest.json`.
2. `node scripts/pack.js` → `dist/applytrail-<version>.zip` (runs the translation check; drops the dev-only `"key"`).
3. Developer Dashboard → the item → **Package** → upload → **Submit for review**. Listing text is in `store/listing.md`, screenshots in `store/screenshots/`.

After the first upload, the store's public key (Package → *View public key*) can replace `"key"` in `manifest.json`, so unpacked builds get the same ID as the store build and share one redirect URI.

## Tests

```
npm install     # jsdom, only needed for tests
npm test        # test/*.test.js + the translation check
node scripts/try-extract.js <job posting URL>   # run the extractor on a live posting
```

The tests run the real files against a fake `chrome.*` API (in-memory storage, a fake Google Drive). They do not cover real sites or real Google sign-in, so before a release also load the unpacked build and check: recording from a Greenhouse or Lever posting, the popup, the tracker in both languages, Gmail recognition on an inbox with a recruiting email, and sync on two browser profiles.

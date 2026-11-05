// Checks the Chinese / English UI text:
//  - every Chinese string in the JS is wrapped in t('…') (or marked i18n-key / i18n-skip)
//  - every key used has an English translation in lib/i18n.js, with the same {placeholders}
//  - every Chinese text node / attribute in the HTML pages has a translation
//  - _locales/en and _locales/zh_CN define the same messages
// Usage: node scripts/check-i18n.js   (exit code 1 on problems)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CJK = /[　-〿一-鿿＀-￯]/;

const ctx = vm.createContext({});
vm.runInContext(read('lib/i18n.js'), ctx);
const EN = ctx.JT.i18n.EN;

const problems = [];
const used = new Set();
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

function useKey(key, where) {
  used.add(key);
  if (!(key in EN)) return problems.push(`${where}: no English for ${JSON.stringify(key)}`);
  const v = EN[key];
  if (typeof v === 'string' && !key.startsWith('@') && placeholders(v) !== placeholders(key)) {
    problems.push(`${where}: placeholders differ for ${JSON.stringify(key)} → ${JSON.stringify(v)}`);
  }
}

// ---------- JS: find string literals (skipping comments and regex literals) ----------

const BS = String.fromCharCode(92); // backslash
const BT = String.fromCharCode(96); // backtick

function literals(src) {
  const out = [];
  let i = 0;
  let line = 1;
  let lastSig = ''; // last significant character, to tell a regex from a division
  const regexAllowedAfter = '(,=:[!&|?{};+-*%<>~^';

  function string(q) {
    const start = i;
    const startLine = line;
    let j = i + 1;
    while (j < src.length && src[j] !== q) {
      if (src[j] === BS) j++;
      else if (src[j] === '\n') line++;
      j++;
    }
    out.push({ quote: q, text: src.slice(i + 1, j), start, line: startLine });
    i = j + 1;
    lastSig = 's';
  }

  // Static text of a template literal; the ${…} expressions are scanned as code.
  function template() {
    const start = i;
    const startLine = line;
    let text = '';
    i++;
    while (i < src.length) {
      const d = src[i];
      if (d === BS) { text += src.slice(i, i + 2); i += 2; continue; }
      if (d === BT) { i++; break; }
      if (d === '$' && src[i + 1] === '{') { i += 2; text += '#'; lastSig = '{'; code(true); continue; }
      if (d === '\n') line++;
      text += d;
      i++;
    }
    out.push({ quote: BT, text, start, line: startLine });
    lastSig = 's';
  }

  function code(untilBrace) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      const n = src[i + 1];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && n === '*') {
        const end = src.indexOf('*/', i + 2);
        line += (src.slice(i, end).match(/\n/g) || []).length;
        i = end + 2;
        continue;
      }
      if (c === '/' && (lastSig === '' || regexAllowedAfter.includes(lastSig) || /\b(return|typeof|case)$/.test(src.slice(0, i).trimEnd()))) {
        let j = i + 1;
        let inClass = false;
        while (j < src.length) {
          if (src[j] === BS) { j += 2; continue; }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          j++;
        }
        i = j + 1;
        while (/[a-z]/i.test(src[i] || '')) i++;
        lastSig = 'r';
        continue;
      }
      if (c === "'" || c === '"') { string(c); continue; }
      if (c === BT) { template(); continue; }
      if (c === '{') depth++;
      if (c === '}') {
        if (untilBrace && depth === 0) { i++; return; }
        depth--;
      }
      lastSig = c;
      i++;
    }
  }

  code(false);
  return out;
}

const JS_FILES = [
  'background.js', 'content/content.js', 'content/extractors.js', 'content/gmail.js',
  'dashboard/dashboard.js', 'popup/popup.js',
  'lib/analyze.js', 'lib/constants.js', 'lib/email.js', 'lib/google.js', 'lib/store.js', 'lib/sync.js',
];

for (const f of JS_FILES) {
  const src = read(f);
  const lines = src.split('\n');
  for (const lit of literals(src)) {
    if (!CJK.test(lit.text)) continue;
    const where = `${f}:${lit.line}`;
    // A marker comment applies to its own line, or to the line after a comment-only line.
    const prev = lines[lit.line - 2] || '';
    const marks = (lines[lit.line - 1] || '') + (/^\s*(\/\/|:\s*\/\/)/.test(prev) ? prev : '');
    const wrapped = lit.quote !== BT && /\bt\(\s*$/.test(src.slice(Math.max(0, lit.start - 40), lit.start));
    if (wrapped) {
      useKey(lit.text, where);
    } else if (/i18n-skip/.test(marks)) {
      continue;
    } else if (lit.quote === BT) {
      problems.push(`${where}: Chinese inside a template string, use t('… {name} …', { name })`);
    } else if (/i18n-key/.test(marks)) {
      useKey(lit.text, where);
    } else {
      problems.push(`${where}: Chinese string not wrapped in t(): ${JSON.stringify(lit.text)}`);
    }
  }
}

// ---------- HTML: text nodes, attributes, data-i18n blocks ----------

const VOID = new Set(['input', 'br', 'meta', 'link', 'img', 'hr', 'source', 'col', 'area', 'base', 'wbr']);
for (const f of ['dashboard/dashboard.html', 'popup/popup.html']) {
  const html = read(f).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  let skipTag = null;
  let skipDepth = 0;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g)) {
    const [, close, tag, attrs, text] = m;
    const where = `${f}:${html.slice(0, m.index).split('\n').length}`;
    if (text != null) {
      const k = text.trim();
      if (!skipTag && k && CJK.test(k) && k !== 'title') useKey(k, where);
      continue;
    }
    const name = tag.toLowerCase();
    if (skipTag) {
      if (name === skipTag) skipDepth += close ? -1 : 1;
      if (skipDepth === 0) skipTag = null;
      continue;
    }
    if (close) continue;
    for (const a of attrs.matchAll(/\b(title|placeholder|aria-label|label)="([^"]*)"/g)) {
      if (CJK.test(a[2])) useKey(a[2], where);
    }
    const di = /\bdata-i18n="([^"]+)"/.exec(attrs);
    if (di) {
      useKey('@' + di[1], where);
      if (!VOID.has(name)) { skipTag = name; skipDepth = 1; }
    }
  }
}

// ---------- manifest locales ----------

const en = JSON.parse(read('_locales/en/messages.json'));
const zh = JSON.parse(read('_locales/zh_CN/messages.json'));
for (const k of new Set([...Object.keys(en), ...Object.keys(zh)])) {
  if (!en[k] || !zh[k]) problems.push(`_locales: "${k}" missing in ${en[k] ? 'zh_CN' : 'en'}`);
}
const manifest = JSON.parse(read('manifest.json'));
for (const m of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) {
  if (!en[m[1]]) problems.push(`manifest.json: __MSG_${m[1]}__ has no message in _locales/en`);
}
if (en.extName && en.extName.message.length > 75) problems.push('_locales/en: extName longer than 75 characters');
for (const [lang, msgs] of [['en', en], ['zh_CN', zh]]) {
  if (msgs.extDesc && msgs.extDesc.message.length > 132) problems.push(`_locales/${lang}: extDesc longer than 132 characters`);
}

const unused = Object.keys(EN).filter((k) => !used.has(k));
if (unused.length) console.log(`note: ${unused.length} translation(s) not found in the code (keys built at runtime are fine):\n  ` + unused.map((k) => JSON.stringify(k)).join('\n  '));
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`i18n OK: ${used.size} strings checked`);

// Runs every test/*.test.js file plus the translation check.
// Usage: npm install, then npm test
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let failed = 0;

function report(name, r, passed) {
  const out = (r.stdout || '') + (r.stderr || '');
  console.log(`${passed(out) ? 'ok  ' : 'FAIL'} ${name}`);
  if (!passed(out)) {
    failed++;
    console.log(out.split('\n').filter((l) => /FAIL|Error|problem/.test(l)).slice(0, 20).join('\n'));
  }
}

for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith('.test.js')).sort()) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 120000 });
  report(f, r, (out) => r.status === 0 && /ALL PASSED/.test(out) && !/\bFAIL\b/.test(out));
}

const i18n = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'check-i18n.js')], { encoding: 'utf8' });
report('check-i18n', i18n, () => i18n.status === 0);

process.exit(failed ? 1 : 0);

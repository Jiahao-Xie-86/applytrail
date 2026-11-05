// Runs the extractor against live job pages (server-rendered HTML only).
// Usage: node scripts/try-extract.js <job posting URL> [...]   (needs: npm install)
const { JSDOM } = require('jsdom');
const fs = require('fs');
const ROOT = require('path').join(__dirname, '..') + '/';
const code = ['lib/analyze.js', 'content/extractors.js'].map((f) => fs.readFileSync(ROOT + f, 'utf8')).join('\n;\n');

const URLS = process.argv.slice(2);

(async () => {
  for (const url of URLS) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' } });
    const html = await res.text();
    const dom = new JSDOM(html, { url: res.url, runScripts: 'outside-only' });
    dom.window.eval(code);
    const j = dom.window.JT.extract();
    console.log('\n===', url, `(HTTP ${res.status})`);
    for (const k of ['title', 'company', 'location', 'source', 'jobType', 'term', 'workMode', 'salary', 'sponsorship', 'jobId', 'postedDate']) {
      console.log(`  ${k.padEnd(12)} ${JSON.stringify(j[k])}`);
    }
    console.log(`  ${'keywords'.padEnd(12)} ${JSON.stringify(j.keywords)}`);
    console.log(`  ${'description'.padEnd(12)} ${j.description.length} chars: ${JSON.stringify(j.description.slice(0, 90))}`);
    if (j.sponsorshipNote) console.log(`  ${'spNote'.padEnd(12)} ${j.sponsorshipNote}`);
  }
})();

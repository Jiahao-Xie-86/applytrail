// Two computers signed into the same Google account, syncing through a fake Drive API.
const fs = require('fs');
const vm = require('vm');
const zlib = require('zlib');
const ROOT = require('path').join(__dirname, '..') + '/';
const EXT_ID = 'pbdigaoohikokfaehfdfajdgdlgejmbp';
const REDIRECT = `https://${EXT_ID}.chromiumapp.org/`;
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.appdata';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra); };

// ---------- fake Google ----------
const google = {
  tokens: new Map(), // token -> expiresAt
  files: new Map(), // id -> { name, bytes, createdTime }
  seq: 0,
  sessionAlive: true, // browser still signed into Google (silent renewal works)
  untickDrive: false,
  cancel: false,
  quotaFull: false,
  offline: false,
  lastAuthParams: null,
  calls: [],
};
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const issue = () => { const t = 'tok' + ++google.seq; google.tokens.set(t, Date.now() + 3600e3); return t; };

async function fakeFetch(url, init = {}) {
  if (google.offline) throw new TypeError('Failed to fetch');
  const u = new URL(url);
  const method = init.method || 'GET';
  const auth = (init.headers || {}).Authorization || '';
  const tok = auth.replace('Bearer ', '');
  google.calls.push(`${method} ${u.pathname}`);
  if (!google.tokens.has(tok) || google.tokens.get(tok) < Date.now()) return json(401, { error: { message: 'Invalid Credentials', errors: [{ reason: 'authError' }] } });
  if (u.host === 'openidconnect.googleapis.com') return json(200, { email: 'user@example.com' });
  if (u.pathname === '/drive/v3/files' && method === 'GET') {
    if (u.searchParams.get('spaces') !== 'appDataFolder') return json(400, {});
    const name = /name='([^']+)'/.exec(u.searchParams.get('q'))[1];
    const files = [...google.files.entries()].filter(([, f]) => f.name === name).sort((a, b) => a[1].createdTime - b[1].createdTime).map(([id, f]) => ({ id, createdTime: new Date(f.createdTime).toISOString() }));
    return json(200, { files });
  }
  let m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
  if (m && method === 'GET' && u.searchParams.get('alt') === 'media') {
    const f = google.files.get(m[1]);
    return f ? new Response(f.bytes, { status: 200 }) : json(404, {});
  }
  if (m && method === 'DELETE') { google.files.delete(m[1]); return new Response(null, { status: 204 }); }
  if (google.quotaFull) return json(403, { error: { message: 'The user has exceeded their Drive storage quota', errors: [{ reason: 'storageQuotaExceeded' }] } });
  m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
  if (m && method === 'PATCH') {
    if (init.headers['Content-Type'] !== 'application/gzip') return json(400, {});
    google.files.get(m[1]).bytes = Buffer.from(init.body);
    return json(200, { id: m[1] });
  }
  if (u.pathname === '/upload/drive/v3/files' && method === 'POST' && u.searchParams.get('uploadType') === 'multipart') {
    const boundary = /boundary=(\S+)/.exec(init.headers['Content-Type'])[1];
    const buf = Buffer.from(await init.body.arrayBuffer());
    const parts = [];
    let pos = buf.indexOf(`--${boundary}`);
    while (pos >= 0) {
      const next = buf.indexOf(`\r\n--${boundary}`, pos + 1);
      if (next < 0) break;
      const head = buf.indexOf('\r\n\r\n', pos);
      parts.push({ headers: buf.slice(pos, head).toString(), body: buf.slice(head + 4, next) });
      pos = next + 2;
    }
    const meta = JSON.parse(parts[0].body.toString());
    if (!meta.parents.includes('appDataFolder') || !/gzip/.test(parts[1].headers)) return json(400, {});
    const id = 'f' + ++google.seq;
    google.files.set(id, { name: meta.name, bytes: parts[1].body, createdTime: Date.now() + google.seq });
    return json(200, { id });
  }
  return json(404, { error: { message: 'unexpected ' + method + ' ' + u.pathname } });
}

function makeIdentity() {
  return {
    getRedirectURL: () => REDIRECT,
    async launchWebAuthFlow({ url, interactive, abortOnLoadForNonInteractive, timeoutMsForNonInteractive }) {
      const p = new URL(url).searchParams;
      google.lastAuthParams = { ...Object.fromEntries(p), interactive, abortOnLoadForNonInteractive, timeoutMsForNonInteractive };
      if (p.get('redirect_uri') !== REDIRECT || p.get('response_type') !== 'token') throw new Error('redirect_uri_mismatch');
      if (interactive && google.cancel) throw new Error('The user did not approve access.');
      if (!interactive && !google.sessionAlive) throw new Error('User interaction required.');
      const scope = p.get('scope').split(' ').filter((s) => !(google.untickDrive && s === SCOPE_DRIVE)).join(' ');
      return `${REDIRECT}#access_token=${issue()}&token_type=Bearer&expires_in=3599&scope=${encodeURIComponent(scope)}`;
    },
  };
}

// ---------- a "computer" ----------
function device() {
  const mkArea = () => {
    const data = {};
    return {
      data,
      async get(keys) {
        if (keys == null) return structuredClone(data);
        return Object.fromEntries([].concat(keys).filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
      },
      async set(obj) { for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v); },
      async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
    };
  };
  const local = mkArea();
  const session = mkArea();
  const ctx = vm.createContext({
    chrome: { storage: { local, session }, identity: makeIdentity() },
    fetch: fakeFetch, Response, Blob, CompressionStream, DecompressionStream, TextEncoder, TextDecoder,
    console, crypto, structuredClone, URL, URLSearchParams, Date, setTimeout,
  });
  ctx.globalThis = ctx;
  for (const f of ['lib/constants.js', 'lib/analyze.js', 'lib/store.js', 'lib/email.js', 'lib/google.js', 'lib/sync.js']) vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx);
  const J = ctx.JT;
  return {
    local, session, S: J.store, Y: J.sync, G: J.google, E: J.email,
    titles: async () => (await J.store.all()).map((a) => `${a.company}:${a.title}`).sort(),
    add: async (company, title, extra = {}) => J.store.save(J.store.newApp({ company, title, ...extra })),
    // what the dashboard does on "用 Google 登录"
    signInAndSync: async () => { const email = await J.google.signIn(); await J.sync.enable(email); return J.sync.syncNow(); },
  };
}
const errOf = async (p) => { try { await p; return ''; } catch (e) { return e.message + (e.needsLogin ? ' [needsLogin]' : ''); } };
const remoteDoc = () => { const [f] = [...google.files.values()]; return JSON.parse(zlib.gunzipSync(f.bytes).toString()); };

(async () => {
  const A = device();
  const B = device();

  // ---- sign-in ----
  ok('real client id is configured', /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(A.G.CLIENT_ID));
  A.G.CLIENT_ID = '';
  ok('no client id -> clear error', (await errOf(A.G.signIn())).includes('CLIENT_ID'));
  A.G.CLIENT_ID = B.G.CLIENT_ID = 'test-client.apps.googleusercontent.com';
  google.cancel = true;
  ok('cancelled popup reported', (await errOf(A.G.signIn())).includes('did not approve'));
  google.cancel = false;
  google.untickDrive = true;
  ok('unticked Drive scope refused', (await errOf(A.G.signIn())).includes('勾选'));
  google.untickDrive = false;

  await A.add('Stripe', 'SWE Intern');
  await A.add('Google', 'STEP Intern');
  const r1 = await A.signInAndSync();
  const p = google.lastAuthParams;
  ok('auth request is correct', p.client_id.startsWith('test-client') && p.prompt === 'select_account' && p.scope.includes(SCOPE_DRIVE) && p.scope.includes('email') && p.interactive === true, JSON.stringify(p).slice(0, 160));
  ok('config stores account', (await A.Y.config()).email === 'user@example.com' && (await A.Y.config()).enabled);
  ok('token only in session storage', !JSON.stringify(A.local.data).includes('tok') && A.session.data.googleAuth);
  ok('A first sync creates one gzip file in appDataFolder', r1.pushed && r1.apps === 2 && google.files.size === 1 && remoteDoc().apps, JSON.stringify(r1));

  await B.add('Ramp', 'Data Intern');
  const r2 = await B.signInAndSync();
  ok('B (new computer) gets everything after one sign-in', r2.received === 2 && r2.pushed && r2.apps === 3, JSON.stringify(r2));
  const r3 = await A.Y.syncNow();
  ok('A receives B record', r3.received === 1 && !r3.pushed);
  ok('both identical', JSON.stringify(await A.titles()) === JSON.stringify(await B.titles()), JSON.stringify(await A.titles()));
  const uploadsBefore = google.calls.filter((c) => c.startsWith('PATCH') || c.startsWith('POST')).length;
  await A.Y.syncNow();
  ok('no-op sync uploads nothing', google.calls.filter((c) => c.startsWith('PATCH') || c.startsWith('POST')).length === uploadsBefore);

  // ---- edits & deletes ----
  const sA = (await A.S.all()).find((a) => a.company === 'Stripe');
  sA.notes = 'A';
  await A.S.save(sA);
  await sleep(5);
  const sB = await B.S.get(sA.id);
  sB.notes = 'B later';
  await B.S.save(sB);
  await A.Y.syncNow(); await B.Y.syncNow(); await A.Y.syncNow();
  ok('later edit wins on both', (await A.S.get(sA.id)).notes === 'B later' && (await B.S.get(sA.id)).notes === 'B later');
  const g = (await A.S.all()).find((a) => a.company === 'Google');
  await A.S.remove(g.id);
  await A.Y.syncNow(); await B.Y.syncNow(); await B.Y.syncNow(); await A.Y.syncNow();
  ok('delete propagates and stays deleted', !(await A.S.get(g.id)) && !(await B.S.get(g.id)));

  // ---- overwrite race (no compare-and-swap on Drive) converges ----
  await A.add('NVIDIA', 'DL Intern');
  await B.add('Jane Street', 'QT Intern');
  await A.Y.syncNow(); // A uploads NVIDIA
  const staleB = structuredClone(remoteDoc());
  await B.Y.syncNow(); // B merges + uploads
  // simulate a third computer that overwrote the file with an old copy
  const fid = [...google.files.keys()][0];
  delete staleB.apps[(await A.S.all()).find((a) => a.company === 'NVIDIA').id];
  google.files.get(fid).bytes = zlib.gzipSync(JSON.stringify(staleB));
  await A.Y.syncNow(); await B.Y.syncNow(); await A.Y.syncNow();
  ok('lost upload is restored by the next sync', (await B.titles()).includes('NVIDIA:DL Intern') && (await A.titles()).includes('Jane Street:QT Intern'));

  // ---- two copies of the file (first sync at the same moment) ----
  const C = device();
  C.G.CLIENT_ID = A.G.CLIENT_ID;
  await C.add('Meta', 'SWE');
  const keep = [...google.files.keys()][0];
  google.files.set('dup', { name: 'job-tracker.json.gz', bytes: zlib.gzipSync(JSON.stringify({ apps: { x1: { ...C.S.newApp({ company: 'OpenAI', title: 'Resident' }), id: 'x1' } }, tombstones: {}, emailEvents: [], emailSeen: {} })), createdTime: Date.now() + 1e9 });
  const rc = await C.signInAndSync();
  ok('duplicate files folded into one', google.files.size === 1 && google.files.has(keep) && rc.pushed, `${google.files.size} files`);
  await A.Y.syncNow();
  ok('...with nothing lost', (await A.titles()).includes('OpenAI:Resident') && (await A.titles()).includes('Meta:SWE'));

  // ---- big unicode payload is gzip-compressed ----
  await A.add('ByteDance', '软件工程实习生', { description: '职位描述 JD — 负责推荐系统后端开发。'.repeat(40000) });
  await A.Y.syncNow();
  const size = [...google.files.values()][0].bytes.length;
  await B.Y.syncNow();
  const bd = (await B.S.all()).find((a) => a.company === 'ByteDance');
  ok('large record round-trips (compressed)', bd && bd.description.length === '职位描述 JD — 负责推荐系统后端开发。'.repeat(40000).length && size < 200000, `${size} bytes on Drive`);

  // ---- tokens ----
  A.session.data.googleAuth.expiresAt = Date.now() - 1000;
  await A.Y.syncNow();
  const sp = google.lastAuthParams;
  ok('expired token renewed silently', sp.interactive === false && sp.prompt === 'none' && sp.login_hint === 'user@example.com' && sp.abortOnLoadForNonInteractive === false && !(await A.Y.state()).lastError);
  google.tokens.set(A.session.data.googleAuth.token, 0); // revoked server-side before local expiry
  await A.Y.syncNow();
  ok('401 mid-session retried with a fresh token', !(await A.Y.state()).lastError);
  google.sessionAlive = false;
  A.session.data.googleAuth.expiresAt = 0;
  const e1 = await errOf(A.Y.syncNow());
  const st = await A.Y.state();
  ok('signed out of Google -> asks to sign in again', e1.includes('重新登录') && e1.includes('[needsLogin]') && st.needsLogin && !st.syncing, e1);
  google.sessionAlive = true;
  await A.signInAndSync();
  ok('re-login clears the error', !(await A.Y.state()).lastError && !(await A.Y.state()).needsLogin);

  // ---- errors ----
  await A.add('Uber', 'SWE');
  google.quotaFull = true;
  ok('Drive full reported', (await errOf(A.Y.syncNow())).includes('空间已满'));
  google.quotaFull = false;
  google.offline = true;
  ok('offline reported', (await errOf(A.Y.syncNow())).includes('网络'));
  google.offline = false;
  await A.Y.syncNow();
  ok('recovers after errors', !(await A.Y.state()).lastError);

  // ---- emails handled once across computers ----
  const mail = { legacyId: 'th1', subject: 'Your application to Stripe', body: 'Unfortunately, we have decided to move forward with other candidates.', senderName: 'Stripe Recruiting', senderEmail: 'no-reply@greenhouse-mail.io', dateText: new Date().toString() };
  await A.E.process([mail]);
  await A.Y.syncNow(); await B.Y.syncNow();
  ok('email handled on A is skipped on B', (await B.E.process([mail])).length === 0);

  // ---- sign out ----
  await B.Y.disable();
  ok('sign-out forgets token and stops syncing', !B.session.data.googleAuth && !(await B.Y.config()).enabled && (await B.Y.syncNow()).skipped);
  ok('sign-out keeps local records', (await B.titles()).length > 3);

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
})();

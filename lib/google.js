// Google sign-in and the Drive file used for cloud sync.
// Sign-in uses chrome.identity.launchWebAuthFlow (works in Chrome and Edge, any Google
// account). Data goes to Drive's hidden appDataFolder: invisible in the Drive UI and
// readable only by this extension (scope drive.appdata, "non-sensitive" per Google).
(function () {
  const JT = (globalThis.JT = globalThis.JT || {});
  const G = (JT.google = {});

  // OAuth client ID ("Web application" type, Google Cloud project job-tracker-513802). Not a secret.
  // Its authorized redirect URIs must include https://<extension-id>.chromiumapp.org/
  G.CLIENT_ID = '1083337985923-tueiug6lqqra5ig4n3u1fps08arpgvig.apps.googleusercontent.com';

  const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.appdata';
  const SCOPES = ['openid', 'email', SCOPE_DRIVE];
  const DRIVE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const FILE = 'job-tracker.json.gz';

  G.redirectUri = () => chrome.identity.getRedirectURL();

  function needsLogin(msg) {
    return Object.assign(new Error(msg || 'Google 登录已过期，请点 “用 Google 登录” 重新登录'), { needsLogin: true });
  }

  async function authorize(interactive, hint) {
    if (!G.CLIENT_ID) throw new Error('还没有配置 Google 登录（lib/google.js 里的 CLIENT_ID 为空）');
    const params = new URLSearchParams({
      client_id: G.CLIENT_ID,
      response_type: 'token',
      redirect_uri: G.redirectUri(),
      scope: SCOPES.join(' '),
      include_granted_scopes: 'true',
      prompt: interactive ? 'select_account' : 'none',
    });
    if (hint) params.set('login_hint', hint);
    const url = await chrome.identity.launchWebAuthFlow({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params,
      interactive,
      // Silent renewal goes through a couple of redirects before landing on the token.
      ...(interactive ? {} : { abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 10000 }),
    });
    const h = new URLSearchParams(new URL(url).hash.slice(1));
    if (h.get('error')) throw interactive ? new Error('Google 登录失败：' + h.get('error')) : needsLogin();
    const token = h.get('access_token');
    if (!token) throw needsLogin();
    // Google's consent screen lets people untick scopes; without Drive there is nothing to sync to.
    if (!(h.get('scope') || '').split(' ').includes(SCOPE_DRIVE)) {
      throw new Error('登录时需要勾选 “查看、创建和删除它自己在 Google 云端硬盘中的配置数据”，否则无法同步。请重新登录并勾选');
    }
    const auth = { token, expiresAt: Date.now() + (Number(h.get('expires_in')) || 3600) * 1000 };
    await chrome.storage.session.set({ googleAuth: auth });
    return auth;
  }

  // Interactive sign-in (call from a click). Returns the account's email address.
  G.signIn = async function () {
    const { token } = await authorize(true);
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + token } });
    const info = res.ok ? await res.json() : {};
    return info.email || '';
  };

  // A valid access token; silently renewed through the browser's Google session.
  G.token = async function (hint) {
    const s = (await chrome.storage.session.get('googleAuth')).googleAuth;
    if (s && s.expiresAt - Date.now() > 120000) return s.token;
    try {
      return (await authorize(false, hint)).token;
    } catch (e) {
      // launchWebAuthFlow rejects with "User interaction required" when the session is gone.
      throw e.needsLogin || !G.CLIENT_ID ? e : needsLogin();
    }
  };

  // Forget the token on this computer only (revoking would also log out the others).
  G.signOut = () => chrome.storage.session.remove('googleAuth');

  // ---------- Drive ----------

  async function api(hint, url, init = {}) {
    let res;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await G.token(hint);
      res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + token } });
      if (res.status !== 401) break;
      await chrome.storage.session.remove('googleAuth'); // expired early — renew once
    }
    if (res.ok) return res;
    let reason = '';
    let msg = '';
    try {
      const body = await res.json();
      reason = ((body.error && body.error.errors && body.error.errors[0]) || {}).reason || '';
      msg = (body.error && body.error.message) || '';
    } catch {}
    if (res.status === 401) throw needsLogin();
    if (/storageQuotaExceeded/.test(reason)) throw new Error('Google Drive 空间已满，无法同步');
    if (/rateLimit/i.test(reason) || res.status === 429) throw new Error('Google 请求太频繁，稍后自动重试');
    if (/insufficient/i.test(reason)) throw needsLogin('登录时没有给 Google Drive 权限，请重新登录并勾选');
    throw new Error(`Google Drive 返回 ${res.status}${msg ? '：' + msg : ''}`);
  }

  async function gzip(text) {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function gunzip(buf) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  // Oldest first. Normally one file; two appear if computers created it at the same moment.
  G.listFiles = async function (hint) {
    const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
    const res = await api(hint, `${DRIVE}/files?spaces=appDataFolder&q=${q}&orderBy=createdTime&fields=files(id,createdTime)`);
    return (await res.json()).files || [];
  };

  G.download = async function (hint, id) {
    const res = await api(hint, `${DRIVE}/files/${id}?alt=media`);
    return JSON.parse(await gunzip(await res.arrayBuffer()));
  };

  // Create (no id) or overwrite the sync file. Simple uploads are capped at 5 MB, which
  // gzip turns into roughly 20 MB of records.
  G.upload = async function (hint, id, data) {
    const bytes = await gzip(JSON.stringify(data));
    if (bytes.length > 5 * 1024 * 1024) throw new Error('数据超过 Google Drive 单次上传上限（5 MB 压缩后）');
    if (id) {
      await api(hint, `${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/gzip' }, body: bytes });
      return id;
    }
    const boundary = 'jt' + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/gzip' });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`,
    ]);
    const res = await api(hint, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return (await res.json()).id;
  };

  G.remove = (hint, id) => api(hint, `${DRIVE}/files/${id}`, { method: 'DELETE' });
})();

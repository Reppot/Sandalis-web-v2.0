const { app, BrowserWindow, protocol, session } = require('electron');
const { createServer } = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
app.setPath('userData', path.join(os.tmpdir(), 'sindaris-auth-ci-' + process.pid));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const deadline = setTimeout(() => { console.error('Electron auth test timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const { createNativeAuthSession, rendererAuthResponse, sessionRequestPolicy, SERVER_URL } = await import(pathToFileURL(path.resolve(__dirname, '../src/policy.mjs')).href);
  const nativeAuth = createNativeAuthSession();
  let cookieMode = 'standard';
  const server = createServer((req, res) => {
    const setup = (req.headers.cookie || '').includes('sindaris_discord_setup=fixture');
    const loggedIn = req.headers.authorization === 'Bearer fixture.jwt.signature';
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/auth/discord/setup' && setup) {
      if (req.method === 'POST') {
        if (cookieMode !== 'missing') res.setHeader('Set-Cookie', (cookieMode === 'renamed' ? 'custom_session' : 'sandalis_session') + '=fixture-session; Path=/; HttpOnly; SameSite=Lax');
        res.end(JSON.stringify({ access_token: 'fixture.jwt.signature', token_type: 'bearer', expires_in: 60, me: { role: 'member' } }));
      } else res.end(JSON.stringify({ guilds: [], memberships: [], joins: [] }));
    } else if (['/api/v1/auth/me', '/api/v1/orders'].includes(req.url) && loggedIn) {
      res.end(JSON.stringify({ role: 'member' }));
    } else {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: { code: 'unauthorized' } }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const ses = session.fromPartition('sindaris-auth-ci');
  ses.protocol.handle('app', async req => {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return new Response('<!doctype html><html><body>Auth integration fixture</body></html>', { headers: { 'Content-Type': 'text/html' } });
    const policy = sessionRequestPolicy(url.pathname);
    const headers = new Headers();
    const authorization = nativeAuth.authorization(SERVER_URL + url.pathname);
    if (authorization) headers.set('Authorization', authorization);
    const body = ['GET','HEAD'].includes(req.method) ? undefined : new Uint8Array(await req.arrayBuffer());
    const upstream = await ses.fetch(origin + url.pathname, { method: req.method, headers, body, credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(policy.timeout) });
    if (url.pathname === '/api/v1/auth/discord/setup') {
      const payload = await upstream.json();
      nativeAuth.capture(url.pathname, req.method, upstream.status, payload);
      return new Response(JSON.stringify(rendererAuthResponse(url.pathname, payload)), { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
  });
  const win = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, nodeIntegration: false, contextIsolation: true } });
  await win.loadURL('app://sindaris/');
  for (cookieMode of ['standard', 'renamed', 'missing']) {
    nativeAuth.clear();
    for (const cookie of await ses.cookies.get({ url: origin })) await ses.cookies.remove(origin + cookie.path, cookie.name);
    await ses.cookies.set({ url: origin, name: 'sindaris_discord_setup', value: 'fixture', httpOnly: true, sameSite: 'lax', expirationDate: Date.now()/1000 + 900 });
    const results = await win.webContents.executeJavaScript(
      '(async () => { const before=await fetch("/api/v1/auth/me"); const a=await fetch("/api/v1/auth/discord/setup"); const b=await fetch("/api/v1/auth/discord/setup",{method:"POST",body:"{}"}); const payload=await b.json(); const c=await fetch("/api/v1/auth/me"); const d=await fetch("/api/v1/orders"); return {statuses:[before.status,a.status,b.status,c.status,d.status],tokenExposed:!!(payload.access_token||payload.refresh_token||payload.token_type)}; })()'
    );
    console.log('AUTH_TRANSPORT', cookieMode, JSON.stringify(results));
    assert.deepEqual(results.statuses, [401,200,200,200,200]);
    assert.equal(results.tokenExposed, false);
    nativeAuth.clear();
    const afterLogout = await win.webContents.executeJavaScript('fetch("/api/v1/auth/me").then(r=>r.status)');
    assert.equal(afterLogout, 401);
  }
  win.destroy();
  await new Promise(resolve => server.close(resolve));
  clearTimeout(deadline);
  console.log('Electron auth transport passed: standard, renamed and missing cookies');
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(deadline); app.exit(1); });

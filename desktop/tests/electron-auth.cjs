const { app, BrowserWindow, protocol, session } = require('electron');
const { createServer } = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
app.setPath('userData', path.join(os.tmpdir(), 'sindaris-auth-ci-' + process.pid));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const deadline = setTimeout(() => { console.error('Electron auth test timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const observed = [];
  const server = createServer((req, res) => {
    const setup = (req.headers.cookie || '').includes('sindaris_discord_setup=fixture');
    const loggedIn = (req.headers.cookie || '').includes('sandalis_session=fixture-session');
    observed.push({ method: req.method, path: req.url, setupCookie: setup, sessionCookie: loggedIn });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/auth/discord/setup' && setup) {
      if (req.method === 'POST') res.setHeader('Set-Cookie', 'sandalis_session=fixture-session; Path=/; HttpOnly; SameSite=Lax');
      res.end(JSON.stringify({ guilds: [], memberships: [], joins: [] }));
    } else if (req.url === '/api/v1/auth/me' && loggedIn) {
      res.end(JSON.stringify({ role: 'member' }));
    } else {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: { code: 'setup_expired' } }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const ses = session.fromPartition('sindaris-auth-ci');
  await ses.cookies.set({ url: origin, name: 'sindaris_discord_setup', value: 'fixture', httpOnly: true, sameSite: 'lax', expirationDate: Date.now()/1000 + 900 });
  ses.protocol.handle('app', async req => {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return new Response('<!doctype html><html><body>Auth integration fixture</body></html>', { headers: { 'Content-Type': 'text/html' } });
    const body = ['GET','HEAD'].includes(req.method) ? undefined : new Uint8Array(await req.arrayBuffer());
    const upstream = await ses.fetch(origin + url.pathname, { method: req.method, body, credentials: 'include', redirect: 'manual' });
    return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
  });
  const win = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, nodeIntegration: false, contextIsolation: true } });
  await win.loadURL('app://sindaris/');
  const results = await win.webContents.executeJavaScript(
    '(async () => { const a=await fetch("/api/v1/auth/discord/setup"); const b=await fetch("/api/v1/auth/discord/setup",{method:"POST",body:"{}"}); const c=await fetch("/api/v1/auth/me"); return [a.status,b.status,c.status]; })()'
  );
  console.log('AUTH_TRANSPORT_OBSERVED', JSON.stringify(observed));
  console.log('AUTH_TRANSPORT_STATUSES', JSON.stringify(results));
  assert.deepEqual(results, [200,200,200], 'setup and session cookies must survive the native proxy');
  assert.ok(observed.every(row => row.setupCookie));
  win.destroy();
  await new Promise(resolve => server.close(resolve));
  clearTimeout(deadline);
  console.log('Electron auth transport passed');
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(deadline); app.exit(1); });

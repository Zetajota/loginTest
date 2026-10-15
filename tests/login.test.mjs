import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

let processHandle;
let baseUrl;
let frontendHandle;
let frontendUrl;
let tempDir;

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function request(path, options) {
  const response = await fetch(`${baseUrl}/api${path}`, options);
  const body = await response.json();
  return { response, body };
}

async function register(email = 'ana@example.com', password = 'clave-segura-123') {
  return request('/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ana', email, password }),
  });
}

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'nimbo-tests-'));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const frontendPort = await freePort();
  frontendUrl = `http://127.0.0.1:${frontendPort}`;
  processHandle = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, BACKEND_PORT: String(port), DB_PATH: join(tempDir, 'users.sqlite'), FRONTEND_ORIGIN: 'http://localhost:5173' },
    stdio: 'ignore',
  });
  frontendHandle = spawn(process.execPath, ['frontend-server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, FRONTEND_PORT: String(frontendPort) },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (processHandle.exitCode !== null) throw new Error(`API terminó inesperadamente (${processHandle.exitCode})`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch { /* El servidor aún inicia. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('La API no inició a tiempo.');
});

after(async () => {
  await Promise.all([processHandle, frontendHandle].filter((child) => child?.exitCode === null).map((child) => new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGTERM'); })));
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

test('1. La API está saludable y la pantalla de perfil se sirve por HTTP', async () => {
  const { response, body } = await request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: 'ok', database: 'sqlite' });
  const profile = await fetch(`${frontendUrl}/profile.html`);
  assert.equal(profile.status, 200);
  const html = await profile.text();
  assert.match(html, /Mi perfil/);
  assert.match(html, /profile\.js/);
});

test('2. Rechaza datos de registro inválidos', async () => {
  const { response, body } = await request('/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '', email: 'correo-invalido', password: 'corta' }),
  });
  assert.equal(response.status, 400);
  assert.match(body.error, /nombre/i);
});

test('3. Registra usuario, devuelve sesión y no expone credenciales', async () => {
  const { response, body } = await register();
  assert.equal(response.status, 200);
  assert.deepEqual(body.user, { id: 1, name: 'Ana', email: 'ana@example.com' });
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.equal(JSON.stringify(body).includes('clave-segura-123'), false);
  const db = await readFile(join(tempDir, 'users.sqlite'));
  assert.equal(db.includes(Buffer.from('clave-segura-123')), false);
});

test('4. Rechaza correo duplicado y contraseña incorrecta con errores esperados', async () => {
  const duplicate = await register();
  assert.equal(duplicate.response.status, 409);
  const wrongPassword = await request('/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ana@example.com', password: 'incorrecta' }),
  });
  assert.equal(wrongPassword.response.status, 401);
  assert.equal(wrongPassword.body.error, 'Correo o contraseña incorrectos.');
});

test('5. Inicia sesión, restaura la sesión y la revoca al cerrar', async () => {
  const login = await request('/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ANA@example.com', password: 'clave-segura-123' }),
  });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const me = await request('/me', { headers: { Cookie: cookie } });
  assert.equal(me.body.user.email, 'ana@example.com');
  const logout = await request('/logout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{}',
  });
  assert.equal(logout.response.status, 200);
  const afterLogout = await request('/me', { headers: { Cookie: cookie } });
  assert.equal(afterLogout.body.user, null);
});

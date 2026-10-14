import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, pbkdf2, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pbkdf2Async = promisify(pbkdf2);
const here = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.DB_PATH || `${here}/data/users.sqlite`);
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);`);

const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const port = Number(process.env.BACKEND_PORT || 3001);
const secureCookies = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
const iterations = 310000;
const cookieName = 'nimbo_session';
const sessionDuration = 7 * 24 * 60 * 60 * 1000;
const temporarySessionDuration = 12 * 60 * 60 * 1000;
const userSummary = (row) => ({ id: row.id, name: row.name, email: row.email });
const tokenDigest = (token) => createHash('sha256').update(token).digest('hex');

function send(response, status, data, extraHeaders = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin', ...extraHeaders });
  response.end(JSON.stringify(data));
}

function clearExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}
clearExpiredSessions();
const sessionCleanup = setInterval(clearExpiredSessions, 15 * 60 * 1000);
sessionCleanup.unref();

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    let tooLarge = false;
    request.on('data', (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 16_384) {
        tooLarge = true;
        reject(Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 }));
      }
    });
    request.on('end', () => {
      if (tooLarge) return;
      try { resolveBody(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('El formato de la solicitud no es válido.'), { status: 400 })); }
    });
    request.on('error', reject);
  });
}

function currentUser(request) {
  const cookies = request.headers.cookie || '';
  const token = cookies.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token) return null;
  let decoded;
  try { decoded = decodeURIComponent(token); } catch { return null; }
  const session = db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenDigest(decoded), Date.now());
  if (!session) return null;
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(session.user_id);
  return user ? userSummary(user) : null;
}

function sessionCookie(token, maxAgeSeconds) {
  const maxAge = maxAgeSeconds === undefined ? '' : `; Max-Age=${maxAgeSeconds}`;
  return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/${maxAge}${secureCookies ? '; Secure' : ''}`;
}

async function createSession(userId, response, remember = false) {
  clearExpiredSessions();
  const duration = remember ? sessionDuration : temporarySessionDuration;
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES(?, ?, ?)').run(tokenDigest(token), userId, Date.now() + duration);
  send(response, 200, { user: userSummary(db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(userId)) }, { 'Set-Cookie': sessionCookie(token, remember ? duration / 1000 : undefined) });
}

const server = createServer(async (request, response) => {
  if (request.headers.origin && request.headers.origin !== origin) return send(response, 403, { error: 'Origen no permitido.' });
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' });
    return response.end();
  }
  const { pathname } = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && pathname === '/api/health') return send(response, 200, { status: 'ok', database: 'sqlite' });
    if (request.method === 'GET' && pathname === '/api/me') return send(response, 200, { user: currentUser(request) });
    if (request.method === 'POST' && pathname === '/api/register') {
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) return send(response, 415, { error: 'El contenido debe ser JSON.' });
      const body = await readBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(response, 400, { error: 'La solicitud no es válida.' });
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!name || name.length > 80) return send(response, 400, { error: 'El nombre es obligatorio y debe tener como máximo 80 caracteres.' });
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(response, 400, { error: 'Escribe un correo electrónico válido.' });
      if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 1024) return send(response, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
      const salt = randomBytes(16);
      const hash = await pbkdf2Async(password, salt, iterations, 32, 'sha256');
      let result;
      try { result = db.prepare('INSERT INTO users(name, email, password_hash, password_salt) VALUES(?, ?, ?, ?)').run(name, email, hash.toString('hex'), salt.toString('hex')); }
      catch (error) {
        if (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(error.message)) return send(response, 409, { error: 'Ya existe una cuenta con ese correo.' });
        throw error;
      }
      return createSession(Number(result.lastInsertRowid), response, body.remember === true);
    }
    if (request.method === 'POST' && pathname === '/api/login') {
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) return send(response, 415, { error: 'El contenido debe ser JSON.' });
      const body = await readBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(response, 400, { error: 'La solicitud no es válida.' });
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const row = db.prepare('SELECT id, name, email, password_hash, password_salt FROM users WHERE email = ?').get(email);
      const salt = row ? Buffer.from(row.password_salt, 'hex') : Buffer.alloc(16);
      const expectedHash = row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(32);
      const actualHash = await pbkdf2Async(password.slice(0, 1024), salt, iterations, 32, 'sha256');
      if (!row || !timingSafeEqual(actualHash, expectedHash)) return send(response, 401, { error: 'Correo o contraseña incorrectos.' });
      return createSession(row.id, response, body.remember === true);
    }
    if (request.method === 'POST' && pathname === '/api/logout') {
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) return send(response, 415, { error: 'El contenido debe ser JSON.' });
      const cookies = request.headers.cookie || '';
      const token = cookies.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      if (token) {
        try { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenDigest(decodeURIComponent(token))); } catch { /* Cookie malformada: se elimina igualmente en el cliente. */ }
      }
      return send(response, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    }
    return send(response, 404, { error: 'Ruta no encontrada.' });
  } catch (error) {
    if (!response.headersSent) send(response, error.status || 500, { error: error.status ? error.message : 'Ocurrió un error interno.' });
    if (!error.status) console.error(error);
  }
});

server.listen(port, '0.0.0.0', () => console.log(`API de login disponible en http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { clearInterval(sessionCleanup); db.close(); process.exit(0); }));

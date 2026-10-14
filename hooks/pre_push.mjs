import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, '..');
const input = readFileSync(0, 'utf8');
let event = {};
try { event = JSON.parse(input); } catch { /* A malformed or empty event does not match a push. */ }
const command = event?.tool_input?.command;

// Includes git push, git.exe push, and global options such as git -C path push.
if (typeof command !== 'string' || !/\bgit(?:\.exe)?\b[^\r\n;&|]*\bpush\b/i.test(command)) process.exit(0);

const checks = [
  ['pruebas', ['--test']],
  ['sintaxis del perfil', ['--check', 'profile.js']],
];
let output = '';
let testsFound = false;

for (const [label, args] of checks) {
  const result = spawnSync(process.execPath, args, {
    cwd: project,
    encoding: 'utf8',
    timeout: 50_000,
    windowsHide: true,
  });
  output += `${result.stdout || ''}${result.stderr || ''}`;
  if (result.error || result.status !== 0) {
    const reason = result.error ? `No se pudieron ejecutar ${label}: ${result.error.message}` : `Falló la validación de ${label}.`;
    process.stderr.write(`PUSH BLOQUEADO: ${reason}\n${output.slice(-6000)}`);
    process.exit(2);
  }
  if (args[0] === '--test') testsFound = /(?:ℹ\s*)tests\s+[1-9]\d*\b|#\s*tests\s+[1-9]\d*\b/.test(output);
}

if (!testsFound) {
  process.stderr.write(`PUSH BLOQUEADO: las pruebas no se encontraron en la salida.\n${output.slice(-6000)}`);
  process.exit(2);
}

process.stderr.write(`Hook previo al push: pruebas aprobadas; se permite continuar.\n${output}`);

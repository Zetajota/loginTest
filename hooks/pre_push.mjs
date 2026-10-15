import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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

// Fix only mechanical whitespace issues in changed JavaScript files. Logic and
// syntax errors are reported below and keep the push blocked for review.
let changedFiles = [];
try {
  const unstaged = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRTUXB'], { cwd: project, encoding: 'utf8' });
  const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRTUXB'], { cwd: project, encoding: 'utf8' });
  changedFiles = [...new Set(`${unstaged}\n${staged}`.split(/\r?\n/))]
    .filter((file) => /\.(?:js|mjs|cjs)$/.test(file));
} catch (error) {
  process.stderr.write(`PUSH BLOQUEADO: no se pudieron revisar los archivos modificados (${error.message}).\n`);
  process.exit(2);
}

const fixes = [];
for (const file of changedFiles) {
  const path = resolve(project, file);
  if (path !== project && !path.startsWith(`${project}/`)) continue;
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  let corrected = source.replace(/[\t ]+(?=\r?$)/gm, '');
  if (corrected.length > 0 && !/\r?\n$/.test(corrected)) corrected += corrected.includes('\r\n') ? '\r\n' : '\n';
  if (corrected !== source) {
    writeFileSync(path, corrected, 'utf8');
    fixes.push(file);
  }
}

for (const file of fixes) {
  process.stderr.write(`Corrección automática: ${file} tenía espacios al final de línea o le faltaba el salto de línea final; se corrigió.\n`);
}

const checks = [
  ...changedFiles.map((file) => [`sintaxis de ${file}`, ['--check', file]]),
  ['pruebas', ['--test']],
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
  if (args[0] === '--test') testsFound = /(?:ℹ\s*)tests\s+5\b|#\s*tests\s+5\b/.test(output);
}

if (!testsFound) {
  process.stderr.write(`PUSH BLOQUEADO: las pruebas no se encontraron en la salida.\n${output.slice(-6000)}`);
  process.exit(2);
}

if (fixes.length > 0) {
  process.stderr.write(`PUSH BLOQUEADO: las correcciones están en el directorio de trabajo y todavía no forman parte de un commit. Revisa y confirma los archivos indicados antes de volver a hacer push.\n`);
  process.exit(2);
}

process.stderr.write(`Hook previo al push: pruebas aprobadas; se permite continuar.\n${output}`);

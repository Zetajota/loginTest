import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server.mjs'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['frontend-server.mjs'], { stdio: 'inherit', env: process.env }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}
for (const child of children) child.on('exit', (code) => {
  if (!stopping && code !== 0) {
    console.error('Uno de los servidores terminó inesperadamente.');
    stop();
    process.exitCode = code || 1;
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);

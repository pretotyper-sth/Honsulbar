import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['scripts/dev-api.js'], { stdio: 'inherit' }),
  spawn('npx', ['vite', '--host', '0.0.0.0'], { stdio: 'inherit' }),
];
for (const child of children) child.on('exit', code => process.exit(code ?? 0));

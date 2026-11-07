import { spawn } from 'node:child_process';
import { expoCli, expoEnvironment, mobileRoot } from './expo-environment.mjs';
const child = spawn(process.execPath, [expoCli, ...process.argv.slice(2)], { cwd: mobileRoot, env: expoEnvironment(), stdio: 'inherit' });
child.on('error', error => { console.error(`Expo could not start: ${error.message}`); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));

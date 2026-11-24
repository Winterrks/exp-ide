import { spawn } from 'node:child_process';
import path from 'node:path';
import { failure } from './workspace.js';

export async function runShell(workspace, { command, cwd = '' }, response) {
  if (typeof command !== 'string' || !command.trim() || command.length > 8192 || command.includes('\0')) {
    throw failure('Enter a shell command under 8192 characters.');
  }
  const directory = await workspace.locate(cwd, true);
  // Only terminal submissions reach this function. Planner actions are data.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', TERM: 'dumb', NO_COLOR: '1' };
  const script = 'eval "$1"\nresult=$?\npwd -P >&3\nexit "$result"';
  const child = spawn('bash', ['--noprofile', '--norc', '-c', script, 'keyline', command], {
    cwd: directory, env, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  });
  response.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  const send = event => { if (!response.destroyed) response.write(JSON.stringify(event) + '\n'); };
  let nextDirectory = '';
  let bytes = 0;
  let stopped = false;
  function stop(reason) {
    if (stopped) return;
    stopped = true;
    if (reason) send({ text: '\n' + reason + '\n' });
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
  }
  const timer = setTimeout(() => stop('Command reached the 60-second limit.'), 60000);
  response.once('close', () => { if (!response.writableEnded) stop(); });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8').on('data', text => {
      if (stopped) return;
      bytes += Buffer.byteLength(text);
      if (bytes > 256 * 1024) stop('Terminal output limit reached.');
      else send({ text });
    });
  }
  child.stdio[3].setEncoding('utf8').on('data', text => { if (nextDirectory.length < 8192) nextDirectory += text; });
  child.once('error', error => send({ text: error.message + '\n' }));
  child.once('close', code => {
    clearTimeout(timer);
    let relative = nextDirectory.trimEnd() ? path.relative(workspace.root, nextDirectory.trimEnd()) : cwd;
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
      send({ text: '\nThe next prompt starts at the workspace root.\n' });
      relative = '';
    }
    send({ exitCode: code ?? 130, cwd: relative });
    response.end();
  });
}

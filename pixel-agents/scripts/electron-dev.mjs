import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webviewDir = path.join(rootDir, 'webview-ui');
const devServerUrl = process.env.PIXEL_AGENTS_ELECTRON_DEV_URL ?? 'http://127.0.0.1:5173';
const parsedDevServerUrl = new URL(devServerUrl);
const devServerPort =
  parsedDevServerUrl.port || (parsedDevServerUrl.protocol === 'https:' ? '443' : '80');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronCommand = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const children = new Set();

function spawnManaged(command, args, options) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  children.add(child);
  child.once('exit', () => children.delete(child));

  return child;
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

function waitForUrl(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  const client = url.startsWith('https:') ? https : http;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = client.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.setTimeout(1000, () => {
        request.destroy();
      });

      request.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

process.on('SIGINT', () => {
  stopChildren();
  process.exit(130);
});

process.on('SIGTERM', () => {
  stopChildren();
  process.exit(143);
});

const build = spawnSync(process.execPath, ['esbuild.js'], {
  cwd: rootDir,
  stdio: 'inherit',
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const vite = spawnManaged(
  npmCommand,
  [
    'run',
    'dev',
    '--',
    '--host',
    parsedDevServerUrl.hostname,
    '--port',
    devServerPort,
    '--strictPort',
  ],
  { cwd: webviewDir },
);

try {
  await waitForUrl(devServerUrl);
} catch (error) {
  stopChildren();
  console.error(error);
  process.exit(1);
}

const electron = spawnManaged(electronCommand, ['electron'], {
  cwd: rootDir,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PIXEL_AGENTS_ELECTRON_DEV_URL: devServerUrl,
  },
});

electron.once('exit', (code) => {
  stopChildren();
  process.exit(code ?? 0);
});

vite.once('exit', (code) => {
  if (code && code !== 0) {
    stopChildren();
    process.exit(code);
  }
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { HOOK_SCRIPTS_DIR } from '../../../constants.js';
import { CODEX_HOOK_EVENTS, CODEX_HOOK_SCRIPT_NAME } from './constants.js';

/** ~/.codex/hooks.json entry */
interface CodexHookEntry {
  event: string;
  command: string;
  timeout?: number;
}

/** Partial shape of ~/.codex/hooks.json */
interface CodexHooksConfig {
  hooks?: CodexHookEntry[];
  [key: string]: unknown;
}

function getCodexHooksPath(): string {
  return path.join(os.homedir(), '.codex', 'hooks.json');
}

function getHookScriptPath(): string {
  return path.join(os.homedir(), HOOK_SCRIPTS_DIR, CODEX_HOOK_SCRIPT_NAME);
}

function readCodexHooks(): CodexHooksConfig {
  const p = getCodexHooksPath();
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as CodexHooksConfig;
    }
  } catch (e) {
    console.error(`[Pixel Agents] Failed to read Codex hooks config: ${e}`);
  }
  return {};
}

function writeCodexHooks(config: CodexHooksConfig): void {
  const p = getCodexHooksPath();
  const dir = path.dirname(p);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = p + '.pixel-agents-tmp';
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
    fs.renameSync(tmp, p);
  } catch (e) {
    console.error(`[Pixel Agents] Failed to write Codex hooks config: ${e}`);
  }
}

function isOurEntry(entry: CodexHookEntry): boolean {
  return entry.command.includes(CODEX_HOOK_SCRIPT_NAME);
}

function makeCommand(): string {
  return `node "${getHookScriptPath()}"`;
}

export function areHooksInstalled(): boolean {
  const config = readCodexHooks();
  if (!Array.isArray(config.hooks)) return false;
  return CODEX_HOOK_EVENTS.every((event) =>
    config.hooks!.some((e) => e.event === event && isOurEntry(e)),
  );
}

export function installHooks(): void {
  const config = readCodexHooks();
  if (!Array.isArray(config.hooks)) {
    config.hooks = [];
  }

  // Remove stale Pixel Agents entries, then add fresh ones for each event
  config.hooks = config.hooks.filter((e) => !isOurEntry(e));
  const command = makeCommand();
  for (const event of CODEX_HOOK_EVENTS) {
    config.hooks.push({ event, command, timeout: 5 });
  }

  writeCodexHooks(config);
  console.log('[Pixel Agents] Codex hooks installed in ~/.codex/hooks.json');
}

export function uninstallHooks(): void {
  const config = readCodexHooks();
  if (!Array.isArray(config.hooks)) return;

  const before = config.hooks.length;
  config.hooks = config.hooks.filter((e) => !isOurEntry(e));
  if (config.hooks.length === before) return;

  if (config.hooks.length === 0) {
    delete config.hooks;
  }
  writeCodexHooks(config);
  console.log('[Pixel Agents] Codex hooks removed from ~/.codex/hooks.json');
}

/** Copy the shipped hook script from the extension/app to ~/.pixel-agents/hooks/ */
export function copyHookScript(extensionPath: string): void {
  const src = path.join(extensionPath, 'dist', 'hooks', CODEX_HOOK_SCRIPT_NAME);
  const dst = getHookScriptPath();
  const dstDir = path.dirname(dst);
  try {
    if (!fs.existsSync(dstDir)) {
      fs.mkdirSync(dstDir, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(src)) {
      console.warn(`[Pixel Agents] Codex hook script not found at ${src}`);
      return;
    }
    fs.copyFileSync(src, dst);
    fs.chmodSync(dst, 0o700);
    console.log(`[Pixel Agents] Codex hook script installed at ${dst}`);
  } catch (e) {
    console.error(`[Pixel Agents] Failed to copy Codex hook script: ${e}`);
  }
}

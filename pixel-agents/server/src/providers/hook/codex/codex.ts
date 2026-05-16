import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BASH_COMMAND_DISPLAY_MAX_LENGTH } from '../../../constants.js';
import type { AgentEvent, HookProvider } from '../../../provider.js';
import {
  areHooksInstalled as installerAreHooksInstalled,
  copyHookScript,
  installHooks as installerInstallHooks,
  uninstallHooks as installerUninstallHooks,
} from './codexHookInstaller.js';

// ── Tool name helpers ────────────────────────────────────────────────────────

/** Extract display name from an MCP tool (mcp__server__tool → tool). */
function mcpDisplayName(toolName: string): string {
  const parts = toolName.split('__');
  return parts[parts.length - 1] ?? toolName;
}

/**
 * Parse exec_command arguments to extract the shell command string.
 * Codex passes arguments as a JSON string: `{ "cmd": "ls -la" }`.
 */
function extractExecCmd(input: unknown): string | null {
  if (typeof input === 'object' && input !== null && 'cmd' in input) {
    const cmd = (input as Record<string, unknown>).cmd;
    if (typeof cmd === 'string') return cmd;
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as Record<string, unknown>;
      if (typeof parsed.cmd === 'string') return parsed.cmd;
    } catch {
      return input;
    }
  }
  return null;
}

// ── formatToolStatus ─────────────────────────────────────────────────────────

export function formatToolStatus(toolName: string, input?: unknown): string {
  const inp = (input ?? {}) as Record<string, unknown>;

  switch (toolName) {
    case 'exec_command': {
      const cmd = extractExecCmd(inp.arguments ?? inp) ?? '';
      const display =
        cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH
          ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '…'
          : cmd;
      return display ? `Running: ${display}` : 'Running command';
    }

    case 'apply_patch':
      // Codex's apply_patch is used for file edits; patch content is in arguments.
      // Extract the first filename from the patch header when available.
      return extractPatchFilename(inp.arguments) ?? 'Editing file';

    default:
      if (toolName.startsWith('mcp__')) {
        return `Using ${mcpDisplayName(toolName)}`;
      }
      return `Using ${toolName}`;
  }
}

/** Try to pull the first modified filename from a unified diff patch. */
function extractPatchFilename(arguments_: unknown): string | null {
  const raw = typeof arguments_ === 'string' ? arguments_ : JSON.stringify(arguments_);
  const match = /^[+-]{3}\s+([^\s]+)/m.exec(raw);
  if (!match) return null;
  const name = match[1].replace(/^[ab]\//, '');
  return `Editing ${path.basename(name)}`;
}

// ── Transcript line parsing (Codex JSONL format from euphony) ────────────────

function safeParseJSON(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Parse one line of a Codex session JSONL file into an AgentEvent.
 * Codex JSONL format:
 *   { "timestamp": "...", "type": "response_item|event_msg|session_meta|...", "payload": {...} }
 */
export function parseTranscriptLine(line: string): AgentEvent | null {
  let record: { type?: string; payload?: Record<string, unknown> };
  try {
    record = JSON.parse(line) as typeof record;
  } catch {
    return null;
  }

  const { type, payload } = record;
  if (!type || !payload) return null;

  if (type === 'response_item') {
    const payloadType = payload.type as string | undefined;

    // Tool call started
    if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
      const toolName = (payload.name as string | undefined) ?? 'unknown';
      const callId = (payload.call_id as string | undefined) ?? `codex-${Date.now()}`;
      const rawArgs = payload.arguments ?? payload.input;
      const parsedInput =
        typeof rawArgs === 'string' ? (safeParseJSON(rawArgs) ?? { raw: rawArgs }) : rawArgs;
      return {
        kind: 'toolStart',
        toolId: callId,
        toolName,
        input: parsedInput as Record<string, unknown>,
      };
    }

    // Tool call completed
    if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
      const callId = (payload.call_id as string | undefined) ?? 'current';
      return { kind: 'toolEnd', toolId: callId };
    }
  }

  if (type === 'event_msg') {
    const payloadType = payload.type as string | undefined;

    if (payloadType === 'user_message') {
      return { kind: 'userTurn' };
    }

    // agent_message after no tools = text-only turn end
    if (payloadType === 'agent_message') {
      return { kind: 'turnEnd' };
    }
  }

  return null;
}

// ── Session dirs + launch command ────────────────────────────────────────────

function getProjectsRoot(): string {
  return path.join(os.homedir(), '.codex');
}

/**
 * Return candidate session directories for a given workspace path.
 * Codex stores sessions under ~/.codex/ — exact sub-path structure varies
 * by CLI version. We return the root and let the scanner find JSONL files.
 * transcript_path from hooks is the authoritative source when hooks are active.
 */
function getSessionDirs(workspacePath: string): string[] {
  const codexRoot = getProjectsRoot();

  // Try workspace-keyed subdir first (mirrors Claude's convention), then root
  const encoded = workspacePath.replace(/[^a-zA-Z0-9-]/g, '-');
  const workspaceDir = path.join(codexRoot, 'projects', encoded);

  const candidates = [codexRoot];
  if (fs.existsSync(workspaceDir)) {
    candidates.unshift(workspaceDir);
  }
  return candidates;
}

/**
 * Build the CLI command to launch Codex for a given session.
 * Codex doesn't accept a pre-supplied session ID; the session_id comes from
 * the SessionStart hook after launch. We pass cwd via env so the terminal
 * opens in the right directory.
 */
function buildLaunchCommand(
  _sessionId: string,
  cwd: string,
): { command: string; args: string[]; env?: Record<string, string> } {
  return { command: 'codex', args: [], env: { PWD: cwd } };
}

// ── Installer wrappers ───────────────────────────────────────────────────────

function installHooks(_serverUrl: string, _authToken: string): Promise<void> {
  installerInstallHooks();
  return Promise.resolve();
}

function uninstallHooks(): Promise<void> {
  installerUninstallHooks();
  return Promise.resolve();
}

function areHooksInstalled(): Promise<boolean> {
  return Promise.resolve(installerAreHooksInstalled());
}

// ── The provider ─────────────────────────────────────────────────────────────

function normalizeHookEvent(
  raw: Record<string, unknown>,
): { sessionId: string; event: AgentEvent } | null {
  const eventName = raw.hook_event_name;
  const sessionId = raw.session_id;
  if (typeof eventName !== 'string' || typeof sessionId !== 'string') return null;

  switch (eventName) {
    case 'PreToolUse': {
      const toolName = typeof raw.tool_name === 'string' ? raw.tool_name : '';
      const toolInput =
        typeof raw.tool_input === 'object' && raw.tool_input !== null
          ? (raw.tool_input as Record<string, unknown>)
          : {};
      return {
        sessionId,
        event: {
          kind: 'toolStart',
          toolId: `hook-${Date.now()}`,
          toolName,
          input: toolInput,
        },
      };
    }

    case 'PostToolUse':
      return { sessionId, event: { kind: 'toolEnd', toolId: 'current' } };

    case 'Stop':
      return { sessionId, event: { kind: 'turnEnd' } };

    case 'UserPromptSubmit':
      return { sessionId, event: { kind: 'userTurn' } };

    case 'PermissionRequest':
      return { sessionId, event: { kind: 'permissionRequest' } };

    case 'SessionStart':
      return {
        sessionId,
        event: {
          kind: 'sessionStart',
          source: typeof raw.source === 'string' ? raw.source : undefined,
        },
      };

    // Codex has no SessionEnd — session termination is inferred via Stop + timeout
    default:
      return null;
  }
}

export const codexProvider: HookProvider = {
  kind: 'hook',
  id: 'codex',
  displayName: 'Codex',

  normalizeHookEvent,

  installHooks,
  uninstallHooks,
  areHooksInstalled,

  formatToolStatus,
  parseTranscriptLine,

  // exec_command is the Codex equivalent of Bash; apply_patch covers Edit/Write.
  // Neither triggers a permission timer by default.
  permissionExemptTools: new Set(['exec_command', 'apply_patch']),
  subagentToolNames: new Set<string>(), // Codex has no SubagentStart/Stop events

  getProjectsRoot,
  getSessionDirs,
  sessionFilePattern: '*.jsonl',
  buildLaunchCommand,
};

export { copyHookScript };

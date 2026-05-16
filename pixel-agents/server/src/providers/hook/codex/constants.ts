/**
 * Codex-specific constants. Kept separate from server/src/constants.ts so a
 * single-provider build doesn't accidentally pull in Codex unless it's active.
 */

/** Output filename after esbuild compiles codex-hook.ts → CJS */
export const CODEX_HOOK_SCRIPT_NAME = 'codex-hook.js';

/** Hook events supported by the Codex CLI.
 *  Codex exposes 6 events (vs Claude's 11) — notably missing: SessionEnd,
 *  SubagentStart/Stop, Notification. Session-end is inferred via Stop + timeout. */
export const CODEX_HOOK_EVENTS = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'UserPromptSubmit',
  'Stop',
] as const;

export type CodexHookEvent = (typeof CODEX_HOOK_EVENTS)[number];

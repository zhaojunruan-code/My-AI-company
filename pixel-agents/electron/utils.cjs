'use strict';

/**
 * Pure utility functions extracted from main.cjs for unit-testability.
 * No Electron API imports, no file I/O — only data transformation logic.
 */

const path = require('node:path');

// ── Layout validation ─────────────────────────────────────────────────────────

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLayout(value) {
  return (
    isObject(value) &&
    value.version === 1 &&
    typeof value.cols === 'number' &&
    typeof value.rows === 'number' &&
    Array.isArray(value.tiles) &&
    Array.isArray(value.furniture)
  );
}

// ── Workspace folder sanitisation ────────────────────────────────────────────

function sanitizeWorkspaceFolders(folders, existsSync, statSync) {
  if (!Array.isArray(folders)) return [];
  return folders
    .filter((folder) => isObject(folder) && typeof folder.path === 'string')
    .map((folder) => {
      const folderPath = path.resolve(folder.path);
      return {
        name:
          typeof folder.name === 'string' && folder.name.trim()
            ? folder.name
            : path.basename(folderPath),
        path: folderPath,
      };
    })
    .filter((folder) => {
      try {
        return existsSync(folder.path) && statSync(folder.path).isDirectory();
      } catch {
        return false;
      }
    });
}

// ── Persisted agent sanitisation ─────────────────────────────────────────────

function sanitizePersistedAgents(savedAgents) {
  if (!Array.isArray(savedAgents)) return [];
  return savedAgents
    .filter((agent) => isObject(agent) && typeof agent.id === 'number')
    .map((agent) => ({
      id: agent.id,
      sessionId: typeof agent.sessionId === 'string' ? agent.sessionId : '',
      isExternal: agent.isExternal === true,
      jsonlFile: typeof agent.jsonlFile === 'string' ? agent.jsonlFile : '',
      projectDir: typeof agent.projectDir === 'string' ? agent.projectDir : '',
      folderName: typeof agent.folderName === 'string' ? agent.folderName : undefined,
      teamName: typeof agent.teamName === 'string' ? agent.teamName : undefined,
      agentName: typeof agent.agentName === 'string' ? agent.agentName : undefined,
      isTeamLead: typeof agent.isTeamLead === 'boolean' ? agent.isTeamLead : undefined,
      leadAgentId: typeof agent.leadAgentId === 'number' ? agent.leadAgentId : undefined,
      teamUsesTmux: typeof agent.teamUsesTmux === 'boolean' ? agent.teamUsesTmux : undefined,
    }))
    .filter((agent) => agent.sessionId || agent.jsonlFile);
}

// ── Desktop state helpers ────────────────────────────────────────────────────

const DEFAULT_DESKTOP_STATE = Object.freeze({
  soundEnabled: true,
  language: '',
  lastSeenVersion: '',
  watchAllSessions: false,
  alwaysShowLabels: false,
  hooksEnabled: false,
  hooksInfoShown: true,
  workspaceFolders: [],
  agents: [],
  agentSeats: {},
});

function mergeDesktopState(saved) {
  return {
    ...DEFAULT_DESKTOP_STATE,
    ...saved,
    workspaceFolders: [],  // caller resolves via sanitizeWorkspaceFolders
    agents: sanitizePersistedAgents(saved.agents),
    agentSeats:
      saved.agentSeats && typeof saved.agentSeats === 'object' && !Array.isArray(saved.agentSeats)
        ? saved.agentSeats
        : {},
  };
}

module.exports = {
  isObject,
  isLayout,
  sanitizeWorkspaceFolders,
  sanitizePersistedAgents,
  DEFAULT_DESKTOP_STATE,
  mergeDesktopState,
};

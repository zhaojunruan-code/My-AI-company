const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// electron-updater: only active in packaged builds to avoid noise during development
let autoUpdater = null;
if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.logger = null; // suppress verbose logs; errors surface via dialog
  } catch {
    // Graceful degradation: app still works without auto-update capability
  }
}

const { version: APP_VERSION } = require('../package.json');
const {
  isObject,
  isLayout,
  sanitizeWorkspaceFolders: _sanitizeWorkspaceFolders,
  sanitizePersistedAgents,
  DEFAULT_DESKTOP_STATE,
  mergeDesktopState,
} = require('./utils.cjs');
const {
  DISMISSED_COOLDOWN_MS,
  EXTERNAL_ACTIVE_THRESHOLD_MS,
  EXTERNAL_SCAN_INTERVAL_MS,
  EXTERNAL_STALE_CHECK_INTERVAL_MS,
  FILE_WATCHER_POLL_INTERVAL_MS,
  GLOBAL_SCAN_ACTIVE_MAX_AGE_MS,
  GLOBAL_SCAN_ACTIVE_MIN_SIZE,
  HookEventHandler,
  installHooks,
  JSONL_POLL_INTERVAL_MS,
  PixelAgentsServer,
  claudeProvider,
  copyHookScript,
  processTranscriptLine,
  setHookProvider,
  uninstallHooks,
} = require('../dist/electron/runtime.cjs');

const APP_PROTOCOL = 'pixel-agents';
const APP_HOST = 'app';
const DATA_DIR_NAME = '.pixel-agents';
const CONFIG_FILE_NAME = 'config.json';
const DESKTOP_STATE_FILE_NAME = 'desktop-state.json';
const LAYOUT_FILE_NAME = 'layout.json';
const LAYOUT_REVISION_KEY = 'layoutRevision';
const WEBVIEW_DIST_DIR = path.resolve(__dirname, '../dist/webview');
const DEV_SERVER_URL = process.env.PIXEL_AGENTS_ELECTRON_DEV_URL;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// DEFAULT_DESKTOP_STATE, isObject, isLayout, sanitizePersistedAgents imported from utils.cjs

function sanitizeWorkspaceFolders(folders) {
  return _sanitizeWorkspaceFolders(folders, fs.existsSync, fs.statSync);
}

let mainWindow = null;
let nextAgentId = 1;
let nextTerminalIndex = 1;
const activeAgentId = { current: null };
const watchAllSessions = { current: false };
const hooksEnabled = { current: false };
const agents = new Map();
const knownJsonlFiles = new Set();
const dismissedJsonlFiles = new Map();
const seededMtimes = new Map();
const trackedProjectDirs = new Set();
const pollingTimers = new Map();
const waitingTimers = new Map();
const permissionTimers = new Map();
const jsonlPollTimers = new Map();
let externalScanTimer = null;
let staleCheckTimer = null;
let pixelAgentsServer = null;
let hookEventHandler = null;

function appendStartupLog(message) {
  try {
    const dir = path.join(os.homedir(), DATA_DIR_NAME);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'electron-main.log'),
      `[${new Date().toISOString()}] ${message}\n`,
      'utf8',
    );
  } catch {
    // Logging must never break app startup.
  }
}

process.on('uncaughtException', (error) => {
  appendStartupLog(`uncaughtException: ${error.stack || error.message}`);
  throw error;
});

process.on('unhandledRejection', (reason) => {
  appendStartupLog(
    `unhandledRejection: ${
      reason instanceof Error ? reason.stack || reason.message : String(reason)
    }`,
  );
});

function createTextResponse(message, status = 500) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function getStaticFilePath(requestUrl) {
  const url = new URL(requestUrl);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(WEBVIEW_DIST_DIR, relativePath);
  const allowedRoot = WEBVIEW_DIST_DIR + path.sep;

  if (filePath !== WEBVIEW_DIST_DIR && !filePath.startsWith(allowedRoot)) {
    return null;
  }

  return filePath;
}

function registerStaticProtocol() {
  appendStartupLog(`registerStaticProtocol dist=${WEBVIEW_DIST_DIR}`);
  protocol.handle(APP_PROTOCOL, (request) => {
    const filePath = getStaticFilePath(request.url);

    if (!filePath || !fs.existsSync(filePath)) {
      return createTextResponse('Pixel Agents asset not found.', 404);
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function isAllowedAppNavigation(url) {
  if (DEV_SERVER_URL) {
    return url.startsWith(DEV_SERVER_URL);
  }

  return url.startsWith(`${APP_PROTOCOL}://${APP_HOST}/`);
}

async function loadRenderer(window) {
  if (DEV_SERVER_URL) {
    await window.loadURL(DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await window.loadURL(`${APP_PROTOCOL}://${APP_HOST}/index.html`);
}

function createMainWindow() {
  appendStartupLog('createMainWindow');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Pixel Agents',
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    appendStartupLog('ready-to-show');
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });

  void loadRenderer(mainWindow).catch((error) => {
    appendStartupLog(`loadRenderer failed: ${error.stack || error.message}`);
    console.error('[Pixel Agents] Failed to load Electron renderer:', error);
  });
}

function sendToRenderer(message) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('pixel-agents:host-message', message);
}

function showError(title, message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    void dialog.showMessageBox(mainWindow, { type: 'error', title, message });
  } else {
    dialog.showErrorBox(title, message);
  }
}

function getDataDir() {
  return path.join(os.homedir(), DATA_DIR_NAME);
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`[Pixel Agents] Failed to read ${filePath}:`, error);
    return fallback;
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function getConfigFilePath() {
  return path.join(getDataDir(), CONFIG_FILE_NAME);
}

function readConfig() {
  const config = readJson(getConfigFilePath(), { externalAssetDirectories: [] });
  return {
    externalAssetDirectories: Array.isArray(config.externalAssetDirectories)
      ? config.externalAssetDirectories.filter((dir) => typeof dir === 'string')
      : [],
  };
}

function writeConfig(config) {
  writeJson(getConfigFilePath(), {
    externalAssetDirectories: Array.isArray(config.externalAssetDirectories)
      ? config.externalAssetDirectories
      : [],
  });
}

function getDesktopStateFilePath() {
  return path.join(getDataDir(), DESKTOP_STATE_FILE_NAME);
}

function readDesktopState() {
  const saved = readJson(getDesktopStateFilePath(), {});
  const state = mergeDesktopState(saved);
  state.workspaceFolders = sanitizeWorkspaceFolders(saved.workspaceFolders);
  return state;
}

function writeDesktopState(updates) {
  const state = { ...readDesktopState(), ...updates };
  writeJson(getDesktopStateFilePath(), state);
  return state;
}

function getLayoutFilePath() {
  return path.join(getDataDir(), LAYOUT_FILE_NAME);
}


function readLayoutFromFile() {
  const layout = readJson(getLayoutFilePath(), null);
  return isLayout(layout) ? layout : null;
}

function writeLayoutToFile(layout) {
  if (!isLayout(layout)) {
    throw new Error('Invalid Pixel Agents layout.');
  }

  writeJson(getLayoutFilePath(), layout);
}

function getAssetsDir() {
  if (DEV_SERVER_URL) {
    return path.resolve(__dirname, '../webview-ui/public/assets');
  }

  return path.join(WEBVIEW_DIST_DIR, 'assets');
}

function loadDefaultLayout() {
  const assetsDir = getAssetsDir();
  let bestRevision = 0;
  let bestPath = null;

  try {
    if (fs.existsSync(assetsDir)) {
      for (const file of fs.readdirSync(assetsDir)) {
        const match = /^default-layout-(\d+)\.json$/.exec(file);
        if (!match) {
          continue;
        }

        const revision = Number.parseInt(match[1], 10);
        if (revision > bestRevision) {
          bestRevision = revision;
          bestPath = path.join(assetsDir, file);
        }
      }
    }

    if (!bestPath) {
      const fallbackPath = path.join(assetsDir, 'default-layout.json');
      if (fs.existsSync(fallbackPath)) {
        bestPath = fallbackPath;
      }
    }

    if (!bestPath) {
      return null;
    }

    const layout = JSON.parse(fs.readFileSync(bestPath, 'utf8'));
    if (bestRevision > 0 && isObject(layout) && !layout[LAYOUT_REVISION_KEY]) {
      layout[LAYOUT_REVISION_KEY] = bestRevision;
    }

    return isLayout(layout) ? layout : null;
  } catch (error) {
    console.error('[Pixel Agents] Failed to load Electron default layout:', error);
    return null;
  }
}

function loadLayout() {
  const savedLayout = readLayoutFromFile();
  const defaultLayout = loadDefaultLayout();

  if (savedLayout) {
    const savedRevision = Number(savedLayout[LAYOUT_REVISION_KEY] ?? 0);
    const defaultRevision = Number(defaultLayout?.[LAYOUT_REVISION_KEY] ?? 0);
    if (defaultLayout && defaultRevision > savedRevision) {
      writeLayoutToFile(defaultLayout);
      return { layout: defaultLayout, wasReset: true };
    }

    return { layout: savedLayout, wasReset: false };
  }

  if (defaultLayout) {
    writeLayoutToFile(defaultLayout);
    return { layout: defaultLayout, wasReset: false };
  }

  return { layout: null, wasReset: false };
}

function sanitizeWorkspaceFolders(folders) {
  if (!Array.isArray(folders)) {
    return [];
  }

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
        return fs.existsSync(folder.path) && fs.statSync(folder.path).isDirectory();
      } catch {
        return false;
      }
    });
}


function rememberWorkspaceFolder(folderPath) {
  const resolved = path.resolve(folderPath);
  const folder = { name: path.basename(resolved) || resolved, path: resolved };
  const state = writeDesktopState({ workspaceFolders: [folder] });
  sendToRenderer({ type: 'workspaceFolders', folders: state.workspaceFolders });
  return folder;
}

async function promptForWorkspaceFolder() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a project folder',
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  return rememberWorkspaceFolder(result.filePaths[0]);
}

async function resolveWorkspaceFolder(folderPath) {
  if (typeof folderPath === 'string' && folderPath.trim()) {
    const resolved = path.resolve(folderPath);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return rememberWorkspaceFolder(resolved);
    }

    showError('Pixel Agents', `Project folder does not exist:\n${resolved}`);
    return null;
  }

  const [firstSavedFolder] = readDesktopState().workspaceFolders;
  if (firstSavedFolder) {
    return firstSavedFolder;
  }

  return promptForWorkspaceFolder();
}

const rendererWebview = Object.freeze({
  postMessage(message) {
    sendToRenderer(message);
  },
});

function getProviderProjectsRoot() {
  return claudeProvider.getProjectsRoot?.() ?? path.join(os.homedir(), '.claude', 'projects');
}

function getProjectDirPath(cwd) {
  const workspacePath = cwd || readDesktopState().workspaceFolders[0]?.path || os.homedir();
  const [projectDir] = claudeProvider.getSessionDirs
    ? claudeProvider.getSessionDirs(workspacePath)
    : [path.join(getProviderProjectsRoot(), workspacePath.replace(/[^a-zA-Z0-9-]/g, '-'))];
  return projectDir;
}

function getFolderNameForPath(folderPath) {
  const state = readDesktopState();
  const resolved = path.resolve(folderPath).toLowerCase();
  const match = state.workspaceFolders.find(
    (folder) => path.resolve(folder.path).toLowerCase() === resolved,
  );
  return match?.name ?? path.basename(folderPath);
}

function createAgentState({
  id,
  sessionId,
  projectDir,
  jsonlFile,
  isExternal = false,
  folderName,
  fileOffset = 0,
  hookDelivered = false,
  hooksOnly = false,
  teamName,
  agentName,
  isTeamLead,
  leadAgentId,
  teamUsesTmux,
}) {
  return {
    id,
    sessionId,
    isExternal,
    projectDir,
    jsonlFile,
    fileOffset,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: Date.now(),
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    folderName,
    hookDelivered,
    hooksOnly,
    inputTokens: 0,
    outputTokens: 0,
    teamName,
    agentName,
    isTeamLead,
    leadAgentId,
    teamUsesTmux,
  };
}

function persistAgents() {
  const persisted = [...agents.values()].map((agent) => ({
    id: agent.id,
    sessionId: agent.sessionId,
    isExternal: agent.isExternal || undefined,
    jsonlFile: agent.jsonlFile,
    projectDir: agent.projectDir,
    folderName: agent.folderName,
    teamName: agent.teamName,
    agentName: agent.agentName,
    isTeamLead: agent.isTeamLead,
    leadAgentId: agent.leadAgentId,
    teamUsesTmux: agent.teamUsesTmux,
  }));
  writeDesktopState({ agents: persisted });
}

function registerAgentHook(agent) {
  if (agent.sessionId) {
    hookEventHandler?.registerAgent(agent.sessionId, agent.id);
  }
}

function unregisterAgentHook(agent) {
  if (agent.sessionId) {
    hookEventHandler?.unregisterAgent(agent.sessionId);
  }
}

function sendExistingAgents() {
  const state = readDesktopState();
  const agentIds = [...agents.keys()].sort((a, b) => a - b);
  const folderNames = {};
  const externalAgents = {};

  for (const [id, agent] of agents) {
    if (agent.folderName) {
      folderNames[id] = agent.folderName;
    }
    if (agent.isExternal) {
      externalAgents[id] = true;
    }
  }

  sendToRenderer({
    type: 'existingAgents',
    agents: agentIds,
    agentMeta: state.agentSeats,
    folderNames,
    externalAgents,
  });
}

function sendCurrentAgentStatuses() {
  for (const [agentId, agent] of agents) {
    for (const [toolId, status] of agent.activeToolStatuses) {
      sendToRenderer({
        type: 'agentToolStart',
        id: agentId,
        toolId,
        status,
        toolName: agent.activeToolNames.get(toolId) ?? '',
      });
    }
    if (agent.isWaiting) {
      sendToRenderer({ type: 'agentStatus', id: agentId, status: 'waiting' });
    }
    if (agent.permissionSent) {
      sendToRenderer({ type: 'agentToolPermission', id: agentId });
    }
    if (agent.teamName) {
      sendToRenderer({
        type: 'agentTeamInfo',
        id: agentId,
        teamName: agent.teamName,
        agentName: agent.agentName,
        isTeamLead: agent.isTeamLead,
        leadAgentId: agent.leadAgentId,
        teamUsesTmux: agent.teamUsesTmux,
      });
    }
    if (agent.inputTokens || agent.outputTokens) {
      sendToRenderer({
        type: 'agentTokenUsage',
        id: agentId,
        inputTokens: agent.inputTokens,
        outputTokens: agent.outputTokens,
      });
    }
  }
}

function stopAgentTimers(agentId) {
  const pollTimer = pollingTimers.get(agentId);
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollingTimers.delete(agentId);

  const waitingTimer = waitingTimers.get(agentId);
  if (waitingTimer) {
    clearTimeout(waitingTimer);
  }
  waitingTimers.delete(agentId);

  const permissionTimer = permissionTimers.get(agentId);
  if (permissionTimer) {
    clearTimeout(permissionTimer);
  }
  permissionTimers.delete(agentId);

  const jsonlPollTimer = jsonlPollTimers.get(agentId);
  if (jsonlPollTimer) {
    clearInterval(jsonlPollTimer);
  }
  jsonlPollTimers.delete(agentId);
}

function removeAgent(agentId, { dismiss = false } = {}) {
  const agent = agents.get(agentId);
  if (!agent) {
    return;
  }

  if (dismiss && agent.jsonlFile) {
    dismissedJsonlFiles.set(agent.jsonlFile, Date.now());
  }
  unregisterAgentHook(agent);
  stopAgentTimers(agentId);
  agents.delete(agentId);
  if (activeAgentId.current === agentId) {
    activeAgentId.current = null;
  }
  persistAgents();
  sendToRenderer({ type: 'agentClosed', id: agentId });
}

function readNewLines(agentId) {
  const agent = agents.get(agentId);
  if (!agent || !agent.jsonlFile) {
    return;
  }

  try {
    const stat = fs.statSync(agent.jsonlFile);
    if (stat.size <= agent.fileOffset) {
      return;
    }

    const bytesToRead = Math.min(stat.size - agent.fileOffset, 65_536);
    const buf = Buffer.alloc(bytesToRead);
    const fd = fs.openSync(agent.jsonlFile, 'r');
    try {
      fs.readSync(fd, buf, 0, buf.length, agent.fileOffset);
    } finally {
      fs.closeSync(fd);
    }
    agent.fileOffset += bytesToRead;

    const text = agent.lineBuffer + buf.toString('utf8');
    const lines = text.split('\n');
    agent.lineBuffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) {
        processTranscriptLine(
          agentId,
          line,
          agents,
          waitingTimers,
          permissionTimers,
          rendererWebview,
        );
      }
    }
    persistAgents();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    console.warn(`[Pixel Agents] Electron JSONL read failed for agent ${agentId}:`, error);
  }
}

function startFileWatching(agentId) {
  if (pollingTimers.has(agentId)) {
    return;
  }

  const interval = setInterval(() => {
    if (!agents.has(agentId)) {
      clearInterval(interval);
      pollingTimers.delete(agentId);
      return;
    }
    readNewLines(agentId);
  }, FILE_WATCHER_POLL_INTERVAL_MS);
  pollingTimers.set(agentId, interval);
}

function seedProjectDir(projectDir) {
  trackedProjectDirs.add(projectDir);
  try {
    for (const file of fs.readdirSync(projectDir)) {
      if (!file.endsWith('.jsonl')) {
        continue;
      }
      const fullPath = path.join(projectDir, file);
      knownJsonlFiles.add(fullPath);
      try {
        seededMtimes.set(fullPath, fs.statSync(fullPath).mtimeMs);
      } catch {
        // Ignore missing files from concurrent Claude writes.
      }
    }
  } catch {
    // Claude may not have created the project directory yet.
  }
}

function trackWorkspaceFolderProjectDirs() {
  const state = readDesktopState();
  const folders = state.workspaceFolders.length
    ? state.workspaceFolders
    : [{ path: os.homedir(), name: path.basename(os.homedir()) }];
  for (const folder of folders) {
    seedProjectDir(getProjectDirPath(folder.path));
  }
}

function adoptExternalSession(jsonlFile, projectDir, folderName, { hookDelivered = false } = {}) {
  const normalizedPath = path.resolve(jsonlFile);
  for (const agent of agents.values()) {
    if (path.resolve(agent.jsonlFile) === normalizedPath) {
      return agent;
    }
  }

  let fileOffset = 0;
  try {
    fileOffset = fs.statSync(jsonlFile).size;
  } catch {
    // Read from the beginning if stat fails; the next poll will settle it.
  }

  const id = nextAgentId++;
  const agent = createAgentState({
    id,
    sessionId: path.basename(jsonlFile, '.jsonl'),
    projectDir,
    jsonlFile,
    isExternal: true,
    folderName,
    fileOffset,
    hookDelivered,
  });
  agents.set(id, agent);
  knownJsonlFiles.add(jsonlFile);
  registerAgentHook(agent);
  persistAgents();
  sendToRenderer({ type: 'agentCreated', id, isExternal: true, folderName });
  startFileWatching(id);
  return agent;
}

function reassignAgentToFile(agentId, newFilePath, newSessionId) {
  const agent = agents.get(agentId);
  if (!agent) {
    return;
  }

  stopAgentTimers(agentId);
  unregisterAgentHook(agent);
  knownJsonlFiles.add(newFilePath);
  agent.sessionId = newSessionId || path.basename(newFilePath, '.jsonl');
  agent.jsonlFile = newFilePath;
  agent.projectDir = path.dirname(newFilePath);
  agent.fileOffset = 0;
  agent.lineBuffer = '';
  agent.lastDataAt = Date.now();
  agent.linesProcessed = 0;
  agent.pendingClear = false;
  registerAgentHook(agent);
  persistAgents();
  sendToRenderer({ type: 'agentToolsClear', id: agentId });
  sendToRenderer({ type: 'agentStatus', id: agentId, status: 'active' });
  startFileWatching(agentId);
  readNewLines(agentId);
}

function folderNameFromProjectDir(dirName) {
  const parts = dirName.replace(/^-+/, '').split('-');
  return parts[parts.length - 1] || dirName;
}

function isTrackedProjectDir(projectDir) {
  const normalized = path.resolve(projectDir).toLowerCase();
  for (const tracked of trackedProjectDirs) {
    if (path.resolve(tracked).toLowerCase() === normalized) {
      return true;
    }
  }
  return false;
}

function scanExternalDir(projectDir) {
  let files;
  try {
    files = fs
      .readdirSync(projectDir)
      .filter((file) => file.endsWith('.jsonl'))
      .map((file) => path.join(projectDir, file));
  } catch {
    return;
  }

  const now = Date.now();
  for (const file of files) {
    const seededMtime = seededMtimes.get(file);
    if (seededMtime !== undefined) {
      try {
        if (fs.statSync(file).mtimeMs > seededMtime) {
          seededMtimes.delete(file);
          knownJsonlFiles.delete(file);
        }
      } catch {
        // Ignore files that disappeared during scan.
      }
      continue;
    }

    if (knownJsonlFiles.has(file)) {
      continue;
    }

    const dismissedAt = dismissedJsonlFiles.get(file);
    if (dismissedAt && now - dismissedAt < DISMISSED_COOLDOWN_MS) {
      continue;
    }
    if (dismissedAt) {
      dismissedJsonlFiles.delete(file);
    }

    try {
      const stat = fs.statSync(file);
      if (now - stat.mtimeMs > EXTERNAL_ACTIVE_THRESHOLD_MS) {
        continue;
      }
    } catch {
      continue;
    }

    console.log(`[Pixel Agents] Electron detected external session ${path.basename(file)}`);
    adoptExternalSession(file, projectDir, folderNameFromProjectDir(path.basename(projectDir)));
  }
}

function scanGlobalProjectDirs() {
  const projectsRoot = getProviderProjectsRoot();
  let dirs;
  try {
    dirs = fs.readdirSync(projectsRoot, { withFileTypes: true }).filter((dir) => dir.isDirectory());
  } catch {
    return;
  }

  const now = Date.now();
  for (const dir of dirs) {
    const dirPath = path.join(projectsRoot, dir.name);
    if (isTrackedProjectDir(dirPath)) {
      continue;
    }

    let files;
    try {
      files = fs
        .readdirSync(dirPath)
        .filter((file) => file.endsWith('.jsonl'))
        .map((file) => path.join(dirPath, file));
    } catch {
      continue;
    }

    for (const file of files) {
      if (knownJsonlFiles.has(file)) {
        continue;
      }
      try {
        const stat = fs.statSync(file);
        if (stat.size < GLOBAL_SCAN_ACTIVE_MIN_SIZE) {
          continue;
        }
        if (now - stat.mtimeMs > GLOBAL_SCAN_ACTIVE_MAX_AGE_MS) {
          continue;
        }
      } catch {
        continue;
      }
      adoptExternalSession(file, dirPath, folderNameFromProjectDir(dir.name));
    }
  }
}

function startSessionScanners() {
  if (!externalScanTimer) {
    externalScanTimer = setInterval(() => {
      if (!hooksEnabled.current) {
        for (const dir of trackedProjectDirs) {
          scanExternalDir(dir);
        }
      }
      if (watchAllSessions.current) {
        scanGlobalProjectDirs();
      }
    }, EXTERNAL_SCAN_INTERVAL_MS);
  }

  if (!staleCheckTimer) {
    staleCheckTimer = setInterval(() => {
      if (hooksEnabled.current) {
        return;
      }
      for (const [id, agent] of agents) {
        if (!agent.isExternal || !agent.jsonlFile) {
          continue;
        }
        if (!fs.existsSync(agent.jsonlFile)) {
          removeAgent(id);
        }
      }
    }, EXTERNAL_STALE_CHECK_INTERVAL_MS);
  }
}

function restoreAgents() {
  for (const persisted of readDesktopState().agents) {
    if (agents.has(persisted.id)) {
      continue;
    }

    if (persisted.jsonlFile && !fs.existsSync(persisted.jsonlFile)) {
      continue;
    }

    let fileOffset = 0;
    if (persisted.jsonlFile) {
      try {
        fileOffset = fs.statSync(persisted.jsonlFile).size;
      } catch {
        fileOffset = 0;
      }
    }

    const agent = createAgentState({
      ...persisted,
      fileOffset,
      hookDelivered: false,
    });
    agents.set(agent.id, agent);
    if (agent.jsonlFile) {
      knownJsonlFiles.add(agent.jsonlFile);
      startFileWatching(agent.id);
    }
    registerAgentHook(agent);
    if (agent.id >= nextAgentId) {
      nextAgentId = agent.id + 1;
    }
  }
  persistAgents();
}

function getHookExtensionPath() {
  if (app.isPackaged) {
    const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked');
    if (fs.existsSync(path.join(unpackedRoot, 'dist', 'hooks'))) {
      return unpackedRoot;
    }
  }
  return path.resolve(__dirname, '..');
}

function syncHookInstallation(enabled, { uninstallWhenDisabled = true } = {}) {
  hooksEnabled.current = enabled;
  if (enabled) {
    copyHookScript(getHookExtensionPath());
    installHooks();
  } else if (uninstallWhenDisabled) {
    uninstallHooks();
  }
}

function initHookHandling() {
  setHookProvider(claudeProvider);
  hookEventHandler = new HookEventHandler(
    agents,
    waitingTimers,
    permissionTimers,
    () => rendererWebview,
    claudeProvider,
    watchAllSessions,
  );

  hookEventHandler.setLifecycleCallbacks({
    onExternalSessionDetected(sessionId, transcriptPath, cwd) {
      const projectDir = transcriptPath ? path.dirname(transcriptPath) : cwd;
      if (!projectDir || (!isTrackedProjectDir(projectDir) && !watchAllSessions.current)) {
        return;
      }

      const agent = transcriptPath
        ? adoptExternalSession(
            transcriptPath,
            path.dirname(transcriptPath),
            cwd ? getFolderNameForPath(cwd) : folderNameFromProjectDir(path.basename(projectDir)),
            { hookDelivered: true },
          )
        : null;
      if (agent) {
        unregisterAgentHook(agent);
        agent.sessionId = sessionId;
        agent.hookDelivered = true;
        registerAgentHook(agent);
        persistAgents();
      }
    },
    onSessionClear(agentId, newSessionId, newTranscriptPath) {
      if (newTranscriptPath) {
        reassignAgentToFile(agentId, newTranscriptPath, newSessionId);
      }
    },
    onSessionResume(transcriptPath) {
      dismissedJsonlFiles.delete(transcriptPath);
      seededMtimes.delete(transcriptPath);
      knownJsonlFiles.delete(transcriptPath);
    },
    onSessionEnd(agentId) {
      removeAgent(agentId, { dismiss: true });
    },
  });

  pixelAgentsServer = new PixelAgentsServer();
  pixelAgentsServer.onHookEvent((providerId, event) => {
    hookEventHandler?.handleEvent(providerId, event);
  });
  void pixelAgentsServer
    .start()
    .then((config) => {
      appendStartupLog(`server ready on port ${config.port}`);
      console.log(`[Pixel Agents] Electron server ready on port ${config.port}`);
      syncHookInstallation(readDesktopState().hooksEnabled, { uninstallWhenDisabled: false });
    })
    .catch((error) => {
      appendStartupLog(`server failed: ${error.stack || error.message || String(error)}`);
      console.error('[Pixel Agents] Failed to start Electron hook server:', error);
    });
}

function buildAgentLaunchCommand(sessionId, cwd, bypassPermissions) {
  const launch = claudeProvider.buildLaunchCommand
    ? claudeProvider.buildLaunchCommand(sessionId, cwd)
    : { command: 'claude', args: ['--session-id', sessionId] };
  const args = [...launch.args];
  // --dangerously-skip-permissions is Claude-specific; future providers handle via their own flags
  if (bypassPermissions) {
    args.push('--dangerously-skip-permissions');
  }
  return { command: launch.command, args };
}

// Linux: ordered list of terminal emulators with their argument builders
const LINUX_TERMINALS = [
  { bin: 'x-terminal-emulator', buildArgs: (cmd) => ['-e', 'sh', '-lc', cmd] },
  { bin: 'gnome-terminal',      buildArgs: (cmd) => ['--', 'sh', '-lc', cmd] },
  { bin: 'konsole',             buildArgs: (cmd) => ['-e', 'sh', '-lc', cmd] },
  { bin: 'xfce4-terminal',      buildArgs: (cmd) => ['-e', `sh -lc ${JSON.stringify(cmd)}`] },
  { bin: 'xterm',               buildArgs: (cmd) => ['-e', 'sh', '-lc', cmd] },
];

function findLinuxTerminal() {
  for (const terminal of LINUX_TERMINALS) {
    try {
      const result = childProcess.spawnSync('which', [terminal.bin], { encoding: 'utf8' });
      if (result.status === 0 && result.stdout.trim()) return terminal;
    } catch {
      // continue to next
    }
  }
  return null;
}

function launchAgentInExternalTerminal(cwd, sessionId, bypassPermissions) {
  const { command, args } = buildAgentLaunchCommand(sessionId, cwd, bypassPermissions);
  const quotedArgs = args.map((arg) => JSON.stringify(arg)).join(' ');

  if (process.platform === 'win32') {
    const child = childProcess.spawn('cmd.exe', ['/k', command, ...args], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return;
  }

  if (process.platform === 'darwin') {
    const shellCmd = `cd ${JSON.stringify(cwd)} && ${command} ${quotedArgs}`;
    const child = childProcess.spawn(
      'osascript',
      ['-e', `tell application "Terminal" to do script ${JSON.stringify(shellCmd)}`],
      { detached: true, stdio: 'ignore' },
    );
    child.unref();
    return;
  }

  // Linux: try terminal emulators in priority order
  const terminal = findLinuxTerminal();
  if (!terminal) {
    throw new Error(
      'No terminal emulator found. Install one of: x-terminal-emulator, gnome-terminal, konsole, xfce4-terminal, xterm',
    );
  }
  const shellCmd = `cd ${JSON.stringify(cwd)} && ${command} ${quotedArgs}; exec sh`;
  const child = childProcess.spawn(terminal.bin, terminal.buildArgs(shellCmd), {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function handleOpenClaude(message) {
  const folder = await resolveWorkspaceFolder(message.folderPath);
  if (!folder) {
    return;
  }

  const agentId = nextAgentId++;
  const terminalIndex = nextTerminalIndex++;
  const sessionId = crypto.randomUUID();
  const projectDir = getProjectDirPath(folder.path);
  const expectedFile = path.join(projectDir, `${sessionId}.jsonl`);

  try {
    launchAgentInExternalTerminal(folder.path, sessionId, message.bypassPermissions === true);
  } catch (error) {
    nextAgentId -= 1;
    showError(
      'Pixel Agents',
      `Failed to launch Claude Code from Electron.\n\n${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  seedProjectDir(projectDir);
  knownJsonlFiles.add(expectedFile);
  const agent = createAgentState({
    id: agentId,
    sessionId,
    projectDir,
    jsonlFile: expectedFile,
    isExternal: false,
    folderName: folder.name,
    fileOffset: 0,
  });
  agents.set(agentId, agent);
  activeAgentId.current = agentId;
  registerAgentHook(agent);
  persistAgents();

  const createdAt = Date.now();
  let pollCount = 0;
  const pollTimer = setInterval(() => {
    pollCount += 1;
    if (!agents.has(agentId)) {
      clearInterval(pollTimer);
      jsonlPollTimers.delete(agentId);
      return;
    }

    if (fs.existsSync(expectedFile)) {
      clearInterval(pollTimer);
      jsonlPollTimers.delete(agentId);
      startFileWatching(agentId);
      readNewLines(agentId);
      return;
    }

    if (pollCount <= 10 || !fs.existsSync(projectDir)) {
      return;
    }

    try {
      const candidates = fs
        .readdirSync(projectDir)
        .filter((file) => file.endsWith('.jsonl'))
        .map((file) => {
          const fullPath = path.join(projectDir, file);
          return { file: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
        })
        .filter((candidate) => candidate.mtime > createdAt)
        .sort((a, b) => b.mtime - a.mtime);
      if (candidates[0]) {
        clearInterval(pollTimer);
        jsonlPollTimers.delete(agentId);
        reassignAgentToFile(agentId, candidates[0].file);
      }
    } catch {
      // Ignore concurrent filesystem changes while Claude is starting.
    }
  }, JSONL_POLL_INTERVAL_MS);
  jsonlPollTimers.set(agentId, pollTimer);

  sendToRenderer({ type: 'agentCreated', id: agentId, folderName: folder.name });
  sendToRenderer({ type: 'agentSelected', id: agentId });
  sendToRenderer({ type: 'agentStatus', id: agentId, status: 'active' });
  console.log(
    `[Pixel Agents] Electron launched Claude Code #${terminalIndex} (${sessionId}) in ${folder.path}`,
  );
}

function sendInitialState() {
  const state = readDesktopState();
  const config = readConfig();
  const layout = loadLayout();
  watchAllSessions.current = state.watchAllSessions;
  hooksEnabled.current = state.hooksEnabled;
  trackWorkspaceFolderProjectDirs();
  restoreAgents();
  startSessionScanners();

  sendToRenderer({ type: 'workspaceFolders', folders: state.workspaceFolders });
  sendToRenderer({
    type: 'settingsLoaded',
    soundEnabled: state.soundEnabled,
    language: state.language,
    lastSeenVersion: state.lastSeenVersion,
    extensionVersion: APP_VERSION,
    watchAllSessions: state.watchAllSessions,
    alwaysShowLabels: state.alwaysShowLabels,
    hooksEnabled: state.hooksEnabled,
    hooksInfoShown: state.hooksInfoShown,
    externalAssetDirectories: config.externalAssetDirectories,
  });
  sendExistingAgents();
  sendToRenderer({
    type: 'layoutLoaded',
    layout: layout.layout,
    wasReset: layout.wasReset,
  });
  sendCurrentAgentStatuses();
}

async function handleImportLayout() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Pixel Agents Layout',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });

  if (result.canceled || !result.filePaths[0]) {
    return;
  }

  try {
    const imported = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    writeLayoutToFile(imported);
    sendToRenderer({ type: 'layoutLoaded', layout: imported });
  } catch (error) {
    showError(
      'Pixel Agents',
      `Invalid layout file.\n\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function handleExportLayout() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const layout = readLayoutFromFile() ?? loadDefaultLayout();
  if (!layout) {
    showError('Pixel Agents', 'No layout is available to export.');
    return;
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Pixel Agents Layout',
    defaultPath: 'pixel-agents-layout.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return;
  }

  try {
    fs.writeFileSync(result.filePath, JSON.stringify(layout, null, 2), 'utf8');
  } catch (error) {
    showError(
      'Pixel Agents',
      `Failed to export layout.\n\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function handleAddExternalAssetDirectory() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Pixel Agents Asset Directory',
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths[0]) {
    return;
  }

  const dir = path.resolve(result.filePaths[0]);
  const config = readConfig();
  if (!config.externalAssetDirectories.map((value) => path.resolve(value)).includes(dir)) {
    config.externalAssetDirectories.push(dir);
    writeConfig(config);
  }

  sendToRenderer({
    type: 'externalAssetDirectoriesUpdated',
    dirs: config.externalAssetDirectories,
  });
}

function handleRemoveExternalAssetDirectory(message) {
  if (typeof message.path !== 'string') {
    return;
  }

  const removedPath = path.resolve(message.path);
  const config = readConfig();
  config.externalAssetDirectories = config.externalAssetDirectories.filter(
    (dir) => path.resolve(dir) !== removedPath,
  );
  writeConfig(config);
  sendToRenderer({
    type: 'externalAssetDirectoriesUpdated',
    dirs: config.externalAssetDirectories,
  });
}

async function handleOpenSessionsFolder() {
  const sessionsDir = getProviderProjectsRoot();
  fs.mkdirSync(sessionsDir, { recursive: true });
  const error = await shell.openPath(sessionsDir);
  if (error) {
    showError('Pixel Agents', error);
  }
}

function updateSetting(key, value) {
  writeDesktopState({ [key]: value });
}

function isRendererMessage(message) {
  return isObject(message) && typeof message.type === 'string';
}

function registerIpcHandlers() {
  ipcMain.on('pixel-agents:renderer-message', (_event, message) => {
    if (!isRendererMessage(message)) {
      return;
    }

    void handleRendererMessage(message).catch((error) => {
      console.error('[Pixel Agents] Electron message handler failed:', error);
      showError(
        'Pixel Agents',
        error instanceof Error ? error.message : 'Electron message handler failed.',
      );
    });
  });
}

async function handleRendererMessage(message) {
  switch (message.type) {
    case 'webviewReady':
      sendInitialState();
      break;
    case 'openClaude':
      await handleOpenClaude(message);
      break;
    case 'focusAgent':
      if (typeof message.id === 'number' && agents.has(message.id)) {
        activeAgentId.current = message.id;
        sendToRenderer({ type: 'agentSelected', id: message.id });
      }
      break;
    case 'closeAgent':
      if (typeof message.id === 'number') {
        removeAgent(message.id, { dismiss: true });
      }
      break;
    case 'requestDiagnostics':
      sendToRenderer({
        type: 'agentDiagnostics',
        agents: [...agents.values()].map((agent) => {
          let jsonlExists = false;
          let fileSize = 0;
          try {
            const stat = fs.statSync(agent.jsonlFile);
            jsonlExists = true;
            fileSize = stat.size;
          } catch {
            // File may not exist yet while Claude starts.
          }
          return {
            id: agent.id,
            projectDir: agent.projectDir,
            projectDirExists: agent.projectDir ? fs.existsSync(agent.projectDir) : false,
            jsonlFile: agent.jsonlFile,
            jsonlExists,
            fileSize,
            fileOffset: agent.fileOffset,
            lastDataAt: agent.lastDataAt,
            linesProcessed: agent.linesProcessed,
          };
        }),
      });
      break;
    case 'saveLayout':
      writeLayoutToFile(message.layout);
      break;
    case 'saveAgentSeats':
      if (isObject(message.seats)) {
        updateSetting('agentSeats', message.seats);
      }
      break;
    case 'setSoundEnabled':
      updateSetting('soundEnabled', message.enabled === true);
      break;
    case 'setLanguage':
      if (message.language === 'zh' || message.language === 'en') {
        updateSetting('language', message.language);
      }
      break;
    case 'setLastSeenVersion':
      if (typeof message.version === 'string') {
        updateSetting('lastSeenVersion', message.version);
      }
      break;
    case 'setAlwaysShowLabels':
      updateSetting('alwaysShowLabels', message.enabled === true);
      break;
    case 'setHooksEnabled':
      updateSetting('hooksEnabled', message.enabled === true);
      syncHookInstallation(message.enabled === true);
      break;
    case 'setHooksInfoShown':
      updateSetting('hooksInfoShown', true);
      break;
    case 'setWatchAllSessions':
      watchAllSessions.current = message.enabled === true;
      updateSetting('watchAllSessions', watchAllSessions.current);
      break;
    case 'importLayout':
      await handleImportLayout();
      break;
    case 'exportLayout':
      await handleExportLayout();
      break;
    case 'addExternalAssetDirectory':
      await handleAddExternalAssetDirectory();
      break;
    case 'removeExternalAssetDirectory':
      handleRemoveExternalAssetDirectory(message);
      break;
    case 'openSessionsFolder':
      await handleOpenSessionsFolder();
      break;
    default:
      console.warn(`[Pixel Agents] Unhandled Electron renderer message: ${message.type}`);
  }
}

appendStartupLog(`main module loaded argv=${JSON.stringify(process.argv)}`);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  appendStartupLog('single instance lock denied; quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(() => {
    appendStartupLog('app ready');
    registerStaticProtocol();
    initHookHandling();
    registerIpcHandlers();
    createMainWindow();

    // Check for updates silently after window is ready; only in packaged builds
    if (autoUpdater) {
      autoUpdater.on('error', (err) => {
        appendStartupLog(`auto-update error: ${err.message}`);
      });
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        appendStartupLog(`auto-update check failed: ${err.message}`);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    for (const id of [...agents.keys()]) {
      stopAgentTimers(id);
    }
    if (externalScanTimer) {
      clearInterval(externalScanTimer);
      externalScanTimer = null;
    }
    if (staleCheckTimer) {
      clearInterval(staleCheckTimer);
      staleCheckTimer = null;
    }
    pixelAgentsServer?.stop();
  });
}

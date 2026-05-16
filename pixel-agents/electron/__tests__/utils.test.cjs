'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  isObject,
  isLayout,
  sanitizeWorkspaceFolders,
  sanitizePersistedAgents,
  DEFAULT_DESKTOP_STATE,
  mergeDesktopState,
} = require('../utils.cjs');

// ── isObject ──────────────────────────────────────────────────────────────────

describe('isObject', () => {
  it('returns true for plain objects', () => assert.ok(isObject({ a: 1 })));
  it('returns false for null', () => assert.ok(!isObject(null)));
  it('returns false for arrays', () => assert.ok(!isObject([])));
  it('returns false for primitives', () => assert.ok(!isObject('str')));
});

// ── isLayout ──────────────────────────────────────────────────────────────────

describe('isLayout', () => {
  const validLayout = { version: 1, cols: 20, rows: 11, tiles: [], furniture: [] };

  it('accepts a valid layout', () => assert.ok(isLayout(validLayout)));
  it('rejects wrong version', () => assert.ok(!isLayout({ ...validLayout, version: 2 })));
  it('rejects missing tiles', () => {
    const { tiles: _, ...noTiles } = validLayout;
    assert.ok(!isLayout(noTiles));
  });
  it('rejects missing furniture', () => {
    const { furniture: _, ...noFurniture } = validLayout;
    assert.ok(!isLayout(noFurniture));
  });
  it('rejects non-numeric cols', () =>
    assert.ok(!isLayout({ ...validLayout, cols: '20' })));
  it('rejects null', () => assert.ok(!isLayout(null)));
  it('rejects array', () => assert.ok(!isLayout([])));
});

// ── sanitizePersistedAgents ───────────────────────────────────────────────────

describe('sanitizePersistedAgents', () => {
  it('returns empty array for non-array input', () => {
    assert.deepEqual(sanitizePersistedAgents(null), []);
    assert.deepEqual(sanitizePersistedAgents(undefined), []);
    assert.deepEqual(sanitizePersistedAgents('bad'), []);
  });

  it('filters out agents missing id', () => {
    assert.deepEqual(sanitizePersistedAgents([{ sessionId: 'abc' }]), []);
  });

  it('filters out agents with no sessionId and no jsonlFile', () => {
    assert.deepEqual(sanitizePersistedAgents([{ id: 1, sessionId: '', jsonlFile: '' }]), []);
  });

  it('keeps agents with sessionId', () => {
    const result = sanitizePersistedAgents([{ id: 1, sessionId: 'abc-123', jsonlFile: '' }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 1);
    assert.equal(result[0].sessionId, 'abc-123');
  });

  it('keeps agents with jsonlFile only', () => {
    const result = sanitizePersistedAgents([{ id: 2, sessionId: '', jsonlFile: '/path/to/file.jsonl' }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].jsonlFile, '/path/to/file.jsonl');
  });

  it('coerces optional fields to correct types', () => {
    const [agent] = sanitizePersistedAgents([
      { id: 3, sessionId: 'x', isExternal: 1, isTeamLead: 'yes', leadAgentId: '5' },
    ]);
    assert.equal(agent.isExternal, false);   // 1 is not strict true
    assert.equal(agent.isTeamLead, undefined); // 'yes' is not boolean
    assert.equal(agent.leadAgentId, undefined); // '5' is not number
  });
});

// ── sanitizeWorkspaceFolders ──────────────────────────────────────────────────

describe('sanitizeWorkspaceFolders', () => {
  const existsSync = () => true;
  const statSync = () => ({ isDirectory: () => true });

  it('returns empty array for non-array input', () => {
    assert.deepEqual(sanitizeWorkspaceFolders(null, existsSync, statSync), []);
  });

  it('resolves relative paths to absolute', () => {
    const [folder] = sanitizeWorkspaceFolders(
      [{ path: '.', name: 'root' }],
      existsSync,
      statSync,
    );
    assert.ok(folder.path.startsWith('/') || /^[A-Z]:\\/.test(folder.path));
  });

  it('falls back to basename when name is blank', () => {
    const [folder] = sanitizeWorkspaceFolders(
      [{ path: '/some/project', name: '' }],
      existsSync,
      statSync,
    );
    assert.equal(folder.name, 'project');
  });

  it('excludes folders that do not exist', () => {
    const result = sanitizeWorkspaceFolders(
      [{ path: '/nonexistent', name: 'gone' }],
      () => false,
      statSync,
    );
    assert.equal(result.length, 0);
  });

  it('excludes paths that are not directories', () => {
    const result = sanitizeWorkspaceFolders(
      [{ path: '/some/file.txt', name: 'file' }],
      existsSync,
      () => ({ isDirectory: () => false }),
    );
    assert.equal(result.length, 0);
  });
});

// ── mergeDesktopState ─────────────────────────────────────────────────────────

describe('mergeDesktopState', () => {
  it('merges saved state over defaults', () => {
    const state = mergeDesktopState({ soundEnabled: false, hooksEnabled: true });
    assert.equal(state.soundEnabled, false);
    assert.equal(state.hooksEnabled, true);
    assert.equal(state.watchAllSessions, DEFAULT_DESKTOP_STATE.watchAllSessions);
  });

  it('sanitizes agents list', () => {
    const state = mergeDesktopState({ agents: [{ id: 1, sessionId: 's' }, { broken: true }] });
    assert.equal(state.agents.length, 1);
  });

  it('falls back to empty agentSeats for invalid input', () => {
    const state = mergeDesktopState({ agentSeats: 'invalid' });
    assert.deepEqual(state.agentSeats, {});
  });

  it('workspaceFolders is always empty (caller resolves)', () => {
    const state = mergeDesktopState({ workspaceFolders: [{ path: '/x', name: 'x' }] });
    assert.deepEqual(state.workspaceFolders, []);
  });
});

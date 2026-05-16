/**
 * Runtime detection, provider-agnostic
 *
 * Single source of truth for determining whether the webview is running
 * inside an IDE extension (VS Code, Cursor, Windsurf, etc.) or standalone
 * in a browser.
 */

declare global {
  interface Window {
    pixelAgentsDesktop?: {
      isElectron: boolean;
    };
  }
}

declare function acquireVsCodeApi(): unknown;

type Runtime = 'vscode' | 'electron' | 'browser';
// Future: 'cursor' | 'windsurf' | etc.

const runtime: Runtime =
  typeof window !== 'undefined' && window.pixelAgentsDesktop?.isElectron
    ? 'electron'
    : typeof acquireVsCodeApi !== 'undefined'
      ? 'vscode'
      : 'browser';

export const isBrowserRuntime = runtime === 'browser';
export const isElectronRuntime = runtime === 'electron';
export const isVSCodeRuntime = runtime === 'vscode';
export { runtime };

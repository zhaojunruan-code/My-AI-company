import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { isBrowserRuntime, isElectronRuntime } from './runtime';

async function main() {
  if (isBrowserRuntime || isElectronRuntime) {
    const { initAssets } = await import('./browserMock.js');
    await initAssets();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main().catch(console.error);

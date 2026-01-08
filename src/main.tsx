import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

console.log('main.tsx: Starting application...');

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found!');
  }

  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  console.log('main.tsx: Application rendered successfully');
} catch (error) {
  console.error('main.tsx: Fatal error during application startup:', error);
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: monospace; background: #000; color: #fff; min-height: 100vh;">
      <h1 style="color: #f00;">Fatal Error</h1>
      <p>Application failed to start:</p>
      <pre style="background: #222; padding: 10px; border-radius: 4px; overflow: auto;">
${error instanceof Error ? error.message : String(error)}
${error instanceof Error && error.stack ? '\n' + error.stack : ''}
      </pre>
      <p style="margin-top: 20px; color: #888;">Check the browser console for more details.</p>
    </div>
  `;
}

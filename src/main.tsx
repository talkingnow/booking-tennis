import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SwUpdatePrompt } from './components/SwUpdatePrompt';
import { DebugPanel } from './components/DebugPanel';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <SwUpdatePrompt />
      <DebugPanel />
    </BrowserRouter>
  </React.StrictMode>,
);

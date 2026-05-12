import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SwUpdatePrompt } from './components/SwUpdatePrompt';
import './styles/index.css';
// Register site adapters (order matters: gy first)
import '@/lib/sites/gy';
import '@/lib/sites/pj';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <SwUpdatePrompt />
    </BrowserRouter>
  </React.StrictMode>,
);

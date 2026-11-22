/**
 * GUI 入口
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('缺少 #root');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

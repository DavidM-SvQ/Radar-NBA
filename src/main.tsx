import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeStyleProvider } from './context/ThemeStyleContext.tsx';

createRoot(document.getElementById('root')!).render(
  <ThemeStyleProvider>
    <App />
  </ThemeStyleProvider>
);


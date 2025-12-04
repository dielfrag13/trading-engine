// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const system = createSystem(defaultConfig);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ChakraProvider value={system}>
        <App />
      </ChakraProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

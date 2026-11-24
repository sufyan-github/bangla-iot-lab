import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import { useLocale } from './i18n';
// Applies a remembered light or dark choice as soon as the app starts.
import './theme';
import { App } from './shell/App';

document.documentElement.lang = useLocale.getState().locale;

// Installs the service worker that makes the app open without a connection.
registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: {
    // Saved circuits live on this device, so queries must run while offline too.
    queries: { networkMode: 'always', retry: false, staleTime: 0, gcTime: 0 },
    mutations: { networkMode: 'always', retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

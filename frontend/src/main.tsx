import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppTheme } from './components/layout/app-theme';
import { BrowserRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { queryClient } from '@/lib/queryClient';
import { App } from './App';
import { AppChrome } from './components/layout/app-chrome';
import { PageMetadata } from './Landing/PageMetadata';
import { Analytics } from './analytics/Analytics';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <BrowserRouter>
          <AppTheme>
            <PageMetadata />
            <Analytics />
            <AppChrome />
            <App />
          </AppTheme>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);

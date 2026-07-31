import { Buffer } from 'buffer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import './index.css';

// `mammoth` (leitura de .docx em interpretarLaudo) usa `Buffer.from(...)`
// assumindo o global do Node — em dev, o pré-bundle do esbuild tolera isso
// silenciosamente, mas o build de produção (Rollup) não injeta esse global
// nenhum, e o navegador de verdade não tem `Buffer` — falhava só no Vercel,
// caindo (também silenciosamente) pro fallback de interpretar só o nome do
// arquivo. Precisa estar disponível ANTES de qualquer import dinâmico do mammoth.
if (!window.Buffer) window.Buffer = Buffer;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);

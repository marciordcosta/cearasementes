import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArquivosPage } from './pages/ArquivosPage';
import { ConciliacaoPage } from './pages/ConciliacaoPage';
import { DashboardPage } from './pages/DashboardPage';
import { FretesPage } from './pages/FretesPage';
import { TesteCampoPage } from './pages/TesteCampoPage';
import { UploadsPage } from './pages/UploadsPage';
import { PricingPage } from './pages/PricingPage';

const PAGINAS = [
  { path: '/', Componente: DashboardPage },
  { path: '/uploads', Componente: UploadsPage },
  { path: '/precificacao', Componente: PricingPage },
  { path: '/fretes', Componente: FretesPage },
  { path: '/conciliacao', Componente: ConciliacaoPage },
  { path: '/arquivos', Componente: ArquivosPage },
  { path: '/teste-campo', Componente: TesteCampoPage },
];

/**
 * Em vez do <Routes> padrão do react-router (que desmonta a página inteira
 * ao sair dela — perdendo busca digitada, cotação em andamento, edição de
 * tabela etc.), cada módulo já visitado fica montado pra sempre; trocar de
 * página só alterna opacidade (com transição suave, "mesma tela") em vez de
 * destruir e recriar o componente. O único jeito de zerar um módulo volta a
 * ser manual: o botão "Limpar" de cada página, ou fechar/recarregar o app.
 */
export default function App() {
  const location = useLocation();
  const [visitadas, setVisitadas] = useState<Set<string>>(() => new Set([location.pathname]));

  useEffect(() => {
    setVisitadas((prev) => (prev.has(location.pathname) ? prev : new Set(prev).add(location.pathname)));
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen">
      {PAGINAS.filter((p) => visitadas.has(p.path)).map(({ path, Componente }) => {
        const ativa = path === location.pathname;
        return (
          <div
            key={path}
            aria-hidden={!ativa}
            className={`absolute inset-0 overflow-y-auto transition-opacity duration-200 ${ativa ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'}`}
          >
            <Componente />
          </div>
        );
      })}
    </div>
  );
}

import { FolderOpen, Landmark, LayoutDashboard, Settings, Tag, Truck, Upload, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  Icone: LucideIcon;
  disabled?: boolean;
}

const NAV_ITEMS_PRINCIPAIS: NavItem[] = [
  { to: '/precificacao', label: 'Precificação', Icone: Tag },
  { to: '/fretes', label: 'Fretes', Icone: Truck },
  { to: '/arquivos', label: 'Arquivos', Icone: FolderOpen },
  { to: '/conciliacao', label: 'Conciliação', Icone: Landmark },
  { to: '/', label: 'Painel BI', Icone: LayoutDashboard },
];

// Fica isolado embaixo, separado dos itens principais — Uploads é uma ação
// mais esporádica do que navegar entre BI e Precificação no dia a dia.
const ITEM_UPLOADS: NavItem = { to: '/uploads', label: 'Uploads', Icone: Upload };

function IconNavLink({ item }: { item: NavItem }) {
  if (item.disabled) {
    return (
      <span
        title="Em breve"
        className="flex h-12 w-12 cursor-not-allowed items-center justify-center rounded-2xl text-[var(--color-text-soft)]/35"
      >
        <item.Icone className="h-5 w-5" strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={item.label}
      className={({ isActive }) =>
        `flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface)] shadow-sm transition hover:shadow-md ${
          isActive ? 'text-[var(--color-accent)] ring-2 ring-[var(--color-accent)]' : 'text-[var(--color-text-soft)] hover:bg-[var(--color-line)] hover:text-[var(--color-text)]'
        }`
      }
    >
      <item.Icone className="h-5 w-5" strokeWidth={1.75} />
    </NavLink>
  );
}

interface SidebarProps {
  /** Só a página atual sabe se ela tem parametrização/configuração — controla se o ícone de engrenagem aparece. */
  mostrarParametrizacao?: boolean;
  /** Clicar na engrenagem abre o modal de parametrização da página atual (não navega, não expande inline). */
  onAbrirParametrizacao?: () => void;
}

// Menu lateral fixo em modo ícones — sem opção de expandir para texto. Os
// módulos principais ficam centralizados verticalmente na barra (via
// flex-1 + justify-center no <nav>), reajustando sozinhos conforme mais
// módulos entram na lista; Uploads continua fixo embaixo, separado do grupo.
export function Sidebar({ mostrarParametrizacao, onAbrirParametrizacao }: SidebarProps) {
  return (
    <aside className="flex h-full w-[68px] shrink-0 flex-col items-center gap-2 py-4">
      <nav className="flex flex-1 flex-col items-center justify-center gap-2">
        {NAV_ITEMS_PRINCIPAIS.map((item) => (
          <IconNavLink key={item.to} item={item} />
        ))}
      </nav>
      {/*
        O espaço da engrenagem fica sempre reservado (h-12 w-12), só ficando
        invisível quando a página não tem parametrização — se o botão
        sumisse de vez, o <nav> flex-1 acima ganharia mais altura e o grupo
        de ícones principais (centralizado com justify-center) se deslocaria
        toda vez que você trocasse de página com/sem engrenagem.
      */}
      <button
        type="button"
        onClick={onAbrirParametrizacao}
        title="Parametrização"
        aria-hidden={!mostrarParametrizacao}
        tabIndex={mostrarParametrizacao ? 0 : -1}
        className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface)] text-[var(--color-text-soft)] shadow-sm transition hover:bg-[var(--color-line)] hover:text-[var(--color-text)] hover:shadow-md ${
          mostrarParametrizacao ? '' : 'pointer-events-none opacity-0'
        }`}
      >
        <Settings className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <IconNavLink item={ITEM_UPLOADS} />
    </aside>
  );
}

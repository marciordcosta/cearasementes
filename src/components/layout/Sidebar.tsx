import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icone: string;
  disabled?: boolean;
}

const NAV_ITEMS_PRINCIPAIS: NavItem[] = [
  { to: '/', label: 'Painel BI', icone: '📊' },
  { to: '/precificacao', label: 'Precificação', icone: '🏷️' },
];

// Fica isolado embaixo, separado dos itens principais (mesma ideia do botão
// de recolher/expandir) — Uploads é uma ação mais esporádica do que navegar
// entre BI e Precificação no dia a dia.
const ITEM_UPLOADS: NavItem = { to: '/uploads', label: 'Uploads', icone: '⇧' };

const STORAGE_KEY = 'sidebar-colapsada';

function IconNavLink({ item }: { item: NavItem }) {
  if (item.disabled) {
    return (
      <span
        title="Em breve"
        className="flex h-12 w-12 cursor-not-allowed items-center justify-center rounded-2xl text-2xl text-[var(--color-text-soft)]/35"
      >
        {item.icone}
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={item.label}
      className={({ isActive }) =>
        `flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface)] text-2xl shadow-sm transition hover:shadow-md ${
          isActive ? 'ring-2 ring-[var(--color-accent)]' : 'hover:bg-[var(--color-line)]'
        }`
      }
    >
      {item.icone}
    </NavLink>
  );
}

function LabelNavLink({ item }: { item: NavItem }) {
  if (item.disabled) {
    return (
      <span
        title="Em breve"
        className="flex cursor-not-allowed items-center overflow-hidden rounded-md px-3 py-2 text-sm whitespace-nowrap text-white/35"
      >
        {item.label}
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `flex items-center overflow-hidden rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
          isActive ? 'bg-white/12 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'
        }`
      }
    >
      {item.label}
    </NavLink>
  );
}

export function Sidebar() {
  // Persistido no localStorage, não em Context — a Sidebar é remontada a
  // cada troca de página (cada página renderiza seu próprio <AppShell>), e
  // sem isso o menu voltaria a expandir sozinho a cada navegação.
  const [colapsada, setColapsada] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, colapsada ? '1' : '0');
  }, [colapsada]);

  if (colapsada) {
    // Sem barra: os ícones flutuam direto sobre o fundo da página.
    return (
      <aside className="sticky top-0 flex h-screen w-[68px] shrink-0 flex-col items-center gap-2 py-4">
        <button
          type="button"
          onClick={() => setColapsada(false)}
          title="Expandir menu"
          className="mb-3 flex h-9 w-9 items-center justify-center rounded-full text-lg text-[var(--color-text-soft)] hover:bg-[var(--color-line)]"
        >
          ›
        </button>
        <nav className="flex flex-col gap-2">
          {NAV_ITEMS_PRINCIPAIS.map((item) => (
            <IconNavLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="flex-1" />
        <IconNavLink item={ITEM_UPLOADS} />
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col bg-[var(--color-navy)] text-white">
      <div className="flex items-center justify-between gap-2 px-4 py-5">
        <div className="flex items-center gap-2 overflow-hidden text-sm font-bold tracking-wide whitespace-nowrap">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--color-accent)]" />
          ERP Ceará Sementes
        </div>
        <button
          type="button"
          onClick={() => setColapsada(true)}
          title="Recolher menu"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
        >
          ‹
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS_PRINCIPAIS.map((item) => (
          <LabelNavLink key={item.to} item={item} />
        ))}
        <div className="flex-1" />
        <LabelNavLink item={ITEM_UPLOADS} />
      </nav>
    </aside>
  );
}

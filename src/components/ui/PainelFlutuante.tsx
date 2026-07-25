import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

interface PainelFlutuanteProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}

/**
 * Painel flutuante arrastável — ao contrário do Modal, não tem fundo
 * bloqueando a tela: o usuário continua podendo clicar, rolar e consultar
 * as grades por trás enquanto o painel fica aberto ao lado.
 */
export function PainelFlutuante({ open, title, onClose, children, widthClassName = 'w-[440px]' }: PainelFlutuanteProps) {
  const [pos, setPos] = useState(() => ({ x: Math.max(24, window.innerWidth - 480), y: 96 }));
  const arrastoRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!arrastoRef.current) return;
      const { dx, dy } = arrastoRef.current;
      setPos({
        x: Math.min(Math.max(0, e.clientX - dx), window.innerWidth - 80),
        y: Math.min(Math.max(0, e.clientY - dy), window.innerHeight - 40),
      });
    }
    function onUp() {
      arrastoRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (!open) return null;

  function onMouseDownHeader(e: ReactMouseEvent) {
    arrastoRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  }

  return (
    <div
      className={`fixed z-[200] flex max-h-[80vh] flex-col overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-2xl ${widthClassName}`}
      style={{ left: pos.x, top: pos.y }}
    >
      <div onMouseDown={onMouseDownHeader} className="flex cursor-move items-center justify-between gap-3 bg-[var(--color-navy)] px-[18px] py-3 text-sm font-bold text-white select-none">
        <span className="truncate">{title}</span>
        <button type="button" onClick={onClose} title="Fechar" className="shrink-0 rounded-md bg-white/15 px-2.5 py-1 text-xs hover:bg-white/28">
          ✕
        </button>
      </div>
      <div className="overflow-y-auto p-[18px]">{children}</div>
    </div>
  );
}

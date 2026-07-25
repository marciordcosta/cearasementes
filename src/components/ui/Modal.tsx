import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
}

export function Modal({ open, title, onClose, children, footer, widthClassName = 'max-w-[420px]' }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[#10233F]/45 p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-2xl ${widthClassName}`}>
        <div className="flex items-center justify-between gap-3 bg-[var(--color-navy)] px-[18px] py-3.5 text-sm font-bold text-white">
          <span>{title}</span>
          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            className="rounded-md bg-white/15 px-2.5 py-1 text-xs hover:bg-white/28"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-[18px]">{children}</div>
        {footer && <div className="flex justify-end gap-2.5 border-t border-[var(--color-line)] px-[18px] py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

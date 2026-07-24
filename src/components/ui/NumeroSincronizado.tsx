import { useEffect, useRef } from 'react';

/**
 * Input numérico não-controlado que só empurra um novo valor pro DOM quando
 * o campo NÃO está com foco — assim uma mudança externa (recálculo de
 * custo/margem, botão de reset) atualiza o texto mostrado, mas o próprio
 * valor digitado pelo usuário nunca é sobrescrito no meio da digitação.
 * Antes disso, o campo usava um `key` derivado do valor pra forçar remonte,
 * o que desmontava o input a cada tecla e derrubava o foco (usuário só
 * conseguia digitar 1-2 dígitos antes de precisar clicar de novo).
 */
export function NumeroSincronizado({
  valor,
  onCommit,
  onFocus,
  className,
  step = '1',
  min,
  tabIndex,
  onKeyDownExtra,
  registrarInput,
}: {
  valor: number;
  onCommit: (valor: number) => void;
  onFocus?: () => void;
  className?: string;
  step?: string;
  min?: string;
  tabIndex?: number;
  /** Handler adicional (ex.: Enter pulando de linha) — chamado junto do onKeyDown interno. */
  onKeyDownExtra?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Expõe o elemento pra fora (ex.: mapa de refs pra navegação por teclado entre campos de Preço). */
  registrarInput?: (el: HTMLInputElement | null) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  // Digitação manual (dígitos, backspace...) liga esse flag pra não atrapalhar
  // o usuário reformatando o campo no meio da edição; clique nas setinhas do
  // input (ou ↑/↓ do teclado) NÃO liga o flag, então o valor pode ser
  // reformatado na hora — é um clique discreto, não uma digitação em curso.
  const editandoRef = useRef(false);

  useEffect(() => {
    if (ref.current && !editandoRef.current) {
      ref.current.value = valor.toFixed(2);
    }
  }, [valor]);

  return (
    <input
      ref={(el) => {
        ref.current = el;
        registrarInput?.(el);
      }}
      type="number"
      step={step}
      min={min}
      tabIndex={tabIndex}
      defaultValue={valor.toFixed(2)}
      onFocus={onFocus}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') editandoRef.current = true;
        onKeyDownExtra?.(e);
      }}
      onChange={(e) => {
        const val = parseFloat(e.target.value);
        if (isNaN(val)) return;
        if (!editandoRef.current) e.target.value = val.toFixed(2);
        onCommit(val);
      }}
      onBlur={(e) => {
        editandoRef.current = false;
        e.target.value = valor.toFixed(2);
      }}
      className={className}
    />
  );
}

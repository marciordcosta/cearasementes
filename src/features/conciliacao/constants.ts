/** Altura (em px) de cada linha das grades Banco (OFX) e Sistema — usada pro VirtualList e pro overlay de itens fixados. */
export const ALTURA_LINHA = 76;

/** Classe padrão de input/select dos modais de conciliação (Regras, Registro Manual, Informar NF, Completar Pré-Lançamento). */
export const CAMPO_CLASSE = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** Valor sentinela da opção "Ocultados" no select de banco (ListaBanco) — igual ao nome de um banco real é astronomicamente improvável, mas ainda assim é só um valor de <option>, nunca comparado com dados de fato. */
export const BANCO_FILTRO_OCULTADOS = '__ocultados__';

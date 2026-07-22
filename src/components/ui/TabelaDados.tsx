import type { ReactNode } from 'react';

export interface ColunaTabela<T> {
  chave: string;
  cabecalho: ReactNode;
  render: (linha: T) => ReactNode;
  alinhamento?: 'left' | 'right';
  className?: string;
}

interface TabelaDadosProps<T> {
  colunas: ColunaTabela<T>[];
  linhas: T[];
  chaveLinha: (linha: T, indice: number) => string;
  vazio?: ReactNode;
  cabecalhoFixo?: boolean;
  maxHeightClassName?: string;
}

export function TabelaDados<T>({
  colunas,
  linhas,
  chaveLinha,
  vazio = 'Nenhum registro encontrado.',
  cabecalhoFixo = false,
  maxHeightClassName = '',
}: TabelaDadosProps<T>) {
  return (
    <div className={`overflow-auto ${maxHeightClassName}`}>
      <table className="w-full text-sm">
        <thead className={cabecalhoFixo ? 'sticky top-0 z-[1] bg-[var(--color-surface)]' : ''}>
          <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-text-soft)]">
            {colunas.map((col) => (
              <th
                key={col.chave}
                className={`px-4 py-2 font-medium ${col.alinhamento === 'right' ? 'text-right' : 'text-left'}`}
              >
                {col.cabecalho}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={colunas.length} className="px-4 py-6 text-center text-[var(--color-text-soft)]">
                {vazio}
              </td>
            </tr>
          ) : (
            linhas.map((linha, indice) => (
              <tr key={chaveLinha(linha, indice)} className="border-b border-[var(--color-line)]">
                {colunas.map((col) => (
                  <td
                    key={col.chave}
                    className={`px-4 py-2 ${col.alinhamento === 'right' ? 'text-right' : 'text-left'} ${col.className ?? ''}`}
                  >
                    {col.render(linha)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

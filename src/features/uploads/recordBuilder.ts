import type { Database } from '@/types/database';
import { parseAnyDate, parseBRNumber, toISODate } from './parsing';
import type { GrupoLinhas, MapeamentoColunas } from './types';

type EntregaInsert = Database['public']['Tables']['entregas_transportadora']['Insert'];

interface Resultado<T> {
  registros: T[];
  ignoradas: number;
}

const val = (row: unknown[], mapeamento: MapeamentoColunas, chave: string): unknown => {
  const idx = mapeamento[chave];
  return idx === null || idx === undefined ? undefined : row[idx];
};

/** Relatório 124: cada linha vira uma entrega. Pula rodapés/linhas de rótulo, igual ao BI local original. */
export function construirRegistros124(grupo: GrupoLinhas, mapeamento: MapeamentoColunas): Resultado<EntregaInsert> {
  const registros: EntregaInsert[] = [];
  let ignoradas = 0;

  for (const row of grupo.rows) {
    const nome = String(val(row, mapeamento, 'transportadora') ?? '').trim();
    if (!nome || /entregador/i.test(nome) || /total/i.test(nome) || /retirada/i.test(nome)) {
      ignoradas++;
      continue;
    }
    const valor = parseBRNumber(val(row, mapeamento, 'valor'));
    if (isNaN(valor)) {
      ignoradas++;
      continue;
    }
    const data = parseAnyDate(val(row, mapeamento, 'data_pedido'));
    registros.push({
      transportadora: nome,
      valor,
      data_pedido: data ? toISODate(data) : null,
      arquivo_origem: grupo.label,
    });
  }

  return { registros, ignoradas };
}

import type { Database } from '@/types/database';
import { detectarNomeTabelaPreco, parseAnyDate, parseBRNumber, toISODate } from './parsing';
import type { GrupoLinhas, MapeamentoColunas } from './types';

type EntregaInsert = Database['public']['Tables']['entregas_transportadora']['Insert'];
type VendaInsert = Database['public']['Tables']['vendas_tabela_preco']['Insert'];

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

export interface ProdutoCustoImportado {
  codigo: string;
  nome: string;
  custo: number;
}

/**
 * Relatório 333: relatório paginado (repete cabeçalho e roda\pé "Maxdata
 * Sistemas..." a cada página, além de uma linha de totais no fim). Em vez
 * de tentar reconhecer cada tipo de linha de "lixo", uma linha só vira
 * produto se tiver Código + Produto + Custo todos preenchidos e o Custo for
 * um número válido — cabeçalho, rodapé, linha de totais e linhas em branco
 * falham nessa checagem naturalmente.
 */
export function construirRegistros333(grupo: GrupoLinhas, mapeamento: MapeamentoColunas): Resultado<ProdutoCustoImportado> {
  const registros: ProdutoCustoImportado[] = [];
  let ignoradas = 0;

  for (const row of grupo.rows) {
    const codigo = String(val(row, mapeamento, 'codigo') ?? '').trim();
    const nome = String(val(row, mapeamento, 'nome') ?? '').trim();
    const custo = parseBRNumber(val(row, mapeamento, 'custo'));
    if (!codigo || !nome || isNaN(custo)) {
      ignoradas++;
      continue;
    }
    registros.push({ codigo, nome, custo });
  }

  return { registros, ignoradas };
}

/** Relatório 396: pula a linha de totais do rodapé (mesma heurística do BI local: contém "Total Reg"). */
export function construirRegistros396(grupo: GrupoLinhas, mapeamento: MapeamentoColunas): Resultado<VendaInsert> {
  const tabelaPreco = detectarNomeTabelaPreco(grupo.rows);
  const linhaTotais = grupo.rows.find((row) => row.some((cell) => /Total\s*Reg\.?\s*:/i.test(String(cell ?? ''))));

  const registros: VendaInsert[] = [];
  let ignoradas = 0;

  for (const row of grupo.rows) {
    if (row === linhaTotais) continue;
    const valorLiquido = parseBRNumber(val(row, mapeamento, 'valor_liquido'));
    if (isNaN(valorLiquido)) {
      ignoradas++;
      continue;
    }
    const valorBruto = parseBRNumber(val(row, mapeamento, 'valor_bruto')) || 0;
    const desconto = parseBRNumber(val(row, mapeamento, 'desconto')) || 0;
    const codigoCliente = String(val(row, mapeamento, 'codigo_cliente') ?? '').trim() || null;
    const data = parseAnyDate(val(row, mapeamento, 'data_venda'));

    registros.push({
      tabela_preco: tabelaPreco,
      codigo_cliente: codigoCliente,
      valor_bruto: valorBruto,
      desconto,
      valor_liquido: valorLiquido,
      data_venda: data ? toISODate(data) : null,
      arquivo_origem: grupo.label,
    });
  }

  return { registros, ignoradas };
}

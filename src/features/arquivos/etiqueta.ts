import type { Produto } from '@/features/pricing/types';
import { encontrarProdutoPreco, resolverObservacaoEtiqueta } from './parametrizacaoProdutos';
import type { ArquivoLaudo, ProdutoParametrizacao } from './types';

const MESES_POR_EXTENSO = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export interface DadosEtiqueta {
  especie: string;
  cultivar: string;
  categoria: string;
  processo: string;
  lote: string;
  safra: string;
  validade: string;
  sementesPuras: string;
  sementesViaveis: string;
  observacao: string;
  peso: string;
}

/**
 * Cultivar do Selo sai direto do nome do produto do laudo (nomeProduto =
 * Espécie + Cultivar + Processo, ver interpretarConteudoLaudo.ts), sem
 * precisar de cadastro à parte: descarta as palavras da Espécie do início
 * (ex.: "Andropogon Gayanus" = 2 palavras), sobrando só o Cultivar. Sem
 * Espécie conhecida (laudo antigo, ou modelo de documento que não destaca
 * Espécie à parte), assume 1 palavra de gênero só (comportamento antigo, ex.:
 * "Andropogon Planaltina" -> descarta só "Andropogon"). Também descarta
 * qualquer palavra que seja o Processo (`laudo.processo`, ex.: "Tradicional")
 * — sem isso, sobrava colado no fim do Cultivar (nomeProduto termina com o
 * Processo) e quem usa esse retorno pra montar "Cultivar + Processo" (ver
 * laudoCasaComProduto em calculoSemeadura.ts) acabava repetindo a palavra;
 * um laudo de Cultivar de 1 palavra só (ex.: "Massai") virava um par
 * "Massai Tradicional Tradicional" que, ao falhar o casamento completo,
 * caía no fallback interno de laudoCasaComNomePreco (que descarta a 1ª
 * palavra achando que é Gênero) e sobrava só "Tradicional Tradicional" —
 * batendo com QUALQUER produto Tradicional de espécie nenhuma a ver (bug
 * real, corrigido: Decumbens sem laudo nenhum puxando dados de um laudo de
 * Panicum Massai/Mombaça, só por acaso os dois serem "Tradicional"). Se
 * alguma palavra do que sobrar contiver "incrustad" mesmo sem
 * `laudo.processo` preenchido (modelo de documento antigo que não separa
 * esse campo), essa palavra também sai do Cultivar.
 */
export function derivarCultivar(nomeProduto: string, especie?: string | null, processo?: string | null): string {
  const palavras = nomeProduto.trim().split(/\s+/).filter(Boolean);
  const palavrasEspecie = especie ? especie.trim().split(/\s+/).filter(Boolean).length : 1;
  const semGenero = palavras.slice(palavrasEspecie);
  const palavrasProcesso = new Set((processo ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean));
  return semGenero.filter((p) => !/incrustad/i.test(p) && !palavrasProcesso.has(p.toLowerCase())).join(' ');
}

/** "MM/AAAA" ou "DD/MM/AAAA" (mesma tolerância de chaveOrdenacaoValidade em ListaArquivos.tsx) -> "MÊS POR EXTENSO/AAAA". Formato não reconhecido cai no texto cru. */
export function formatarValidadeEtiqueta(validade: string | null): string {
  if (!validade) return '';
  const texto = validade.trim();
  const mesAno = texto.match(/^(\d{1,2})\/(\d{4})$/);
  if (mesAno) {
    const mes = Number(mesAno[1]);
    if (mes >= 1 && mes <= 12) return `${MESES_POR_EXTENSO[mes - 1]}/${mesAno[2]}`;
  }
  const diaMesAno = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (diaMesAno) {
    const mes = Number(diaMesAno[2]);
    const ano = diaMesAno[3].length === 2 ? `20${diaMesAno[3]}` : diaMesAno[3];
    if (mes >= 1 && mes <= 12) return `${MESES_POR_EXTENSO[mes - 1]}/${ano}`;
  }
  return texto;
}

/** Garante o "%" no final (o laudo às vezes já traz "40,9%", às vezes só "40,9") — sem duplicar. */
function comPercentual(valor: string | null): string {
  if (!valor) return '';
  const semPercentual = valor.trim().replace(/%\s*$/, '');
  return semPercentual ? `${semPercentual}%` : '';
}

function formatarPeso(peso: number | undefined): string {
  if (!peso || peso <= 0) return '';
  return Number.isInteger(peso) ? `${peso}kg` : `${peso.toFixed(1).replace('.', ',')}kg`;
}

/** Peso da embalagem (kg): prioriza o que o próprio laudo traz (Peso por Embalagem do Boletim de Análise); sem isso (laudo antigo, ou modelo de documento que não traz esse dado), cai pro peso cadastrado na Tabela de Preço (casando pelo nome, mesmo mecanismo do Guia de Plantio). */
function resolverPeso(laudo: ArquivoLaudo, produtoPreco: Produto | null): string {
  const doLaudo = laudo.pesoEmbalagem?.trim().replace(/kg\s*$/i, '').trim();
  if (doLaudo) return `${doLaudo}kg`;
  return formatarPeso(produtoPreco?.peso);
}

/**
 * Junta tudo que o Selo precisa: Lote/Safra/Validade/Pureza/Germinação/
 * Categoria/Espécie/Processo vêm direto do laudo (lidos do documento quando
 * possível, editáveis em EditarLaudoModal quando não — Espécie só se corrige
 * pelo Nome do Produto); "% Sementes Viáveis" do Selo é a própria Germinação
 * do laudo (não o VC% do Guia de Plantio — são contas diferentes, VC% desconta
 * a Pureza e não é o que vai impresso aqui). Cultivar é derivado do nome do
 * produto do laudo (nomeProduto = Espécie + Cultivar) descontando a Espécie,
 * Observação vem da Parametrização de Produtos (texto fixo por grupo, não
 * muda por lote) e Peso prioriza o Peso por Embalagem do próprio laudo, caindo
 * pro pacote cadastrado na Tabela de Preço só se o laudo não tiver esse dado
 * (ver resolverPeso). Campo sem dado imprime vazio — não impede gerar o selo.
 */
export function montarDadosEtiqueta(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], produtosPreco: Produto[]): DadosEtiqueta {
  const cultivar = derivarCultivar(laudo.nomeProduto, laudo.especie, laudo.processo);
  const produtoPreco = encontrarProdutoPreco(laudo.nomeProduto, produtosPreco);
  return {
    especie: laudo.especie ?? '',
    cultivar,
    categoria: laudo.categoria ?? '',
    processo: laudo.processo ?? '',
    lote: laudo.lote ?? '',
    safra: laudo.anoSafra ?? '',
    validade: formatarValidadeEtiqueta(laudo.validade),
    sementesPuras: comPercentual(laudo.pureza),
    sementesViaveis: comPercentual(laudo.germinacao),
    observacao: resolverObservacaoEtiqueta(laudo.nomeProduto, produtos) ?? '',
    peso: resolverPeso(laudo, produtoPreco),
  };
}

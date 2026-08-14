import type { Produto } from '@/features/pricing/types';
import { paraNumero } from './metricas';
import type { ArquivoLaudo, FatorPlantio, ProdutoParametrizacao } from './types';

/**
 * Compara nomes de produto ignorando acento, caixa e espaçamento — usado em
 * toda a cadeia laudo/Parametrização/Tabela de Preço, pra não duplicar essa
 * normalização em cada arquivo. Colapsa qualquer sequência de espaços (duplo
 * espaço, espaço não separável etc. — comuns em nome digitado à mão em
 * épocas diferentes) numa só, senão dois nomes visualmente idênticos
 * escapavam da comparação por essa única diferença invisível.
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Reduz um nome de produto ao "grupo" que importa pra Parametrização — 1ª e
 * 3ª palavra (geralmente Gênero + Tratamento, pulando a variedade/cultivar
 * específica no meio): "Panicum Mombaça Incrustado" -> "Panicum Incrustado",
 * "Brachiaria Decumbens Incrustado" -> "Brachiaria Incrustado", "Milho
 * Hibrido BRS2022" -> "Milho BRS2022". Nome com menos de 3 palavras não tem
 * o que reduzir (ex.: "Panicum Tradicional" fica igual). Um cadastro só de
 * grupo em Parametrização passa a valer pra qualquer produto — do laudo ou
 * da Tabela de Preço — que reduza pro mesmo grupo, sem precisar cadastrar
 * cada variedade separadamente.
 */
export function grupoDoNome(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length >= 3) return `${palavras[0]} ${palavras[2]}`;
  return palavras.join(' ');
}

function encontrarProduto(nomeProduto: string, produtos: ProdutoParametrizacao[]): ProdutoParametrizacao | null {
  const alvo = normalizarNome(grupoDoNome(nomeProduto));
  return produtos.find((p) => normalizarNome(grupoDoNome(p.nomeProduto)) === alvo) ?? null;
}

/** PMS base do produto, como texto cru (pra exibir na grade exatamente como foi cadastrado) — null se não houver cadastro pra esse produto. */
export function resolverPmsBaseTexto(nomeProduto: string, produtos: ProdutoParametrizacao[]): string | null {
  return encontrarProduto(nomeProduto, produtos)?.pmsBase ?? null;
}

/** PMS base do produto, já convertido pra número (pra entrar na conta de kg/ha). */
export function resolverPmsBase(nomeProduto: string, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(resolverPmsBaseTexto(nomeProduto, produtos));
}

/** PMS do lote (digitado em EditarLaudoModal/TesteModal) ou, em branco, o PMS base do produto na Parametrização — já como número, pronto pra conta (ver calculoSemeadura.ts e resultadoTesteNumero em testeGerminacao.ts). */
export function resolverPmsDoLaudo(laudo: Pick<ArquivoLaudo, 'nomeProduto' | 'pms'>, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(laudo.pms) ?? resolverPmsBase(laudo.nomeProduto, produtos);
}

/** Densidade base do produto, como texto cru — não é editável por lote, então isso é sempre o que a grade mostra. */
export function resolverDensidadeBaseTexto(nomeProduto: string, produtos: ProdutoParametrizacao[]): string | null {
  return encontrarProduto(nomeProduto, produtos)?.densidadeBase ?? null;
}

/** Densidade base do produto, já convertida pra número (pra entrar na conta de kg/ha). */
export function resolverDensidadeBase(nomeProduto: string, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(resolverDensidadeBaseTexto(nomeProduto, produtos));
}

/** Índice de Sobrevivência do produto, como fração (0 a 1) — ex.: cadastro "35" (%) vira 0.35. Null se não cadastrado. */
export function resolverIndiceSobrevivencia(nomeProduto: string, produtos: ProdutoParametrizacao[]): number | null {
  const percentual = paraNumero(encontrarProduto(nomeProduto, produtos)?.indiceSobrevivencia ?? null);
  return percentual === null ? null : percentual / 100;
}

/** Máximo de plântulas estabelecidas (pós-perdas) por cova, como número — usado pra calcular o espaçamento padrão do Guia de Plantio em modo Covas (ver calcularEspacamentoPadrao em GuiaPlantioModal.tsx). Null se não cadastrado. */
export function resolverMaxPlantulasCova(nomeProduto: string, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(encontrarProduto(nomeProduto, produtos)?.maxPlantulasCova ?? null);
}

/** Máximo de plântulas estabelecidas por metro linear de linha, como número — 3ª dimensão de densidade (junto com resolverDensidadeBase, por m², e resolverMaxPlantulasCova, por cova). Equivale a uma distância mínima em cm (100 ÷ esse valor) entre plântulas na linha, usada no Guia de Plantio (ver distanciaMinimaEfetivaMilhoSorgo/modoLinearCapim em GuiaPlantioModal.tsx). Null se não cadastrado. */
export function resolverMaxPlantulasMetroLinear(nomeProduto: string, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(encontrarProduto(nomeProduto, produtos)?.maxPlantulasMetroLinear ?? null);
}

/**
 * Fator de perda (multiplicador 0–1) pra uma Condição de Implantação do Guia de Plantio — prioriza o
 * valor cadastrado POR PRODUTO (Parametrização, ex.: Milho aguenta bem menos variação de condição que um
 * capim já estabelecido); sem isso, cai no fator GLOBAL de sempre (arquivos_fatores_plantio). "Ideal" não
 * tem override em lugar nenhum — é sempre 0% de perda (fator 1) por definição.
 */
export function resolverFatorCondicao(
  nomeProduto: string,
  condicao: 'ideal' | 'media' | 'baixa',
  produtos: ProdutoParametrizacao[],
  fatoresGlobais: FatorPlantio[],
): number {
  if (condicao === 'ideal') return 1;
  const produto = encontrarProduto(nomeProduto, produtos);
  const perdaTexto = condicao === 'media' ? produto?.perdaMedia : produto?.perdaBaixa;
  const perdaProduto = paraNumero(perdaTexto ?? null);
  if (perdaProduto !== null) return 1 - perdaProduto / 100;
  return paraNumero(fatoresGlobais.find((f) => f.chave === condicao)?.fator ?? null) ?? 1;
}

/** Modo de plantio padrão do produto (Cova, Lanço ou Linha) — só pré-seleciona o modo ao adicionar no Guia de Plantio, nunca entra em cálculo. Null = sem preferência cadastrada. */
export function resolverModoPlantio(nomeProduto: string, produtos: ProdutoParametrizacao[]): 'cova' | 'lanco' | 'linha' | null {
  return encontrarProduto(nomeProduto, produtos)?.modoPlantio ?? null;
}

/** Margem de tolerância (%) do produto pra arredondar sacos — 25% se não cadastrado (ver arredondarSacos em GuiaPlantioModal.tsx). */
export function resolverMargemTolerancia(nomeProduto: string, produtos: ProdutoParametrizacao[]): number {
  const percentual = paraNumero(encontrarProduto(nomeProduto, produtos)?.margemTolerancia ?? null);
  return percentual ?? 25;
}

/** Texto livre da linha "Observação" do Selo impresso (ex.: registro RENASEM do produtor). Null se não cadastrado. */
export function resolverObservacaoEtiqueta(nomeProduto: string, produtos: ProdutoParametrizacao[]): string | null {
  return encontrarProduto(nomeProduto, produtos)?.observacaoEtiqueta ?? null;
}

/** Duas palavras "iguais pra fins de nome" — idênticas, ou diferindo só na última letra (gênero: "incrustada" x "incrustado"). Exige pelo menos 4 caracteres pra não deixar palavra curta demais (ex.: "de", "do") crescer um falso positivo. */
function palavrasParecidas(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  return minLen >= 4 && a.slice(0, minLen - 1) === b.slice(0, minLen - 1);
}

/**
 * Casa o nome de um laudo com o nome de um produto da Tabela de Preço: toda
 * palavra de conteúdo do laudo (ignora números soltos, tipo número de lote)
 * precisa aparecer, em algum lugar, no nome da Tabela de Preço — não depende
 * de posição nem de reduzir os dois nomes do mesmo jeito. Necessário porque
 * a Tabela de Preço segue um padrão BEM diferente do laudo: tem gênero
 * científico na frente e peso do pacote no fim ("Panicum Tanzania
 * Tradicional 15kg"), enquanto o laudo só traz a variedade e o tratamento
 * ("Tanzania 1 Tradicional", o "1" é o número do lote) — comparar por
 * posição de palavra (1ª/3ª) não reconcilia os dois formatos ao mesmo
 * tempo; comparar se as palavras do laudo aparecem soltas no nome da Tabela
 * de Preço funciona nos dois formatos, sem precisar saber qual é o gênero.
 */
export function laudoCasaComNomePreco(nomeLaudo: string, nomeProdutoPreco: string): boolean {
  const termosLaudo = normalizarNome(nomeLaudo)
    .split(' ')
    .filter((palavra) => palavra.length >= 3 && !/^\d+$/.test(palavra));
  if (termosLaudo.length === 0) return false;
  const palavrasPreco = normalizarNome(nomeProdutoPreco).split(' ');
  return termosLaudo.every((termo) => palavrasPreco.some((palavra) => palavrasParecidas(termo, palavra)));
}

/** Acha o produto da Tabela de Preço (módulo Precificação) que corresponde ao nome de um laudo — usado pra puxar peso do saco/valor sem precisar cadastrar essa ligação manualmente (ver laudoCasaComNomePreco). */
export function encontrarProdutoPreco(nomeProduto: string, produtosPreco: Produto[]): Produto | null {
  return produtosPreco.find((p) => laudoCasaComNomePreco(nomeProduto, p.nome)) ?? null;
}

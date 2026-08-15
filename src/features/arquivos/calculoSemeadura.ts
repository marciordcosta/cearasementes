import { calcularVCNumero, paraNumero } from './metricas';
import {
  cultivarCasaComNomePreco,
  cultivarDoLaudo,
  normalizarNome,
  resolverDensidadeBase,
  resolverFatorCondicao,
  resolverIndiceSobrevivencia,
  resolverMargemTolerancia,
  resolverMaxPlantulasCova,
  resolverPmsBase,
  resolverPmsDoLaudo,
} from './parametrizacaoProdutos';
import { resultadoTesteNumero } from './testeGerminacao';
import type { ArquivoLaudo, FatorPlantio, ProdutoParametrizacao } from './types';

type LaudoParaSemeadura = Pick<
  ArquivoLaudo,
  'nomeProduto' | 'especie' | 'processo' | 'cultivar' | 'pms' | 'testeForma' | 'testePlantadas' | 'testeGerminadas' | 'testePesoPlantado' | 'pureza' | 'germinacao'
>;

/**
 * % "de germinação usada" na conta de semeadura — na prática, a taxa geral
 * de sucesso (sementes que viram planta estabelecida):
 *
 * - Teste de campo (o nosso, feito com frequência): já é medido na terra de
 *   verdade, então já reflete a sobrevivência real — usa direto, sem
 *   multiplicar mais nada por cima.
 * - Sem teste de campo: cai pro VC do laudo (Pureza × Germinação, medidos em
 *   laboratório) corrigido pelo Índice de Sobrevivência do produto — o
 *   laboratório não capta perdas de campo (seca, praga, forma de plantio),
 *   por isso a correção só entra aqui, nunca em cima do teste de campo.
 *   Sempre o LAUDO de verdade (o último lote) — nunca um valor genérico
 *   cadastrado por cima; sem Pureza/Germinação nesse laudo, fica sem
 *   calcular (mesma regra tanto no Guia interno quanto no Catálogo Online,
 *   é a mesma função).
 */
export function germinacaoParaSemeadura(a: LaudoParaSemeadura, produtos: ProdutoParametrizacao[]): number | null {
  const doTeste = resultadoTesteNumero(a, resolverPmsDoLaudo(a, produtos));
  if (doTeste !== null) return doTeste;
  const vc = calcularVCNumero(a);
  if (vc === null) return null;
  const sobrevivencia = resolverIndiceSobrevivencia(a, produtos);
  return sobrevivencia === null ? vc : vc * sobrevivencia;
}

/**
 * Germinação final, em pontos percentuais — germinacaoParaSemeadura já
 * multiplicada pelos Fatores globais de Modo/Condição do Guia de Plantio.
 * Esses fatores vêm do Guia (escolhidos na hora, não são por produto) e
 * SEMPRE entram, mesmo quando há teste de campo: o teste mede a germinação
 * real, mas não sabe qual vai ser a forma de plantio da PRÓXIMA semeadura.
 */
export function germinacaoFinalSemeadura(a: LaudoParaSemeadura, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicao: number): number | null {
  const base = germinacaoParaSemeadura(a, produtos);
  if (base === null) return null;
  const final = base * fatorModo * fatorCondicao;
  return final > 0 ? final : null;
}

/**
 * Sementes por m² = Densidade desejada ÷ (Germinação final / 100) — a
 * REFERÊNCIA de todo o cálculo de semeadura é a Densidade (plântulas
 * estabelecidas por m² que o produtor quer no final); a Germinação final
 * (VC% do laudo OU teste de campo, × Índice de Sobrevivência, × Fatores de
 * Modo/Condição do Guia) diz que fração das sementes lançadas vira planta —
 * então pra chegar na Densidade alvo, lança-se Densidade/germinação
 * sementes por m². Não depende de PMS nem de área — é uma taxa pura.
 */
export function calcularSementesPorM2(a: LaudoParaSemeadura, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicao: number): number | null {
  const densidade = resolverDensidadeBase(a, produtos);
  const germinacao = germinacaoFinalSemeadura(a, produtos, fatorModo, fatorCondicao);
  if (densidade === null || germinacao === null) return null;
  return (densidade * 100) / germinacao;
}

/**
 * kg/ha = Sementes por m² × PMS ÷ 100 — o PMS só entra AQUI, como conversor
 * sementes→peso (PMS = peso de 1.000 sementes, em gramas). Sem PMS
 * cadastrado (nem no lote, nem base), não tem como saber o peso — mas
 * Sementes por m²/cova continuam calculáveis normalmente, só o kg/ha (e
 * tudo que depende dele: Peso total, Sacos, Valor) fica pendente.
 */
export function calcularKgPorHectareNumero(a: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicao: number): number | null {
  const sementesPorM2 = calcularSementesPorM2(a, produtos, fatorModo, fatorCondicao);
  const pms = paraNumero(a.pms) ?? resolverPmsBase(a, produtos);
  if (sementesPorM2 === null || pms === null) return null;
  return (sementesPorM2 * pms) / 100;
}

/** Igual calcularKgPorHectareNumero, mas já formatado (arredondado pra cima, número fechado) pra exibir. */
export function calcularKgPorHectare(a: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicao: number): string {
  const kgHa = calcularKgPorHectareNumero(a, produtos, fatorModo, fatorCondicao);
  // Arredonda sempre pra cima (nunca pra baixo) e pro inteiro fechado — é uma
  // recomendação de dosagem, então erra pra margem maior (mais semente, não
  // menos) e vira um número redondo, fácil de medir/comunicar no campo.
  return kgHa === null ? '—' : `${Math.ceil(kgHa)} kg/ha`;
}

/**
 * Covas por m² = 10.000 cm² (1 m²) ÷ (espaçamento entre covas na linha ×
 * espaçamento do corredor entre linhas), os dois em cm.
 */
export function calcularCovasPorM2(covaCm: number | null, corredorCm: number | null): number | null {
  if (covaCm === null || covaCm <= 0 || corredorCm === null || corredorCm <= 0) return null;
  return 10000 / (covaCm * corredorCm);
}

/**
 * Sementes por cova (alvo teórico) = Sementes por m² ÷ Covas por m² — o mesmo
 * total de sementes lançadas em 1 m² (ver calcularSementesPorM2), mas em vez
 * de espalhado a lanço, concentrado nas covas daquele m². Só usado como
 * referência de exibição — no modo Linha/Cova a Sementes/cova de verdade é
 * sempre digitada manualmente (nunca calculada), e é ela quem fixa o produto
 * Cova × Corredor; ver derivarEspacamento em GuiaPlantioModal.tsx.
 */
export function calcularSementesPorCova(sementesPorM2: number | null, covasPorM2: number | null): number | null {
  if (sementesPorM2 === null || covasPorM2 === null || covasPorM2 <= 0) return null;
  return sementesPorM2 / covasPorM2;
}

/**
 * Arredonda o total de embalagens/sacos por MARGEM de tolerância (cadastrada por grupo em
 * Parametrização, ver resolverMargemTolerancia — 25% se não cadastrado) em vez do arredondamento
 * padrão (0,5): até essa % de embalagem faltando ainda arredonda pra baixo (compra menos), acima
 * arredonda pra cima. Sempre no mínimo 1 quando há alguma demanda de verdade (senão "faltar pouco"
 * pra completar a PRIMEIRA embalagem resultaria em 0, o que não faz sentido).
 */
export function arredondarSacos(quociente: number, margemFracao: number): number {
  const inteiros = Math.floor(quociente);
  const fracao = quociente - inteiros;
  const sacos = fracao > margemFracao ? inteiros + 1 : inteiros;
  return quociente > 0 ? Math.max(sacos, 1) : 0;
}

/** Valor de um Fator (Modo ou Condição) cadastrado em `arquivos_fatores_plantio`, pela `chave` — 1 se não cadastrado (sem efeito na conta). */
export function fatorDe(fatores: FatorPlantio[], chave: string): number {
  return paraNumero(fatores.find((f) => f.chave === chave)?.fator ?? null) ?? 1;
}

/**
 * Sementes Tradicionais (soltas, pequenas) não dá pra catar uma a uma pra colocar na cova — só
 * pesar; Incrustadas (peletizadas) são grandes o bastante pra contar. Decide se o modo Covas mostra
 * "Sementes/cova" (contagem) ou "Peso/cova (g)" (via PMS) — os dois fatores importam juntos: só o
 * Processo não decide sozinho (uma Tradicional pura, com PMS cadastrado, ainda vira peso — PMS é
 * quem permite converter a contagem em gramas; sem PMS nenhum, não dá pra mostrar peso, e mostrar a
 * contagem crua seria enganoso pra uma semente que não dá pra contar no campo).
 */
export function precisaPesoPorCova(laudo: Pick<ArquivoLaudo, 'processo'>): boolean {
  return (laudo.processo ?? '').toLowerCase().includes('tradicional');
}

/** Validade no formato "MM/AAAA" (texto livre, digitado pelo operador) — convertida num número comparável (ano×12+mês). Sem validade cadastrada vai pro fim da lista (usado pra ordenar laudos do mais recente pro mais antigo). */
export function validadeParaOrdenacao(validade: string | null): number {
  const partes = (validade ?? '').split('/');
  if (partes.length !== 2) return -Infinity;
  const mes = Number(partes[0]);
  const ano = Number(partes[1]);
  if (!Number.isFinite(mes) || !Number.isFinite(ano)) return -Infinity;
  return ano * 12 + mes;
}

/**
 * Covas por m² TRAVADO — regra GERAL do modo Covas (Milho/Sorgo usa a regra própria em
 * GuiaPlantioModal.tsx, ver covasM2AlvoMilhoSorgo). PADRONIZADO em 4 (equivalente ao 50×50 de
 * sempre) — não é campo por produto. Não é editável de jeito nenhum; o único grau de liberdade é o
 * Corredor (Distância é sempre derivada dele pra manter esse valor fixo, ver distanciaDeCovasM2).
 */
export function covasM2Alvo(): number {
  return 4;
}

/** Distância (cm) no espaçamento padrão (grade quadrada no Covas/m² alvo, ver covasM2Alvo) — referência de "0% de desconto" pra sementesComAjustePorDistancia (regra geral). Valor EXATO (sem arredondar pro centímetro fechado), pra a curva ficar contínua. */
export function distanciaIdealProduto(): number {
  return Math.sqrt(10000 / covasM2Alvo());
}

/** Distância (cm) a partir de um Covas/m² alvo já resolvido e do Corredor digitado — Distância = 10000 ÷ (Corredor × Covas/m² alvo). Null com Corredor ou Covas/m² inválido. */
export function distanciaDeCovasM2(covasM2: number | null, corredorTexto: string): number | null {
  const corredor = paraNumero(corredorTexto);
  if (corredor === null || corredor <= 0 || covasM2 === null || covasM2 <= 0) return null;
  return 10000 / (corredor * covasM2);
}

/** O menor entre Distância e Corredor atuais — quem estiver mais apertado é quem realmente limita a competição entre plantas, então é esse valor que entra no desconto por espaçamento mínimo (ver sementesComAjustePorDistancia). Null com Corredor inválido. */
export function espacamentoDeDistancia(distancia: number | null, corredorTexto: string): number | null {
  const corredor = paraNumero(corredorTexto);
  return distancia === null || corredor === null ? null : Math.min(distancia, corredor);
}

// % de desconto na Sementes/cova por cm que o espaçamento efetivo (o menor entre Distância e
// Corredor atuais) fica mais apertado que a distância ideal — evita superdimensionar a cova quando
// o espaçamento aperta. Sem teto — a conta continua linear (nada empírico travando antes da hora).
const TAXA_AJUSTE_SEMENTES_POR_CM = 1;

/** Desconta a Sementes/cova padrão quando o espaçamento efetivo fica mais apertado que a distância ideal — 1%/cm de diferença, sem teto. Mais aberto que o ideal não faz nada (mantém o padrão, sem "prêmio" por sobrar espaço). */
export function sementesComAjustePorDistancia(sementesPadrao: number, espacamentoAtual: number, distanciaIdeal: number): number {
  const diferenca = distanciaIdeal - espacamentoAtual; // > 0: mais apertado (desconto); <= 0: sem ajuste
  if (diferenca <= 0) return sementesPadrao;
  const percentual = diferenca * TAXA_AJUSTE_SEMENTES_POR_CM;
  return sementesPadrao * (1 - percentual / 100);
}

/**
 * Sementes/cova (equivalente, sempre em SEMENTES) que bate EXATAMENTE o Máx. de plântulas/cova
 * cadastrado (Parametrização), numa dada Germinação final — regra GERAL pro modo Covas (Milho/Sorgo
 * usa a regra própria em GuiaPlantioModal.tsx), onde a Densidade não serve de referência (ela
 * funciona bem só pra "A Lanço"). Null sem Máx. cadastrado ou sem Germinação.
 */
export function sementesPorCovaAlvo(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number): number | null {
  const maxPlantulasCova = resolverMaxPlantulasCova(laudo, produtos);
  if (maxPlantulasCova === null || maxPlantulasCova <= 0) return null;
  const germinacaoFinal = germinacaoFinalSemeadura(laudo, produtos, fatorModo, fatorCondicaoValor);
  return germinacaoFinal !== null && germinacaoFinal > 0 ? (maxPlantulasCova * 100) / germinacaoFinal : null;
}

/**
 * Sementes/cova (equivalente, sempre em sementes) da regra GERAL do modo Covas — mira o Máx.
 * cadastrado (ver sementesPorCovaAlvo, ou o modelo por Densidade sem esse cadastro), descontada
 * conforme o espaçamento efetivo fica mais apertado que o ideal do produto (ver
 * sementesComAjustePorDistancia). `espacamentoAtual = null` devolve o valor SEM esse desconto (a
 * base "no espaçamento padrão"). Null quando falta algum dado (Germinação, Máx./Densidade).
 */
export function sementesCovaAtual(
  laudo: ArquivoLaudo,
  produtos: ProdutoParametrizacao[],
  fatorModo: number,
  fatorCondicaoValor: number,
  espacamentoAtual: number | null,
): number | null {
  let sementesCova = sementesPorCovaAlvo(laudo, produtos, fatorModo, fatorCondicaoValor);
  if (sementesCova === null) {
    const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoValor);
    sementesCova = calcularSementesPorCova(sementesPorM2, covasM2Alvo());
  }
  if (sementesCova === null || espacamentoAtual === null) return sementesCova;
  return sementesComAjustePorDistancia(sementesCova, espacamentoAtual, distanciaIdealProduto());
}

/**
 * kg/ha a partir de Covas/m² × Sementes/cova (equivalente) × PMS — a conta "de verdade" em modo
 * Covas, nunca só da Densidade (que em Covas só serve de estimativa de fallback).
 */
export function kgPorHaDeSementesCova(covasPorM2: number | null, sementesCova: number | null, pms: number | null): number | null {
  return covasPorM2 !== null && sementesCova !== null && pms !== null && pms > 0 ? (covasPorM2 * sementesCova * pms) / 100 : null;
}

/**
 * Fornecedor do laudo "bate" com o Fornecedor cadastrado no produto da Tabela de Preço — frouxo o
 * suficiente pra tolerar variações de escrita ("Barenbrug" x "Barenbrug Sementes"), mas por PALAVRA
 * inteira (não substring bruta): toda palavra do nome mais curto precisa aparecer como palavra
 * INTEIRA no nome mais longo. Substring bruta (versão antiga) deixava uma palavra curta/genérica
 * ("Grão") bater dentro de qualquer nome que a contivesse por acaso ("Multigrão"), mesmo sendo
 * fornecedores completamente diferentes — risco real, fechado. Também não depende mais da ordem das
 * palavras ("Sementes Adriana" agora bate com "Adriana Sementes"). Null de qualquer lado nunca bate.
 */
function fornecedorCasaComProduto(fornecedorLaudo: string | null, fornecedorProduto: string | null): boolean {
  if (!fornecedorLaudo || !fornecedorProduto) return false;
  const palavrasLaudo = normalizarNome(fornecedorLaudo).split(' ').filter(Boolean);
  const palavrasProduto = normalizarNome(fornecedorProduto).split(' ').filter(Boolean);
  const [menor, maior] = palavrasLaudo.length <= palavrasProduto.length ? [palavrasLaudo, palavrasProduto] : [palavrasProduto, palavrasLaudo];
  return menor.length > 0 && menor.every((palavra) => maior.includes(palavra));
}

/** Processos conhecidos do sistema — únicos usados pra decidir se a Tabela de Preço "menciona um Processo" (ver mencionaProcessoConflitante). */
const PROCESSOS_CONHECIDOS = ['tradicional', 'incrustado'];

/**
 * true quando a Tabela de Preço menciona um Processo (Tradicional/Incrustado) que não aparece em
 * lugar NENHUM do laudo (nem no campo Processo estruturado, nem solto no nome) — sinal de que é
 * OUTRA variante do mesmo Cultivar (ex.: laudo "Decumbens Incrustado" x produto "Brach Decumbens
 * Tradicional" — mesmo Cultivar, Processo diferente, produtos DIFERENTES), não simplesmente uma
 * Tabela que não repete o Processo no nome (aí nenhum dos dois lados menciona nenhum Processo, e
 * essa função devolve false — sem conflito, pode cair no Cultivar sozinho).
 */
function mencionaProcessoConflitante(nomeProdutoPreco: string, laudo: Pick<ArquivoLaudo, 'nomeProduto' | 'processo'>): boolean {
  const nomePrecoNorm = normalizarNome(nomeProdutoPreco);
  const nomeLaudoCompleto = normalizarNome(`${laudo.nomeProduto} ${laudo.processo ?? ''}`);
  return PROCESSOS_CONHECIDOS.some((proc) => nomePrecoNorm.includes(proc) && !nomeLaudoCompleto.includes(proc));
}

/**
 * Cultivar CADASTRADO nos 2 lados (`cultivarProduto`, da Tabela de Preço, e `cultivarDoLaudo`) —
 * compara direto, normalizado (sem acento/caixa), sem fuzzy matching nenhum: nada de heurística de
 * nome, nada de "descartar 1ª palavra achando que é Gênero" — os 2 lados dizem exatamente qual é o
 * Cultivar, então ou bate ou não bate. Processo (Tradicional/Incrustado) ainda não é campo próprio
 * do produto, então continua checado pelo NOME da Tabela de Preço (ver mencionaProcessoConflitante)
 * — só pra não deixar um laudo Incrustado entrar num produto que diz "Tradicional" no nome, mesmo
 * cultivar. Esse é o caminho MAIS ROBUSTO: uma vez cadastrado, mudar o texto do nome do produto (pra
 * ajustar destaque/marca, por exemplo) nunca mais quebra esse casamento.
 */
function cultivarCadastradoCasaComProduto(laudo: ArquivoLaudo, nomeProdutoPreco: string, cultivarProduto: string): boolean {
  if (normalizarNome(cultivarDoLaudo(laudo)) !== normalizarNome(cultivarProduto)) return false;
  return !mencionaProcessoConflitante(nomeProdutoPreco, laudo);
}

/**
 * Sem Cultivar cadastrado no produto (`cultivarProduto` null — a maioria hoje): casa por NOME, igual
 * antes — Cultivar do laudo (ver cultivarDoLaudo) + Processo (campo próprio do laudo) tentado
 * primeiro; se não bater, o Cultivar sozinho, MAS só quando a Tabela de Preço não menciona um
 * Processo conflitante (ver mencionaProcessoConflitante) — sem essa trava, um laudo "Incrustado"
 * casava com o produto "Tradicional" da mesma variedade só por causa do Cultivar em comum (bug real,
 * corrigido). O casamento em si usa cultivarCasaComNomePreco (núcleo sem o fallback de "descartar a
 * 1ª palavra achando que é Gênero" que laudoCasaComNomePreco tem) — aqui a 1ª palavra JÁ é o Cultivar
 * de verdade, não um Gênero cru; reaplicar aquele fallback descartaria o próprio Cultivar e sobraria
 * só o Processo, que casa com QUALQUER produto do mesmo Processo, espécie nenhuma a ver (bug real,
 * corrigido — um laudo de Panicum Massai/Mombaça puxando dados pra um Brachiaria Decumbens sem laudo
 * algum, só por os dois serem "Tradicional"). Tudo isso é DE PROPÓSITO sem o Gênero/Espécie: laudo e
 * Tabela às vezes escrevem o Gênero de formas totalmente diferentes pra mesma planta (ex.:
 * "U.Brizantha" no laudo x "Brach" na Tabela — Urochloa/Brachiaria é sinônimo taxonômico,
 * reclassificação, não é só abreviação, não tem prefixo em comum) — exigir o Gênero bater fazia
 * esses laudos nunca casarem com produto nenhum. Sem Cultivar isolável (raro — nomeProduto só tem a
 * Espécie, nada sobra), cai pro nomeProduto inteiro. Esse caminho por nome é inerentemente mais
 * frágil que o cadastrado (ver cultivarCadastradoCasaComProduto) — cadastrar o Cultivar no laudo E
 * no produto elimina essa fragilidade de vez.
 */
function cultivarPorNomeCasaComProduto(laudo: ArquivoLaudo, nomeProdutoPreco: string): boolean {
  const base = cultivarDoLaudo(laudo) || laudo.nomeProduto;
  if (laudo.processo && cultivarCasaComNomePreco(`${base} ${laudo.processo}`, nomeProdutoPreco)) return true;
  if (mencionaProcessoConflitante(nomeProdutoPreco, laudo)) return false;
  return cultivarCasaComNomePreco(base, nomeProdutoPreco);
}

function laudoCasaComProduto(laudo: ArquivoLaudo, nomeProdutoPreco: string, cultivarProduto: string | null): boolean {
  const cultivarProdutoLimpo = cultivarProduto?.trim();
  if (cultivarProdutoLimpo) return cultivarCadastradoCasaComProduto(laudo, nomeProdutoPreco, cultivarProdutoLimpo);
  return cultivarPorNomeCasaComProduto(laudo, nomeProdutoPreco);
}

/**
 * Laudo de maior Validade entre os que casam com esse produto da Tabela de Preço (ver
 * laudoCasaComProduto — por Cultivar cadastrado quando `cultivarProduto` vier preenchido, por nome
 * como fallback) — igual à ordenação já usada no Guia de Plantio. Quando o produto tem Fornecedor
 * cadastrado, o Fornecedor do laudo é EXIGIDO também (não só preferido): Cultivar sozinho não basta
 * pra distinguir o mesmo capim vendido por fornecedores diferentes (lotes/PMS/VC diferentes) —
 * melhor não mostrar nada do que mostrar o dado errado. Sem nenhum laudo com Fornecedor batendo,
 * retorna null. Produto SEM Fornecedor cadastrado não tem o que exigir, cai no casamento só por
 * Cultivar(+Processo) mesmo.
 */
export function encontrarLaudoParaProduto(
  nomeProdutoPreco: string,
  arquivos: ArquivoLaudo[],
  fornecedorProduto: string | null = null,
  cultivarProduto: string | null = null,
): ArquivoLaudo | null {
  const candidatos = arquivos.filter((a) => laudoCasaComProduto(a, nomeProdutoPreco, cultivarProduto));
  if (candidatos.length === 0) return null;
  const finalistas = fornecedorProduto ? candidatos.filter((a) => fornecedorCasaComProduto(a.fornecedor, fornecedorProduto)) : candidatos;
  if (finalistas.length === 0) return null;
  return [...finalistas].sort((a, b) => validadeParaOrdenacao(b.validade) - validadeParaOrdenacao(a.validade))[0];
}

export interface PlantioPublicoResultado {
  kgHaLanco: number | null;
  /** Sementes/cova ANTES do ajuste por espaçamento (Corredor no padrão, 50cm) — a página pública do Catálogo Online recalcula ao vivo a partir daqui conforme o Corredor que o cliente digitar (ver sementesComAjustePorDistancia). */
  sementesCovaBase: number | null;
  pms: number | null;
  /** VC% (Pureza × Germinação) do laudo escolhido — null sem essas duas preenchidas nesse laudo. Só pra EXIBIÇÃO no card do Catálogo Online. */
  vc: number | null;
  /** PMS como veio digitado NESSE laudo (texto cru, ex.: "3,794") — diferente de `pms` (usado no cálculo, que cai pro PMS base da Parametrização quando o laudo não tem); aqui NUNCA cai pro base, só pra exibição — null quando esse lote não tem PMS próprio informado. */
  pmsManual: string | null;
  /** Validade do laudo escolhido, como veio cadastrada (ex.: "07/2027") — só pra exibição. */
  validade: string | null;
  /** Margem de tolerância (%) do grupo pra arredondar embalagens (ver resolverMargemTolerancia/arredondarSacos) — 25 se não cadastrado, nunca null (a calculadora pública sempre tem algum valor pra arredondar). */
  margemTolerancia: number;
  /** = precisaPesoPorCova(laudo) — true: modo Covas mostra "Peso/cova (g)" (via `pms`) em vez de "Sementes/cova" (contagem). Sementes Tradicionais soltas não dá pra contar uma a uma, só pesar. */
  precisaPesoPorCova: boolean;
}

/**
 * Snapshot de plantio pro Catálogo Online (calculadora + informação discreta no card, ver
 * CatalogoPublicoPage.tsx) — condição sempre "Média" (sem seletor lá), regra GERAL de Covas pra
 * qualquer produto (mesmo Milho/Sorgo, que no Guia interno tem Sementes/cova editável —
 * simplificação combinada com o usuário pra essa calculadora pública). Calculado no momento de
 * "Publicar" (autenticado, com os laudos/Parametrização em mãos); a página pública só lê o
 * resultado, nunca o laudo em si.
 */
export function resolverPlantioParaProduto(
  nomeProdutoPreco: string,
  arquivos: ArquivoLaudo[],
  produtos: ProdutoParametrizacao[],
  fatores: FatorPlantio[],
  fornecedorProduto: string | null = null,
  cultivarProduto: string | null = null,
): PlantioPublicoResultado {
  const laudo = encontrarLaudoParaProduto(nomeProdutoPreco, arquivos, fornecedorProduto, cultivarProduto);
  if (!laudo) {
    return { kgHaLanco: null, sementesCovaBase: null, pms: null, vc: null, pmsManual: null, validade: null, margemTolerancia: 25, precisaPesoPorCova: false };
  }
  const fatorCondicaoMedia = resolverFatorCondicao(laudo, 'media', produtos, fatores);
  const kgHaLanco = calcularKgPorHectareNumero(laudo, produtos, fatorDe(fatores, 'lanco'), fatorCondicaoMedia);
  const sementesCovaBase = sementesCovaAtual(laudo, produtos, fatorDe(fatores, 'linha_cova'), fatorCondicaoMedia, null);
  const pms = resolverPmsDoLaudo(laudo, produtos);
  const vc = calcularVCNumero(laudo);
  const margemTolerancia = resolverMargemTolerancia(laudo, produtos);
  return { kgHaLanco, sementesCovaBase, pms, vc, pmsManual: laudo.pms, validade: laudo.validade, margemTolerancia, precisaPesoPorCova: precisaPesoPorCova(laudo) };
}

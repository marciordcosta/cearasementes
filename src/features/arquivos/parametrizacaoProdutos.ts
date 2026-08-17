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

/** Identidade mínima que qualquer laudo precisa expor pra achar sua Parametrização (ver cultivarDoLaudo/encontrarProduto) — um Pick, não o ArquivoLaudo inteiro, porque alguns chamadores (ex.: TesteModal) só têm um objeto parcial em mãos. */
export type IdentidadeLaudo = Pick<ArquivoLaudo, 'nomeProduto' | 'especie' | 'processo' | 'cultivar'>;

/**
 * Cultivar do Selo/Parametrização sai direto do nome do produto do laudo (nomeProduto = Espécie +
 * Cultivar + Processo, ver interpretarConteudoLaudo.ts), sem precisar de cadastro à parte: descarta
 * as palavras da Espécie do início (ex.: "Andropogon Gayanus" = 2 palavras), sobrando só o Cultivar.
 * Sem Espécie conhecida (laudo antigo, ou modelo de documento que não destaca Espécie à parte),
 * assume 1 palavra de gênero só (comportamento antigo, ex.: "Andropogon Planaltina" -> descarta só
 * "Andropogon"). Também descarta qualquer palavra que seja o Processo (`processo`, ex.:
 * "Tradicional") — sem isso, sobrava colado no fim do Cultivar (nomeProduto termina com o Processo)
 * e quem monta "Cultivar + Processo" a partir daqui acabava repetindo a palavra (bug real, corrigido
 * — ver cultivarDoLaudo). Se alguma palavra do que sobrar contiver "incrustad" mesmo sem `processo`
 * preenchido (modelo de documento antigo que não separa esse campo), essa palavra também sai.
 */
export function derivarCultivar(nomeProduto: string, especie?: string | null, processo?: string | null): string {
  const palavras = nomeProduto.trim().split(/\s+/).filter(Boolean);
  const palavrasEspecie = especie ? especie.trim().split(/\s+/).filter(Boolean).length : 1;
  const semGenero = palavras.slice(palavrasEspecie);
  const palavrasProcesso = new Set((processo ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean));
  return semGenero.filter((p) => !/incrustad/i.test(p) && !palavrasProcesso.has(p.toLowerCase())).join(' ');
}

/** Cultivar do laudo — o cadastrado à mão (`laudo.cultivar`, ver ArquivoLaudo) quando existir; sem isso, derivado do Nome do Produto (ver derivarCultivar). Usado tanto pra achar a Parametrização (ver encontrarProduto) quanto pro casamento com a Tabela de Preço (ver laudoCasaComProduto em calculoSemeadura.ts) e pro Cultivar do Selo (ver montarDadosEtiqueta em etiqueta.ts). */
export function cultivarDoLaudo(laudo: IdentidadeLaudo): string {
  return (laudo.cultivar || derivarCultivar(laudo.nomeProduto, laudo.especie, laudo.processo)).trim();
}

/**
 * Acha a Parametrização cadastrada pro Cultivar+Processo desse laudo — comparação EXATA
 * (normalizada, sem acento/caixa), sem heurística de nome nenhuma: Cultivar (ver cultivarDoLaudo) e
 * Processo são campos PRÓPRIOS de cada lado (laudo e cadastro de Parametrização, ver
 * ProdutoParametrizacao.cultivar/processo), então ou batem os dois ou não bate nada — nunca uma
 * aproximação por posição de palavra (o antigo grupoDoNome, que reduzia o nome à 1ª+3ª palavra e
 * podia juntar cultivares diferentes debaixo do mesmo "grupo", ou separar o mesmo cultivar em dois
 * grupos por causa de uma palavra a mais/a menos no nome). Sem Cultivar isolável (raro), não casa
 * com nada — melhor não achar Parametrização nenhuma do que achar a errada.
 */
function encontrarProduto(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): ProdutoParametrizacao | null {
  const cultivar = normalizarNome(cultivarDoLaudo(laudo));
  if (!cultivar) return null;
  const processo = normalizarNome(laudo.processo ?? '');
  return produtos.find((p) => normalizarNome(p.cultivar ?? '') === cultivar && normalizarNome(p.processo ?? '') === processo) ?? null;
}

/** PMS base do produto, como texto cru (pra exibir na grade exatamente como foi cadastrado) — null se não houver cadastro pra esse produto. */
export function resolverPmsBaseTexto(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): string | null {
  return encontrarProduto(laudo, produtos)?.pmsBase ?? null;
}

/** PMS base do produto, já convertido pra número (pra entrar na conta de kg/ha). */
export function resolverPmsBase(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(resolverPmsBaseTexto(laudo, produtos));
}

/** PMS do lote (digitado em EditarLaudoModal/TesteModal) ou, em branco, o PMS base do produto na Parametrização — já como número, pronto pra conta (ver calculoSemeadura.ts e resultadoTesteNumero em testeGerminacao.ts). */
export function resolverPmsDoLaudo(laudo: IdentidadeLaudo & Pick<ArquivoLaudo, 'pms'>, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(laudo.pms) ?? resolverPmsBase(laudo, produtos);
}

/** Densidade base do produto, como texto cru — não é editável por lote, então isso é sempre o que a grade mostra. */
export function resolverDensidadeBaseTexto(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): string | null {
  return encontrarProduto(laudo, produtos)?.densidadeBase ?? null;
}

/** Densidade base do produto, já convertida pra número (pra entrar na conta de kg/ha). */
export function resolverDensidadeBase(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(resolverDensidadeBaseTexto(laudo, produtos));
}

/** Índice de Sobrevivência do produto, como fração (0 a 1) — ex.: cadastro "35" (%) vira 0.35. Null se não cadastrado. */
export function resolverIndiceSobrevivencia(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): number | null {
  const percentual = paraNumero(encontrarProduto(laudo, produtos)?.indiceSobrevivencia ?? null);
  return percentual === null ? null : percentual / 100;
}

/** Máximo de plântulas estabelecidas (pós-perdas) por cova, como número — usado pra calcular o espaçamento padrão do Guia de Plantio em modo Covas (ver calcularEspacamentoPadrao em GuiaPlantioModal.tsx). Null se não cadastrado. */
export function resolverMaxPlantulasCova(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(encontrarProduto(laudo, produtos)?.maxPlantulasCova ?? null);
}

/** Máximo de plântulas estabelecidas por metro linear de linha, como número — 3ª dimensão de densidade (junto com resolverDensidadeBase, por m², e resolverMaxPlantulasCova, por cova). Equivale a uma distância mínima em cm (100 ÷ esse valor) entre plântulas na linha, usada no Guia de Plantio (ver distanciaMinimaEfetivaMilhoSorgo/modoLinearCapim em GuiaPlantioModal.tsx). Null se não cadastrado. */
export function resolverMaxPlantulasMetroLinear(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(encontrarProduto(laudo, produtos)?.maxPlantulasMetroLinear ?? null);
}

/**
 * Fator de perda (multiplicador 0–1) pra uma Condição de Implantação do Guia de Plantio — prioriza o
 * valor cadastrado POR PRODUTO (Parametrização, ex.: Milho aguenta bem menos variação de condição que um
 * capim já estabelecido); sem isso, cai no fator GLOBAL de sempre (arquivos_fatores_plantio). "Ideal" não
 * tem override em lugar nenhum — é sempre 0% de perda (fator 1) por definição.
 */
export function resolverFatorCondicao(
  laudo: IdentidadeLaudo,
  condicao: 'ideal' | 'media' | 'baixa',
  produtos: ProdutoParametrizacao[],
  fatoresGlobais: FatorPlantio[],
): number {
  if (condicao === 'ideal') return 1;
  const produto = encontrarProduto(laudo, produtos);
  const perdaTexto = condicao === 'media' ? produto?.perdaMedia : produto?.perdaBaixa;
  const perdaProduto = paraNumero(perdaTexto ?? null);
  if (perdaProduto !== null) return 1 - perdaProduto / 100;
  return paraNumero(fatoresGlobais.find((f) => f.chave === condicao)?.fator ?? null) ?? 1;
}

/** Modo de plantio padrão do produto (Cova, Lanço ou Linha) — só pré-seleciona o modo ao adicionar no Guia de Plantio, nunca entra em cálculo. Null = sem preferência cadastrada. */
export function resolverModoPlantio(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): 'cova' | 'lanco' | 'linha' | null {
  return encontrarProduto(laudo, produtos)?.modoPlantio ?? null;
}

/** Margem de tolerância (%) do produto pra arredondar sacos — 25% se não cadastrado (ver arredondarSacos em GuiaPlantioModal.tsx). */
export function resolverMargemTolerancia(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): number {
  const percentual = paraNumero(encontrarProduto(laudo, produtos)?.margemTolerancia ?? null);
  return percentual ?? 25;
}

/** Texto livre da linha "Observação" do Selo impresso (ex.: registro RENASEM do produtor). Null se não cadastrado. */
export function resolverObservacaoEtiqueta(laudo: IdentidadeLaudo, produtos: ProdutoParametrizacao[]): string | null {
  return encontrarProduto(laudo, produtos)?.observacaoEtiqueta ?? null;
}

/** Duas palavras "iguais pra fins de nome" — idênticas, ou diferindo só na última letra (gênero: "incrustada" x "incrustado"). Exige pelo menos 4 caracteres pra não deixar palavra curta demais (ex.: "de", "do") crescer um falso positivo. */
function palavrasParecidas(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  return minLen >= 4 && a.slice(0, minLen - 1) === b.slice(0, minLen - 1);
}

/** "Panicum Tanzania Tradicional 15kg" -> ["panicum","tanzania","tradicional"] (ignora números soltos, tipo lote/peso, e palavras curtas demais). */
function termosDeConteudo(nome: string): string[] {
  return normalizarNome(nome)
    .split(' ')
    .filter((palavra) => palavra.length >= 3 && !/^\d+$/.test(palavra));
}

/**
 * Núcleo do casamento: toda palavra de `termosLaudo` precisa aparecer, em algum lugar, no nome da
 * Tabela de Preço — não depende de posição nem de reduzir os dois nomes do mesmo jeito. Necessário
 * porque a Tabela de Preço segue um padrão BEM diferente do laudo: tem gênero científico na frente e
 * peso do pacote no fim ("Panicum Tanzania Tradicional 15kg"), enquanto o laudo só traz a variedade e
 * o tratamento — comparar por posição de palavra (1ª/3ª) não reconcilia os dois formatos ao mesmo
 * tempo; comparar se as palavras aparecem soltas no nome da Tabela de Preço funciona nos dois
 * formatos, sem precisar saber qual é o gênero.
 *
 * Remove `*negrito*`/`_itálico_` do nome da Tabela de Preço antes de comparar (ver
 * NomeComDestaque.tsx — marcação digitada no cadastro, não faz parte da palavra em si): sem isso, um
 * asterisco colado ("*planaltina*") desloca a comparação de prefixo em palavrasParecidas e o
 * casamento falha bem na palavra que mais importa (o Cultivar, quase sempre o que fica em negrito).
 */
function casamentoDeTermos(termosLaudo: string[], nomeProdutoPreco: string): boolean {
  if (termosLaudo.length === 0) return false;
  const palavrasPreco = normalizarNome(nomeProdutoPreco.replace(/[*_]/g, '')).split(' ');
  return termosLaudo.every((termo) => palavrasPreco.some((palavra) => palavrasParecidas(termo, palavra)));
}

/**
 * Casa o nome CRU de um laudo (ainda com o Gênero na frente, ex.: "Tanzania 1 Tradicional" — o "1" é
 * o número do lote) com o nome de um produto da Tabela de Preço — ver casamentoDeTermos pro núcleo.
 *
 * O Gênero (1ª palavra do laudo) às vezes é sinônimo taxonômico/abreviação BEM diferente do usado na
 * Tabela de Preço (ex.: "U.Brizantha" no laudo x "Brach" na Tabela — Urochloa/Brachiaria é a mesma
 * planta reclassificada, não dá pra aproximar por prefixo comum) — quando o casamento completo falha,
 * tenta de novo SEM a 1ª palavra do laudo. Só usa esse resultado se sobrarem pelo menos 2 termos
 * depois de tirar o Gênero (Cultivar + Processo, por exemplo) — com só 1 termo genérico sobrando
 * (ex.: só "Incrustado"), esse laudo casaria com QUALQUER produto que tenha essa palavra, misturando
 * PMS/VC de produtos diferentes. Só faz sentido pra nome CRU — usar isso com um Cultivar já isolado
 * descartaria o próprio Cultivar achando que é Gênero (ver cultivarCasaComNomePreco).
 */
export function laudoCasaComNomePreco(nomeLaudo: string, nomeProdutoPreco: string): boolean {
  const termosLaudo = termosDeConteudo(nomeLaudo);
  if (casamentoDeTermos(termosLaudo, nomeProdutoPreco)) return true;
  const semGenero = termosLaudo.slice(1);
  return semGenero.length >= 2 && casamentoDeTermos(semGenero, nomeProdutoPreco);
}

/** Acha o produto da Tabela de Preço (módulo Precificação) que corresponde ao nome de um laudo — usado pra puxar peso do saco/valor sem precisar cadastrar essa ligação manualmente (ver laudoCasaComNomePreco). */
export function encontrarProdutoPreco(nomeProduto: string, produtosPreco: Produto[]): Produto | null {
  return produtosPreco.find((p) => laudoCasaComNomePreco(nomeProduto, p.nome)) ?? null;
}

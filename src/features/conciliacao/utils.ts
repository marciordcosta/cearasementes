// ---------------------------------------------------------------------
// Utilitários de texto/data — porte direto do conciliacao.js original
// (funções puras, sem DOM, fáceis de testar isoladas).
// ---------------------------------------------------------------------

export function removerAcentos(str: unknown): string {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '');
}

/**
 * Compara dois valores com tolerância — `<=` pra uma regra com tolerância 0
 * ainda aceitar valores exatamente iguais. O `+ 1e-9` absorve erro de ponto
 * flutuante do próprio JS: `93.34 - 93.33` não dá exatamente `0.01`, dá
 * `0.010000000000005116` — sem essa folga, uma diferença que devia bater
 * exatamente no limite da tolerância falhava por uma casa decimal
 * inexistente na prática (13ª casa), escondendo sugestões que deveriam
 * aparecer.
 */
export function valoresIguais(a: number, b: number, tolerancia = 0.01): boolean {
  return Math.abs(a - b) <= tolerancia + 1e-9;
}

/** Diferença desprezível (só arredondamento de ponto flutuante, não a tolerância configurável da regra) — usado pra separar "valor exato" de "valor aproximado dentro da tolerância" nas categorias de sugestão. */
export function valoresExatamenteIguais(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.001;
}

/** Conta dias úteis estritamente entre `inicio` e `fim` (assume `inicio <= fim`), parando cedo (retorna algo > diasMax) assim que ultrapassa `diasMax` — evita percorrer intervalos longos à toa nos filtros de janela de Boleto. */
export function diasUteisAte(inicio: Date, fim: Date, diasMax: number): number {
  let diasUteis = 0;
  const cur = new Date(inicio);
  while (cur < fim) {
    cur.setDate(cur.getDate() + 1);
    const dia = cur.getDay();
    if (dia !== 0 && dia !== 6) diasUteis++;
    if (diasUteis > diasMax) return diasUteis;
  }
  return diasUteis;
}

/** Diferença em DIAS ÚTEIS entre duas datas ISO (YYYY-MM-DD); negativo se dataSistema vier depois de dataOfx. */
export function diffDiasUteis(dataSistema: string, dataOfx: string): number {
  let d1 = new Date(dataSistema);
  let d2 = new Date(dataOfx);

  let sinal = 1;
  if (d1 > d2) {
    sinal = -1;
    [d1, d2] = [d2, d1];
  }

  let dias = 0;
  const cur = new Date(d1);
  while (cur < d2) {
    cur.setDate(cur.getDate() + 1);
    const dia = cur.getDay();
    if (dia !== 0 && dia !== 6) dias++;
  }
  return dias * sinal;
}

/** Descrição do OFX -> nome de cliente comparável (remove termos de meio de pagamento, números, pontuação). */
export function normalizarNomeClienteOfx(str: unknown): string | null {
  if (!str) return null;
  const normalizado = removerAcentos(str)
    .toLowerCase()
    .replace(/\b(pix|transfer|transf|dinheiro|pagamento|compra|debito|credito|cartao|boleto|cobranca|ref|id)\b/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalizado || null;
}

/**
 * "Nomes fortemente parecidos" — usado no match PIX (nome do OFX x cliente
 * do sistema): nome completo contido um no outro, OU primeiro nome igual +
 * inicial do sobrenome batendo (ex.: OFX "francisco l" x Sistema "francisco lima").
 * `minContido`/`minSobrenome` vêm da regra parametrizável de PIX (ver regras.ts).
 */
export function nomesSemelhantesFortes(nomeOfx: string | null, nomeSys: string | null, minContido = 8, minSobrenome = 5): boolean {
  if (!nomeOfx || !nomeSys) return false;
  const a = nomeOfx.trim();
  const b = nomeSys.trim();

  if (a.length >= minContido && b.includes(a)) return true;
  if (b.length >= minContido && a.includes(b)) return true;

  const pa = a.split(' ');
  const pb = b.split(' ');
  if (pa.length === 0 || pb.length < 2) return false;

  if (pa[0] !== pb[0]) return false;

  if (pa.length === 2 && pa[1].length === 1) {
    const inicial = pa[1];
    const sobrenomeSys = pb[1];
    if (sobrenomeSys && sobrenomeSys.length >= minSobrenome && sobrenomeSys.startsWith(inicial)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------
// Detecção de forma de pagamento / subtipo de cartão
// ---------------------------------------------------------------------
export function detectPaymentTypeFromOfx(desc: unknown): 'PIX' | 'CARTAO' | 'BOLETO' | 'CHEQUE' | 'RENDIMENTO' | 'OUTRO' {
  if (!desc) return 'OUTRO';
  const t = removerAcentos(desc).toLowerCase();

  if (t.includes('cartao') || t.includes('carto') || t.includes('credito') || t.includes('debito')) return 'CARTAO';
  if (t.includes('boleto') || t.includes('cobranca')) return 'BOLETO';
  if (t.includes('rendimento') || t.includes('rende')) return 'RENDIMENTO';
  if (t.includes('cheque') || t.includes('chq')) return 'CHEQUE';
  if (t.includes('pix') || t.includes('dinheiro') || t.includes('transf') || t.includes('doc') || t.includes('ted')) return 'PIX';
  return 'OUTRO';
}

/** Mesma classificação, mas a partir do campo "tipo" cru do sistema (Max Data) — aceita abreviações (ex.: "crd", "dbi"). */
export function getCategoriaSistema(tipo: unknown): 'PIX' | 'CARTAO' | 'BOLETO' | 'CHEQUE' | 'RENDIMENTO' | 'OUTRO' {
  const s = removerAcentos(tipo).toLowerCase();
  if (s.includes('pix') || s.includes('transf') || s.includes('doc') || s.includes('ted')) return 'PIX';
  if (s.includes('cheque')) return 'CHEQUE';
  if (s.includes('cartao') || s.includes('carto') || s.includes('credito') || s.includes('debito')) return 'CARTAO';
  if (s.includes('boleto') || s.includes('cobranca')) return 'BOLETO';
  if (s.includes('rendimento') || s.includes('rende')) return 'RENDIMENTO';
  return 'OUTRO';
}

export function getSubtipoCartaoOfx(desc: unknown): 'DEBITO' | 'CREDITO' | null {
  if (!desc) return null;
  const t = removerAcentos(desc).toLowerCase();
  if (t.includes('debito')) return 'DEBITO';
  if (t.includes('credito')) return 'CREDITO';
  return null;
}

/** Aceita tanto abreviações curtas ("dbi"/"crd") quanto o texto real do Max Data ("Cartao Deb"/"Cartao Cred") — "deb"/"cred" não são iguais a "dbi"/"crd" (têm um "e" a mais), então precisam de checagem própria. */
export function getSubtipoCartaoSistema(tipo: unknown): 'DEBITO' | 'CREDITO' | null {
  if (!tipo) return null;
  const t = removerAcentos(tipo).toLowerCase();
  if (t.includes('dbi') || t.includes('deb')) return 'DEBITO';
  if (t.includes('crd') || t.includes('cred')) return 'CREDITO';
  return null;
}

export interface Parcela {
  atual: number;
  total: number;
}

/** Extrai "X/Y" de um texto — descrição do Banco ("Stone Elo Credito - parcela 3/3") ou documento do Sistema ("VE40440-3/3"). Mesma notação nos dois lados, usada pra desambiguar candidatos de valor muito parecido (parcelas de valor igual de uma venda parcelada). */
export function extrairParcela(texto: unknown): Parcela | null {
  const m = String(texto ?? '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { atual: parseInt(m[1], 10), total: parseInt(m[2], 10) };
}

/** Compatível quando as duas parcelas batem OU quando um dos lados não tem informação de parcela nenhuma (venda à vista no Sistema não tem sufixo "-N/M" no documento) — só é INcompatível quando os dois lados têm parcela conhecida e ela diverge. */
export function parcelaCompativel(a: Parcela | null, b: Parcela | null): boolean {
  if (!a || !b) return true;
  return a.atual === b.atual && a.total === b.total;
}

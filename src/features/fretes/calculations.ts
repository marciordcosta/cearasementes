import type { CotacaoFreteInput, CotacaoFreteResultado, RotaParametros, Transportadora } from './types';

/**
 * Cotação de frete — porte fiel do calcularFrete() do protótipo
 * (frete.html/frete.js): custo = peso*R$/kg + valor da NF + taxa de coleta,
 * respeitando o frete mínimo. valorNf/taxaColeta usam o `_tipo` explícito
 * (percentual do valor da mercadoria, ou fixo em R$) — no protótipo original
 * essa decisão era implícita ("se <= 1, é percentual"), aqui é uma coluna.
 */
export function cotarFrete(transportadoras: Transportadora[], input: CotacaoFreteInput): CotacaoFreteResultado[] {
  const atendem = transportadoras.filter((t) => t.ativa && t.prazos.some((p) => normalizarCidade(p.cidade) === normalizarCidade(input.cidade)));

  return atendem.map((t) => {
    const prazoCidade = t.prazos.find((p) => normalizarCidade(p.cidade) === normalizarCidade(input.cidade))!;

    const valorNf = t.valorPorNfTipo === 'percentual' ? input.valorMercadoria * t.valorPorNf : t.valorPorNf;
    const taxaColeta = t.taxaColetaTipo === 'percentual' ? input.valorMercadoria * t.taxaColeta : t.taxaColeta;

    let total = input.peso * t.valorPorKg + valorNf + taxaColeta;
    if (total < t.freteMinimo) total = t.freteMinimo;

    return {
      transportadoraId: t.id,
      nome: t.nome,
      uf: t.uf,
      prazo: prazoCidade.prazoHoras ?? prazoCidade.prazoTexto ?? '—',
      valorNf,
      taxaColeta,
      total,
      pctValorCarga: input.valorMercadoria > 0 ? (total / input.valorMercadoria) * 100 : 0,
      custoPorKg: input.peso > 0 ? total / input.peso : 0,
    };
  });
}

/** Sempre do mais barato pro mais caro — o resultado destaca o primeiro (menor frete) como recomendação. */
export function ordenarCotacoes(cotacoes: CotacaoFreteResultado[]): CotacaoFreteResultado[] {
  return [...cotacoes].sort((a, b) => a.total - b.total);
}

/** Horas de condução realmente disponíveis num dia cheio, já descontada a pausa (almoço/descanso) fixa. */
function horasJornada(p: RotaParametros): number {
  return Math.max(0, p.jornadaFimHora - p.jornadaInicioHora - p.pausaHoras);
}

/** Km rodado num dia "cheio" (jornada inteira, na velocidade média) — é o valor que antes era digitado direto em "Média de km rodado por dia". */
export function kmPorDiaCheio(p: RotaParametros): number {
  return p.velocidadeMedia * horasJornada(p);
}

function horaTextoParaNumero(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}

function formatarHora(h: number): string {
  const horaNormalizada = ((h % 24) + 24) % 24;
  const hh = Math.floor(horaNormalizada);
  const mm = Math.round((horaNormalizada - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Horas de condução disponíveis no 1º dia (já descontada a pausa) — o resto
 * dos dias sempre roda a jornada cheia, mas o 1º depende de quando a viagem
 * realmente sai: se sai antes da jornada começar, aproveita o dia inteiro (só
 * começa a rodar quando a jornada abre); se sai no meio, só sobra o resto do
 * dia; se sai depois da jornada já ter fechado, não roda nada nesse 1º dia
 * (o motorista só começa a rodar de fato no dia seguinte).
 */
function horasDia1(p: RotaParametros): number {
  const saida = horaTextoParaNumero(p.horarioInicio);
  if (saida <= p.jornadaInicioHora) return horasJornada(p);
  if (saida >= p.jornadaFimHora) return 0;
  return Math.max(0, p.jornadaFimHora - saida - p.pausaHoras);
}

/** Em que dia (1-indexado) e horário aproximado a viagem acumula `kmAlvo` km rodados, dado o dia 1 (parcial) + dias seguintes (jornada cheia). */
function pontoNoTempo(kmAlvo: number, p: RotaParametros): { dia: number; horario: string } {
  const cheio = horasJornada(p);
  const dia1 = horasDia1(p);
  let acumuladoKm = 0;

  for (let dia = 1; dia <= 60; dia++) {
    const horasHoje = dia === 1 ? dia1 : cheio;
    const kmHoje = horasHoje * p.velocidadeMedia;
    if (kmHoje > 0 && acumuladoKm + kmHoje >= kmAlvo) {
      const horasNecessarias = p.velocidadeMedia > 0 ? (kmAlvo - acumuladoKm) / p.velocidadeMedia : 0;
      const horaInicioDoDia = dia === 1 ? horaTextoParaNumero(p.horarioInicio) : p.jornadaInicioHora;
      // A pausa acontece uma vez por dia — soma no horário de chegada (não afeta a capacidade em km, que já foi descontada em horasJornada/horasDia1).
      return { dia, horario: formatarHora(horaInicioDoDia + horasNecessarias + p.pausaHoras) };
    }
    acumuladoKm += kmHoje;
    // Nem o 1º dia nem os seguintes rodam nada (jornada mal configurada) — devolve o próprio "dia 1" sem mais voltas, pra não travar num loop sem sentido.
    if (cheio <= 0 && dia1 <= 0) return { dia: 1, horario: p.horarioInicio };
  }
  return { dia: 60, horario: formatarHora(p.jornadaFimHora) };
}

/**
 * Custo da Rota de Frota Própria — diferente da cotação por transportadora
 * (que é peso × R$/kg): aqui o custo é por quilometragem rodada (ida e
 * volta) + uma despesa extra por dia de viagem (motorista, alimentação...).
 * Os dias vêm de simular dia a dia quanto se roda (1º dia parcial, a partir
 * do horário real de saída; os demais na jornada cheia).
 */
export function calcularCustoRota(kmTotal: number, parametros: RotaParametros, pesoTotal: number, valorCarga: number) {
  const diasViagem = kmPorDiaCheio(parametros) > 0 || horasDia1(parametros) > 0 ? pontoNoTempo(kmTotal, parametros).dia : 0;
  const valorFrete = kmTotal * parametros.valorKm + diasViagem * parametros.despesaExtraDia;
  return {
    diasViagem,
    valorFrete,
    pctValorCarga: valorCarga > 0 ? (valorFrete / valorCarga) * 100 : 0,
    custoPorKg: pesoTotal > 0 ? valorFrete / pesoTotal : 0,
  };
}

/** Dia + horário aproximado de chegada em cada trecho — usa o mesmo simulador dia a dia do custo, sobre o km ACUMULADO até aquele trecho. */
export function chegadaDoTrecho(kmAcumulado: number, parametros: RotaParametros): { dia: number; horario: string } {
  return pontoNoTempo(kmAcumulado, parametros);
}

/** Cidade + UF de toda transportadora cadastrada — usado como sugestão de autocomplete (Cotação de Frete e Rota de Frota Própria), sempre com o estado junto pra não confundir cidades homônimas. */
export function cidadesDasTransportadoras(transportadoras: Transportadora[]): { valor: string; meta: string }[] {
  const ufPorCidade = new Map<string, string>();
  transportadoras.forEach((t) =>
    t.prazos.forEach((p) => {
      if (!ufPorCidade.has(p.cidade)) ufPorCidade.set(p.cidade, t.uf);
    }),
  );
  return Array.from(ufPorCidade.entries())
    .map(([cidade, uf]) => ({ valor: cidade, meta: uf }))
    .sort((a, b) => a.valor.localeCompare(b.valor, 'pt-BR'));
}

export function normalizarCidade(cidade: string): string {
  return cidade
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** "Fortaleza, CE" -> "Fortaleza" (só o nome, sem UF) — "Fortaleza" (sem vírgula) volta como está. */
export function apenasNomeCidade(cidade: string): string {
  return cidade.split(',')[0].trim();
}

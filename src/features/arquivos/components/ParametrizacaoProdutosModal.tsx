import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AutocompleteInput } from '@/features/fretes/components/AutocompleteInput';
import { paraNumero } from '../metricas';
import { cultivarDoLaudo, normalizarNome } from '../parametrizacaoProdutos';
import type { ArquivoLaudo, ChecklistPergunta, FatorPlantio, ManualPlantio, ProdutoParametrizacao } from '../types';

type Aba = 'produtos' | 'checklist' | 'plantio';

const ABAS: { valor: Aba; rotulo: string; icone: string }[] = [
  { valor: 'produtos', rotulo: 'Produtos', icone: '🌾' },
  { valor: 'checklist', rotulo: 'Checklist', icone: '☑️' },
  { valor: 'plantio', rotulo: 'Plantio', icone: '🌱' },
];

interface CamposProduto {
  cultivar: string;
  processo: string;
  pmsBase: string;
  /** As 3 colunas de densidade (m² → linear → cova) ficam juntas, nessa ordem — cada modo de plantio usa a que corresponde (ver ProdutoParametrizacao). */
  densidadeBase: string;
  maxPlantulasMetroLinear: string;
  maxPlantulasCova: string;
  indiceSobrevivencia: string;
  perdaMedia: string;
  perdaBaixa: string;
  modoPlantio: 'cova' | 'lanco' | 'linha' | null;
  margemTolerancia: string;
  observacaoEtiqueta: string;
}

interface ParametrizacaoProdutosModalProps {
  open: boolean;
  produtos: ProdutoParametrizacao[];
  /** Laudos importados — sugere linhas de Cultivar+Processo ainda sem cadastro (ver linhasParametrizacao), a partir do Cultivar/Processo de cada laudo (campos próprios, ver cultivarDoLaudo). */
  arquivos: ArquivoLaudo[];
  fatores: FatorPlantio[];
  checklist: ChecklistPergunta[];
  manual: ManualPlantio | null;
  onFechar: () => void;
  /** `idExistente` = id da linha já cadastrada (update por id) ou null pra linha nova (upsert por Cultivar+Processo) — ver onSalvarProduto em ArquivosPage.tsx. */
  onSalvar: (
    produto: {
      cultivar: string;
      processo: string;
      pmsBase: string;
      densidadeBase: string;
      maxPlantulasMetroLinear: string;
      maxPlantulasCova: string;
      indiceSobrevivencia: string;
      perdaMedia: string;
      perdaBaixa: string;
      modoPlantio: 'cova' | 'lanco' | 'linha' | null;
      margemTolerancia: string;
      observacaoEtiqueta: string;
    },
    idExistente: string | null,
  ) => void;
  onApagar: (id: string) => void;
  onSalvarFator: (chave: string, fator: string) => void;
  onSalvarResumoCondicao: (chave: string, resumo: string) => void;
  onAdicionarPerguntaChecklist: (pergunta: string) => void;
  onSalvarPerguntaChecklist: (id: string, pergunta: string) => void;
  onApagarPerguntaChecklist: (id: string) => void;
  onAdicionarOpcaoChecklist: (perguntaId: string, texto: string, condicaoChave: string) => void;
  onSalvarOpcaoChecklist: (id: string, patch: { texto?: string; condicaoChave?: string }) => void;
  onApagarOpcaoChecklist: (id: string) => void;
  onSalvarManual: (manual: ManualPlantio) => void;
}

const campoClasse = 'rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** O banco guarda o fator (multiplicador, ex.: "0,75"), mas aqui exibe/edita a PERDA em % (ex.: "25") — mais intuitivo que digitar um multiplicador. Perda% = (1 - fator) × 100, e volta: fator = 1 - perda%/100. Preenchimento manual (não mais só as 4 opções fechadas de antes) — aceita qualquer valor entre 0 e 100. */
function LinhaFator({
  fator,
  onSalvar,
  onSalvarResumo,
}: {
  fator: FatorPlantio;
  onSalvar: (chave: string, fator: string) => void;
  onSalvarResumo?: (chave: string, resumo: string) => void;
}) {
  const fatorNumero = paraNumero(fator.fator);
  const perdaAtual = fatorNumero !== null ? Math.round((1 - fatorNumero) * 100) : 0;

  return (
    <div className="space-y-1 rounded-md bg-[var(--color-page)] px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm text-[var(--color-text)]">{fator.rotulo}</span>
        <div className="flex w-28 items-center gap-1">
          <input
            defaultValue={perdaAtual}
            inputMode="decimal"
            title="Perda (%) — 0% = potencial máximo, sem redução"
            onBlur={(e) => {
              const perdaDigitada = paraNumero(e.target.value);
              const perdaLimitada = Math.min(100, Math.max(0, perdaDigitada ?? 0));
              onSalvar(fator.chave, (1 - perdaLimitada / 100).toFixed(2));
            }}
            className={`w-full text-right num ${campoClasse}`}
          />
          <span className="text-xs text-[var(--color-text-soft)]">%</span>
        </div>
      </div>
      {onSalvarResumo && (
        <textarea
          defaultValue={fator.resumo ?? ''}
          placeholder="Resumo mostrado no Guia de Plantio ao escolher essa condição..."
          rows={2}
          onBlur={(e) => {
            const valor = e.target.value.trim();
            if (valor !== (fator.resumo ?? '')) onSalvarResumo(fator.chave, valor);
          }}
          className={`w-full resize-none text-xs ${campoClasse}`}
        />
      )}
    </div>
  );
}

function LinhaOpcaoChecklist({
  opcao,
  condicoes,
  onSalvar,
  onApagar,
}: {
  opcao: ChecklistPergunta['opcoes'][number];
  condicoes: FatorPlantio[];
  onSalvar: (id: string, patch: { texto?: string; condicaoChave?: string }) => void;
  onApagar: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        defaultValue={opcao.texto}
        onBlur={(e) => {
          const valor = e.target.value.trim();
          if (valor && valor !== opcao.texto) onSalvar(opcao.id, { texto: valor });
        }}
        className={`flex-1 ${campoClasse}`}
      />
      <select value={opcao.condicaoChave} onChange={(e) => onSalvar(opcao.id, { condicaoChave: e.target.value })} className={`w-24 ${campoClasse}`}>
        {condicoes.map((c) => (
          <option key={c.chave} value={c.chave} className="text-[var(--color-text)]">
            {c.rotulo}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onApagar(opcao.id)} title="Excluir opção" className="text-[var(--color-text-soft)] hover:text-bad">
        🗑
      </button>
    </div>
  );
}

function BlocoPerguntaChecklist({
  pergunta,
  condicoes,
  onSalvarPergunta,
  onApagarPergunta,
  onAdicionarOpcao,
  onSalvarOpcao,
  onApagarOpcao,
}: {
  pergunta: ChecklistPergunta;
  condicoes: FatorPlantio[];
  onSalvarPergunta: (id: string, pergunta: string) => void;
  onApagarPergunta: (id: string) => void;
  onAdicionarOpcao: (perguntaId: string, texto: string, condicaoChave: string) => void;
  onSalvarOpcao: (id: string, patch: { texto?: string; condicaoChave?: string }) => void;
  onApagarOpcao: (id: string) => void;
}) {
  const [novaOpcaoTexto, setNovaOpcaoTexto] = useState('');

  return (
    <div className="space-y-1.5 rounded-md border border-[var(--color-line)] p-2.5">
      <div className="flex items-center gap-1.5">
        <input
          defaultValue={pergunta.pergunta}
          onBlur={(e) => {
            const valor = e.target.value.trim();
            if (valor && valor !== pergunta.pergunta) onSalvarPergunta(pergunta.id, valor);
          }}
          className={`flex-1 font-medium ${campoClasse}`}
        />
        <button type="button" onClick={() => onApagarPergunta(pergunta.id)} title="Excluir pergunta" className="text-[var(--color-text-soft)] hover:text-bad">
          🗑
        </button>
      </div>
      <div className="space-y-1 pl-2">
        {pergunta.opcoes.map((opcao) => (
          <LinhaOpcaoChecklist key={opcao.id} opcao={opcao} condicoes={condicoes} onSalvar={onSalvarOpcao} onApagar={onApagarOpcao} />
        ))}
        <div className="flex items-center gap-1.5">
          <input
            value={novaOpcaoTexto}
            onChange={(e) => setNovaOpcaoTexto(e.target.value)}
            placeholder="Nova opção..."
            className={`flex-1 ${campoClasse}`}
          />
          <Button
            variant="outline"
            onClick={() => {
              if (!novaOpcaoTexto.trim() || !condicoes[0]) return;
              onAdicionarOpcao(pergunta.id, novaOpcaoTexto.trim(), condicoes[0].chave);
              setNovaOpcaoTexto('');
            }}
          >
            + Opção
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 1 linha da grade de Produtos — Cultivar/Processo em autocomplete, sugerindo os já cadastrados nos
 * LAUDOS (fonte dessa informação, ver cultivarDoLaudo em parametrizacaoProdutos.ts): evita divergência
 * de grafia entre o que fica aqui e o que fica no laudo, já que o casamento compara os 2 direto,
 * exato. Estado local só nesses 2 campos (precisam ser controlados pro autocomplete funcionar) — os
 * demais continuam no padrão defaultValue+onBlur do resto da grade, sem precisar de estado React.
 * Salva ao sair do campo (onBlur) ou ao clicar numa sugestão (onSelecionar) — nunca a cada tecla.
 */
function LinhaParametrizacao({
  cultivarSugerido,
  processoSugerido,
  existente,
  cultivaresLaudos,
  processosLaudos,
  onSalvar,
  onApagar,
  onAbrirObservacao,
}: {
  cultivarSugerido: string;
  processoSugerido: string;
  existente: ProdutoParametrizacao | null;
  cultivaresLaudos: string[];
  processosLaudos: string[];
  onSalvar: ParametrizacaoProdutosModalProps['onSalvar'];
  onApagar: (id: string) => void;
  onAbrirObservacao: (titulo: string, campos: CamposProduto, idExistente: string | null) => void;
}) {
  const cultivarInicial = existente?.cultivar ?? cultivarSugerido;
  const processoInicial = existente?.processo ?? processoSugerido;
  const [cultivar, setCultivar] = useState(cultivarInicial);
  const [processo, setProcesso] = useState(processoInicial);
  const idExistente = existente?.id ?? null;

  const camposAtuais: CamposProduto = {
    cultivar,
    processo,
    pmsBase: existente?.pmsBase ?? '',
    densidadeBase: existente?.densidadeBase ?? '',
    maxPlantulasMetroLinear: existente?.maxPlantulasMetroLinear ?? '',
    maxPlantulasCova: existente?.maxPlantulasCova ?? '',
    indiceSobrevivencia: existente?.indiceSobrevivencia ?? '',
    perdaMedia: existente?.perdaMedia ?? '',
    perdaBaixa: existente?.perdaBaixa ?? '',
    modoPlantio: existente?.modoPlantio ?? null,
    margemTolerancia: existente?.margemTolerancia ?? '',
    observacaoEtiqueta: existente?.observacaoEtiqueta ?? '',
  };
  const tituloObservacao = [camposAtuais.cultivar, camposAtuais.processo].filter(Boolean).join(' ') || 'Sem Cultivar';

  return (
    <div className="flex items-center gap-2 rounded-md bg-[var(--color-page)] px-3 py-1.5">
      <AutocompleteInput
        value={cultivar}
        onChangeTexto={setCultivar}
        onSelecionar={(valor) => {
          setCultivar(valor);
          if (valor.trim()) onSalvar({ ...camposAtuais, cultivar: valor }, idExistente);
        }}
        onBlur={() => {
          const valor = cultivar.trim();
          if (valor && valor !== cultivarInicial) onSalvar({ ...camposAtuais, cultivar: valor }, idExistente);
        }}
        opcoes={cultivaresLaudos.map((c) => ({ valor: c }))}
        placeholder="Cultivar"
        title="Ex.: Massai, Marandu — junto com Processo, é o que casa essa linha com o laudo certo"
        className={`w-28 shrink-0 ${campoClasse}`}
      />
      <AutocompleteInput
        value={processo}
        onChangeTexto={setProcesso}
        onSelecionar={(valor) => {
          setProcesso(valor);
          onSalvar({ ...camposAtuais, processo: valor }, idExistente);
        }}
        onBlur={() => {
          const valor = processo.trim();
          if (valor !== processoInicial) onSalvar({ ...camposAtuais, processo: valor }, idExistente);
        }}
        opcoes={processosLaudos.map((p) => ({ valor: p }))}
        placeholder="(sem Processo)"
        title="Ex.: Tradicional, Incrustado — em branco vale só pra laudo sem Processo cadastrado"
        className={`w-24 shrink-0 ${campoClasse}`}
      />
      <input
        defaultValue={camposAtuais.pmsBase}
        title="Peso de Mil Sementes (g)"
        onBlur={(e) => {
          const valor = e.target.value.trim();
          if (valor !== camposAtuais.pmsBase) onSalvar({ ...camposAtuais, pmsBase: valor }, idExistente);
        }}
        className={`w-16 shrink-0 ${campoClasse}`}
      />
      <input
        defaultValue={camposAtuais.densidadeBase}
        placeholder="por m²"
        title="Plântulas pretendidas por m² — usada em modo A Lanço"
        onBlur={(e) => {
          const valor = e.target.value.trim();
          if (valor !== camposAtuais.densidadeBase) onSalvar({ ...camposAtuais, densidadeBase: valor }, idExistente);
        }}
        className={`w-16 shrink-0 ${campoClasse}`}
      />
      <input
        defaultValue={camposAtuais.maxPlantulasMetroLinear}
        placeholder="sem limite"
        title="Máx. de plântulas pretendidas por metro linear — usada em Milho/Sorgo e no modo Linha"
        onBlur={(e) => {
          const valor = e.target.value.trim();
          if (valor !== camposAtuais.maxPlantulasMetroLinear) onSalvar({ ...camposAtuais, maxPlantulasMetroLinear: valor }, idExistente);
        }}
        className={`w-16 shrink-0 ${campoClasse}`}
      />
      <input
        defaultValue={camposAtuais.maxPlantulasCova}
        placeholder="8"
        title="Plântulas pretendidas por cova — usada em modo Covas"
        onBlur={(e) => {
          const valor = e.target.value.trim();
          if (valor !== camposAtuais.maxPlantulasCova) onSalvar({ ...camposAtuais, maxPlantulasCova: valor }, idExistente);
        }}
        className={`w-16 shrink-0 ${campoClasse}`}
      />
      <input
        defaultValue={camposAtuais.indiceSobrevivencia}
        placeholder="ideal"
        title="Índice de Sobrevivência (%)"
        onBlur={(e) => {
          const valor = e.target.value.trim();
          if (valor !== camposAtuais.indiceSobrevivencia) onSalvar({ ...camposAtuais, indiceSobrevivencia: valor }, idExistente);
        }}
        className={`w-16 shrink-0 ${campoClasse}`}
      />
      <input
        defaultValue={camposAtuais.perdaMedia}
        placeholder="global"
        title="Perda (%) na Condição Média — em branco, usa o valor global"
        onBlur={(e) => {
          const valor = e.target.value.trim();
          if (valor !== camposAtuais.perdaMedia) onSalvar({ ...camposAtuais, perdaMedia: valor }, idExistente);
        }}
        className={`w-16 shrink-0 ${campoClasse}`}
      />
      <input
        defaultValue={camposAtuais.perdaBaixa}
        placeholder="global"
        title="Perda (%) na Condição Baixa — em branco, usa o valor global"
        onBlur={(e) => {
          const valor = e.target.value.trim();
          if (valor !== camposAtuais.perdaBaixa) onSalvar({ ...camposAtuais, perdaBaixa: valor }, idExistente);
        }}
        className={`w-16 shrink-0 ${campoClasse}`}
      />
      <select
        value={camposAtuais.modoPlantio ?? 'lanco'}
        onChange={(e) => onSalvar({ ...camposAtuais, modoPlantio: e.target.value as 'cova' | 'lanco' | 'linha' }, idExistente)}
        title="Modo de plantio padrão"
        className={`w-[74px] shrink-0 ${campoClasse}`}
      >
        <option value="lanco">Lanço</option>
        <option value="linha">Linha</option>
        <option value="cova">Cova</option>
      </select>
      <input
        defaultValue={camposAtuais.margemTolerancia}
        placeholder="25"
        title="Margem de tolerância (%) pra arredondar sacos"
        onBlur={(e) => {
          const valor = e.target.value.trim();
          if (valor !== camposAtuais.margemTolerancia) onSalvar({ ...camposAtuais, margemTolerancia: valor }, idExistente);
        }}
        className={`w-16 shrink-0 ${campoClasse}`}
      />
      <button
        type="button"
        onClick={() => onAbrirObservacao(tituloObservacao, camposAtuais, idExistente)}
        title={camposAtuais.observacaoEtiqueta ? `Observação: ${camposAtuais.observacaoEtiqueta}` : 'Adicionar observação (texto impresso no Selo)'}
        className={`w-8 shrink-0 text-center text-sm ${camposAtuais.observacaoEtiqueta ? 'text-[var(--color-text)]' : 'text-[var(--color-text-soft)]'} hover:text-[var(--color-navy)]`}
      >
        📝
      </button>
      {existente ? (
        <button type="button" onClick={() => onApagar(existente.id)} title="Excluir essa linha de parametrização" className="text-[var(--color-text-soft)] hover:text-bad">
          🗑
        </button>
      ) : (
        <span className="w-8 shrink-0" />
      )}
    </div>
  );
}

/** PMS base, Densidade base (plantas/m²) e Índice de Sobrevivência (%) por Cultivar+Processo — cadastrado uma vez aqui, usado automaticamente no cálculo de kg/ha de todo laudo desse Cultivar+Processo. */
export function ParametrizacaoProdutosModal({
  open,
  produtos,
  arquivos,
  fatores,
  checklist,
  manual,
  onFechar,
  onSalvar,
  onApagar,
  onSalvarFator,
  onSalvarResumoCondicao,
  onAdicionarPerguntaChecklist,
  onSalvarPerguntaChecklist,
  onApagarPerguntaChecklist,
  onAdicionarOpcaoChecklist,
  onSalvarOpcaoChecklist,
  onApagarOpcaoChecklist,
  onSalvarManual,
}: ParametrizacaoProdutosModalProps) {
  const [novaPergunta, setNovaPergunta] = useState('');
  const [aba, setAba] = useState<Aba>('produtos');
  /** Linha cuja Observação (selo) está aberta no modal próprio — evita a coluna larga na grade. */
  const [observacaoModal, setObservacaoModal] = useState<{ titulo: string; campos: CamposProduto; idExistente: string | null } | null>(null);
  const [observacaoTexto, setObservacaoTexto] = useState('');

  function abrirObservacao(titulo: string, campos: CamposProduto, idExistente: string | null) {
    setObservacaoModal({ titulo, campos, idExistente });
    setObservacaoTexto(campos.observacaoEtiqueta);
  }

  function salvarObservacao() {
    if (!observacaoModal) return;
    onSalvar({ ...observacaoModal.campos, observacaoEtiqueta: observacaoTexto.trim() }, observacaoModal.idExistente);
    setObservacaoModal(null);
  }

  const condicoes = fatores.filter((f) => f.categoria === 'condicao');

  /**
   * Cada linha já cadastrada (produtos) aparece sempre, mesmo com Cultivar/Processo ainda em branco
   * (dado legado de antes da migração — sem Cultivar não casa com laudo nenhum, mas os valores de
   * PMS/Densidade/etc. continuam visíveis pra copiar/ajustar em vez de perder). Some a isso uma
   * linha SUGESTÃO (existente: null) pra cada combinação de Cultivar+Processo que já apareceu em
   * algum laudo importado (ver cultivarDoLaudo) e ainda não tem cadastro — nunca duplica uma que já
   * existe. Cultivar/Processo são campos PRÓPRIOS de cada lado agora (não mais "1ª+3ª palavra" do
   * nome, ver derivarCultivar) — o casamento com o laudo compara os 2 direto, exato.
   */
  const linhasParametrizacao = useMemo(() => {
    const linhas: { chave: string; cultivar: string; processo: string; existente: ProdutoParametrizacao | null }[] = produtos.map((p) => ({
      chave: p.id,
      cultivar: p.cultivar ?? '',
      processo: p.processo ?? '',
      existente: p,
    }));
    const chavesExistentes = new Set(produtos.filter((p) => p.cultivar).map((p) => `${normalizarNome(p.cultivar ?? '')}|${normalizarNome(p.processo ?? '')}`));
    const vistosDeLaudo = new Set<string>();
    arquivos.forEach((a) => {
      const cultivar = cultivarDoLaudo(a);
      if (!cultivar) return;
      const processo = (a.processo ?? '').trim();
      const chaveNormalizada = `${normalizarNome(cultivar)}|${normalizarNome(processo)}`;
      if (chavesExistentes.has(chaveNormalizada) || vistosDeLaudo.has(chaveNormalizada)) return;
      vistosDeLaudo.add(chaveNormalizada);
      linhas.push({ chave: chaveNormalizada, cultivar, processo, existente: null });
    });
    return linhas.sort((a, b) => a.cultivar.localeCompare(b.cultivar) || a.processo.localeCompare(b.processo));
  }, [produtos, arquivos]);

  // Sugestões pro autocomplete de Cultivar/Processo (ver LinhaParametrizacao) — os laudos são a
  // FONTE dessa informação, então cadastro manual aqui busca dessa mesma lista, evitando divergência
  // de grafia entre o que fica na Parametrização e o que fica no laudo.
  const cultivaresLaudos = useMemo(() => {
    const vistos = new Set<string>();
    arquivos.forEach((a) => {
      const cultivar = cultivarDoLaudo(a);
      if (cultivar) vistos.add(cultivar);
    });
    return [...vistos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [arquivos]);
  const processosLaudos = useMemo(() => {
    const vistos = new Set<string>();
    arquivos.forEach((a) => {
      const processo = (a.processo ?? '').trim();
      if (processo) vistos.add(processo);
    });
    return [...vistos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [arquivos]);

  return (
    <>
    <Modal open={open} title="Parametrização de Produtos" onClose={onFechar} widthClassName="max-w-[1080px]">
      <div className="space-y-4">
        <div className="flex items-center gap-1 border-b border-[var(--color-line)] pb-2">
          {ABAS.map((a) => (
            <button
              key={a.valor}
              type="button"
              onClick={() => setAba(a.valor)}
              title={a.rotulo}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                aba === a.valor ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-soft)] hover:bg-[var(--color-page)]'
              }`}
            >
              <span>{a.icone}</span>
              {a.rotulo}
            </button>
          ))}
        </div>

        {aba === 'produtos' && (
        <div className="space-y-3">
          <div className="max-h-[360px] space-y-1.5 overflow-y-auto">
            <div className="flex items-center gap-2 px-3 text-[11px] font-semibold text-[var(--color-text-soft)]">
              <span className="w-28 shrink-0">Cultivar</span>
              <span className="w-24 shrink-0">Processo</span>
              <span className="w-16 shrink-0 text-center">PMS</span>
              <span className="w-16 shrink-0 text-center">Plant/m²</span>
              <span className="w-16 shrink-0 text-center">Plant/linear</span>
              <span className="w-16 shrink-0 text-center">Plant/cova</span>
              <span className="w-16 shrink-0 text-center">Sobrev%</span>
              <span className="w-16 shrink-0 text-center">Perda Méd%</span>
              <span className="w-16 shrink-0 text-center">Perda Baix%</span>
              <span className="w-[74px] shrink-0 text-center">Plantio</span>
              <span className="w-16 shrink-0 text-center">Margem%</span>
              <span className="w-8 shrink-0 text-center">Obs.</span>
              <span className="w-8 shrink-0" />
            </div>
            {linhasParametrizacao.map(({ chave, cultivar, processo, existente }) => (
              <LinhaParametrizacao
                key={chave}
                cultivarSugerido={cultivar}
                processoSugerido={processo}
                existente={existente}
                cultivaresLaudos={cultivaresLaudos}
                processosLaudos={processosLaudos}
                onSalvar={onSalvar}
                onApagar={onApagar}
                onAbrirObservacao={abrirObservacao}
              />
            ))}
            {linhasParametrizacao.length === 0 && <p className="text-sm text-[var(--color-text-soft)]">Nenhum laudo importado ainda.</p>}
          </div>
        </div>
        )}

        {aba === 'checklist' && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-soft)]">
            Checklist de Diagnóstico de Campo — perguntas e opções que o operador marca no Guia de Plantio; cada opção aponta pra uma condição, e o sistema usa sempre a PIOR condição entre as respostas
            marcadas.
          </p>
          <div className="max-h-[280px] space-y-2 overflow-y-auto">
            {checklist.map((pergunta) => (
              <BlocoPerguntaChecklist
                key={pergunta.id}
                pergunta={pergunta}
                condicoes={condicoes}
                onSalvarPergunta={onSalvarPerguntaChecklist}
                onApagarPergunta={onApagarPerguntaChecklist}
                onAdicionarOpcao={onAdicionarOpcaoChecklist}
                onSalvarOpcao={onSalvarOpcaoChecklist}
                onApagarOpcao={onApagarOpcaoChecklist}
              />
            ))}
            {checklist.length === 0 && <p className="text-sm text-[var(--color-text-soft)]">Nenhuma pergunta cadastrada ainda.</p>}
          </div>
          <div className="flex items-center gap-2">
            <input value={novaPergunta} onChange={(e) => setNovaPergunta(e.target.value)} placeholder="Nova pergunta..." className={`flex-1 ${campoClasse}`} />
            <Button
              variant="outline"
              onClick={() => {
                if (!novaPergunta.trim()) return;
                onAdicionarPerguntaChecklist(novaPergunta.trim());
                setNovaPergunta('');
              }}
            >
              + Pergunta
            </Button>
          </div>
        </div>
        )}

        {aba === 'plantio' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-text-soft)]">
              Fator de perda (globais, não são por produto) — usados no Guia de Plantio pra corrigir o kg/ha conforme a forma de plantio escolhida. Digite a perda em % (0% = potencial máximo, sem
              redução). Nas condições, o Resumo é o texto discreto mostrado no Guia de Plantio ao escolher a opção.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-[var(--color-text-soft)]">Modo de Plantio</p>
                {fatores
                  .filter((f) => f.categoria === 'modo')
                  .map((f) => (
                    <LinhaFator key={f.chave} fator={f} onSalvar={onSalvarFator} />
                  ))}
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-[var(--color-text-soft)]">Condição de Implantação</p>
                {condicoes
                  .filter((f) => f.chave !== 'ideal')
                  .map((f) => (
                    <LinhaFator key={f.chave} fator={f} onSalvar={onSalvarFator} onSalvarResumo={onSalvarResumoCondicao} />
                  ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-[var(--color-line)] pt-4">
            <p className="text-xs text-[var(--color-text-soft)]">
              Manual de Plantio — texto opcional que acompanha o PDF do Guia de Plantio (o operador escolhe se inclui na hora de imprimir). Separe parágrafos com uma linha em branco. Um parágrafo
              começando com "Nota do consultor" sai destacado numa caixa no PDF.
            </p>
            <input
              defaultValue={manual?.titulo ?? ''}
              placeholder="Título do manual"
              onBlur={(e) => {
                const valor = e.target.value.trim();
                if (valor !== (manual?.titulo ?? '')) onSalvarManual({ titulo: valor, corpo: manual?.corpo ?? '' });
              }}
              className={`w-full ${campoClasse}`}
            />
            <textarea
              defaultValue={manual?.corpo ?? ''}
              placeholder="Corpo do manual..."
              rows={12}
              onBlur={(e) => {
                const valor = e.target.value.trim();
                if (valor !== (manual?.corpo ?? '')) onSalvarManual({ titulo: manual?.titulo ?? '', corpo: valor });
              }}
              className={`w-full resize-y text-xs ${campoClasse}`}
            />
          </div>
        </div>
        )}
      </div>
    </Modal>
    <Modal
      open={observacaoModal !== null}
      title={`Observação (selo) — ${observacaoModal?.titulo ?? ''}`}
      onClose={() => setObservacaoModal(null)}
      widthClassName="max-w-[420px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => setObservacaoModal(null)}>
            Cancelar
          </Button>
          <Button onClick={salvarObservacao}>Salvar</Button>
        </>
      }
    >
      <textarea
        value={observacaoTexto}
        onChange={(e) => setObservacaoTexto(e.target.value)}
        placeholder="Ex.: PRODUTOR : RENASEM : GO - 02.647/2019"
        rows={4}
        autoFocus
        className={`w-full resize-y text-sm ${campoClasse}`}
      />
    </Modal>
    </>
  );
}

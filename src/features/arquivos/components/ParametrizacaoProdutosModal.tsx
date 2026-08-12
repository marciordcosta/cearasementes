import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { paraNumero } from '../metricas';
import { grupoDoNome, normalizarNome } from '../parametrizacaoProdutos';
import type { ArquivoLaudo, ChecklistPergunta, FatorPlantio, ManualPlantio, ProdutoParametrizacao } from '../types';

type Aba = 'produtos' | 'checklist' | 'plantio';

const ABAS: { valor: Aba; rotulo: string; icone: string }[] = [
  { valor: 'produtos', rotulo: 'Produtos', icone: '🌾' },
  { valor: 'checklist', rotulo: 'Checklist', icone: '☑️' },
  { valor: 'plantio', rotulo: 'Plantio', icone: '🌱' },
];

interface ParametrizacaoProdutosModalProps {
  open: boolean;
  produtos: ProdutoParametrizacao[];
  /** Laudos importados — a lista de grupos exibida aqui é derivada automaticamente do nome deles (ver linhasGrupo), não digitada à mão. Fonte é o laudo (não a Tabela de Preço) porque é o laudo quem precisa achar essa parametrização depois — usando a mesma redução dos dois lados, o casamento nunca falha por causa de gênero científico ou peso do pacote que só a Tabela de Preço tem. */
  arquivos: ArquivoLaudo[];
  fatores: FatorPlantio[];
  checklist: ChecklistPergunta[];
  manual: ManualPlantio | null;
  onFechar: () => void;
  onSalvar: (produto: {
    nomeProduto: string;
    pmsBase: string;
    densidadeBase: string;
    indiceSobrevivencia: string;
    maxPlantulasCova: string;
    maxCovasM2: string;
    perdaMedia: string;
    perdaBaixa: string;
    modoPlantio: 'cova' | 'lanco' | null;
    margemTolerancia: string;
    observacaoEtiqueta: string;
  }) => void;
  onApagar: (id: string) => void;
  /** Corrige o grupo de uma linha já cadastrada — pra quando a extração automática (1ª + 3ª palavra) não pega o nome certo. */
  onRenomear: (id: string, novoNome: string) => void;
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

/** PMS base, Densidade base (plantas/m²) e Índice de Sobrevivência (%) por produto (nome) — cadastrado uma vez aqui, usado automaticamente no cálculo de kg/ha de todo laudo desse produto. */
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
  onRenomear,
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
  /** id da linha (parametrização já cadastrada) cujo grupo está em edição — null quando nenhuma. */
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const condicoes = fatores.filter((f) => f.categoria === 'condicao');

  // Nada de cadastro manual — a lista de grupos vem AUTOMATICAMENTE dos
  // LAUDOS importados (1ª + 3ª palavra do nome, ver grupoDoNome), não da
  // Tabela de Preço: o laudo é quem vai precisar achar essa parametrização
  // depois (resolverPmsBase etc.), e laudo do mesmo produto sempre chega com
  // o mesmo nome — usando a mesma fonte/redução dos dois lados, o casamento
  // nunca falha por causa de gênero científico ou peso do pacote, que só a
  // Tabela de Preço tem (ex.: "Panicum Tanzania Tradicional 15KG" vs
  // "Tanzania 1 Tradicional" no laudo — nomes de mundos diferentes). Junta
  // também grupo já parametrizado que não bate com nenhum laudo atual (dado
  // legado/órfão) — pra não sumir cadastro já feito.
  const linhasGrupo = useMemo(() => {
    const grupoPorChave = new Map<string, string>();
    arquivos.forEach((a) => {
      const grupo = grupoDoNome(a.nomeProduto);
      grupoPorChave.set(normalizarNome(grupo), grupo);
    });
    produtos.forEach((p) => {
      const grupo = grupoDoNome(p.nomeProduto);
      const chave = normalizarNome(grupo);
      if (!grupoPorChave.has(chave)) grupoPorChave.set(chave, grupo);
    });
    return [...grupoPorChave.entries()]
      .map(([chave, grupo]) => ({ grupo, existente: produtos.find((p) => normalizarNome(grupoDoNome(p.nomeProduto)) === chave) ?? null }))
      .sort((a, b) => a.grupo.localeCompare(b.grupo));
  }, [produtos, arquivos]);

  return (
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
          <p className="px-3 text-[11px] text-[var(--color-text-soft)]">
            Grupo calculado automaticamente dos laudos importados (1ª + 3ª palavra do nome, pulando a variedade do meio) — só preencha PMS, Densidade e Sobrevivência de cada linha. Em modo Covas, o
            espaçamento padrão do Guia de Plantio vem de Máx/cova (plântulas estabelecidas, pós-perdas, que cabem numa mesma cova) e Cov/m² (covas por m² que a cultivar aguenta) — a Densidade não é
            mais o alvo em Covas (só continua valendo pra "A Lanço"); sem os 2 campos, cai no cálculo por Densidade de antes, ou no 50×50 fixo. Perda Média%/Baixa% sobrepõe, só pra esse produto, o
            fator global de perda das Condições de Implantação (aba Plantio) — em branco, usa o valor global. Margem% decide o arredondamento de sacos no Guia de Plantio (até essa % de saco faltando
            arredonda pra baixo, acima pra cima) — 25% se em branco.
          </p>
          <div className="max-h-[360px] space-y-1.5 overflow-y-auto">
            <div className="flex items-center gap-2 px-3 text-[11px] font-semibold text-[var(--color-text-soft)]">
              <span className="flex-1">Grupo</span>
              <span className="w-16 shrink-0 text-center">PMS</span>
              <span className="w-16 shrink-0 text-center">Densid.</span>
              <span className="w-16 shrink-0 text-center">Sobrev%</span>
              <span className="w-16 shrink-0 text-center">Máx/cova</span>
              <span className="w-16 shrink-0 text-center">Cov/m²</span>
              <span className="w-16 shrink-0 text-center">Perda Méd%</span>
              <span className="w-16 shrink-0 text-center">Perda Baix%</span>
              <span className="w-[74px] shrink-0 text-center">Plantio</span>
              <span className="w-16 shrink-0 text-center">Margem%</span>
              <span className="w-56 shrink-0 text-center">Observação (selo)</span>
              <span className="w-8 shrink-0" />
            </div>
            {linhasGrupo.map(({ grupo, existente }) => {
              const camposAtuais = {
                nomeProduto: existente?.nomeProduto ?? grupo,
                pmsBase: existente?.pmsBase ?? '',
                densidadeBase: existente?.densidadeBase ?? '',
                indiceSobrevivencia: existente?.indiceSobrevivencia ?? '',
                maxPlantulasCova: existente?.maxPlantulasCova ?? '',
                maxCovasM2: existente?.maxCovasM2 ?? '',
                perdaMedia: existente?.perdaMedia ?? '',
                perdaBaixa: existente?.perdaBaixa ?? '',
                modoPlantio: existente?.modoPlantio ?? null,
                margemTolerancia: existente?.margemTolerancia ?? '',
                observacaoEtiqueta: existente?.observacaoEtiqueta ?? '',
              };
              return (
              <div key={grupo} className="flex items-center gap-2 rounded-md bg-[var(--color-page)] px-3 py-1.5">
                {existente && editandoId === existente.id ? (
                  <input
                    defaultValue={grupo}
                    autoFocus
                    onBlur={(e) => {
                      const valor = e.target.value.trim();
                      if (valor && valor !== grupo) onRenomear(existente.id, valor);
                      setEditandoId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setEditandoId(null);
                    }}
                    className={`min-w-0 flex-1 ${campoClasse}`}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]" title={grupo}>
                    {grupo}
                  </span>
                )}
                <input
                  defaultValue={camposAtuais.pmsBase}
                  title="Peso de Mil Sementes (g)"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== camposAtuais.pmsBase) onSalvar({ ...camposAtuais, pmsBase: valor });
                  }}
                  className={`w-16 shrink-0 ${campoClasse}`}
                />
                <input
                  defaultValue={camposAtuais.densidadeBase}
                  placeholder="por m²"
                  title="Densidade alvo (plântulas/m²)"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== camposAtuais.densidadeBase) onSalvar({ ...camposAtuais, densidadeBase: valor });
                  }}
                  className={`w-16 shrink-0 ${campoClasse}`}
                />
                <input
                  defaultValue={camposAtuais.indiceSobrevivencia}
                  placeholder="ideal"
                  title="Índice de Sobrevivência (%)"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== camposAtuais.indiceSobrevivencia) onSalvar({ ...camposAtuais, indiceSobrevivencia: valor });
                  }}
                  className={`w-16 shrink-0 ${campoClasse}`}
                />
                <input
                  defaultValue={camposAtuais.maxPlantulasCova}
                  placeholder="8"
                  title="Máx. de plântulas por cova"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== camposAtuais.maxPlantulasCova) onSalvar({ ...camposAtuais, maxPlantulasCova: valor });
                  }}
                  className={`w-16 shrink-0 ${campoClasse}`}
                />
                <input
                  defaultValue={camposAtuais.maxCovasM2}
                  placeholder="10"
                  title="Máx. de covas por m²"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== camposAtuais.maxCovasM2) onSalvar({ ...camposAtuais, maxCovasM2: valor });
                  }}
                  className={`w-16 shrink-0 ${campoClasse}`}
                />
                <input
                  defaultValue={camposAtuais.perdaMedia}
                  placeholder="global"
                  title="Perda (%) na Condição Média — em branco, usa o valor global"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== camposAtuais.perdaMedia) onSalvar({ ...camposAtuais, perdaMedia: valor });
                  }}
                  className={`w-16 shrink-0 ${campoClasse}`}
                />
                <input
                  defaultValue={camposAtuais.perdaBaixa}
                  placeholder="global"
                  title="Perda (%) na Condição Baixa — em branco, usa o valor global"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== camposAtuais.perdaBaixa) onSalvar({ ...camposAtuais, perdaBaixa: valor });
                  }}
                  className={`w-16 shrink-0 ${campoClasse}`}
                />
                <select
                  value={camposAtuais.modoPlantio ?? 'lanco'}
                  onChange={(e) => onSalvar({ ...camposAtuais, modoPlantio: e.target.value as 'cova' | 'lanco' })}
                  title="Modo de plantio padrão"
                  className={`w-[74px] shrink-0 ${campoClasse}`}
                >
                  <option value="lanco">Lanço</option>
                  <option value="cova">Cova</option>
                </select>
                <input
                  defaultValue={camposAtuais.margemTolerancia}
                  placeholder="25"
                  title="Margem de tolerância (%) pra arredondar sacos"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== camposAtuais.margemTolerancia) onSalvar({ ...camposAtuais, margemTolerancia: valor });
                  }}
                  className={`w-16 shrink-0 ${campoClasse}`}
                />
                <input
                  defaultValue={camposAtuais.observacaoEtiqueta}
                  placeholder="Ex.: PRODUTOR : RENASEM : GO - 02.647/2019"
                  title="Texto impresso no Selo"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== camposAtuais.observacaoEtiqueta) onSalvar({ ...camposAtuais, observacaoEtiqueta: valor });
                  }}
                  className={`w-56 shrink-0 ${campoClasse}`}
                />
                {existente ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditandoId(existente.id)}
                      title="Corrigir o nome do grupo (a extração automática errou o nome)"
                      className="text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
                    >
                      ✎
                    </button>
                    <button type="button" onClick={() => onApagar(existente.id)} title="Limpar parametrização deste grupo" className="text-[var(--color-text-soft)] hover:text-bad">
                      🗑
                    </button>
                  </>
                ) : (
                  <span className="w-8 shrink-0" />
                )}
              </div>
              );
            })}
            {linhasGrupo.length === 0 && <p className="text-sm text-[var(--color-text-soft)]">Nenhum laudo importado ainda.</p>}
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
  );
}

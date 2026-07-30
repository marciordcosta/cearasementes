import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { paraNumero } from '../metricas';
import type { ChecklistPergunta, FatorPlantio, ManualPlantio, ProdutoParametrizacao } from '../types';

type Aba = 'produtos' | 'checklist' | 'plantio';

const ABAS: { valor: Aba; rotulo: string; icone: string }[] = [
  { valor: 'produtos', rotulo: 'Produtos', icone: '🌾' },
  { valor: 'checklist', rotulo: 'Checklist', icone: '☑️' },
  { valor: 'plantio', rotulo: 'Plantio', icone: '🌱' },
];

interface ParametrizacaoProdutosModalProps {
  open: boolean;
  produtos: ProdutoParametrizacao[];
  fatores: FatorPlantio[];
  checklist: ChecklistPergunta[];
  manual: ManualPlantio | null;
  onFechar: () => void;
  onSalvar: (produto: { id?: string; nomeProduto: string; pmsBase: string; densidadeBase: string; indiceSobrevivencia: string }) => void;
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

/** Opções fechadas de perda — inversamente, fator 1 = 0% de perda (potencial máximo). */
const OPCOES_PERDA = [0, 25, 50, 75];

/** O banco guarda o fator (multiplicador, ex.: "0,75"), mas aqui exibe/edita a PERDA em % (ex.: "25") — mais intuitivo que digitar um multiplicador. Perda% = (1 - fator) × 100, e volta: fator = 1 - perda%/100. */
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
  const perdaMaisProxima = OPCOES_PERDA.reduce((maisProxima, opcao) => (Math.abs(opcao - perdaAtual) < Math.abs(maisProxima - perdaAtual) ? opcao : maisProxima), OPCOES_PERDA[0]);

  return (
    <div className="space-y-1 rounded-md bg-[var(--color-page)] px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm text-[var(--color-text)]">{fator.rotulo}</span>
        <select
          value={perdaMaisProxima}
          onChange={(e) => {
            const perdaEscolhida = Number(e.target.value);
            onSalvar(fator.chave, (1 - perdaEscolhida / 100).toFixed(2));
          }}
          className={`w-28 ${campoClasse}`}
        >
          {OPCOES_PERDA.map((p) => (
            <option key={p} value={p}>
              {p}%
            </option>
          ))}
        </select>
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
  const [novoNome, setNovoNome] = useState('');
  const [novoPms, setNovoPms] = useState('');
  const [novaDensidade, setNovaDensidade] = useState('');
  const [novaSobrevivencia, setNovaSobrevivencia] = useState('');
  const [novaPergunta, setNovaPergunta] = useState('');
  const [aba, setAba] = useState<Aba>('produtos');

  const condicoes = fatores.filter((f) => f.categoria === 'condicao');

  function adicionar() {
    if (!novoNome.trim()) return;
    onSalvar({
      nomeProduto: novoNome.trim(),
      pmsBase: novoPms.trim(),
      densidadeBase: novaDensidade.trim(),
      indiceSobrevivencia: novaSobrevivencia.trim(),
    });
    setNovoNome('');
    setNovoPms('');
    setNovaDensidade('');
    setNovaSobrevivencia('');
  }

  return (
    <Modal
      open={open}
      title="Parametrização de Produtos"
      onClose={onFechar}
      widthClassName="max-w-[680px]"
      footer={<Button onClick={onFechar}>Fechar</Button>}
    >
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
          <p className="text-xs text-[var(--color-text-soft)]">
            PMS base, Densidade base (população alvo, plantas/m²) e Índice de Sobrevivência (%) por produto — usados no cálculo do Guia de Plantio sempre que o nome do produto do laudo bater com um
            cadastrado aqui. O PMS pode ser sobrescrito por lote (se digitar lá, o valor do lote manda); os demais campos só existem aqui. O peso do saco vem direto da Tabela de Preço (módulo
            Precificação) — não precisa cadastrar de novo.
          </p>

          <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
            <div className="flex items-center gap-2 px-3 text-[11px] font-semibold text-[var(--color-text-soft)]">
              <span className="flex-1">Produto</span>
              <span className="w-20 text-center">PMS</span>
              <span className="w-20 text-center">Densidade</span>
              <span className="w-20 text-center">Sobrev. %</span>
              <span className="w-4" />
            </div>
            {produtos.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md bg-[var(--color-page)] px-3 py-1.5">
                <span className="flex-1 truncate text-sm text-[var(--color-text)]" title={p.nomeProduto}>
                  {p.nomeProduto}
                </span>
                <input
                  defaultValue={p.pmsBase ?? ''}
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== (p.pmsBase ?? ''))
                      onSalvar({ id: p.id, nomeProduto: p.nomeProduto, pmsBase: valor, densidadeBase: p.densidadeBase ?? '', indiceSobrevivencia: p.indiceSobrevivencia ?? '' });
                  }}
                  className={`w-20 ${campoClasse}`}
                />
                <input
                  defaultValue={p.densidadeBase ?? ''}
                  placeholder="por m²"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== (p.densidadeBase ?? ''))
                      onSalvar({ id: p.id, nomeProduto: p.nomeProduto, pmsBase: p.pmsBase ?? '', densidadeBase: valor, indiceSobrevivencia: p.indiceSobrevivencia ?? '' });
                  }}
                  className={`w-20 ${campoClasse}`}
                />
                <input
                  defaultValue={p.indiceSobrevivencia ?? ''}
                  placeholder="ideal"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== (p.indiceSobrevivencia ?? ''))
                      onSalvar({ id: p.id, nomeProduto: p.nomeProduto, pmsBase: p.pmsBase ?? '', densidadeBase: p.densidadeBase ?? '', indiceSobrevivencia: valor });
                  }}
                  className={`w-20 ${campoClasse}`}
                />
                <button type="button" onClick={() => onApagar(p.id)} title="Excluir" className="text-[var(--color-text-soft)] hover:text-bad">
                  🗑
                </button>
              </div>
            ))}
            {produtos.length === 0 && <p className="text-sm text-[var(--color-text-soft)]">Nenhum produto cadastrado ainda.</p>}
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--color-line)] px-3 pt-3">
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do produto" className={`flex-1 ${campoClasse}`} />
            <input value={novoPms} onChange={(e) => setNovoPms(e.target.value)} placeholder="PMS" className={`w-20 ${campoClasse}`} />
            <input value={novaDensidade} onChange={(e) => setNovaDensidade(e.target.value)} placeholder="Densidade" className={`w-20 ${campoClasse}`} />
            <input value={novaSobrevivencia} onChange={(e) => setNovaSobrevivencia(e.target.value)} placeholder="Sobrev. %" className={`w-20 ${campoClasse}`} />
            <Button variant="primary" onClick={adicionar}>
              + Adicionar
            </Button>
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
              Fator de perda (globais, não são por produto) — usados no Guia de Plantio pra corrigir o kg/ha conforme a forma de plantio escolhida. Escolha a perda em % (0% = potencial máximo, sem
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
                {condicoes.map((f) => (
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

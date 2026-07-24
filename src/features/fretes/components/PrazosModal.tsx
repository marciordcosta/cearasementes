import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { PrazoTransportadora, Transportadora } from '../types';

interface PrazosModalProps {
  transportadora: Transportadora | null;
  onFechar: () => void;
  onSalvarPrazo: (cidade: string, prazoHoras: number | null, prazoTexto: string | null) => void;
  onApagarPrazo: (id: string) => void;
}

function prazoParaTexto(p: PrazoTransportadora): string {
  return p.prazoHoras !== null ? String(p.prazoHoras) : (p.prazoTexto ?? '');
}

/** Lista de cidades atendidas por uma Transportadora+Região — busca, adição de novas cidades e edição do prazo de cada uma (clicando no ✎). */
export function PrazosModal({ transportadora, onFechar, onSalvarPrazo, onApagarPrazo }: PrazosModalProps) {
  const [busca, setBusca] = useState('');
  const [novaCidade, setNovaCidade] = useState('');
  const [novoPrazo, setNovoPrazo] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [valorEditando, setValorEditando] = useState('');

  const prazosFiltrados = useMemo(() => {
    if (!transportadora) return [];
    const termo = busca.trim().toLowerCase();
    const lista = termo ? transportadora.prazos.filter((p) => p.cidade.toLowerCase().includes(termo)) : transportadora.prazos;
    return [...lista].sort((a, b) => a.cidade.localeCompare(b.cidade));
  }, [transportadora, busca]);

  function parsePrazo(txt: string): { horas: number | null; texto: string | null } {
    const numero = Number(txt);
    if (txt.trim() && !isNaN(numero)) return { horas: numero, texto: null };
    return { horas: null, texto: txt.trim() || null };
  }

  function adicionar() {
    if (!novaCidade.trim()) return;
    const { horas, texto } = parsePrazo(novoPrazo);
    onSalvarPrazo(novaCidade.trim(), horas, texto);
    setNovaCidade('');
    setNovoPrazo('');
  }

  function iniciarEdicao(p: PrazoTransportadora) {
    setEditandoId(p.id);
    setValorEditando(prazoParaTexto(p));
  }

  function salvarEdicao(p: PrazoTransportadora) {
    const { horas, texto } = parsePrazo(valorEditando);
    onSalvarPrazo(p.cidade, horas, texto);
    setEditandoId(null);
  }

  return (
    <Modal open={transportadora !== null} title={`Cidades atendidas — ${transportadora?.nome ?? ''} (${transportadora?.uf ?? ''})`} onClose={onFechar} widthClassName="max-w-[560px]">
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nova cidade"
            value={novaCidade}
            onChange={(e) => setNovaCidade(e.target.value)}
            className="flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]"
          />
          <input
            type="text"
            placeholder="Prazo (horas ou texto)"
            value={novoPrazo}
            onChange={(e) => setNovoPrazo(e.target.value)}
            className="w-40 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]"
          />
          <Button variant="primary" onClick={adicionar}>
            + Add
          </Button>
        </div>
        <p className="text-xs text-[var(--color-text-soft)]">
          Pra editar o prazo de uma cidade já cadastrada, clique no ✎ dela na lista abaixo. Cadastrar uma cidade com o mesmo nome de uma já existente também atualiza o prazo dela (não duplica).
        </p>

        <input
          type="text"
          placeholder={`Pesquisar entre ${transportadora?.prazos.length ?? 0} cidades…`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]"
        />

        <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-[var(--color-line)]">
          <table className="w-full text-sm">
            <tbody>
              {prazosFiltrados.map((p) => (
                <tr key={p.id} className="border-b border-[var(--color-line)] last:border-b-0">
                  <td className="px-3 py-1.5 text-[var(--color-text)]">{p.cidade}</td>
                  {editandoId === p.id ? (
                    <>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          autoFocus
                          type="text"
                          value={valorEditando}
                          onChange={(e) => setValorEditando(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && salvarEdicao(p)}
                          className="w-28 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-right text-sm text-[var(--color-text)]"
                        />
                      </td>
                      <td className="w-16 whitespace-nowrap px-2 py-1.5 text-right">
                        <button type="button" onClick={() => salvarEdicao(p)} className="mr-1.5 text-[var(--color-accent)] hover:opacity-70" title="Salvar">
                          ✓
                        </button>
                        <button type="button" onClick={() => setEditandoId(null)} className="text-[var(--color-text-soft)] hover:text-bad" title="Cancelar">
                          ✕
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-1.5 text-right text-[var(--color-text-soft)]">{p.prazoHoras !== null ? `${p.prazoHoras}h úteis` : p.prazoTexto}</td>
                      <td className="w-16 whitespace-nowrap px-2 py-1.5 text-right">
                        <button type="button" onClick={() => iniciarEdicao(p)} className="mr-1.5 text-[var(--color-text-soft)] hover:text-[var(--color-text)]" title="Editar prazo">
                          ✎
                        </button>
                        <button type="button" onClick={() => onApagarPrazo(p.id)} className="text-[var(--color-text-soft)] hover:text-bad" title="Remover cidade">
                          ✕
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {prazosFiltrados.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-center text-[var(--color-text-soft)]">Nenhuma cidade encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

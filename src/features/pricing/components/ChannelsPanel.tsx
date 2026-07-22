import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { gerarCorCanal } from '../calculations';
import type { Canal, FreteAdicionalTipo, TipoImposto } from '../types';

export interface NovoCanalInput {
  nome: string;
  desconto: number;
  comissao: number;
  cartao: number;
  outrosEncargos: number;
  freteKg: number;
  fretePct: number;
  freteAdicionalTipo: FreteAdicionalTipo;
  freteAdicionalValor: number;
  tipoImposto: TipoImposto;
}

type CampoNumerico = 'desconto' | 'comissao' | 'cartao' | 'outrosEncargos' | 'freteKg' | 'fretePct' | 'freteAdicionalValor';

interface ChannelsPanelProps {
  canais: Canal[];
  onAtualizarCampo: (canalId: string, campo: CampoNumerico, valor: number) => void;
  onAtualizarTipoImposto: (canalId: string, valor: TipoImposto) => void;
  onAtualizarFreteAdicionalTipo: (canalId: string, valor: FreteAdicionalTipo) => void;
  onToggleVisivel: (canalId: string, valor: boolean) => void;
  onToggleFreteIncluso: (canalId: string, valor: boolean) => void;
  onRemoverCanal: (canalId: string) => void;
  onAdicionarCanal: (input: NovoCanalInput) => void;
  /** Ação exibida na mesma linha do título (ex.: botão de voltar pra Tabela de Preços) */
  acaoTitulo?: React.ReactNode;
}

function CampoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5">
      <label className="text-xs text-[var(--color-text-soft)]">{label}</label>
      {children}
    </div>
  );
}

const inputClass = 'w-24 rounded-md border border-[var(--color-line)] px-2 py-1.5 text-right text-xs num';

export function ChannelsPanel({
  canais,
  onAtualizarCampo,
  onAtualizarTipoImposto,
  onAtualizarFreteAdicionalTipo,
  onToggleVisivel,
  onToggleFreteIncluso,
  onRemoverCanal,
  onAdicionarCanal,
  acaoTitulo,
}: ChannelsPanelProps) {
  const [canalParaRemover, setCanalParaRemover] = useState<Canal | null>(null);
  const [novo, setNovo] = useState<NovoCanalInput>({
    nome: '',
    desconto: 0,
    comissao: 0,
    cartao: 0,
    outrosEncargos: 0,
    freteKg: 0,
    fretePct: 0,
    freteAdicionalTipo: 'fixo',
    freteAdicionalValor: 0,
    tipoImposto: 'estadual',
  });

  function confirmarRemover() {
    if (canalParaRemover) onRemoverCanal(canalParaRemover.id);
    setCanalParaRemover(null);
  }

  function submeterNovoCanal() {
    if (!novo.nome.trim()) return;
    onAdicionarCanal(novo);
    setNovo({ nome: '', desconto: 0, comissao: 0, cartao: 0, outrosEncargos: 0, freteKg: 0, fretePct: 0, freteAdicionalTipo: 'fixo', freteAdicionalValor: 0, tipoImposto: 'estadual' });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-[var(--color-navy)]">Tabelas de Preço / Canais de Venda</p>
        {acaoTitulo}
      </div>
      <p className="text-xs text-[var(--color-text-soft)]">
        Cada tabela gera um bloco de colunas (Preço, Frete, Encargos, ML % e ML $) na Tabela de Preços. Excluir remove
        imediatamente da tela.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {canais.map((canal) => {
          const cor = gerarCorCanal(canal.corIndice);
          return (
            <Card key={canal.id} className="overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-bold text-white" style={{ background: cor.dark }}>
                <span>{canal.nome}</span>
                <button
                  type="button"
                  onClick={() => setCanalParaRemover(canal)}
                  className="rounded bg-white/20 px-1.5 py-0.5 text-xs hover:bg-white/35"
                >
                  🗑 Excluir
                </button>
              </div>
              <div className="flex flex-col gap-2 p-3.5">
                <label className="flex items-center justify-between border-b border-dashed border-[var(--color-line)] pb-1.5 text-xs">
                  <span className="font-semibold text-[var(--color-navy)]">Exibir na Tabela Principal</span>
                  <input type="checkbox" checked={canal.visivel} onChange={(e) => onToggleVisivel(canal.id, e.target.checked)} className="accent-[var(--color-navy)]" />
                </label>
                <label className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--color-navy)]">Frete Incluso na Margem</span>
                  <input type="checkbox" checked={canal.freteIncluso} onChange={(e) => onToggleFreteIncluso(canal.id, e.target.checked)} className="accent-accent" />
                </label>
                <CampoRow label="Média de Desconto (%)">
                  <input type="number" step="0.1" min="0" defaultValue={canal.desconto} onBlur={(e) => onAtualizarCampo(canal.id, 'desconto', parseFloat(e.target.value) || 0)} className={inputClass} />
                </CampoRow>
                <CampoRow label="Comissão Vendedor (%)">
                  <input type="number" step="0.1" min="0" defaultValue={canal.comissao} onBlur={(e) => onAtualizarCampo(canal.id, 'comissao', parseFloat(e.target.value) || 0)} className={inputClass} />
                </CampoRow>
                <CampoRow label="Taxa de Cartão (%)">
                  <input type="number" step="0.1" min="0" defaultValue={canal.cartao} onBlur={(e) => onAtualizarCampo(canal.id, 'cartao', parseFloat(e.target.value) || 0)} className={inputClass} />
                </CampoRow>
                <CampoRow label="Outros Encargos (R$)">
                  <input type="number" step="0.1" min="0" defaultValue={canal.outrosEncargos} onBlur={(e) => onAtualizarCampo(canal.id, 'outrosEncargos', parseFloat(e.target.value) || 0)} className={inputClass} />
                </CampoRow>
                <CampoRow label="Frete Kg (R$)">
                  <input type="number" step="0.1" min="0" defaultValue={canal.freteKg} onBlur={(e) => onAtualizarCampo(canal.id, 'freteKg', parseFloat(e.target.value) || 0)} className={inputClass} />
                </CampoRow>
                <CampoRow label="Frete NF (%)">
                  <input type="number" step="0.1" min="0" defaultValue={canal.fretePct} onBlur={(e) => onAtualizarCampo(canal.id, 'fretePct', parseFloat(e.target.value) || 0)} className={inputClass} />
                </CampoRow>
                <CampoRow label="Frete Cobrado">
                  <span className="flex gap-1.5">
                    <select
                      defaultValue={canal.freteAdicionalTipo}
                      onChange={(e) => onAtualizarFreteAdicionalTipo(canal.id, e.target.value as FreteAdicionalTipo)}
                      className="rounded-md border border-[var(--color-line)] px-1.5 py-1.5 text-xs"
                    >
                      <option value="fixo">R$ Fixo</option>
                      <option value="kg">R$/Kg</option>
                    </select>
                    <input type="number" step="0.1" min="0" defaultValue={canal.freteAdicionalValor} onBlur={(e) => onAtualizarCampo(canal.id, 'freteAdicionalValor', parseFloat(e.target.value) || 0)} className="w-20 rounded-md border border-[var(--color-line)] px-2 py-1.5 text-right text-xs num" />
                  </span>
                </CampoRow>
                <CampoRow label="Tipo de Imposto (ICMS)">
                  <select
                    defaultValue={canal.tipoImposto}
                    onChange={(e) => onAtualizarTipoImposto(canal.id, e.target.value as TipoImposto)}
                    className="rounded-md border border-[var(--color-line)] px-1.5 py-1.5 text-xs"
                  >
                    <option value="estadual">Estadual</option>
                    <option value="interestadual">Interestadual</option>
                  </select>
                </CampoRow>
              </div>
            </Card>
          );
        })}

        <Card className="border-2 border-dashed border-[var(--color-line)] bg-[var(--color-page)]">
          <div className="px-3.5 py-2.5 text-sm font-bold text-[var(--color-navy)]">+ Adicionar Nova Tabela de Preço</div>
          <div className="flex flex-col gap-2 p-3.5">
            <input
              type="text"
              placeholder="Nome da tabela"
              value={novo.nome}
              onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))}
              className="rounded-md border border-[var(--color-line)] px-2 py-1.5 text-xs"
            />
            <CampoRow label="Média de Desconto (%)">
              <input type="number" step="0.1" min="0" value={novo.desconto} onChange={(e) => setNovo((n) => ({ ...n, desconto: parseFloat(e.target.value) || 0 }))} className={inputClass} />
            </CampoRow>
            <CampoRow label="Comissão Vendedor (%)">
              <input type="number" step="0.1" min="0" value={novo.comissao} onChange={(e) => setNovo((n) => ({ ...n, comissao: parseFloat(e.target.value) || 0 }))} className={inputClass} />
            </CampoRow>
            <CampoRow label="Taxa de Cartão (%)">
              <input type="number" step="0.1" min="0" value={novo.cartao} onChange={(e) => setNovo((n) => ({ ...n, cartao: parseFloat(e.target.value) || 0 }))} className={inputClass} />
            </CampoRow>
            <CampoRow label="Frete Kg (R$)">
              <input type="number" step="0.1" min="0" value={novo.freteKg} onChange={(e) => setNovo((n) => ({ ...n, freteKg: parseFloat(e.target.value) || 0 }))} className={inputClass} />
            </CampoRow>
            <CampoRow label="Frete NF (%)">
              <input type="number" step="0.1" min="0" value={novo.fretePct} onChange={(e) => setNovo((n) => ({ ...n, fretePct: parseFloat(e.target.value) || 0 }))} className={inputClass} />
            </CampoRow>
            <CampoRow label="Tipo de Imposto (ICMS)">
              <select
                value={novo.tipoImposto}
                onChange={(e) => setNovo((n) => ({ ...n, tipoImposto: e.target.value as TipoImposto }))}
                className="rounded-md border border-[var(--color-line)] px-1.5 py-1.5 text-xs"
              >
                <option value="estadual">Estadual</option>
                <option value="interestadual">Interestadual</option>
              </select>
            </CampoRow>
            <Button variant="primary" className="mt-2" onClick={submeterNovoCanal}>
              + Adicionar Nova Tabela de Preço
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={canalParaRemover !== null}
        title="Excluir Tabela de Preço"
        onClose={() => setCanalParaRemover(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setCanalParaRemover(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarRemover}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text)]">
          Excluir a Tabela de Preço <strong>{canalParaRemover?.nome}</strong>? As colunas dela vão sumir da Tabela de Preços
          imediatamente, para todos que acessarem o sistema.
        </p>
      </Modal>
    </div>
  );
}

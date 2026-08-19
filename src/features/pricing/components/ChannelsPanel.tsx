import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { Transportadora } from '@/features/fretes/types';
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
  transportadoraId: string | null;
}

type CampoNumerico =
  | 'desconto'
  | 'comissao'
  | 'cartao'
  | 'outrosEncargos'
  | 'freteKg'
  | 'fretePct'
  | 'freteAdicionalValor'
  | 'pagamentoAvistaDescontoPct'
  | 'pagamentoBoletoValorMinimo'
  | 'pagamentoBoletoParcelasMax';

interface ChannelsPanelProps {
  canais: Canal[];
  transportadoras: Transportadora[];
  onAtualizarCampo: (canalId: string, campo: CampoNumerico, valor: number) => void;
  /** WhatsApp desse canal (DDI+DDD+número, só dígitos) — usado no Catálogo Online (botão flutuante + envio de orçamento). */
  onAtualizarWhatsapp: (canalId: string, valor: string) => void;
  /** true = card do Catálogo Online desse canal mostra VC%/Validade além do Fornecedor. */
  onAtualizarMostrarDetalhes: (canalId: string, valor: boolean) => void;
  onAtualizarTipoImposto: (canalId: string, valor: TipoImposto) => void;
  onAtualizarFreteAdicionalTipo: (canalId: string, valor: FreteAdicionalTipo) => void;
  /** true = margem sugerida dessa Tabela vem de "Outra Tabela" (referência, escolhida por Categoria em Categorias); false = vem direto da % cadastrada por Categoria ("Categorias"). Mesmo campo de sempre (Canal.margemPorReferencia) — só mudou de tela, ver Categorias > Gerenciamento de Categorias pro comportamento em si. */
  onAtualizarCanalModoMargem: (canalId: string, porReferencia: boolean) => void;
  onToggleVisivel: (canalId: string, valor: boolean) => void;
  /** true = essa Tabela oferece pagamento (Pix com desconto + Boleto parcelado, sempre os dois juntos) no modal do Catálogo Online. */
  onTogglePagamento: (canalId: string, valor: boolean) => void;
  onRemoverCanal: (canalId: string) => void;
  onAdicionarCanal: (input: NovoCanalInput) => void;
  /** Vincula (ou desvincula, se null) a Transportadora+Região do canal — o cálculo passa a usar o valor dela ao vivo (módulo Fretes) */
  onSelecionarTransportadora: (canalId: string, transportadoraId: string | null) => void;
  /** Ação exibida na mesma linha do título (ex.: botão de voltar pra Tabela de Preços) */
  acaoTitulo?: React.ReactNode;
}

function CampoRow({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-1.5" title={title}>
      <label className="whitespace-nowrap text-[11px] text-[var(--color-text-soft)]">{label}</label>
      {children}
    </div>
  );
}

const inputClass = 'w-16 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1.5 text-right text-xs text-[var(--color-text)] num';
const selectClass = 'min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-1.5 text-[11px] text-[var(--color-text)]';

export function ChannelsPanel({
  canais,
  transportadoras,
  onAtualizarCampo,
  onAtualizarWhatsapp,
  onAtualizarMostrarDetalhes,
  onAtualizarTipoImposto,
  onAtualizarFreteAdicionalTipo,
  onAtualizarCanalModoMargem,
  onToggleVisivel,
  onTogglePagamento,
  onRemoverCanal,
  onAdicionarCanal,
  onSelecionarTransportadora,
  acaoTitulo,
}: ChannelsPanelProps) {
  const [canalParaRemover, setCanalParaRemover] = useState<Canal | null>(null);
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
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
    transportadoraId: null,
  });
  const novoTransportadoraVinculada = novo.transportadoraId ? transportadoras.find((t) => t.id === novo.transportadoraId) : undefined;

  function confirmarRemover() {
    if (canalParaRemover) onRemoverCanal(canalParaRemover.id);
    setCanalParaRemover(null);
  }

  function submeterNovoCanal() {
    if (!novo.nome.trim()) return;
    onAdicionarCanal(novo);
    setNovo({ nome: '', desconto: 0, comissao: 0, cartao: 0, outrosEncargos: 0, freteKg: 0, fretePct: 0, freteAdicionalTipo: 'fixo', freteAdicionalValor: 0, tipoImposto: 'estadual', transportadoraId: null });
    setModalNovoAberto(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-[var(--color-text)]">Tabelas de Preço / Canais de Venda</p>
        <span className="flex items-center gap-2">
          <Button variant="primary" onClick={() => setModalNovoAberto(true)}>
            + Nova Tabela
          </Button>
          {acaoTitulo}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {canais.map((canal) => {
          const cor = gerarCorCanal(canal.corIndice);
          const transportadoraVinculada = canal.transportadoraId ? transportadoras.find((t) => t.id === canal.transportadoraId) : undefined;
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
              <div className="flex flex-col gap-1.5 p-2.5">
                <label className="flex items-center justify-between gap-1.5 border-b border-dashed border-[var(--color-line)] pb-1.5 text-[11px]">
                  <span className="whitespace-nowrap font-semibold text-[var(--color-text)]">Exibir na Tabela Principal</span>
                  <input type="checkbox" checked={canal.visivel} onChange={(e) => onToggleVisivel(canal.id, e.target.checked)} className="accent-[var(--color-navy)]" />
                </label>
                <label
                  className="flex items-center justify-between gap-1.5 text-[11px]"
                  title="Card do Catálogo Online desse canal mostra VC%/Validade além do Fornecedor — desmarcado, mostra só o nome padrão e o Fornecedor"
                >
                  <span className="whitespace-nowrap font-semibold text-[var(--color-text)]">Mostra detalhes no catálogo</span>
                  <input
                    type="checkbox"
                    checked={canal.mostrarDetalhesPlantio}
                    onChange={(e) => onAtualizarMostrarDetalhes(canal.id, e.target.checked)}
                    className="accent-[var(--color-navy)]"
                  />
                </label>
                <CampoRow
                  label="Média de Desconto (%)"
                  title="Só usado quando não há desconto real medido no BI (última Safra vendida) pra um produto — a fonte primária agora é o histórico de vendas, não mais esse valor cadastrado."
                >
                  <input type="number" step="0.1" min="0" defaultValue={canal.desconto} onBlur={(e) => onAtualizarCampo(canal.id, 'desconto', parseFloat(e.target.value) || 0)} className={inputClass} />
                </CampoRow>
                <CampoRow label="Comissão Vendedor (%)">
                  <input type="number" step="0.1" min="0" defaultValue={canal.comissao} onBlur={(e) => onAtualizarCampo(canal.id, 'comissao', parseFloat(e.target.value) || 0)} className={inputClass} />
                </CampoRow>
                <CampoRow label="Taxa de Cartão (%)">
                  <input type="number" step="0.1" min="0" defaultValue={canal.cartao} onBlur={(e) => onAtualizarCampo(canal.id, 'cartao', parseFloat(e.target.value) || 0)} className={inputClass} />
                </CampoRow>
                <CampoRow label="Tipo de Imposto (ICMS)">
                  <select
                    defaultValue={canal.tipoImposto}
                    onChange={(e) => onAtualizarTipoImposto(canal.id, e.target.value as TipoImposto)}
                    className={selectClass}
                  >
                    <option value="estadual" className="text-[var(--color-text)]">Estadual</option>
                    <option value="interestadual" className="text-[var(--color-text)]">Interestadual</option>
                  </select>
                </CampoRow>
                <CampoRow label="Outros Encargos (R$)">
                  <input type="number" step="0.1" min="0" defaultValue={canal.outrosEncargos} onBlur={(e) => onAtualizarCampo(canal.id, 'outrosEncargos', parseFloat(e.target.value) || 0)} className={inputClass} />
                </CampoRow>
                <CampoRow
                  label="Base de precificação"
                  title="De onde vem a margem sugerida dessa Tabela — 'Categorias' usa a % cadastrada por Categoria (aba Categorias); 'Outra Tabela' espelha a Margem R$ de uma Tabela de referência, escolhida por Categoria (mesma aba). Continua funcionando exatamente como hoje — só o controle mudou de tela."
                >
                  <select
                    value={canal.margemPorReferencia ? 'referencia' : 'categoria'}
                    onChange={(e) => onAtualizarCanalModoMargem(canal.id, e.target.value === 'referencia')}
                    className={selectClass}
                  >
                    <option value="categoria" className="text-[var(--color-text)]">Categorias</option>
                    <option value="referencia" className="text-[var(--color-text)]">Outra Tabela</option>
                  </select>
                </CampoRow>
                <CampoRow label="Transportadora Padrão">
                  <select
                    value={canal.transportadoraId ?? ''}
                    onChange={(e) => onSelecionarTransportadora(canal.id, e.target.value || null)}
                    title="O cálculo passa a usar o Valor/Kg e o Custo NF dela ao vivo — editar a taxa no módulo Fretes atualiza aqui automaticamente"
                    className={selectClass}
                  >
                    <option value="" className="text-[var(--color-text)]">— Manual —</option>
                    {transportadoras.map((t) => (
                      <option key={t.id} value={t.id} className="text-[var(--color-text)]">
                        {t.nome} — {t.uf}
                      </option>
                    ))}
                  </select>
                </CampoRow>
                {transportadoraVinculada ? (
                  <div className="rounded-md bg-[var(--color-page)] px-2.5 py-2 text-xs text-[var(--color-text-soft)]">
                    Ao vivo via <strong className="text-[var(--color-text)]">{transportadoraVinculada.nome}</strong>: Frete Kg{' '}
                    <span className="num font-semibold text-[var(--color-text)]">R$ {transportadoraVinculada.valorPorKg.toFixed(2)}</span>
                    {transportadoraVinculada.valorPorNfTipo === 'percentual' ? (
                      <>
                        {' '}
                        · Frete NF <span className="num font-semibold text-[var(--color-text)]">{(transportadoraVinculada.valorPorNf * 100).toFixed(2)}%</span>
                      </>
                    ) : (
                      <>
                        {' '}
                        · Custo NF é fixo (R$ {transportadoraVinculada.valorPorNf.toFixed(2)}) — não entra como %; ajuste em Outros Encargos se precisar refletir no preço.
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <CampoRow label="Frete Kg (R$)">
                      <input type="number" step="0.1" min="0" defaultValue={canal.freteKg} onBlur={(e) => onAtualizarCampo(canal.id, 'freteKg', parseFloat(e.target.value) || 0)} className={inputClass} />
                    </CampoRow>
                    <CampoRow label="Frete NF (%)">
                      <input type="number" step="0.1" min="0" defaultValue={canal.fretePct} onBlur={(e) => onAtualizarCampo(canal.id, 'fretePct', parseFloat(e.target.value) || 0)} className={inputClass} />
                    </CampoRow>
                  </>
                )}
                <div className="border-t border-dashed border-[var(--color-line)] pt-1.5" />
                <div className="flex flex-col gap-1.5 rounded-md bg-[var(--color-page)] p-2">
                  <CampoRow
                    label="Frete cobrado do cliente"
                    title="O que se cobra do cliente pelo frete — Fixo/R$ por Kg digitados à mão, ou 'Total' pra cobrar exatamente o valor cheio ao vivo da Transportadora vinculada (mesmo usado no custo interno). Nesse modo o frete não entra na margem/preço sugerido (a coluna Frete some da grade) — só o Catálogo Online calcula e cobra o valor cheio no checkout."
                  >
                    <span className="flex gap-1.5">
                      <select
                        defaultValue={canal.freteAdicionalTipo}
                        onChange={(e) => onAtualizarFreteAdicionalTipo(canal.id, e.target.value as FreteAdicionalTipo)}
                        className={selectClass}
                      >
                        <option value="fixo" className="text-[var(--color-text)]">R$ Fixo</option>
                        <option value="kg" className="text-[var(--color-text)]">R$/Kg</option>
                        <option value="transportadora" className="text-[var(--color-text)]">Total</option>
                      </select>
                      {canal.freteAdicionalTipo !== 'transportadora' && (
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          defaultValue={canal.freteAdicionalValor}
                          onBlur={(e) => onAtualizarCampo(canal.id, 'freteAdicionalValor', parseFloat(e.target.value) || 0)}
                          className="w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1.5 text-right text-xs text-[var(--color-text)] num"
                        />
                      )}
                    </span>
                  </CampoRow>
                  <CampoRow label="WhatsApp" title="Número usado no Catálogo Online desse canal (botão flutuante + envio de orçamento) — só DDD+número, Brasil (+55) já é fixo">
                    <span className="flex items-center gap-1">
                      <span className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1.5 text-[11px] text-[var(--color-text-soft)]">+55</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="85999999999"
                        defaultValue={(canal.whatsapp ?? '').replace(/^55/, '')}
                        onBlur={(e) => {
                          const digitos = e.target.value.replace(/\D/g, '');
                          onAtualizarWhatsapp(canal.id, digitos ? `55${digitos}` : '');
                        }}
                        className="w-24 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1.5 text-xs text-[var(--color-text)]"
                      />
                    </span>
                  </CampoRow>
                  <div className="flex flex-col gap-1.5 border-t border-dashed border-[var(--color-line)] pt-1.5">
                    <label
                      className="flex items-center justify-between gap-1.5 text-[11px]"
                      title="Liga Pix (com desconto) e Boleto (parcelado) juntos no modal de pagamento do Catálogo Online (depois de Concluir, antes do WhatsApp/PDF)."
                    >
                      <span className="font-semibold text-[var(--color-text)]">Habilitar forma de pagamento</span>
                      <input
                        type="checkbox"
                        checked={canal.pagamentoHabilitado}
                        onChange={(e) => onTogglePagamento(canal.id, e.target.checked)}
                        className="accent-[var(--color-navy)]"
                      />
                    </label>
                    {canal.pagamentoHabilitado && (
                      <>
                        <CampoRow label="Desconto Pix (%)" title="Desconto no Pix, só sobre os produtos, nunca sobre o frete.">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            defaultValue={canal.pagamentoAvistaDescontoPct}
                            onBlur={(e) => onAtualizarCampo(canal.id, 'pagamentoAvistaDescontoPct', parseFloat(e.target.value) || 0)}
                            className={inputClass}
                          />
                        </CampoRow>
                        <CampoRow label="Valor mínimo do boleto (R$)" title="Parcela o total dos produtos (sem frete) dividindo pelo Valor mínimo do boleto, travado na Qtd máxima de parcelas.">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            defaultValue={canal.pagamentoBoletoValorMinimo}
                            onBlur={(e) => onAtualizarCampo(canal.id, 'pagamentoBoletoValorMinimo', parseFloat(e.target.value) || 0)}
                            className={inputClass}
                          />
                        </CampoRow>
                        <CampoRow label="Qtd máxima de parcelas">
                          <input
                            type="number"
                            step="1"
                            min="1"
                            defaultValue={canal.pagamentoBoletoParcelasMax}
                            onBlur={(e) => onAtualizarCampo(canal.id, 'pagamentoBoletoParcelasMax', parseInt(e.target.value, 10) || 1)}
                            className={inputClass}
                          />
                        </CampoRow>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
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

      <Modal open={modalNovoAberto} title="Nova Tabela de Preço" onClose={() => setModalNovoAberto(false)}>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Nome da tabela"
            value={novo.nome}
            onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))}
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
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
          <CampoRow label="Transportadora Padrão">
            <select
              value={novo.transportadoraId ?? ''}
              onChange={(e) => setNovo((n) => ({ ...n, transportadoraId: e.target.value || null }))}
              title="O cálculo passa a usar o Valor/Kg e o Custo NF dela ao vivo — editar a taxa no módulo Fretes atualiza aqui automaticamente"
              className={selectClass}
            >
              <option value="" className="text-[var(--color-text)]">— Manual —</option>
              {transportadoras.map((t) => (
                <option key={t.id} value={t.id} className="text-[var(--color-text)]">
                  {t.nome} — {t.uf}
                </option>
              ))}
            </select>
          </CampoRow>
          {novoTransportadoraVinculada ? (
            <div className="rounded-md bg-[var(--color-page)] px-2.5 py-2 text-xs text-[var(--color-text-soft)]">
              Ao vivo via <strong className="text-[var(--color-text)]">{novoTransportadoraVinculada.nome}</strong>: Frete Kg{' '}
              <span className="num font-semibold text-[var(--color-text)]">R$ {novoTransportadoraVinculada.valorPorKg.toFixed(2)}</span>
              {novoTransportadoraVinculada.valorPorNfTipo === 'percentual' ? (
                <>
                  {' '}
                  · Frete NF <span className="num font-semibold text-[var(--color-text)]">{(novoTransportadoraVinculada.valorPorNf * 100).toFixed(2)}%</span>
                </>
              ) : (
                <>
                  {' '}
                  · Custo NF é fixo (R$ {novoTransportadoraVinculada.valorPorNf.toFixed(2)}) — não entra como %; ajuste em Outros Encargos se precisar refletir no preço.
                </>
              )}
            </div>
          ) : (
            <>
              <CampoRow label="Frete Kg (R$)">
                <input type="number" step="0.1" min="0" value={novo.freteKg} onChange={(e) => setNovo((n) => ({ ...n, freteKg: parseFloat(e.target.value) || 0 }))} className={inputClass} />
              </CampoRow>
              <CampoRow label="Frete NF (%)">
                <input type="number" step="0.1" min="0" value={novo.fretePct} onChange={(e) => setNovo((n) => ({ ...n, fretePct: parseFloat(e.target.value) || 0 }))} className={inputClass} />
              </CampoRow>
            </>
          )}
          <CampoRow label="Tipo de Imposto (ICMS)">
            <select
              value={novo.tipoImposto}
              onChange={(e) => setNovo((n) => ({ ...n, tipoImposto: e.target.value as TipoImposto }))}
              className={selectClass}
            >
              <option value="estadual" className="text-[var(--color-text)]">Estadual</option>
              <option value="interestadual" className="text-[var(--color-text)]">Interestadual</option>
            </select>
          </CampoRow>
          <Button variant="primary" className="mt-2" onClick={submeterNovoCanal}>
            + Adicionar Nova Tabela de Preço
          </Button>
        </div>
      </Modal>
    </div>
  );
}

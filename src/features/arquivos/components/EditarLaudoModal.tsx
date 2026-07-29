import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { ArquivoLaudo } from '../types';

export interface PatchLaudo {
  nomeProduto: string;
  lote: string;
  anoSafra: string;
  pureza: string;
  germinacao: string;
  validade: string;
  pms: string;
}

interface EditarLaudoModalProps {
  laudo: ArquivoLaudo | null;
  onFechar: () => void;
  onSalvar: (id: string, patch: PatchLaudo) => void;
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** O arquivo pode ter sido salvo com dados errados ou faltando (detecção automática não pega tudo em PDF) — aqui corrige os metadados, sem reenviar o arquivo. */
export function EditarLaudoModal({ laudo, onFechar, onSalvar }: EditarLaudoModalProps) {
  const [nomeProduto, setNomeProduto] = useState('');
  const [lote, setLote] = useState('');
  const [anoSafra, setAnoSafra] = useState('');
  const [pureza, setPureza] = useState('');
  const [germinacao, setGerminacao] = useState('');
  const [validade, setValidade] = useState('');
  const [pms, setPms] = useState('');

  useEffect(() => {
    if (!laudo) return;
    setNomeProduto(laudo.nomeProduto);
    setLote(laudo.lote ?? '');
    setAnoSafra(laudo.anoSafra ?? '');
    setPureza(laudo.pureza ?? '');
    setGerminacao(laudo.germinacao ?? '');
    setValidade(laudo.validade ?? '');
    setPms(laudo.pms ?? '');
  }, [laudo]);

  function salvar() {
    if (!laudo || !nomeProduto.trim() || !lote.trim() || !anoSafra.trim()) return;
    onSalvar(laudo.id, {
      nomeProduto: nomeProduto.trim(),
      lote: lote.trim(),
      anoSafra: anoSafra.trim(),
      pureza: pureza.trim(),
      germinacao: germinacao.trim(),
      validade: validade.trim(),
      pms: pms.trim(),
    });
  }

  return (
    <Modal
      open={laudo !== null}
      title="Editar Laudo"
      onClose={onFechar}
      footer={
        <>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={salvar}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="truncate text-xs text-[var(--color-text-soft)]" title={laudo?.arquivoNome}>
          Arquivo: {laudo?.arquivoNome}
        </p>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Nome do Produto *</label>
          <input value={nomeProduto} onChange={(e) => setNomeProduto(e.target.value)} className={campoClasse} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Lote *</label>
            <input value={lote} onChange={(e) => setLote(e.target.value)} className={campoClasse} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Ano da Safra *</label>
            <input value={anoSafra} onChange={(e) => setAnoSafra(e.target.value)} className={campoClasse} placeholder="Ex.: 2025 ou 25" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Pureza</label>
            <input value={pureza} onChange={(e) => setPureza(e.target.value)} className={campoClasse} placeholder="Ex.: 61,4" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Germinação</label>
            <input value={germinacao} onChange={(e) => setGerminacao(e.target.value)} className={campoClasse} placeholder="Ex.: 82" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Validade</label>
            <input value={validade} onChange={(e) => setValidade(e.target.value)} className={campoClasse} placeholder="Ex.: 11/2025" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">PMS (Peso de Mil Sementes)</label>
          <input value={pms} onChange={(e) => setPms(e.target.value)} className={campoClasse} placeholder="Ex.: 3,2 (em branco usa o PMS base da Parametrização)" />
        </div>
      </div>
    </Modal>
  );
}

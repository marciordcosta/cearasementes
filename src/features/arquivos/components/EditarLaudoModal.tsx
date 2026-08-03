import type { ReactNode } from 'react';
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
  categoria: string;
  processo: string;
  pesoEmbalagem: string;
  pms: string;
}

interface EditarLaudoModalProps {
  laudo: ArquivoLaudo | null;
  onFechar: () => void;
  onSalvar: (id: string, patch: PatchLaudo) => void;
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** Linha do formulário em 2 colunas: descrição à esquerda (largura fixa), caixa à direita (ocupa o resto). */
function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-center gap-3">
      <label className="text-xs font-semibold text-[var(--color-text-soft)]">{label}</label>
      {children}
    </div>
  );
}

/** O arquivo pode ter sido salvo com dados errados ou faltando (detecção automática não pega tudo em PDF) — aqui corrige os metadados, sem reenviar o arquivo. */
export function EditarLaudoModal({ laudo, onFechar, onSalvar }: EditarLaudoModalProps) {
  const [nomeProduto, setNomeProduto] = useState('');
  const [lote, setLote] = useState('');
  const [anoSafra, setAnoSafra] = useState('');
  const [pureza, setPureza] = useState('');
  const [germinacao, setGerminacao] = useState('');
  const [validade, setValidade] = useState('');
  const [categoria, setCategoria] = useState('');
  const [processo, setProcesso] = useState('');
  const [pesoEmbalagem, setPesoEmbalagem] = useState('');
  const [pms, setPms] = useState('');

  useEffect(() => {
    if (!laudo) return;
    setNomeProduto(laudo.nomeProduto);
    setLote(laudo.lote ?? '');
    setAnoSafra(laudo.anoSafra ?? '');
    setPureza(laudo.pureza ?? '');
    setGerminacao(laudo.germinacao ?? '');
    setValidade(laudo.validade ?? '');
    setCategoria(laudo.categoria ?? '');
    setProcesso(laudo.processo ?? '');
    setPesoEmbalagem(laudo.pesoEmbalagem ?? '');
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
      categoria: categoria.trim(),
      processo: processo.trim(),
      pesoEmbalagem: pesoEmbalagem.trim(),
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
      <div className="space-y-2.5">
        <p className="truncate text-xs text-[var(--color-text-soft)]" title={laudo?.arquivoNome}>
          Arquivo: {laudo?.arquivoNome}
        </p>
        <Campo label="Nome do Produto *">
          <input value={nomeProduto} onChange={(e) => setNomeProduto(e.target.value)} className={campoClasse} />
        </Campo>
        <Campo label="Processo">
          <input
            value={processo}
            onChange={(e) => setProcesso(e.target.value)}
            className={campoClasse}
            placeholder="Ex.: Tradicional, Incrustado (lido do laudo quando o documento traz)"
          />
        </Campo>
        <Campo label="Categoria">
          <input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={campoClasse}
            placeholder="Ex.: S2 (lido do laudo quando o documento traz)"
          />
        </Campo>
        <Campo label="Peso por Embalagem (kg)">
          <input
            value={pesoEmbalagem}
            onChange={(e) => setPesoEmbalagem(e.target.value)}
            className={campoClasse}
            placeholder="Ex.: 6 (lido do laudo quando o documento traz; sem isso usa o peso da Tabela de Preço)"
          />
        </Campo>
        <Campo label="Lote *">
          <input value={lote} onChange={(e) => setLote(e.target.value)} className={campoClasse} />
        </Campo>
        <Campo label="Ano da Safra *">
          <input value={anoSafra} onChange={(e) => setAnoSafra(e.target.value)} className={campoClasse} placeholder="Ex.: 2025 ou 25" />
        </Campo>
        <Campo label="Pureza">
          <input value={pureza} onChange={(e) => setPureza(e.target.value)} className={campoClasse} placeholder="Ex.: 61,4" />
        </Campo>
        <Campo label="Germinação">
          <input value={germinacao} onChange={(e) => setGerminacao(e.target.value)} className={campoClasse} placeholder="Ex.: 82" />
        </Campo>
        <Campo label="Validade">
          <input value={validade} onChange={(e) => setValidade(e.target.value)} className={campoClasse} placeholder="Ex.: 11/2025" />
        </Campo>
        <Campo label="PMS (Peso de Mil Sementes)">
          <input value={pms} onChange={(e) => setPms(e.target.value)} className={campoClasse} placeholder="Ex.: 3,2 (em branco usa o PMS base da Parametrização)" />
        </Campo>
      </div>
    </Modal>
  );
}

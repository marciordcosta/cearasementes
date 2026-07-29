import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { PatchTeste } from '../api';
import { diasDesdeTeste, formatarDiasTeste, resultadoTeste } from '../testeGerminacao';
import type { ArquivoLaudo } from '../types';

interface TesteModalProps {
  laudo: ArquivoLaudo | null;
  onFechar: () => void;
  onSalvar: (id: string, patch: PatchTeste) => void;
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** Teste de germinação de campo (nosso, feito com frequência) — separado do EditarLaudoModal porque é aberto clicando no próprio valor da coluna "Teste", não no ✎ de editar metadados. */
export function TesteModal({ laudo, onFechar, onSalvar }: TesteModalProps) {
  const [forma, setForma] = useState<'sementes' | 'peso'>('sementes');
  const [data, setData] = useState('');
  const [plantadas, setPlantadas] = useState('');
  const [germinadas, setGerminadas] = useState('');
  const [pesoPlantado, setPesoPlantado] = useState('');

  useEffect(() => {
    if (!laudo) return;
    setForma(laudo.testeForma ?? 'sementes');
    setData(laudo.testeData ?? '');
    setPlantadas(laudo.testePlantadas != null ? String(laudo.testePlantadas) : '');
    setGerminadas(laudo.testeGerminadas != null ? String(laudo.testeGerminadas) : '');
    setPesoPlantado(laudo.testePesoPlantado != null ? String(laudo.testePesoPlantado) : '');
  }, [laudo]);

  const plantadasNum = Number(plantadas.replace(',', '.')) || 0;
  const germinadasNum = Number(germinadas.replace(',', '.')) || 0;
  const resultado = resultadoTeste({ testeForma: forma, testePlantadas: plantadasNum, testeGerminadas: germinadasNum });
  const dias = data ? diasDesdeTeste(data) : null;

  function salvar() {
    if (!laudo) return;
    onSalvar(laudo.id, {
      testeForma: forma,
      testeData: data || null,
      testePlantadas: forma === 'sementes' && plantadas.trim() ? plantadasNum : null,
      testeGerminadas: germinadas.trim() ? germinadasNum : null,
      testePesoPlantado: forma === 'peso' && pesoPlantado.trim() ? Number(pesoPlantado.replace(',', '.')) || null : null,
    });
  }

  function excluir() {
    if (!laudo) return;
    onSalvar(laudo.id, { testeForma: null, testeData: null, testePlantadas: null, testeGerminadas: null, testePesoPlantado: null });
  }

  return (
    <Modal
      open={laudo !== null}
      title="Teste de Germinação (Campo)"
      onClose={onFechar}
      footer={
        <>
          {laudo?.testeForma != null && (
            <Button variant="danger" onClick={excluir} className="mr-auto">
              Excluir
            </Button>
          )}
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
        <p className="text-xs text-[var(--color-text-soft)]">
          {laudo?.nomeProduto}
          {laudo?.lote ? ` — Lote ${laudo.lote}` : ''}
        </p>

        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Forma do teste</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForma('sementes')}
              className={`flex-1 rounded-md border px-2.5 py-1.5 text-sm font-semibold ${
                forma === 'sementes' ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]' : 'border-[var(--color-line)] text-[var(--color-text-soft)]'
              }`}
            >
              Quantidade de sementes
            </button>
            <button
              type="button"
              onClick={() => setForma('peso')}
              className={`flex-1 rounded-md border px-2.5 py-1.5 text-sm font-semibold ${
                forma === 'peso' ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]' : 'border-[var(--color-line)] text-[var(--color-text-soft)]'
              }`}
            >
              Peso
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Data do teste</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campoClasse} />
        </div>

        {forma === 'sementes' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Plantadas</label>
              <input type="number" min={0} value={plantadas} onChange={(e) => setPlantadas(e.target.value)} className={campoClasse} placeholder="Ex.: 100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Germinadas</label>
              <input type="number" min={0} value={germinadas} onChange={(e) => setGerminadas(e.target.value)} className={campoClasse} placeholder="Ex.: 35" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Peso plantado (g)</label>
              <input type="number" min={0} value={pesoPlantado} onChange={(e) => setPesoPlantado(e.target.value)} className={campoClasse} placeholder="Ex.: 5" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Germinadas (qtd.)</label>
              <input type="number" min={0} value={germinadas} onChange={(e) => setGerminadas(e.target.value)} className={campoClasse} placeholder="Ex.: 35" />
            </div>
          </div>
        )}

        <div className="rounded-md border border-[var(--color-line)] p-3 text-sm">
          <p className="text-[var(--color-text)]">
            Resultado: <strong>{resultado}</strong>
          </p>
          {dias !== null && <p className="mt-0.5 text-xs text-[var(--color-text-soft)]">{formatarDiasTeste(dias)} desde o teste</p>}
        </div>
      </div>
    </Modal>
  );
}

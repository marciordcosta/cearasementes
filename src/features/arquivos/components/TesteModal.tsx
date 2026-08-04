import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { PatchTeste } from '../api';
import { redimensionarImagem } from '../fotoTeste';
import { diasDesdeTeste, formatarDiasTeste, resultadoTeste } from '../testeGerminacao';
import type { ArquivoLaudo } from '../types';

interface TesteModalProps {
  laudo: ArquivoLaudo | null;
  onFechar: () => void;
  onSalvar: (id: string, patch: PatchTeste) => void;
  /** Sobe a foto e devolve a URL pública — chamado na hora (não espera o "Salvar"), pra não perder foto já tirada no campo se o usuário fechar o modal sem salvar o resto. */
  onAdicionarFoto: (laudoId: string, arquivo: File) => Promise<string>;
  onRemoverFoto: (laudoId: string, url: string) => Promise<void>;
  /** Grava a lista de fotos no próprio laudo (coluna teste_fotos) — chamado logo depois de cada upload/remoção, senão a foto fica só no Storage, sem nenhuma referência salva até o usuário clicar "Salvar". */
  onSalvarFotos: (laudoId: string, fotos: string[]) => Promise<void>;
  /** Como fotos gravam direto (sem esperar "Salvar"), a lista de laudos do pai precisa ser atualizada na hora — senão reabrir o modal sem ter clicado Salvar mostraria a foto "sumida" (o `laudo` recebido via prop ainda seria o antigo, do cache desatualizado). */
  onFotosAlteradas: () => void;
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** Teste de germinação de campo (nosso, feito com frequência) — separado do EditarLaudoModal porque é aberto clicando no próprio valor da coluna "Teste", não no ✎ de editar metadados. */
export function TesteModal({ laudo, onFechar, onSalvar, onAdicionarFoto, onRemoverFoto, onSalvarFotos, onFotosAlteradas }: TesteModalProps) {
  const [forma, setForma] = useState<'sementes' | 'peso'>('sementes');
  const [data, setData] = useState('');
  const [plantadas, setPlantadas] = useState('');
  const [germinadas, setGerminadas] = useState('');
  const [pesoPlantado, setPesoPlantado] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!laudo) return;
    setForma(laudo.testeForma ?? 'sementes');
    setData(laudo.testeData ?? '');
    setPlantadas(laudo.testePlantadas != null ? String(laudo.testePlantadas) : '');
    setGerminadas(laudo.testeGerminadas != null ? String(laudo.testeGerminadas) : '');
    setPesoPlantado(laudo.testePesoPlantado != null ? String(laudo.testePesoPlantado) : '');
    setFotos(laudo.testeFotos);
    setErroFoto(null);
  }, [laudo]);

  async function aoEscolherFotos(arquivos: FileList | null) {
    if (!laudo || !arquivos || arquivos.length === 0) return;
    setEnviandoFoto(true);
    setErroFoto(null);
    try {
      let atual = fotos;
      for (const arquivo of Array.from(arquivos)) {
        const reduzido = await redimensionarImagem(arquivo);
        const url = await onAdicionarFoto(laudo.id, reduzido);
        atual = [...atual, url];
        setFotos(atual);
      }
      await onSalvarFotos(laudo.id, atual);
      onFotosAlteradas();
    } catch {
      setErroFoto('Falha ao enviar uma ou mais fotos. Tente novamente.');
    } finally {
      setEnviandoFoto(false);
      if (inputFotoRef.current) inputFotoRef.current.value = '';
    }
  }

  async function removerFoto(url: string) {
    if (!laudo) return;
    const atual = fotos.filter((f) => f !== url);
    setFotos(atual);
    try {
      await onRemoverFoto(laudo.id, url);
      await onSalvarFotos(laudo.id, atual);
      onFotosAlteradas();
    } catch {
      setErroFoto('Falha ao remover a foto do servidor (ela já sumiu da tela, mas pode continuar salva).');
    }
  }

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
      testeFotos: fotos,
    });
  }

  async function excluir() {
    if (!laudo) return;
    await Promise.all(fotos.map((url) => onRemoverFoto(laudo.id, url).catch(() => {})));
    onSalvar(laudo.id, { testeForma: null, testeData: null, testePlantadas: null, testeGerminadas: null, testePesoPlantado: null, testeFotos: [] });
  }

  return (
    <Modal
      open={laudo !== null}
      title="Teste de Germinação (Campo)"
      onClose={onFechar}
      widthClassName="max-w-[480px]"
      footer={
        <>
          {(laudo?.testeForma != null || fotos.length > 0) && (
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

        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Fotos</label>
          {erroFoto && <p className="mb-1.5 text-xs text-bad">{erroFoto}</p>}
          <div className="grid grid-cols-3 gap-2">
            {fotos.map((url) => (
              <div key={url} className="group relative aspect-square overflow-hidden rounded-md border border-[var(--color-line)]">
                <img src={url} alt="Foto do teste de campo" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removerFoto(url)}
                  title="Remover foto"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-bad"
                >
                  ✕
                </button>
              </div>
            ))}
            <label
              className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--color-line)] text-center text-[11px] text-[var(--color-text-soft)] hover:bg-[var(--color-page)] ${enviandoFoto ? 'pointer-events-none opacity-50' : ''}`}
            >
              <span className="text-lg">📷</span>
              {enviandoFoto ? 'Enviando…' : '+ Adicionar'}
              <input
                ref={inputFotoRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={enviandoFoto}
                onChange={(e) => aoEscolherFotos(e.target.files)}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { PatchTeste } from '../api';
import { redimensionarImagem } from '../fotoTeste';
import { diasDesdeTeste, formatarDiasTeste, resultadoTeste, statusTeste } from '../testeGerminacao';
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
const valorClasse = 'w-28 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]';
const valorNumeroClasse = `${valorClasse} text-right num`;

/** Linha "descrição de um lado, valor do outro" — mais compacta que rótulo em cima do campo, cabe melhor numa tela de celular. */
function LinhaCampo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="text-xs font-semibold text-[var(--color-text-soft)]">{label}</span>
      {children}
    </div>
  );
}

/** Card de uma etapa do Teste de Campo (Plantio ou Resultado) — título + selo opcional na faixa de cabeçalho. */
function Cartao({ titulo, selo, children }: { titulo: string; selo?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-line)]">
      <div className="flex items-center justify-between bg-[var(--color-page)] px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">{titulo}</span>
        {selo}
      </div>
      <div className="divide-y divide-[var(--color-line)]">{children}</div>
    </div>
  );
}

/** Teste de germinação de campo (nosso, feito com frequência) — separado do EditarLaudoModal porque é aberto clicando no próprio valor da coluna "Teste", não no ✎ de editar metadados. */
export function TesteModal({ laudo, onFechar, onSalvar, onAdicionarFoto, onRemoverFoto, onSalvarFotos, onFotosAlteradas }: TesteModalProps) {
  const [forma, setForma] = useState<'sementes' | 'peso'>('sementes');
  const [data, setData] = useState('');
  const [plantadas, setPlantadas] = useState('');
  const [germinadas, setGerminadas] = useState('');
  const [pesoPlantado, setPesoPlantado] = useState('');
  const [dataResultado, setDataResultado] = useState('');
  const [observacao, setObservacao] = useState('');
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
    setDataResultado(laudo.testeDataResultado ?? '');
    setObservacao(laudo.testeObservacao ?? '');
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

  /** Baixa a foto pro PC — um <a download> comum não funciona pra URL de outro domínio (Storage do Supabase), então busca o arquivo e baixa via blob local. */
  async function baixarFoto(url: string) {
    try {
      const resposta = await fetch(url);
      const blob = await resposta.blob();
      const urlLocal = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = urlLocal;
      link.download = url.split('/').pop() || 'foto-teste-campo.jpg';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(urlLocal);
    } catch {
      setErroFoto('Falha ao baixar a foto.');
    }
  }

  const plantadasNum = Number(plantadas.replace(',', '.')) || 0;
  // null (não 0) enquanto "Germinadas" não foi preenchido — é o que distingue "Em análise" de "resultado 0%" (ver statusTeste).
  const germinadasNum = germinadas.trim() ? Number(germinadas.replace(',', '.')) || 0 : null;
  // `forma` sempre tem um valor local ('sementes' por padrão, mesmo num laudo sem teste nenhum — é só o toggle
  // pré-selecionado) — sem esse check, statusTeste nunca veria "sem_teste" aqui dentro, e um laudo nunca tocado
  // mostraria "Em análise" só de abrir o modal, antes de preencher ou salvar qualquer coisa.
  const testeIniciado = laudo?.testeForma != null || data.trim() !== '' || plantadas.trim() !== '' || pesoPlantado.trim() !== '';
  const status = testeIniciado ? statusTeste({ testeForma: forma, testeGerminadas: germinadasNum }) : 'sem_teste';
  const resultado = testeIniciado ? resultadoTeste({ testeForma: forma, testePlantadas: plantadasNum, testeGerminadas: germinadasNum }) : '—';
  const diasPlantio = data ? diasDesdeTeste(data) : null;
  const diasResultado = dataResultado ? diasDesdeTeste(dataResultado) : null;

  function salvar() {
    if (!laudo) return;
    onSalvar(laudo.id, {
      testeForma: forma,
      testeData: data || null,
      testePlantadas: forma === 'sementes' && plantadas.trim() ? plantadasNum : null,
      testeGerminadas: germinadasNum,
      testePesoPlantado: forma === 'peso' && pesoPlantado.trim() ? Number(pesoPlantado.replace(',', '.')) || null : null,
      testeFotos: fotos,
      testeObservacao: observacao.trim() || null,
      testeDataResultado: dataResultado || null,
    });
  }

  async function excluir() {
    if (!laudo) return;
    await Promise.all(fotos.map((url) => onRemoverFoto(laudo.id, url).catch(() => {})));
    onSalvar(laudo.id, {
      testeForma: null,
      testeData: null,
      testePlantadas: null,
      testeGerminadas: null,
      testePesoPlantado: null,
      testeFotos: [],
      testeObservacao: null,
      testeDataResultado: null,
    });
  }

  return (
    <Modal
      open={laudo !== null}
      title="Teste de Germinação (Campo)"
      onClose={onFechar}
      widthClassName="max-w-[480px]"
      footer={
        <>
          {(laudo?.testeForma != null || fotos.length > 0 || observacao.trim() !== '') && (
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

        <Cartao titulo="Plantio">
          <LinhaCampo label="Data do plantio">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={`${valorClasse} w-[150px]`} />
          </LinhaCampo>
          {forma === 'sementes' ? (
            <LinhaCampo label="Plantadas">
              <input type="number" min={0} value={plantadas} onChange={(e) => setPlantadas(e.target.value)} className={valorNumeroClasse} />
            </LinhaCampo>
          ) : (
            <LinhaCampo label="Peso plantado (g)">
              <input type="number" min={0} value={pesoPlantado} onChange={(e) => setPesoPlantado(e.target.value)} className={valorNumeroClasse} />
            </LinhaCampo>
          )}
          {status === 'em_analise' && diasPlantio !== null && (
            <p className="px-3 py-2 text-[11px] text-[var(--color-text-soft)]">{formatarDiasTeste(diasPlantio)} desde o plantio — aguardando resultado.</p>
          )}
        </Cartao>

        <Cartao
          titulo="Resultado"
          selo={
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                status === 'resultado' ? 'bg-good-soft text-good' : status === 'em_analise' ? 'bg-warn-soft text-[#8A5B10]' : 'bg-[var(--color-line)] text-[var(--color-text-soft)]'
              }`}
            >
              {resultado}
            </span>
          }
        >
          <LinhaCampo label={forma === 'peso' ? 'Germinadas (qtd.)' : 'Germinadas'}>
            <input type="number" min={0} value={germinadas} onChange={(e) => setGerminadas(e.target.value)} className={valorNumeroClasse} />
          </LinhaCampo>
          <LinhaCampo label="Data do resultado">
            <input type="date" value={dataResultado} onChange={(e) => setDataResultado(e.target.value)} className={`${valorClasse} w-[150px]`} />
          </LinhaCampo>
          {diasResultado !== null && status === 'resultado' && (
            <p className="px-3 py-2 text-[11px] text-[var(--color-text-soft)]">Resultado registrado há {formatarDiasTeste(diasResultado)}.</p>
          )}

          <div className="px-3 py-2.5">
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Anotações do teste (opcional)"
              className={`${campoClasse} resize-none`}
            />
          </div>

          <div className="px-3 py-2.5">
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Fotos</label>
            {erroFoto && <p className="mb-1.5 text-xs text-bad">{erroFoto}</p>}
            <div className="grid grid-cols-3 gap-2">
              {fotos.map((url) => (
                <div key={url} className="group relative aspect-square overflow-hidden rounded-md border border-[var(--color-line)]">
                  <img src={url} alt="Foto do teste de campo" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => baixarFoto(url)}
                    title="Baixar foto"
                    className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-[var(--color-accent)]"
                  >
                    ⬇
                  </button>
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
        </Cartao>
      </div>
    </Modal>
  );
}

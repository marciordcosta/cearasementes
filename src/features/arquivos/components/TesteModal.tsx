import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { uuidParaCurto } from '@/lib/idCurto';
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

/** Glifo do WhatsApp (simple-icons) — lucide-react não tem ícones de marca. */
function IconeWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0 0 12.04 2Zm0 18.15a8.2 8.2 0 0 1-4.19-1.14l-.3-.18-3.12.82.83-3.04-.2-.32a8.14 8.14 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.42a8.17 8.17 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.24 8.24Zm4.98-6.04c-.24-.12-1.44-.71-1.66-.79-.22-.08-.38-.12-.54.12s-.62.79-.76.95-.28.18-.52.06c-.24-.12-1.04-.39-1.99-1.24-.74-.66-1.24-1.48-1.38-1.72-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.32-.74-1.8-.2-.48-.4-.42-.54-.42-.14 0-.3-.02-.46-.02s-.42.06-.64.3c-.22.24-.84.82-.84 2.02s.86 2.35 1 2.51c.14.16 1.7 2.62 4.15 3.62.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

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

  /** Link direto pro Teste de Campo desse laudo na página enxuta de celular (TesteCampoPage) — abre o WhatsApp Web já com o texto pronto pra escolher o contato e enviar. */
  function enviarPorWhatsapp() {
    if (!laudo) return;
    const link = `${window.location.origin}/teste-campo?laudo=${uuidParaCurto(laudo.id)}`;
    const texto = `Teste de Germinação (Campo) — ${laudo.nomeProduto}${laudo.lote ? ` (Lote ${laudo.lote})` : ''}: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
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
      title={
        <>
          <span>Teste de Germinação (Campo)</span>
          {laudo && (
            <button
              type="button"
              onClick={enviarPorWhatsapp}
              title="Enviar link de acesso pelo celular via WhatsApp"
              className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#25D366] opacity-80 hover:opacity-100"
            >
              <IconeWhatsapp className="h-4 w-4" />
            </button>
          )}
        </>
      }
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

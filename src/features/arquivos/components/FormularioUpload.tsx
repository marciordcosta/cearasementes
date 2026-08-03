import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { mensagemDeErro } from '@/lib/errors';
import { interpretarLaudo } from '../interpretarLaudo';
import type { NovoLaudoInput } from '../types';
import { VisualizarLocalModal } from './VisualizarLocalModal';

interface FormularioUploadProps {
  /** O picker de arquivos vive num modal, aberto pelo botão no topbar (ver ArquivosPage) — controlado de fora pra um único botão conseguir abri-lo. */
  aberto: boolean;
  onFechar: () => void;
  enviando: boolean;
  onEnviar: (inputs: NovoLaudoInput[]) => Promise<ResultadoEnvio[]>;
}

interface ResultadoEnvio {
  arquivo: string;
  ok: boolean;
  erro?: string;
}

interface ArquivoProcessado extends NovoLaudoInput {
  extras: Record<string, string>;
}

/** Um arquivo pode falhar já na LEITURA (PDF corrompido, formato inesperado) — antes de sequer virar um envio pro Supabase. Guarda os dois casos lado a lado (por arquivo) em vez de dois arrays paralelos, pra nunca dessincronizar. */
type LeituraArquivo = { ok: true; arquivo: File; processado: ArquivoProcessado } | { ok: false; arquivo: File; erroLeitura: string };
type ArquivoResultado = { ok: true; arquivo: File; processado: ArquivoProcessado; envio?: ResultadoEnvio } | { ok: false; arquivo: File; erroLeitura: string };

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FormularioUpload({ aberto, onFechar, enviando, onEnviar }: FormularioUploadProps) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [visualizando, setVisualizando] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<ArquivoResultado[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function aoEscolherArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const novos = Array.from(e.target.files ?? []);
    setArquivos((prev) => [...prev, ...novos]);
    setResultado(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function remover(arquivo: File) {
    setArquivos((prev) => prev.filter((a) => a !== arquivo));
  }

  async function enviarTodos() {
    if (arquivos.length === 0) return;
    setProcessando(true);
    setResultado(null);
    try {
      // Lê todos em paralelo (mais rápido com vários arquivos) e isola o erro
      // de cada um — sem isso, um único PDF corrompido derrubava a leitura
      // inteira, sem nenhuma mensagem, e nem chegava a enviar os outros.
      const lidos: LeituraArquivo[] = await Promise.all(
        arquivos.map(async (arquivo): Promise<LeituraArquivo> => {
          try {
            const lido = await interpretarLaudo(arquivo);
            const processado: ArquivoProcessado = {
              nomeProduto: lido.nomeProduto,
              lote: lido.lote,
              anoSafra: lido.anoSafra,
              arquivo,
              pureza: lido.extras.Pureza,
              germinacao: lido.extras.Germinação,
              validade: lido.extras.Validade,
              categoria: lido.extras.Categoria,
              especie: lido.extras.Espécie,
              processo: lido.extras.Processo,
              pesoEmbalagem: lido.extras.Peso,
              extras: lido.extras,
            };
            return { ok: true, arquivo, processado };
          } catch (e) {
            return { ok: false, arquivo, erroLeitura: mensagemDeErro(e, 'Falha ao ler o arquivo.') };
          }
        }),
      );

      const paraEnviar = lidos.filter((l): l is Extract<LeituraArquivo, { ok: true }> => l.ok).map((l) => l.processado);
      const envios = paraEnviar.length > 0 ? await onEnviar(paraEnviar) : [];

      let proximoEnvio = 0;
      const finais: ArquivoResultado[] = lidos.map((l) => (l.ok ? { ...l, envio: envios[proximoEnvio++] } : l));
      setResultado(finais);
      setArquivos([]);
      onFechar();
    } finally {
      setProcessando(false);
    }
  }

  const ocupado = processando || enviando;

  return (
    <>
      <Modal open={aberto} title="Enviar novos laudos" onClose={onFechar} widthClassName="max-w-[560px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={inputRef} type="file" multiple onChange={aoEscolherArquivos} className="text-sm" />
            <Button variant="primary" disabled={ocupado || arquivos.length === 0} onClick={enviarTodos}>
              {processando ? 'Lendo e enviando…' : enviando ? 'Enviando…' : `+ Enviar ${arquivos.length || ''} Laudo${arquivos.length === 1 ? '' : 's'}`.trim()}
            </Button>
          </div>

          {arquivos.length > 0 && (
            <ul className="space-y-1.5">
              {arquivos.map((arquivo, i) => (
                <li key={`${arquivo.name}_${i}`} className="flex items-center justify-between gap-3 rounded-md bg-[var(--color-page)] px-3 py-1.5 text-sm">
                  <span className="truncate text-[var(--color-text)]" title={arquivo.name}>
                    {arquivo.name} <span className="text-xs text-[var(--color-text-soft)]">({formatarTamanho(arquivo.size)})</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => setVisualizando(arquivo)} title="Ver arquivo" className="text-[var(--color-text-soft)] hover:text-[var(--color-text)]">
                      👁
                    </button>
                    <button type="button" onClick={() => remover(arquivo)} title="Remover da lista" className="text-[var(--color-text-soft)] hover:text-bad">
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {resultado && (
        <Card className="space-y-1.5 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-[var(--color-text)]">
              {resultado.filter((r) => r.ok && r.envio?.ok).length} de {resultado.length} laudo(s) enviado(s):
            </p>
            <button type="button" onClick={() => setResultado(null)} title="Fechar" className="shrink-0 text-[var(--color-text-soft)] hover:text-[var(--color-text)]">
              ✕
            </button>
          </div>
          <ul className="space-y-1.5">
            {resultado.map((r, i) => {
              if (!r.ok) {
                return (
                  <li key={`${r.arquivo.name}_${i}`} className="text-xs text-[var(--color-text-soft)]">
                    ❌ <strong className="text-[var(--color-text)]">{r.arquivo.name}</strong>
                    <span className="text-bad"> — Falha ao ler o arquivo: {r.erroLeitura}</span>
                  </li>
                );
              }
              const { processado: p, envio } = r;
              const faltando = [!p.nomeProduto.trim() && 'Produto', !p.lote.trim() && 'Lote', !p.anoSafra.trim() && 'Ano Safra'].filter(Boolean) as string[];
              return (
                <li key={`${p.arquivo.name}_${i}`} className="text-xs text-[var(--color-text-soft)]">
                  {envio?.ok ? '✅' : '❌'} <strong className="text-[var(--color-text)]">{p.nomeProduto || p.arquivo.name}</strong>
                  {p.lote ? ` — Lote ${p.lote}` : ''}
                  {p.anoSafra ? ` — Safra ${p.anoSafra}` : ''}
                  {Object.entries(p.extras).map(([campo, valor]) => ` · ${campo}: ${valor}`).join('')}
                  {envio && !envio.ok && <span className="text-bad"> — Falha ao enviar: {envio.erro}</span>}
                  {envio?.ok && faltando.length > 0 && <span> — faltou detectar {faltando.join(', ')}, corrija com o ✎ na lista.</span>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <VisualizarLocalModal arquivo={visualizando} onFechar={() => setVisualizando(null)} />
    </>
  );
}

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { interpretarLaudo } from '../interpretarLaudo';
import type { NovoLaudoInput } from '../types';
import { VisualizarLocalModal } from './VisualizarLocalModal';

interface FormularioUploadProps {
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

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FormularioUpload({ enviando, onEnviar }: FormularioUploadProps) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [visualizando, setVisualizando] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<{ processados: ArquivoProcessado[]; envios: ResultadoEnvio[] } | null>(null);
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
      const processados: ArquivoProcessado[] = [];
      for (const arquivo of arquivos) {
        const lido = await interpretarLaudo(arquivo);
        processados.push({
          nomeProduto: lido.nomeProduto,
          lote: lido.lote,
          anoSafra: lido.anoSafra,
          arquivo,
          pureza: lido.extras.Pureza,
          germinacao: lido.extras.Germinação,
          validade: lido.extras.Validade,
          extras: lido.extras,
        });
      }
      const envios = await onEnviar(processados);
      setResultado({ processados, envios });
      setArquivos([]);
    } finally {
      setProcessando(false);
    }
  }

  const ocupado = processando || enviando;

  return (
    <Card className="space-y-3 p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">Enviar novos laudos</h3>

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

      {resultado && (
        <div className="space-y-1.5 rounded-md border border-[var(--color-line)] p-3">
          <p className="text-xs font-semibold text-[var(--color-text)]">
            {resultado.envios.filter((r) => r.ok).length} de {resultado.envios.length} laudo(s) enviado(s):
          </p>
          <ul className="space-y-1.5">
            {resultado.processados.map((p, i) => {
              const envio = resultado.envios[i];
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
        </div>
      )}

      <VisualizarLocalModal arquivo={visualizando} onFechar={() => setVisualizando(null)} />
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apagarFotoTeste,
  atualizarFotosTeste,
  atualizarTeste,
  enviarFotoTeste,
  fetchArquivosLaudos,
  fetchParametrizacaoProdutos,
  type PatchTeste,
} from '@/features/arquivos/api';
import { TesteModal } from '@/features/arquivos/components/TesteModal';
import { filtrarArquivos } from '@/features/arquivos/filtrarArquivos';
import { resolverPmsDoLaudo } from '@/features/arquivos/parametrizacaoProdutos';
import { resultadoTeste, statusTeste } from '@/features/arquivos/testeGerminacao';
import type { ArquivoLaudo } from '@/features/arquivos/types';
import { mensagemDeErro } from '@/lib/errors';
import { curtoParaUuid } from '@/lib/idCurto';

/**
 * Página enxuta pra celular — busca um laudo e abre direto o Teste de Campo
 * (mesmo TesteModal do Gerenciador de Arquivos, com câmera pra fotos). Sem
 * AppShell (sidebar/topbar do desktop não cabem numa tela de celular) e sem
 * autenticação (o app inteiro já não tem nenhuma hoje). Sempre modo claro
 * fixo (`.tema-claro-fixo`, ver index.css) — quem usa é o operador de campo
 * batendo foto sob luz forte, sem tema pra trocar nem botão pra isso.
 */
export function TesteCampoPage() {
  const queryClient = useQueryClient();
  const { data: arquivos = [] } = useQuery({ queryKey: ['arquivos_laudos'], queryFn: fetchArquivosLaudos });
  const { data: produtos = [] } = useQuery({ queryKey: ['arquivos_parametrizacao_produtos'], queryFn: fetchParametrizacaoProdutos });
  const [busca, setBusca] = useState('');
  const [paraTeste, setParaTeste] = useState<ArquivoLaudo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  // Link enviado pelo ícone de WhatsApp do TesteModal (?laudo=<id>) — abre esse teste
  // direto, sem precisar buscar/tocar na lista.
  const laudoIdLink = searchParams.get('laudo');
  useEffect(() => {
    if (!laudoIdLink) return;
    const idReal = curtoParaUuid(laudoIdLink);
    if (!idReal) return;
    const alvo = arquivos.find((a) => a.id === idReal);
    if (alvo) setParaTeste(alvo);
  }, [laudoIdLink, arquivos]);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['arquivos_laudos'] });
  }

  async function onSalvarTeste(id: string, patch: PatchTeste) {
    try {
      await atualizarTeste(id, patch);
      setParaTeste(null);
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar o teste de germinação.'));
    }
  }

  const filtrados = [...filtrarArquivos(arquivos, busca)].sort((a, b) => a.nomeProduto.localeCompare(b.nomeProduto));

  return (
    <div className="tema-claro-fixo flex min-h-screen flex-col bg-[var(--color-page)]">
      <div className="sticky top-0 z-10 space-y-2.5 border-b border-[var(--color-line)] bg-[var(--color-navy)] px-4 py-3.5">
        <h1 className="text-base font-bold text-white">Teste de Campo</h1>
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por produto ou lote…"
          className="w-full rounded-md border border-white/25 bg-white/10 px-3 py-2.5 text-base text-white placeholder:text-white/60 focus:border-[var(--color-accent)] focus:bg-white/15 focus:outline-none"
        />
      </div>

      {erro && (
        <div className="flex items-center justify-between gap-3 border-b border-bad/40 bg-bad-soft px-4 py-2.5 text-sm text-[#8F2E2E]">
          <span>{erro}</span>
          <button type="button" onClick={() => setErro(null)} className="font-semibold hover:underline">
            Fechar
          </button>
        </div>
      )}

      <div className="flex-1">
        {filtrados.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-text-soft)]">Nenhum laudo encontrado.</p>
        ) : (
          filtrados.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setParaTeste(a)}
              className="flex w-full flex-col gap-0.5 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3.5 text-left active:bg-[var(--color-page)]"
            >
              <span className="text-sm font-semibold text-[var(--color-text)]">{a.nomeProduto}</span>
              <span className="flex items-center justify-between text-xs text-[var(--color-text-soft)]">
                <span>
                  {a.lote ? `Lote ${a.lote}` : 'Sem lote'}
                  {a.validade ? ` · Validade ${a.validade}` : ''}
                </span>
                <span
                  className={`font-semibold ${
                    statusTeste(a) === 'resultado' ? 'text-good' : statusTeste(a) === 'em_analise' ? 'text-[#8A5B10]' : ''
                  }`}
                >
                  {statusTeste(a) === 'sem_teste' ? '🧪' : resultadoTeste(a, resolverPmsDoLaudo(a, produtos))}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      <TesteModal
        laudo={paraTeste}
        produtos={produtos}
        onFechar={() => setParaTeste(null)}
        onSalvar={onSalvarTeste}
        onAdicionarFoto={enviarFotoTeste}
        onRemoverFoto={apagarFotoTeste}
        onSalvarFotos={atualizarFotosTeste}
        onFotosAlteradas={invalidar}
      />
    </div>
  );
}

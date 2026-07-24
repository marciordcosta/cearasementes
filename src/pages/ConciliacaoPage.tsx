import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import {
  cancelarConciliacao,
  conciliar,
  conciliarManualSistema,
  fetchArquivos,
  fetchLancamentosBanco,
  fetchLancamentosSistema,
  inserirLancamentoManualSistema,
  toggleDesativadoBanco,
  toggleDesativadoSistema,
} from '@/features/conciliacao/api';
import { AcoesConciliacaoCard } from '@/features/conciliacao/components/AcoesConciliacaoCard';
import { FiltrosConciliacao } from '@/features/conciliacao/components/FiltrosConciliacao';
import { ListaBanco } from '@/features/conciliacao/components/ListaBanco';
import { ListaSistema } from '@/features/conciliacao/components/ListaSistema';
import { NovoLancamentoManualModal } from '@/features/conciliacao/components/NovoLancamentoManualModal';
import { SugestoesModal } from '@/features/conciliacao/components/SugestoesModal';
import { TotaisRodape } from '@/features/conciliacao/components/TotaisRodape';
import { buscarSugestoes, conciliacaoAutomatica } from '@/features/conciliacao/matching';
import type { ArquivoConciliacao, FiltrosConciliacao as FiltrosConciliacaoType, LancamentoBanco, LancamentoSistema, SugestoesConciliacao } from '@/features/conciliacao/types';
import { mensagemDeErro } from '@/lib/errors';

const FILTROS_VAZIOS: FiltrosConciliacaoType = {
  arquivoBancoId: null,
  dataInicio: null,
  dataFim: null,
  formaPagamento: null,
  tipoLancamento: null,
  conciliado: null,
  busca: '',
};

export function ConciliacaoPage() {
  const queryClient = useQueryClient();
  const { data: arquivosData } = useQuery({ queryKey: ['conciliacao', 'arquivos'], queryFn: fetchArquivos });
  const { data: bancoData } = useQuery({ queryKey: ['conciliacao', 'banco'], queryFn: fetchLancamentosBanco });
  const { data: sistemaData } = useQuery({ queryKey: ['conciliacao', 'sistema'], queryFn: fetchLancamentosSistema });

  const [arquivos, setArquivos] = useState<ArquivoConciliacao[]>([]);
  const [banco, setBanco] = useState<LancamentoBanco[]>([]);
  const [sistema, setSistema] = useState<LancamentoSistema[]>([]);

  // Diferente da Precificação (que "trava" o espelho local pra não perder
  // edição em andamento), aqui sincroniza sempre que a query mudar: agora
  // que o upload de OFX/Sistema vive na página de Uploads (não mais aqui),
  // a única forma de saber que chegou arquivo novo é reagir à invalidação
  // da query — mesmo com a página mantida montada (troca de módulo com
  // fade, sem desmontar) enquanto o import acontece em outra aba.
  useEffect(() => {
    if (!arquivosData || !bancoData || !sistemaData) return;
    setArquivos(arquivosData);
    setBanco(bancoData);
    setSistema(sistemaData);
  }, [arquivosData, bancoData, sistemaData]);

  const [filtros, setFiltros] = useState<FiltrosConciliacaoType>(FILTROS_VAZIOS);
  const [buscaBanco, setBuscaBanco] = useState('');
  const [buscaSistema, setBuscaSistema] = useState('');
  const [selecionadosBanco, setSelecionadosBanco] = useState<Set<string>>(new Set());
  const [selecionadosSistema, setSelecionadosSistema] = useState<Set<string>>(new Set());
  const [itemSugestoes, setItemSugestoes] = useState<LancamentoBanco | null>(null);
  const [sugestoes, setSugestoes] = useState<SugestoesConciliacao | null>(null);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function recarregarDoServidor() {
    const [a, b, s] = await Promise.all([fetchArquivos(), fetchLancamentosBanco(), fetchLancamentosSistema()]);
    setArquivos(a);
    setBanco(b);
    setSistema(s);
    queryClient.invalidateQueries({ queryKey: ['conciliacao'] });
  }

  function tratarErro(e: unknown) {
    setErro(mensagemDeErro(e, 'Falha ao falar com o Supabase.'));
  }

  // ---------- Filtros ----------
  const bancoFiltrado = useMemo(() => {
    const termo = buscaBanco.trim().toLowerCase();
    return banco.filter((b) => {
      if (filtros.arquivoBancoId && b.arquivoId !== filtros.arquivoBancoId) return false;
      if (filtros.dataInicio && b.data < filtros.dataInicio) return false;
      if (filtros.dataFim && b.data > filtros.dataFim) return false;
      if (filtros.formaPagamento && b.formaPagamento !== filtros.formaPagamento) return false;
      if (filtros.conciliado === 'sim' && !b.conciliado) return false;
      if (filtros.conciliado === 'nao' && b.conciliado) return false;
      if (filtros.conciliado === 'marcados' && !b.marcado) return false;
      if (filtros.busca && !(b.descricao ?? '').toLowerCase().includes(filtros.busca.toLowerCase())) return false;
      if (termo && !(b.descricao ?? '').toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [banco, filtros, buscaBanco]);

  const sistemaFiltrado = useMemo(() => {
    const termo = buscaSistema.trim().toLowerCase();
    return sistema.filter((s) => {
      if (filtros.dataInicio && s.data && s.data < filtros.dataInicio) return false;
      if (filtros.dataFim && s.data && s.data > filtros.dataFim) return false;
      if (filtros.conciliado === 'sim' && !s.conciliado) return false;
      if (filtros.conciliado === 'nao' && s.conciliado) return false;
      if (termo && !(s.cliente ?? '').toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [sistema, filtros, buscaSistema]);

  const arquivosOfx = arquivos.filter((a) => a.tipo === 'ofx');

  // ---------- Seleção / conciliação manual ----------
  function toggleSelecionadoBanco(id: string) {
    setSelecionadosBanco((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function toggleSelecionadoSistema(id: string) {
    setSelecionadosSistema((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function onConciliarSelecionados(sistemaIdsForcados?: string[]) {
    const bancoIds = Array.from(selecionadosBanco);
    const sistemaIds = sistemaIdsForcados ?? Array.from(selecionadosSistema);
    try {
      await conciliar(bancoIds, sistemaIds);
      setSelecionadosBanco(new Set());
      setSelecionadosSistema(new Set());
      setItemSugestoes(null);
      await recarregarDoServidor();
    } catch (e) {
      tratarErro(e);
    }
  }

  function onVerSugestoes(item: LancamentoBanco) {
    setItemSugestoes(item);
    setSugestoes(buscarSugestoes(item, banco, sistema));
  }

  async function onConciliarSugestao(sistemaIds: string[]) {
    setSelecionadosBanco(new Set(itemSugestoes ? [itemSugestoes.id] : []));
    try {
      await conciliar(itemSugestoes ? [itemSugestoes.id] : [], sistemaIds);
      setItemSugestoes(null);
      setSelecionadosBanco(new Set());
      await recarregarDoServidor();
    } catch (e) {
      tratarErro(e);
    }
  }

  async function onConciliarManualSistema(item: LancamentoSistema) {
    try {
      await conciliarManualSistema(item.id);
      await recarregarDoServidor();
    } catch (e) {
      tratarErro(e);
    }
  }

  async function onCancelarConciliacao(grupoId: string) {
    try {
      await cancelarConciliacao(grupoId);
      await recarregarDoServidor();
    } catch (e) {
      tratarErro(e);
    }
  }

  async function onToggleDesativadoBanco(item: LancamentoBanco) {
    try {
      await toggleDesativadoBanco(item.id, !item.desativado);
      setBanco((prev) => prev.map((b) => (b.id === item.id ? { ...b, desativado: !item.desativado } : b)));
    } catch (e) {
      tratarErro(e);
    }
  }

  async function onToggleDesativadoSistema(item: LancamentoSistema) {
    try {
      await toggleDesativadoSistema(item.id, !item.desativado);
      setSistema((prev) => prev.map((s) => (s.id === item.id ? { ...s, desativado: !item.desativado } : s)));
    } catch (e) {
      tratarErro(e);
    }
  }

  async function onConciliarAutomatico() {
    setProcessando(true);
    try {
      const grupos = conciliacaoAutomatica(banco, sistema);
      for (const g of grupos) {
        await conciliar(g.bancoIds, g.sistemaIds);
      }
      await recarregarDoServidor();
      setErro(grupos.length === 0 ? 'Nenhum lançamento pôde ser conciliado automaticamente (sem ambiguidade).' : null);
    } catch (e) {
      tratarErro(e);
    } finally {
      setProcessando(false);
    }
  }

  async function onSalvarLancamentoManual(input: Parameters<typeof inserirLancamentoManualSistema>[0]) {
    try {
      await inserirLancamentoManualSistema(input);
      setModalManualAberto(false);
      await recarregarDoServidor();
    } catch (e) {
      tratarErro(e);
    }
  }

  return (
    <AppShell topbarNavy title={<FiltrosConciliacao filtros={filtros} arquivosOfx={arquivosOfx} onChange={setFiltros} />}>
      <div className="space-y-4">
        {erro && (
          <Card className="flex items-center justify-between gap-3 border-bad/40 bg-bad-soft p-3 text-sm text-[#8F2E2E]">
            <span>{erro}</span>
            <button type="button" onClick={() => setErro(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </Card>
        )}

        <AcoesConciliacaoCard processando={processando} onConciliarAutomatico={onConciliarAutomatico} onNovoLancamentoManual={() => setModalManualAberto(true)} />

        {selecionadosBanco.size > 0 && selecionadosSistema.size > 0 && (
          <button
            type="button"
            onClick={() => onConciliarSelecionados()}
            className="w-full rounded-lg bg-[var(--color-accent)] py-2.5 text-sm font-bold text-white hover:brightness-105"
          >
            Conciliar {selecionadosBanco.size} do banco com {selecionadosSistema.size} do sistema
          </button>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ListaBanco
            itens={bancoFiltrado}
            selecionados={selecionadosBanco}
            busca={buscaBanco}
            onChangeBusca={setBuscaBanco}
            onToggleSelecionado={toggleSelecionadoBanco}
            onVerSugestoes={onVerSugestoes}
            onToggleDesativado={onToggleDesativadoBanco}
            onCancelarConciliacao={onCancelarConciliacao}
          />
          <ListaSistema
            itens={sistemaFiltrado}
            selecionados={selecionadosSistema}
            busca={buscaSistema}
            onChangeBusca={setBuscaSistema}
            onToggleSelecionado={toggleSelecionadoSistema}
            onToggleDesativado={onToggleDesativadoSistema}
            onConciliarManual={onConciliarManualSistema}
            onCancelarConciliacao={onCancelarConciliacao}
            onAdicionarManual={() => setModalManualAberto(true)}
          />
        </div>

        <TotaisRodape banco={banco} sistema={sistema} />
      </div>

      <SugestoesModal itemBanco={itemSugestoes} sugestoes={sugestoes} onFechar={() => setItemSugestoes(null)} onConciliar={onConciliarSugestao} />

      <NovoLancamentoManualModal open={modalManualAberto} onFechar={() => setModalManualAberto(false)} onSalvar={onSalvarLancamentoManual} />
    </AppShell>
  );
}

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  apagarPrazo,
  apagarTransportadora,
  atualizarTransportadora,
  fetchCidadesRotaCache,
  fetchRotaParametros,
  fetchTransportadoras,
  inserirTransportadora,
  salvarRotaParametros,
  upsertPrazo,
  type NovaTransportadoraInput,
} from '@/features/fretes/api';
import { CotacaoFreteCard, type CotacaoFreteCardHandle } from '@/features/fretes/components/CotacaoFreteCard';
import { NovaTransportadoraModal } from '@/features/fretes/components/NovaTransportadoraModal';
import { PrazosModal } from '@/features/fretes/components/PrazosModal';
import { RotaParametrosPanel } from '@/features/fretes/components/RotaParametrosPanel';
import { TransportadorasTable } from '@/features/fretes/components/TransportadorasTable';
import type { RotaParametros, Transportadora } from '@/features/fretes/types';
import { fetchCanais, fetchCategorias, fetchProdutos, fetchSubcategorias } from '@/features/pricing/api';
import { mensagemDeErro } from '@/lib/errors';

const ROTA_PARAMETROS_PADRAO: RotaParametros = {
  nomeTransporte: '',
  cidadeInicio: '',
  valorKm: 0,
  velocidadeMedia: 60,
  jornadaInicioHora: 6,
  jornadaFimHora: 18,
  pausaHoras: 1,
  pesoMinimoComparativo: 0,
  despesaExtraDia: 0,
  horarioInicio: '06:00',
};

export function FretesPage() {
  const queryClient = useQueryClient();
  const { data: transportadoras = [] } = useQuery({ queryKey: ['fretes', 'transportadoras'], queryFn: fetchTransportadoras });
  // Reaproveita os dados de Precificação pro modo "Orçamento" da cotação de frete (produto + preço da tabela + despesa extra).
  const { data: produtos = [] } = useQuery({ queryKey: ['pricing', 'produtos'], queryFn: fetchProdutos });
  const { data: canais = [] } = useQuery({ queryKey: ['pricing', 'canais'], queryFn: fetchCanais });
  const { data: categorias = [] } = useQuery({ queryKey: ['pricing', 'categorias'], queryFn: fetchCategorias });
  const { data: subcategorias = [] } = useQuery({ queryKey: ['pricing', 'subcategorias'], queryFn: fetchSubcategorias });
  const { data: parametrosRota = ROTA_PARAMETROS_PADRAO } = useQuery({ queryKey: ['fretes', 'rota_parametros'], queryFn: fetchRotaParametros });
  const { data: cidadesRotaCache = [] } = useQuery({ queryKey: ['fretes', 'rota_cidades_cache'], queryFn: fetchCidadesRotaCache });

  const cotacaoRef = useRef<CotacaoFreteCardHandle>(null);
  const [mostrarConfiguracao, setMostrarConfiguracao] = useState(false);
  const [modalNovaAberto, setModalNovaAberto] = useState(false);
  const [transportadoraEditando, setTransportadoraEditando] = useState<Transportadora | null>(null);
  const [transportadoraCidades, setTransportadoraCidades] = useState<Transportadora | null>(null);
  const [transportadoraParaApagar, setTransportadoraParaApagar] = useState<Transportadora | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['fretes'] });
  }

  function fecharModalForm() {
    setModalNovaAberto(false);
    setTransportadoraEditando(null);
  }

  async function onSalvarForm(input: NovaTransportadoraInput) {
    try {
      if (transportadoraEditando) {
        await atualizarTransportadora(transportadoraEditando.id, {
          nome: input.nome,
          uf: input.uf,
          valor_por_kg: input.valorPorKg,
          valor_por_nf: input.valorPorNf,
          valor_por_nf_tipo: input.valorPorNfTipo,
          taxa_coleta: input.taxaColeta,
          taxa_coleta_tipo: input.taxaColetaTipo,
          frete_minimo: input.freteMinimo,
        });
      } else {
        await inserirTransportadora(input, transportadoras.length);
      }
      fecharModalForm();
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar transportadora.'));
    }
  }

  async function onToggleAtiva(id: string, ativa: boolean) {
    try {
      await atualizarTransportadora(id, { ativa });
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao atualizar transportadora.'));
    }
  }

  async function onSalvarPrazo(cidade: string, prazoHoras: number | null, prazoTexto: string | null) {
    if (!transportadoraCidades) return;
    try {
      await upsertPrazo(transportadoraCidades.id, cidade, prazoHoras, prazoTexto);
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar cidade/prazo.'));
    }
  }

  async function onApagarPrazo(id: string) {
    try {
      await apagarPrazo(id);
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao remover cidade.'));
    }
  }

  async function onSalvarRotaParametros(input: RotaParametros) {
    try {
      await salvarRotaParametros(input);
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar a parametrização de rota.'));
    }
  }

  async function confirmarApagarTransportadora() {
    if (!transportadoraParaApagar) return;
    try {
      await apagarTransportadora(transportadoraParaApagar.id);
      setTransportadoraParaApagar(null);
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao excluir transportadora.'));
    }
  }

  // Mantém o modal de cidades sincronizado com os dados mais recentes (após upsert/apagar prazo)
  const transportadoraCidadesAtual = transportadoraCidades ? (transportadoras.find((t) => t.id === transportadoraCidades.id) ?? null) : null;

  return (
    <AppShell
      topbarNavy
      title="Gestão de Fretes"
      mostrarParametrizacao
      onAbrirParametrizacao={() => setMostrarConfiguracao(true)}
      actions={
        <Button variant="danger" onClick={() => cotacaoRef.current?.limparTudo()}>
          Limpar
        </Button>
      }
    >
      <div className="space-y-6">
        {erro && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-bad/40 bg-bad-soft p-3 text-sm text-[#8F2E2E]">
            <span>{erro}</span>
            <button type="button" onClick={() => setErro(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </div>
        )}

        <CotacaoFreteCard
          ref={cotacaoRef}
          transportadoras={transportadoras}
          produtos={produtos}
          canais={canais}
          categorias={categorias}
          subcategorias={subcategorias}
          parametrosRota={parametrosRota}
          cidadesRotaCache={cidadesRotaCache}
          onRotaCalculada={() => queryClient.invalidateQueries({ queryKey: ['fretes', 'rota_cidades_cache'] })}
        />
      </div>

      <Modal open={mostrarConfiguracao} title="Parametrização — Gestão de Fretes" onClose={() => setMostrarConfiguracao(false)} widthClassName="max-w-[95vw]">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-soft)]">Configuração de Transportadoras</p>
              <Button variant="primary" onClick={() => setModalNovaAberto(true)}>
                + Nova Transportadora
              </Button>
            </div>
            <TransportadorasTable
              transportadoras={transportadoras}
              onToggleAtiva={onToggleAtiva}
              onVerCidades={setTransportadoraCidades}
              onEditar={setTransportadoraEditando}
              onApagar={setTransportadoraParaApagar}
            />
          </div>

          <RotaParametrosPanel parametros={parametrosRota} onSalvar={onSalvarRotaParametros} />
        </div>
      </Modal>

      <NovaTransportadoraModal open={modalNovaAberto || transportadoraEditando !== null} editando={transportadoraEditando} onFechar={fecharModalForm} onSalvar={onSalvarForm} />

      <PrazosModal transportadora={transportadoraCidadesAtual} onFechar={() => setTransportadoraCidades(null)} onSalvarPrazo={onSalvarPrazo} onApagarPrazo={onApagarPrazo} />

      <Modal
        open={transportadoraParaApagar !== null}
        title="Excluir Transportadora"
        onClose={() => setTransportadoraParaApagar(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setTransportadoraParaApagar(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarApagarTransportadora}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text)]">
          Excluir <strong>{transportadoraParaApagar?.nome} — {transportadoraParaApagar?.uf}</strong>? Todas as cidades/prazos
          cadastrados dela também serão removidos. Tabelas de Preço que usam essa transportadora como padrão continuam com os
          valores já aplicados, só perdem o vínculo automático.
        </p>
      </Modal>
    </AppShell>
  );
}

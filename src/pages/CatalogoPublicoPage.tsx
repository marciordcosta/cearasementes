import { useQuery } from '@tanstack/react-query';
import { fetchCatalogoPublico } from '@/features/pricing/api';

function fmtR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Link público (sem login) de UMA Tabela de Preço — lê só de `catalogo_publico_itens` (nome,
 * preço, peso já prontos, publicados pelo operador em Precificação > Exportar > 🌐 Catálogo
 * Online), nunca de `produtos`/`canais_preco` — Custo/Margem nunca chegam nessa página. Ver
 * 0069_catalogo_publico.sql e publicarCatalogoOnline em pricing/api.ts.
 *
 * `canalId` vem de App.tsx (regex na URL, não de <Route>/useParams — esse app não usa roteamento
 * declarativo do react-router, ver o comentário em App.tsx).
 */
export function CatalogoPublicoPage({ canalId }: { canalId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalogo-publico', canalId],
    queryFn: () => fetchCatalogoPublico(canalId),
  });

  const grupos: { categoriaNome: string; itens: NonNullable<typeof data>['itens'] }[] = [];
  data?.itens.forEach((item) => {
    const grupoAtual = grupos[grupos.length - 1];
    if (grupoAtual && grupoAtual.categoriaNome === item.categoriaNome) grupoAtual.itens.push(item);
    else grupos.push({ categoriaNome: item.categoriaNome, itens: [item] });
  });

  return (
    <div className="min-h-screen bg-[var(--color-page)]">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-navy)] px-5 py-5 text-white sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Ceará Sementes</p>
        <h1 className="mt-0.5 text-xl font-bold sm:text-2xl">{data?.canalNome ?? (isLoading ? 'Carregando…' : 'Catálogo')}</h1>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6 sm:px-8">
        {isLoading && <p className="text-sm text-[var(--color-text-soft)]">Carregando catálogo…</p>}

        {isError && <p className="text-sm text-bad">Não foi possível carregar esse catálogo. Confira o link e tente de novo.</p>}

        {!isLoading && !isError && (!data || data.itens.length === 0) && (
          <p className="text-sm text-[var(--color-text-soft)]">Esse catálogo ainda não tem produtos publicados.</p>
        )}

        {grupos.map((grupo) => (
          <section key={grupo.categoriaNome} className="mb-7">
            <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">{grupo.categoriaNome}</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {grupo.itens.map((item) => (
                <div key={item.id} className="flex flex-col justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-sm">
                  <p className="text-sm font-semibold leading-snug text-[var(--color-text)]">{item.nome}</p>
                  <div className="mt-2">
                    <p className="num text-lg font-bold text-[var(--color-accent)]">R$ {fmtR(item.preco)}</p>
                    <p className="text-[11px] text-[var(--color-text-soft)]">{Math.round(item.peso)}kg</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

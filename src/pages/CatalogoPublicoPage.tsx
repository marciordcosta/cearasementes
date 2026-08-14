import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NomeComDestaque } from '@/components/ui/NomeComDestaque';
import { fetchCatalogoPublicoPorSlug, type CatalogoPublico } from '@/features/pricing/api';

function fmtR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function chaveCache(slug: string): string {
  return `catalogo-publico-cache:${slug}`;
}

/** Lido de forma síncrona no primeiro render — dá pra já mostrar os cards antes mesmo do fetch responder, importante numa conexão de celular mais lenta. Descartado silenciosamente se estiver corrompido/vier de uma versão antiga do formato. */
function lerCache(slug: string): CatalogoPublico | null {
  try {
    const bruto = localStorage.getItem(chaveCache(slug));
    return bruto ? (JSON.parse(bruto) as CatalogoPublico) : null;
  } catch {
    return null;
  }
}

function salvarCache(slug: string, dados: CatalogoPublico) {
  try {
    localStorage.setItem(chaveCache(slug), JSON.stringify(dados));
  } catch {
    // localStorage indisponível/cheio (aba anônima, cota) — sem cache, só não acelera a próxima visita.
  }
}

/**
 * Link público (sem login) de UMA Tabela de Preço — lê só de `catalogo_publico_itens`/
 * `catalogo_publico_canais` (nome, preço, peso já prontos, publicados pelo operador em
 * Precificação > Exportar > 🌐 Catálogo Online), nunca de `produtos`/`canais_preco` — Custo/Margem
 * nunca chegam nessa página. Ver 0069/0070_catalogo_publico*.sql e publicarCatalogoOnline em
 * pricing/api.ts.
 *
 * `slug` vem de App.tsx (regex na URL, não de <Route>/useParams — esse app não usa roteamento
 * declarativo do react-router, ver o comentário em App.tsx).
 */
export function CatalogoPublicoPage({ slug }: { slug: string }) {
  // Sempre modo claro aqui, independente do que o visitante tiver usado no app interno nesse
  // mesmo navegador (localStorage) ou da preferência do sistema — o toggle de tema não existe
  // nessa página. Só mexe na classe do <html> enquanto essa página está montada.
  useEffect(() => {
    const tinhaDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark');
    return () => {
      if (tinhaDark) document.documentElement.classList.add('dark');
    };
  }, []);

  const [cache] = useState(() => lerCache(slug));
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['catalogo-publico', slug],
    queryFn: () => fetchCatalogoPublicoPorSlug(slug),
    initialData: cache ?? undefined,
    // Sempre busca de novo ao entrar, mesmo com cache — o padrão global (staleTime: 60s, ver
    // main.tsx) faria o cache do localStorage "parecer" recém-buscado e nunca revalidar sozinho.
    staleTime: 0,
  });

  useEffect(() => {
    if (data) salvarCache(slug, data);
  }, [data, slug]);

  const grupos: { categoriaNome: string; itens: CatalogoPublico['itens'] }[] = [];
  data?.itens.forEach((item) => {
    const grupoAtual = grupos[grupos.length - 1];
    if (grupoAtual && grupoAtual.categoriaNome === item.categoriaNome) grupoAtual.itens.push(item);
    else grupos.push({ categoriaNome: item.categoriaNome, itens: [item] });
  });

  // "Carregando" cheio só quando não tem NADA pra mostrar ainda (1ª visita, sem cache); com cache
  // (mesmo desatualizado) ou já com o fetch resolvido, quem avisa que ainda está atualizando é só
  // o iconezinho discreto no canto do cabeçalho.
  const semNadaAindaCarregando = isLoading && !data;

  return (
    <div className="min-h-screen bg-[#f5f7fa]">
      <header className="relative border-b border-[#e2e6ed] bg-[#10233f] px-4 py-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Ceará Sementes</p>
        <h1 className="mt-0.5 truncate text-lg font-bold pr-7">{data?.canalNome ?? (semNadaAindaCarregando ? 'Carregando…' : 'Catálogo')}</h1>
        {isFetching && (
          <Loader2 size={16} className="absolute right-4 top-4 animate-spin text-white/70" aria-label="Atualizando…" />
        )}
      </header>

      <main className="mx-auto max-w-2xl px-3 py-4">
        {semNadaAindaCarregando && <p className="text-sm text-[#67718a]">Carregando catálogo…</p>}

        {isError && !data && <p className="text-sm text-[#c24444]">Não foi possível carregar esse catálogo. Confira o link e tente de novo.</p>}

        {!semNadaAindaCarregando && !isError && data && data.itens.length === 0 && (
          <p className="text-sm text-[#67718a]">Esse catálogo ainda não tem produtos publicados.</p>
        )}

        {grupos.map((grupo) => (
          <section key={grupo.categoriaNome} className="mb-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#67718a]">{grupo.categoriaNome}</h2>
            <div className="flex flex-col gap-2">
              {grupo.itens.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e2e6ed] bg-white px-3.5 py-2.5 shadow-sm">
                  <p className="min-w-0 flex-1 text-sm leading-snug text-[#1a2233]">
                    <NomeComDestaque nome={item.nome} />
                  </p>
                  <div className="shrink-0 text-right">
                    <p className="num text-base font-bold text-[#0e9d74]">R$ {fmtR(item.preco)}</p>
                    <p className="text-[11px] text-[#67718a]">{Math.round(item.peso)}kg</p>
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

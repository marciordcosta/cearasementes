import type { Transportadora } from '@/features/fretes/types';
import { calcularCanal } from './calculations';
import type { Canal, Categoria, Fornecedor, Produto } from './types';

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Mesma marcação do nome do produto na tela (NomeComDestaque, PricingTable.tsx): *negrito*, _itálico_. */
function nomeComDestaqueHtml(nome: string): string {
  const regex = /\*(.+?)\*|_(.+?)_/g;
  let resultado = '';
  let ultimoIndice = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(nome)) !== null) {
    if (match.index > ultimoIndice) resultado += escapeHtml(nome.slice(ultimoIndice, match.index));
    const tag = match[1] !== undefined ? 'b' : 'i';
    resultado += `<${tag}>${escapeHtml((match[1] ?? match[2])!)}</${tag}>`;
    ultimoIndice = regex.lastIndex;
  }
  if (ultimoIndice < nome.length) resultado += escapeHtml(nome.slice(ultimoIndice));
  return resultado;
}

/**
 * Gera o catálogo em PDF (via janela de impressão do navegador) para um
 * canal específico, respeitando o filtro de Classe/Categoria já aplicado na
 * tela — portado 1:1 do precificacao-inteligente.html original.
 */
export function gerarCatalogoPDF(
  canal: Canal,
  produtosFiltrados: Produto[],
  categorias: Categoria[],
  fornecedores: Fornecedor[],
  transportadoraPorId: Map<string, Transportadora>,
): void {
  const getCategoria = (id: string) => categorias.find((c) => c.id === id) ?? categorias[0];
  const getFornecedor = (id: string | null) => (id ? fornecedores.find((f) => f.id === id) : undefined);

  // "Imprimir" desmarcado no Editar Produto tira o produto de todo catálogo — continua normal em todo o resto do sistema.
  // "Precisa de ajuste" (✓) é por canal — some só do PDF DESSE canal específico.
  const produtosParaImprimir = produtosFiltrados.filter((p) => p.imprimir && !(p.precos[canal.id]?.precisaAjuste ?? false));

  const categoriasPresentes = new Map<string, Produto[]>();
  produtosParaImprimir.forEach((p) => {
    const lista = categoriasPresentes.get(p.categoriaId) ?? [];
    lista.push(p);
    categoriasPresentes.set(p.categoriaId, lista);
  });

  const categoriasOrdenadas = Array.from(categoriasPresentes.keys())
    .map((id) => getCategoria(id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const f = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let corpoHtml = '';
  categoriasOrdenadas.forEach((cat) => {
    const itens = [...(categoriasPresentes.get(cat.id) ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    let linhas = '';
    itens.forEach((produto) => {
      const r = calcularCanal(produto, canal, cat, transportadoraPorId);
      const fornecedor = getFornecedor(produto.fornecedorId);
      const tagFornecedor = fornecedor ? ` <span class="tag-fornecedor">${escapeHtml(fornecedor.nome)}</span>` : '';
      linhas += `
        <tr>
          <td>${nomeComDestaqueHtml(produto.nome)}${tagFornecedor}</td>
          <td class="valor">R$ ${f(r.preco)}</td>
          <td class="peso">${Math.round(produto.peso)}kg</td>
        </tr>
      `;
    });

    corpoHtml += `
      <h2 class="cat-titulo">${cat.nome}</h2>
      <table class="tabela-catalogo">
        <thead>
          <tr><th>Produto</th><th class="valor">Valor (R$)</th><th class="peso">Peso (Kg)</th></tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    `;
  });

  if (categoriasOrdenadas.length === 0) {
    corpoHtml = `<p class="vazio">Nenhum produto encontrado para o filtro atual.</p>`;
  }

  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Catálogo — ${canal.nome}</title>
      <style>
        @page{ margin:18mm 14mm; }
        /* Sem isso, o Chrome corta fundos/cores na impressão a menos que o usuário marque
           "Gráficos de segundo plano" no diálogo — força o título da categoria e as tags
           de fornecedor a sempre saírem coloridas. */
        *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; color-adjust:exact; }
        body{
          font-family:'Inter',Arial,sans-serif; color:#000000; background:#FFFFFF;
          margin:0; padding:0 4mm;
        }
        .cabecalho{
          display:flex; justify-content:space-between; align-items:flex-start;
          border-bottom:2px solid #000000; padding-bottom:8px; margin-bottom:18px;
        }
        .cabecalho .marca{ display:flex; flex-direction:column; gap:2px; }
        .cabecalho h1{font-size:20px; font-weight:700; margin:0; letter-spacing:.3px;}
        .cabecalho .subtitulo{font-size:12.5px; font-weight:400; color:#333333; margin:0;}
        .cabecalho .meta{font-size:11px; color:#333333; text-align:right; line-height:1.5; white-space:nowrap;}
        .cat-titulo{
          font-size:13.5px; text-transform:uppercase; letter-spacing:.6px;
          background:#EFEFEF; color:#000000; padding:7px 10px; margin:20px 0 0;
          border-left:4px solid #000000; page-break-after:avoid;
        }
        table.tabela-catalogo{
          width:100%; border-collapse:collapse; font-size:12px; margin:0 0 4px;
        }
        table.tabela-catalogo thead th{
          text-align:left; padding:7px 10px; border-bottom:1px solid #000000;
          font-weight:700; color:#000000;
        }
        table.tabela-catalogo tbody td{
          padding:6px 10px; border-bottom:1px solid #CCCCCC; color:#000000;
        }
        table.tabela-catalogo tbody tr{ page-break-inside:avoid; }
        table.tabela-catalogo th.valor, table.tabela-catalogo td.valor{ width:80px; padding-right:4px; text-align:right; font-weight:700; }
        table.tabela-catalogo th.peso, table.tabela-catalogo td.peso{ width:50px; padding-left:4px; text-align:right; }
        .tag-fornecedor{
          display:inline-block; margin-left:8px; font-size:9px; font-weight:500; color:#777777;
          text-transform:uppercase; letter-spacing:.3px; vertical-align:middle;
        }
        .vazio{ font-size:13px; color:#000000; padding:20px 0; }
        @media print{
          .cabecalho{ position:running(head); }
        }
      </style>
    </head>
    <body>
      <div class="cabecalho">
        <div class="marca">
          <h1>Ceará Sementes</h1>
          <p class="subtitulo">Rua Engenheiro Henrique Morize, 236, Cajazeiras, Fortaleza-CE</p>
          <p class="subtitulo">Fone/Whatsapp: (85) 3275-2074</p>
          <p class="subtitulo">${canal.nome}</p>
        </div>
        <div class="meta">${dataEmissao}</div>
      </div>
      ${corpoHtml}
    </body>
    </html>
  `;

  const janela = window.open('', '_blank', 'width=900,height=1000');
  if (!janela) {
    alert('O navegador bloqueou a abertura da janela de impressão. Permita pop-ups para este site e tente novamente.');
    return;
  }
  janela.document.open();
  janela.document.write(htmlCompleto);
  janela.document.close();
  // onload E o setTimeout de fallback (pra navegadores que não disparam onload de forma
  // confiável em document.write) podem disparar os dois — a flag garante só 1 diálogo de impressão.
  let impresso = false;
  const imprimirUmaVez = () => {
    if (impresso) return;
    impresso = true;
    janela.focus();
    janela.print();
  };
  janela.onload = imprimirUmaVez;
  setTimeout(imprimirUmaVez, 400);
}

import qrcode from 'qrcode-generator';
import type { Transportadora } from '@/features/fretes/types';
import { calcularCanal, mesmoProdutoBase } from './calculations';
import type { Canal, Categoria, Fornecedor, Produto, Subcategoria } from './types';

const LINK_CATALOGO = 'https://linktr.ee/cearasementes';

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** SVG embutido (sem chamada de rede) — gerado localmente pra sempre imprimir, mesmo sem internet. */
function gerarQrCodeSvg(url: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ scalable: true });
}

/**
 * Estimativa (em `ch`, aproximando a largura média de um caractere na fonte
 * usada) do quanto a coluna "Produto" precisa pra caber esse nome + tag de
 * fornecedor sem quebrar linha — usada pra alinhar a coluna Valor/Peso no
 * mesmo x em TODAS as categorias da tabela (a referência é sempre o produto
 * com o nome mais longo do catálogo inteiro, não só da categoria dele).
 */
function tamanhoNomeCh(produto: Produto, fornecedor: Fornecedor | undefined): number {
  const nomeVisivel = produto.nome.replace(/[*_]/g, '');
  let ch = nomeVisivel.length * 1.05; // negrito deixa o texto um pouco mais largo que o resto
  if (fornecedor) {
    const fornecedorVisivel = fornecedor.nome.replace(/[*_]/g, '');
    ch += fornecedorVisivel.length * 0.65 + 2; // tag em fonte menor (9px) + margem antes dela
  }
  return ch;
}

/** Mesma marcação do nome do produto na tela (NomeComDestaque, PricingTable.tsx): *negrito*, _itálico_. */
export function nomeComDestaqueHtml(nome: string): string {
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

/** Abre a janela de impressão e dispara o diálogo — mesmo fluxo pro catálogo padrão e pro de gerenciamento. */
export function abrirEImprimir(html: string): void {
  const janela = window.open('', '_blank', 'width=900,height=1000');
  if (!janela) {
    alert('O navegador bloqueou a abertura da janela de impressão. Permita pop-ups para este site e tente novamente.');
    return;
  }
  janela.document.open();
  janela.document.write(html);
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

/**
 * Gera o catálogo em PDF (via janela de impressão do navegador) para um
 * canal específico, respeitando o filtro de Classe/Categoria já aplicado na
 * tela — portado 1:1 do precificacao-inteligente.html original.
 */
export function gerarCatalogoPDF(
  canal: Canal,
  produtosFiltrados: Produto[],
  categorias: Categoria[],
  subcategorias: Subcategoria[],
  fornecedores: Fornecedor[],
  todosCanais: Canal[],
  transportadoraPorId: Map<string, Transportadora>,
): void {
  const getCategoria = (id: string) => categorias.find((c) => c.id === id) ?? categorias[0];
  const getSubcategoria = (id: string | null) => (id ? subcategorias.find((s) => s.id === id) : undefined);
  const getFornecedor = (id: string | null) => (id ? fornecedores.find((f) => f.id === id) : undefined);
  const canaisPorId = new Map(todosCanais.map((c) => [c.id, c]));

  // "Imprimir" desmarcado no Editar Produto tira o produto de todo catálogo — continua normal em todo o resto do sistema.
  // "Precisa de ajuste" (✓) é por canal — some só do PDF DESSE canal específico. "PDF" desmarcado
  // no Fornecedor (Parametrização) tira todos os produtos dele só do PDF, continuam na grade.
  const produtosParaImprimir = produtosFiltrados.filter(
    (p) => p.imprimir && !(p.precos[canal.id]?.precisaAjuste ?? false) && (getFornecedor(p.fornecedorId)?.visivelPdf ?? true),
  );

  const categoriasPresentes = new Map<string, Produto[]>();
  produtosParaImprimir.forEach((p) => {
    const lista = categoriasPresentes.get(p.categoriaId) ?? [];
    lista.push(p);
    categoriasPresentes.set(p.categoriaId, lista);
  });

  const categoriasOrdenadas = Array.from(categoriasPresentes.keys())
    .map((id) => getCategoria(id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // Referência única (o nome mais longo de TODO o catálogo) pra coluna Produto
  // sair com a mesma largura em toda categoria — sem isso, cada tabela encolhe
  // pro seu próprio conteúdo e a coluna Valor/Peso fica desalinhada entre elas.
  const larguraProdutoCh = Math.ceil(
    Math.max(4, ...produtosParaImprimir.map((p) => tamanhoNomeCh(p, getFornecedor(p.fornecedorId)))) + 2,
  );

  const f = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let corpoHtml = '';
  categoriasOrdenadas.forEach((cat) => {
    const itens = [...(categoriasPresentes.get(cat.id) ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    let linhas = '';
    itens.forEach((produto, indice) => {
      const r = calcularCanal(produto, canal, cat, getSubcategoria(produto.subcategoriaId), transportadoraPorId, canaisPorId);
      const fornecedor = getFornecedor(produto.fornecedorId);
      const tagFornecedor = fornecedor ? ` <span class="tag-fornecedor">${escapeHtml(fornecedor.nome)}</span>` : '';
      // Mesma regra da Tabela de Preços: linha divisória mais espessa quando o produto "muda"
      // (duas primeiras palavras do nome diferentes do anterior) — sem a cor verde de categoria,
      // que aqui já fica implícita (cada categoria vira sua própria tabela/seção).
      const produtoMudou = indice > 0 && !mesmoProdutoBase(produto, itens[indice - 1]);
      linhas += `
        <tr class="${produtoMudou ? 'divisor' : ''}">
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
        .cabecalho .lado-direito{ display:flex; align-items:flex-start; gap:12px; }
        .cabecalho .meta{font-size:11px; color:#333333; text-align:right; line-height:1.5; white-space:nowrap;}
        .cabecalho .qrcode{ display:flex; flex-direction:column; align-items:center; gap:2px; }
        .cabecalho .qrcode svg{ width:50px; height:50px; }
        .cabecalho .qrcode p{ font-size:7.5px; color:#333333; margin:0; white-space:nowrap; }
        .cat-titulo{
          font-size:13.5px; text-transform:uppercase; letter-spacing:.6px;
          background:#EFEFEF; color:#000000; padding:7px 10px; margin:20px 0 0;
          border-left:4px solid #000000; page-break-after:avoid;
        }
        table.tabela-catalogo{
          /* width:auto (em vez de 100%) — a tabela encolhe pro conteúdo, então Valor/Peso
             ficam colados perto do nome do produto, em vez de esticados até a borda da
             página (importante pro cliente não perder a linha ao dar zoom no PDF). */
          width:auto; max-width:100%; border-collapse:collapse; font-size:12px; margin:0 0 4px;
        }
        table.tabela-catalogo thead th{
          text-align:left; padding:7px 10px; border-bottom:1px solid #000000;
          font-weight:700; color:#000000; white-space:nowrap;
        }
        table.tabela-catalogo tbody td{
          padding:6px 10px; border-bottom:1px solid #CCCCCC; color:#000000;
        }
        table.tabela-catalogo tbody tr{ page-break-inside:avoid; }
        table.tabela-catalogo tbody tr.divisor td{ border-top:2px solid #888888; }
        /* Mesma largura mínima em toda categoria (calculada a partir do nome mais
           longo do catálogo inteiro) — sem isso, Valor/Peso saem em x diferente
           em cada tabela, já que cada uma encolhe pro próprio conteúdo. */
        table.tabela-catalogo th:first-child, table.tabela-catalogo td:first-child{ min-width:${larguraProdutoCh}ch; }
        table.tabela-catalogo th.valor, table.tabela-catalogo td.valor{ width:80px; padding-right:4px; text-align:right; font-weight:700; }
        table.tabela-catalogo th.peso, table.tabela-catalogo td.peso{ width:50px; padding-left:4px; text-align:right; }
        .tag-fornecedor{
          display:inline-block; margin-left:8px; font-size:9px; font-weight:500; color:#777777;
          text-transform:uppercase; letter-spacing:.3px; vertical-align:middle;
        }
        .vazio{ font-size:13px; color:#000000; padding:20px 0; }
        .rodape{
          margin-top:24px; padding-top:10px; border-top:1px solid #CCCCCC;
          page-break-inside:avoid;
        }
        .rodape .titulo{ font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:#000000; margin:0 0 3px; }
        .rodape p{ font-size:10.5px; color:#555555; margin:0; }
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
        <div class="lado-direito">
          <div class="meta">${dataEmissao}</div>
          <div class="qrcode">
            ${gerarQrCodeSvg(LINK_CATALOGO)}
            <p>linktr.ee/cearasementes</p>
          </div>
        </div>
      </div>
      ${corpoHtml}
      <div class="rodape">
        <p class="titulo">Atenção</p>
        <p>Os valores podem ser alterados sem aviso prévio, tabela válida por 15 dias ou até durar o estoque (lote em questão).</p>
      </div>
    </body>
    </html>
  `;

  abrirEImprimir(htmlCompleto);
}

/**
 * Mesmo agrupamento por categoria do catálogo padrão, só que com mais
 * colunas — pra uso interno (expõe Custo/Frete/Encargos/Margem R$, então
 * NÃO é pra imprimir pro cliente). Produto/Valor/Peso saem na mesma ordem e
 * estilo do catálogo padrão; as colunas seguintes (Custo em diante) vêm com
 * fundo cinza claro e uma divisória discreta entre colunas.
 */
export function gerarCatalogoGerenciamentoPDF(
  canal: Canal,
  produtosFiltrados: Produto[],
  categorias: Categoria[],
  subcategorias: Subcategoria[],
  fornecedores: Fornecedor[],
  todosCanais: Canal[],
  transportadoraPorId: Map<string, Transportadora>,
): void {
  const getCategoria = (id: string) => categorias.find((c) => c.id === id) ?? categorias[0];
  const getSubcategoria = (id: string | null) => (id ? subcategorias.find((s) => s.id === id) : undefined);
  const getFornecedor = (id: string | null) => (id ? fornecedores.find((f) => f.id === id) : undefined);
  const canaisPorId = new Map(todosCanais.map((c) => [c.id, c]));
  // Mesma regra do cálculo (calculations.ts) — frete só entra na margem quando o canal considera "frete incluso".
  const freteConsiderado = canal.freteIncluso !== false;

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

  const larguraProdutoCh = Math.ceil(
    Math.max(4, ...produtosParaImprimir.map((p) => tamanhoNomeCh(p, getFornecedor(p.fornecedorId)))) + 2,
  );

  const f = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  let corpoHtml = '';
  categoriasOrdenadas.forEach((cat) => {
    const itens = [...(categoriasPresentes.get(cat.id) ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    let linhas = '';
    itens.forEach((produto, indice) => {
      const r = calcularCanal(produto, canal, cat, getSubcategoria(produto.subcategoriaId), transportadoraPorId, canaisPorId);
      const fornecedor = getFornecedor(produto.fornecedorId);
      const tagFornecedor = fornecedor ? ` <span class="tag-fornecedor">${escapeHtml(fornecedor.nome)}</span>` : '';
      const produtoMudou = indice > 0 && !mesmoProdutoBase(produto, itens[indice - 1]);
      const freteExibido = freteConsiderado ? r.freteReais : 0;
      linhas += `
        <tr class="${produtoMudou ? 'divisor' : ''}">
          <td>${nomeComDestaqueHtml(produto.nome)}${tagFornecedor}</td>
          <td class="peso">${Math.round(produto.peso)}kg</td>
          <td class="cinza numero">${f(produto.custo)}</td>
          <td class="cinza numero">${f(freteExibido)}</td>
          <td class="cinza numero">${f(r.impostoReais)}</td>
          <td class="cinza numero">${f(r.margemReais)}</td>
          <td class="cinza numero">${fPct(r.margemPct)}%</td>
          <td class="valor">R$ ${f(r.preco)}</td>
        </tr>
      `;
    });

    corpoHtml += `
      <h2 class="cat-titulo">${cat.nome}</h2>
      <table class="tabela-gerenciamento">
        <thead>
          <tr>
            <th>Produto</th>
            <th class="peso">Kg</th>
            <th class="cinza numero">Custo</th>
            <th class="cinza numero">Frete</th>
            <th class="cinza numero">Encargos</th>
            <th class="cinza numero">Margem</th>
            <th class="cinza numero">%</th>
            <th class="valor">Valor (R$)</th>
          </tr>
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
      <title>Gerenciamento — ${canal.nome}</title>
      <style>
        @page{ margin:18mm 14mm; }
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
        .cabecalho .tag-interno{
          display:inline-block; margin-top:3px; font-size:9.5px; font-weight:700; color:#A83232;
          letter-spacing:.4px; text-transform:uppercase;
        }
        .cabecalho .meta{font-size:11px; color:#333333; text-align:right; line-height:1.5; white-space:nowrap;}
        .cat-titulo{
          font-size:13.5px; text-transform:uppercase; letter-spacing:.6px;
          background:#EFEFEF; color:#000000; padding:7px 10px; margin:20px 0 0;
          border-left:4px solid #000000; page-break-after:avoid;
        }
        table.tabela-gerenciamento{
          width:auto; max-width:100%; border-collapse:collapse; font-size:11.5px; margin:0 0 4px;
        }
        table.tabela-gerenciamento thead th{
          text-align:left; padding:7px 8px; border-bottom:1px solid #000000;
          font-weight:700; color:#000000; white-space:nowrap;
        }
        table.tabela-gerenciamento tbody td{
          padding:6px 8px; border-bottom:1px solid #CCCCCC; color:#000000;
        }
        /* Divisória discreta entre colunas — a tabela padrão não tem (só 3 colunas), mas
           com 7 colunas ajuda a acompanhar a linha até o final. */
        table.tabela-gerenciamento th:not(:last-child), table.tabela-gerenciamento td:not(:last-child){
          border-right:1px solid #E3E3E3;
        }
        table.tabela-gerenciamento tbody tr{ page-break-inside:avoid; }
        table.tabela-gerenciamento tbody tr.divisor td{ border-top:2px solid #888888; }
        table.tabela-gerenciamento th:first-child, table.tabela-gerenciamento td:first-child{ min-width:${larguraProdutoCh}ch; }
        /* min-width (em vez de width) + nowrap — a coluna nunca quebra o número em duas
           linhas, mesmo com "R$ 1.234,56"; se precisar de mais espaço, ela cresce. */
        table.tabela-gerenciamento th.valor, table.tabela-gerenciamento td.valor{ min-width:70px; padding-left:4px; text-align:right; font-weight:700; white-space:nowrap; }
        table.tabela-gerenciamento th.peso, table.tabela-gerenciamento td.peso{ min-width:36px; padding-right:4px; text-align:right; white-space:nowrap; }
        table.tabela-gerenciamento th.numero, table.tabela-gerenciamento td.numero{ min-width:56px; text-align:right; white-space:nowrap; }
        table.tabela-gerenciamento .cinza{ background:#E4E4E4; }
        .tag-fornecedor{
          display:inline-block; margin-left:8px; font-size:9px; font-weight:500; color:#777777;
          text-transform:uppercase; letter-spacing:.3px; vertical-align:middle;
        }
        .vazio{ font-size:13px; color:#000000; padding:20px 0; }
      </style>
    </head>
    <body>
      <div class="cabecalho">
        <div class="marca">
          <h1>Ceará Sementes</h1>
          <p class="subtitulo">${canal.nome} — Relatório de Gerenciamento</p>
          <p class="tag-interno">Uso interno — não distribuir</p>
        </div>
        <div class="meta">${dataEmissao}</div>
      </div>
      ${corpoHtml}
    </body>
    </html>
  `;

  abrirEImprimir(htmlCompleto);
}

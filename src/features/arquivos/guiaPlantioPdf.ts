export interface LinhaGuiaPlantioPdf {
  nomeProduto: string;
  lote: string | null;
  modoLabel: string;
  area: string;
  taxaSemeadura: string;
  sacos: string;
  pesoTotal: string;
  valorUnit: string;
  valorTotal: string;
  /** "50×50 cm" — só quando o modo é Covas. */
  espacamento: string | null;
  /** Só quando o modo é Covas. */
  covasPorM2: string | null;
  sementesLabel: string;
  sementesValor: string;
}

export interface ResumoGuiaPlantioPdf {
  totalSacos: string;
  totalPeso: string;
  totalValor: string;
}

/** Texto fixo entregue ao cliente junto com todo Guia de Plantio impresso — orientações básicas de manejo, não muda por pedido. */
const MANUAL_RAPIDO_HTML = `
  <div class="manual">
    <h2>Manual Rápido de Plantio de Pastagem (passo a passo)</h2>
    <p>Prezado(a) Cliente,</p>
    <p>
      Se você nunca plantou pastagem antes, saiba que o segredo para ter um pasto fechado, limpo e produtivo não está na
      quantidade de semente jogada, mas sim no capricho do manejo.
    </p>
    <p>Siga estes 4 passos práticos para garantir o sucesso do seu investimento:</p>
    <ol>
      <li>
        <strong>O preparo do solo é tudo.</strong> As sementes precisam de terra fofa para soltar as primeiras raízes. Faça
        uma boa gradagem e o nivelamento do terreno antes de semear. Nunca jogue as sementes sobre solo duro, compactado ou
        cheio de grandes torrões de terra.
      </li>
      <li>
        <strong>Cuidado com a profundidade (o maior erro de quem começa!).</strong> Sementes de capim são miúdas e frágeis.
        Elas devem ficar enterradas a no máximo 1 a 2 cm de profundidade. Se você usar uma grade niveladora para cobrir a
        semente, tome muito cuidado: se a semente afundar mais de 3 cm de terra, ela vai morrer sufocada antes de conseguir
        sair do chão.
      </li>
      <li>
        <strong>O rolo compactador é o seu melhor amigo.</strong> Se o seu plantio for feito a lanço, passar o rolo
        compactador logo atrás da semente é indispensável. O rolo aperta a semente contra a terra úmida, o que evita que o
        vento a leve embora, dificulta o ataque de formigas e garante que ela consiga puxar a água necessária da terra para
        nascer.
      </li>
      <li>
        <strong>Acerte a época da chuva.</strong> Só inicie o plantio quando o período de chuvas da sua região estiver
        totalmente firmado. Se a semente receber apenas uma chuva leve (que mal molha a terra) e depois vier uma sequência
        de dias de sol escaldante, a semente vai iniciar a germinação e morrer seca antes mesmo de virar uma plantinha.
      </li>
    </ol>
    <div class="nota">
      <strong>Nota do consultor:</strong> a quantidade de sementes sugerida neste orçamento foi calculada por um sistema
      técnico inteligente. Ela já prevê as margens de perda natural do campo (como o ataque de pragas e pequenas variações
      do clima), garantindo o número exato de plantas por metro quadrado que a sua propriedade precisa.
    </div>
  </div>
`;

function blocoProduto(l: LinhaGuiaPlantioPdf): string {
  return `
    <div class="produto">
      <div class="produto-cabecalho">
        <span class="produto-nome">${l.nomeProduto}</span>
        <span class="produto-lote">Lote ${l.lote ?? '—'}</span>
        <span class="produto-modo">${l.modoLabel}</span>
      </div>
      <table class="tabela-resultado">
        <tbody>
          <tr>
            <td class="rotulo">Área</td>
            <td class="valor">${l.area} ha</td>
            <td class="rotulo">Taxa de semeadura</td>
            <td class="valor">${l.taxaSemeadura}</td>
          </tr>
          <tr>
            <td class="rotulo">Sacos necessários</td>
            <td class="valor">${l.sacos}</td>
            <td class="rotulo">Peso total</td>
            <td class="valor">${l.pesoTotal}</td>
          </tr>
          <tr>
            <td class="rotulo">Valor unit. (saco)</td>
            <td class="valor">${l.valorUnit}</td>
            <td class="rotulo">Valor total</td>
            <td class="valor">${l.valorTotal}</td>
          </tr>
          ${
            l.espacamento !== null
              ? `
          <tr>
            <td class="rotulo">Espaçamento</td>
            <td class="valor">${l.espacamento}</td>
            <td class="rotulo">Covas por m²</td>
            <td class="valor">${l.covasPorM2 ?? '—'}</td>
          </tr>`
              : ''
          }
          <tr>
            <td class="rotulo">${l.sementesLabel}</td>
            <td class="valor" colspan="3">${l.sementesValor}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Guia de Plantio impresso (via janela de impressão do navegador, mesmo padrão de
 * gerarGuiaTestePdf/gerarCatalogoPDF) — só os resultados calculados por produto
 * (modo, área, taxa, sacos, valor, sementes) e o Manual Rápido de Plantio fixo,
 * que sempre acompanha o orçamento.
 */
export function gerarGuiaPlantioPdf(linhas: LinhaGuiaPlantioPdf[], resumo: ResumoGuiaPlantioPdf | null): void {
  const corpoHtml =
    linhas.length === 0
      ? `<p class="vazio">Nenhum produto no Guia de Plantio.</p>`
      : `
        ${linhas.map(blocoProduto).join('')}
        ${
          resumo
            ? `
        <div class="resumo-geral">
          <span><strong>Total de Sacos:</strong> ${resumo.totalSacos}</span>
          <span><strong>Peso Total:</strong> ${resumo.totalPeso}</span>
          <span><strong>Valor Total:</strong> ${resumo.totalValor}</span>
        </div>`
            : ''
        }
      `;

  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Guia de Plantio</title>
      <style>
        @page{ margin:14mm 10mm; }
        *{ box-sizing:border-box; }
        body{
          font-family:'Inter',Arial,sans-serif; color:#000000; background:#FFFFFF;
          margin:0; padding:0 4mm;
        }
        .cabecalho{
          display:flex; justify-content:space-between; align-items:flex-start;
          border-bottom:2px solid #000000; padding-bottom:8px; margin-bottom:14px;
        }
        .cabecalho h1{font-size:18px; font-weight:700; margin:0; letter-spacing:.3px;}
        .cabecalho .meta{font-size:11px; color:#333333; text-align:right; white-space:nowrap;}

        .produto{ margin-bottom:14px; page-break-inside:avoid; }
        .produto-cabecalho{
          display:flex; align-items:baseline; gap:10px; margin-bottom:6px;
          border-bottom:1px solid #999999; padding-bottom:4px;
        }
        .produto-nome{ font-size:14px; font-weight:700; }
        .produto-lote{ font-size:11px; color:#333333; }
        .produto-modo{
          margin-left:auto; font-size:11px; font-weight:700; text-transform:uppercase;
          border:1px solid #000000; border-radius:999px; padding:2px 10px;
        }
        table.tabela-resultado{ width:100%; border-collapse:collapse; font-size:12px; }
        table.tabela-resultado td{ padding:5px 8px; border:1px solid #cccccc; }
        table.tabela-resultado td.rotulo{ color:#333333; width:22%; background:#F5F5F5; }
        table.tabela-resultado td.valor{ font-weight:700; width:28%; }

        .resumo-geral{
          display:flex; gap:24px; font-size:13px; border-top:2px solid #000000;
          border-bottom:2px solid #000000; padding:8px 0; margin:16px 0 20px;
        }

        .manual{ page-break-before:always; font-size:12.5px; line-height:1.5; }
        .manual h2{ font-size:16px; margin:0 0 10px; }
        .manual ol{ padding-left:18px; margin:10px 0; }
        .manual li{ margin-bottom:10px; }
        .manual .nota{
          margin-top:14px; padding:10px 12px; border:1px solid #000000; background:#F5F5F5; font-size:12px;
        }
        .vazio{ font-size:13px; color:#000000; padding:20px 0; }
      </style>
    </head>
    <body>
      <div class="cabecalho">
        <h1>Guia de Plantio</h1>
        <div class="meta">Emitido em ${dataEmissao}</div>
      </div>
      ${corpoHtml}
      ${MANUAL_RAPIDO_HTML}
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
  janela.onload = () => {
    janela.focus();
    janela.print();
  };
  // Fallback para navegadores que não disparam onload de forma confiável em document.write
  setTimeout(() => {
    janela.focus();
    janela.print();
  }, 400);
}

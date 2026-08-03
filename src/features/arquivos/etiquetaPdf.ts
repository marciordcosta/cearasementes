import type { DadosEtiqueta } from './etiqueta';

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Selo de identificação de lote (100mm × 70mm), no mesmo espírito do selo
 * feito hoje no WinLabel — impresso via janela do navegador (mesma técnica
 * de gerarGuiaPlantioPdf/gerarGuiaTestePdf), já que a impressora de etiquetas
 * (Wincode) instala como impressora comum do Windows. Os VALORES são sempre
 * os do laudo — os dois modos só diferem em mostrar ou não a grade/rótulos:
 * `comEstrutura` (Selo em Branco) imprime tudo, pro caso de papel virgem;
 * sem estrutura (Original) imprime só os valores, nas mesmas posições, pra
 * imprimir por cima de papel já pré-impresso com a grade/rótulos de fábrica
 * (o "Selo Em branco.wlf" do WinLabel) sem duplicar/desalinhar o desenho.
 *
 * Dentro de um mesmo campo, rótulo e valor NÃO têm borda entre si (rótulo
 * fica ancorado no canto superior esquerdo da célula, valor centralizado
 * nela) — borda só separa campos DIFERENTES. Proporções de linha/coluna
 * calibradas pelo grid real do "Selo Em branco.wlf" (print do WinLabel).
 */
export function gerarEtiquetaPdf(dados: DadosEtiqueta, comEstrutura: boolean): void {
  const d = dados;

  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Selo</title>
      <style>
        @page{ size:100mm 70mm; margin:0; }
        *{ box-sizing:border-box; }
        html,body{ width:100mm; height:70mm; margin:0; padding:0; font-family:Arial,Helvetica,sans-serif; color:#000000; background:#FFFFFF; }
        .selo{ width:100mm; height:70mm; display:flex; flex-direction:column; border:0.3mm solid #000000; overflow:hidden; }
        .linha{ display:flex; border-bottom:0.25mm solid #000000; }
        .linha:last-child{ border-bottom:none; }
        .celula{ position:relative; display:flex; overflow:hidden; padding:0.5mm 1.8mm; }
        .celula + .celula{ border-left:0.25mm solid #000000; }
        .rotulo{ position:absolute; top:0.5mm; left:1.8mm; font-size:2.3mm; font-weight:700; text-transform:uppercase; line-height:1.15; white-space:nowrap; }
        .valor{ font-size:4mm; font-weight:300; text-transform:uppercase; line-height:1.15; }

        /* Campo com rótulo+valor NA MESMA LINHA (rótulo ancorado no canto, valor centralizado no resto da célula) — Espécie/Cultivar/Cat/Processo/Observação. */
        .campo-inline{ flex-direction:row; align-items:center; justify-content:center; }
        .campo-inline .valor{ text-align:center; }

        /* Campo com rótulo em cima e valor embaixo, centralizado — Lote/Safra/Validade/%Puras/%Viáveis/Peso. */
        .campo-empilhado{ flex-direction:column; justify-content:center; align-items:center; padding-top:2.6mm; }
        .campo-empilhado .valor{ text-align:center; }

        /* Cultivar é o único campo bem destacado do Selo (igual ao print de referência) — fonte bem gorda, diferente do resto. */
        .valor-gigante{ font-size:6.2mm; font-weight:900; font-family:'Arial Black', Arial, sans-serif; }
        .valor-media{ font-size:4.6mm; }
        .titulo-secao{ align-items:center; justify-content:center; }
        .titulo-secao .rotulo{ position:static; font-size:4mm; }
        .obs-valor{ font-size:2.8mm; text-transform:none; text-align:left !important; }
        ${
          comEstrutura
            ? ''
            : `
        /* Original: mesmas posições/tamanhos (não mexe no layout, senão desalinha do papel pré-impresso), só apaga a tinta da grade e dos rótulos. */
        .selo{ border-color:transparent; }
        .linha{ border-color:transparent; }
        .celula + .celula{ border-color:transparent; }
        .rotulo{ visibility:hidden; }
        `
        }
      </style>
    </head>
    <body>
      <div class="selo">
        <div class="linha" style="flex:1">
          <div class="celula campo-inline" style="flex:1">
            <span class="rotulo">Espécie:</span>
            <span class="valor valor-media">${escapeHtml(d.especie)}</span>
          </div>
        </div>

        <div class="linha" style="flex:1.8">
          <div class="celula campo-inline" style="flex:1">
            <span class="rotulo">Cultivar:</span>
            <span class="valor valor-gigante">${escapeHtml(d.cultivar)}</span>
          </div>
          <div class="celula campo-inline" style="flex:0 0 20mm">
            <span class="rotulo">Cat:</span>
            <span class="valor">${escapeHtml(d.categoria)}</span>
          </div>
        </div>

        <div class="linha" style="flex:1">
          <div class="celula campo-inline" style="flex:1">
            <span class="rotulo">Processo:</span>
            <span class="valor valor-media">${escapeHtml(d.processo)}</span>
          </div>
        </div>

        <div class="linha" style="flex:1.3">
          <div class="celula campo-empilhado" style="flex:0 0 27mm">
            <span class="rotulo">Lote:</span>
            <span class="valor">${escapeHtml(d.lote)}</span>
          </div>
          <div class="celula campo-empilhado" style="flex:0 0 28mm">
            <span class="rotulo">Safra:</span>
            <span class="valor">${escapeHtml(d.safra)}</span>
          </div>
          <div class="celula campo-empilhado" style="flex:1">
            <span class="rotulo">Validade:</span>
            <span class="valor">${escapeHtml(d.validade)}</span>
          </div>
        </div>

        <div class="linha titulo-secao" style="flex:0.9">
          <span class="rotulo">% Garantias Mínimas</span>
        </div>

        <div class="linha" style="flex:1.1">
          <div class="celula campo-empilhado" style="flex:1">
            <span class="rotulo">% Sementes Puras:</span>
            <span class="valor">${escapeHtml(d.sementesPuras)}</span>
          </div>
          <div class="celula campo-empilhado" style="flex:1">
            <span class="rotulo">% Sementes Viáveis:</span>
            <span class="valor">${escapeHtml(d.sementesViaveis)}</span>
          </div>
        </div>

        <div class="linha" style="flex:1.1">
          <div class="celula campo-inline" style="flex:1; justify-content:flex-start; padding-left:1.8mm">
            <span class="rotulo">Observação:</span>
            <span class="valor obs-valor" style="margin-left:22mm">${escapeHtml(d.observacao)}</span>
          </div>
        </div>

        <div class="linha" style="flex:1.3">
          <div class="celula" style="flex:1">
            <span class="rotulo">Código de Barras</span>
          </div>
          <div class="celula campo-empilhado" style="flex:0 0 20mm">
            <span class="rotulo">Peso:</span>
            <span class="valor">${escapeHtml(d.peso)}</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const janela = window.open('', '_blank', 'width=500,height=400');
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

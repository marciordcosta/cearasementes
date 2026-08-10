import type { NotaEtiqueta } from './types';

/** Uma cidade da cotação com as NFs (uma ou mais) a etiquetar pra ela. */
export interface GrupoEtiquetaFrete {
  /** "Nome, UF" (como fica salvo na lista de cidades da cotação) ou só "Nome". */
  cidade: string;
  notas: NotaEtiqueta[];
}

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** "Fortaleza, CE" -> { cidade: "Fortaleza", uf: "CE" }; sem vírgula, UF fica vazia. */
function separarCidadeUf(cidadeCompleta: string): { cidade: string; uf: string } {
  const partes = cidadeCompleta.split(',');
  if (partes.length < 2) return { cidade: cidadeCompleta.trim(), uf: '' };
  return { cidade: partes[0].trim(), uf: partes.slice(1).join(',').trim() };
}

/**
 * Gera as etiquetas de expedição (via janela de impressão do navegador) —
 * uma etiqueta física por VOLUME: uma NF com 50 volumes vira 50 etiquetas
 * "1/50", "2/50"... "50/50". Mesmo padrão de gerarEtiquetaPdf
 * (features/arquivos/etiquetaPdf.ts): HTML puro em `window.print()`, sem lib
 * de PDF. Etiqueta física padrão de frete: 100mm (largura) x 30mm (altura) —
 * bem mais larga que alta, por isso os campos ficam em 2 linhas, cada uma
 * com um par lado a lado (Cidade+UF, depois NF+VOL), não empilhados.
 */
export function gerarEtiquetaFretePdf(grupos: GrupoEtiquetaFrete[]): void {
  const etiquetas = grupos.flatMap(({ cidade, notas }) => {
    const { cidade: nomeCidade, uf } = separarCidadeUf(cidade);
    return notas.flatMap((nota) =>
      Array.from({ length: nota.volumes }, (_, i) => ({
        cidade: nomeCidade,
        uf,
        nf: nota.nf,
        volumeAtual: i + 1,
        volumeTotal: nota.volumes,
      })),
    );
  });

  const corpoHtml = etiquetas
    .map(
      (e) => `
        <div class="etiqueta">
          <div class="grupo">
            <div class="campo"><span class="rotulo">Cidade:</span> <span class="valor">${escapeHtml(e.cidade)}</span></div>
            <div class="campo"><span class="rotulo">UF:</span> <span class="valor">${escapeHtml(e.uf)}</span></div>
          </div>
          <div class="grupo">
            <div class="campo"><span class="rotulo">NF:</span> <span class="valor">${escapeHtml(e.nf)}</span></div>
            <div class="campo"><span class="rotulo">VOL:</span> <span class="valor">${e.volumeAtual}/${e.volumeTotal}</span></div>
          </div>
        </div>
      `,
    )
    .join('');

  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title></title>
      <style>
        @page{ size:100mm 30mm; margin:0; }
        *{ box-sizing:border-box; }
        html,body{ width:100mm; height:30mm; margin:0; padding:0; font-family:Arial,Helvetica,sans-serif; color:#000000; background:#FFFFFF; }
        .etiqueta{
          width:100mm; height:30mm; padding:2mm 4mm;
          display:flex; flex-direction:column; justify-content:center; gap:1.5mm;
          page-break-after:always;
        }
        .etiqueta:last-child{ page-break-after:auto; }
        .grupo{ display:flex; flex-direction:row; align-items:flex-end; gap:4mm; }
        .campo{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .campo:first-child{ flex:1 1 auto; min-width:0; }
        .campo:last-child{ flex:0 0 auto; }
        .rotulo{ font-size:2.2mm; font-weight:700; }
        .valor{ font-size:6.5mm; font-weight:700; display:block; line-height:1.05; }
      </style>
    </head>
    <body>
      ${corpoHtml}
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

/**
 * Nome com marcação estilo WhatsApp, digitada no próprio campo "Produto" do
 * EditProductModal (não afeta o que é salvo, só a exibição): `*palavra*` sai
 * em negrito, `_palavra_` sai em itálico, o resto do nome em peso 300 (fino).
 * Reaproveitado em qualquer lugar que exiba nome de produto — grade de
 * Precificação (PricingTable), busca/autocomplete (AutocompleteInput), etc.
 */
export function NomeComDestaque({ nome }: { nome: string }) {
  const regex = /\*(.+?)\*|_(.+?)_/g;
  const partes: { texto: string; estilo: 'normal' | 'negrito' | 'italico' }[] = [];
  let ultimoIndice = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(nome)) !== null) {
    if (match.index > ultimoIndice) partes.push({ texto: nome.slice(ultimoIndice, match.index), estilo: 'normal' });
    partes.push({ texto: (match[1] ?? match[2])!, estilo: match[1] !== undefined ? 'negrito' : 'italico' });
    ultimoIndice = regex.lastIndex;
  }
  if (ultimoIndice < nome.length) partes.push({ texto: nome.slice(ultimoIndice), estilo: 'normal' });

  return (
    <>
      {partes.map((p, i) => (
        <span key={i} className={p.estilo === 'negrito' ? 'font-bold' : p.estilo === 'italico' ? 'font-light italic' : 'font-light'}>
          {p.texto}
        </span>
      ))}
    </>
  );
}

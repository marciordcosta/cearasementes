/**
 * Relatórios exportados por sistemas legados (Delphi/RDprint, planilhas
 * antigas etc.) costumam vir em Windows-1252/Latin-1, não UTF-8 — decodificar
 * como UTF-8 direto corrompe acento (perde a letra, não só o acento: "João"
 * vira "Joo"). Tenta UTF-8 primeiro; se aparecer o caractere de substituição
 * (sinal de que a decodificação falhou), refaz em windows-1252.
 */
export async function readFileSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (text.includes('�')) {
    text = new TextDecoder('windows-1252').decode(buf);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

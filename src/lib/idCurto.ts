/**
 * Representação curta e reversível de um UUID (16 bytes -> base64url, ~22
 * caracteres em vez dos 36 do formato com hífens) — só pra encurtar links
 * compartilhados (ex.: WhatsApp), sem precisar de encurtador externo nem de
 * uma 2ª coluna "código curto" no banco.
 */
export function uuidParaCurto(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  let binario = '';
  bytes.forEach((b) => {
    binario += String.fromCharCode(b);
  });
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Aceita tanto o código curto quanto um UUID completo (links já enviados antes dessa mudança continuam funcionando). */
export function curtoParaUuid(valor: string): string | null {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) return valor;
  try {
    let base64 = valor.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) base64 += '=';
    const binario = atob(base64);
    if (binario.length !== 16) return null;
    let hex = '';
    for (let i = 0; i < 16; i++) hex += binario.charCodeAt(i).toString(16).padStart(2, '0');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}

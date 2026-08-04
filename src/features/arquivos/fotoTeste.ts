const LADO_MAXIMO = 1600;
const QUALIDADE_JPEG = 0.8;

/**
 * Redimensiona uma foto no próprio navegador antes do upload (canvas) —
 * câmera de celular gera arquivos de vários MB sem necessidade pro que é só
 * uma evidência visual do Teste de Campo, e a conexão na roça costuma ser
 * ruim. Só encolhe (nunca amplia) e nunca bloqueia o envio: se o
 * redimensionamento falhar por qualquer motivo, devolve o arquivo original.
 */
export async function redimensionarImagem(arquivo: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const maiorLado = Math.max(bitmap.width, bitmap.height);
    if (maiorLado <= LADO_MAXIMO) {
      bitmap.close();
      return arquivo;
    }

    const escala = LADO_MAXIMO / maiorLado;
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return arquivo;
    }
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG));
    if (!blob) return arquivo;

    const nome = arquivo.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg' });
  } catch {
    return arquivo;
  }
}

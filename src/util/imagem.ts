// Compressão de fotos no próprio aparelho (cabe no plano gratuito do Firestore).

async function carregar(arquivo: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((ok, falha) =>
    canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível processar a imagem.'))), tipo, qualidade),
  );
}

/**
 * Reduz a foto para no máximo `ladoMax` px e ~`alvo` bytes em JPEG.
 * Uma foto de celular de 3–5 MB vira algo entre 60 e 150 KB.
 */
export async function comprimirImagem(arquivo: Blob, ladoMax = 1280, alvo = 150_000): Promise<Uint8Array> {
  const img = await carregar(arquivo);
  let lado = ladoMax;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const escala = Math.min(1, lado / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Navegador sem suporte a imagens.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.72, 0.6, 0.5, 0.4]) {
      const blob = await paraBlob(canvas, 'image/jpeg', q);
      if (blob.size <= alvo) return new Uint8Array(await blob.arrayBuffer());
    }
    lado = Math.round(lado * 0.75);
  }
  throw new Error('A foto ficou grande demais mesmo comprimida. Tente outra foto.');
}

/** Logo da empresa: mantém PNG (transparência) se couber, senão JPEG. */
export async function prepararLogo(arquivo: Blob): Promise<{ bytes: Uint8Array; tipo: string }> {
  const img = await carregar(arquivo);
  const escala = Math.min(1, 400 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = await paraBlob(canvas, 'image/png');
  if (png.size <= 200_000) return { bytes: new Uint8Array(await png.arrayBuffer()), tipo: 'image/png' };
  return { bytes: await comprimirImagem(arquivo, 400, 150_000), tipo: 'image/jpeg' };
}

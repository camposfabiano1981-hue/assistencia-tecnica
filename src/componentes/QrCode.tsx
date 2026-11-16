import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function urlEquipamento(id: string): string {
  return `${location.origin}/q/${id}`;
}

export function QrCode({ texto, tamanho = 220, alt = 'QR code' }: { texto: string; tamanho?: number; alt?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let vivo = true;
    void QRCode.toDataURL(texto, { width: tamanho * 2, margin: 1, errorCorrectionLevel: 'M' }).then((u) => vivo && setSrc(u));
    return () => {
      vivo = false;
    };
  }, [texto, tamanho]);
  return src ? <img src={src} width={tamanho} height={tamanho} alt={alt} /> : <div style={{ width: tamanho, height: tamanho }} />;
}

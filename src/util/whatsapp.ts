// Mensagens prontas via wa.me — custo zero: abre o WhatsApp com o texto escrito,
// e quem envia é a pessoa (atendente, técnico ou cliente).
import { soDigitos } from './formato';

export function linkWhatsApp(numero: string | undefined | null, texto: string): string {
  let n = soDigitos(numero);
  if (n && n.length <= 11) n = `55${n}`; // número brasileiro sem DDI
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

export function abrirWhatsApp(numero: string | undefined | null, texto: string): void {
  window.open(linkWhatsApp(numero, texto), '_blank', 'noopener');
}

/** Compartilha um arquivo (ex.: laudo PDF) pelo menu nativo do celular; no computador, baixa o arquivo. */
export async function compartilharArquivo(arquivo: File, texto: string): Promise<'compartilhado' | 'baixado' | 'bloqueado'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [arquivo] })) {
    try {
      await nav.share({ files: [arquivo], title: arquivo.name, text: texto });
      return 'compartilhado';
    } catch (e) {
      const nome = (e as DOMException).name;
      if (nome === 'AbortError') return 'compartilhado';
      // O navegador exige um toque recente: a tela mostra um botão para compartilhar.
      if (nome === 'NotAllowedError') return 'bloqueado';
    }
  }
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'baixado';
}

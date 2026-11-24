// Base comum dos documentos PDF (laudo, orçamento, fatura): cabeçalho, seções, tabelas e rodapé.
import { jsPDF } from 'jspdf';
import { autoTable, type UserOptions } from 'jspdf-autotable';
import type { Empresa } from '../tipos';
import { fmtTelefone } from './formato';

export type RGB = [number, number, number];
export const COR = {
  primaria: [14, 90, 116] as RGB,
  suave: [88, 106, 118] as RGB,
  faixa: [226, 240, 245] as RGB,
  faixaTexto: [10, 69, 89] as RGB,
  verde: [27, 117, 67] as RGB,
  verdeFundo: [227, 243, 233] as RGB,
  vermelho: [179, 38, 30] as RGB,
  vermelhoFundo: [253, 232, 230] as RGB,
};

// As fontes padrão do PDF só cobrem o Latin-1: troca símbolos fora dele.
const TROCAS: [RegExp, string][] = [
  [/Ω/g, 'ohm'],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/[—–]/g, '-'],
  [/…/g, '...'],
  [/[“”]/g, '"'],
  [/[‘’]/g, "'"],
  [/•/g, '·'],
];
export function txt(s: unknown): string {
  let r = String(s ?? '');
  for (const [de, para] of TROCAS) r = r.replace(de, para);
  return r.replace(/[^\u0000-ÿ]/g, '');
}

export class Folha {
  readonly pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  readonly M = 14;
  readonly L = 210 - 2 * 14;
  private readonly limite = 297 - 18;
  y = 14;

  garantir(espaco: number): void {
    if (this.y + espaco > this.limite) {
      this.pdf.addPage();
      this.y = 16;
    }
  }

  private fimTabela(): number {
    return ((this.pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? this.y) + 4;
  }

  cabecalho(empresa: Empresa | null, titulo: string[], numero: string, subtitulo?: string): void {
    const { pdf, M } = this;
    const y = this.y;
    let xEmpresa = M;
    if (empresa?.logo) {
      try {
        const bytes = empresa.logo.toUint8Array();
        const p = pdf.getImageProperties(bytes);
        const h = 20;
        const w = Math.min(34, (p.width / p.height) * h);
        pdf.addImage(bytes, empresa.logoTipo?.includes('png') ? 'PNG' : 'JPEG', M, y, w, h, undefined, 'FAST');
        xEmpresa = M + w + 4;
      } catch {
        /* logo inválida: segue sem */
      }
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12.5);
    pdf.text(txt(empresa?.nome || 'Assistência Técnica'), xEmpresa, y + 5, { maxWidth: 105 });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...COR.suave);
    const linhas = [
      empresa?.documento ? `CNPJ/CPF: ${empresa.documento}` : '',
      [empresa?.telefone && fmtTelefone(empresa.telefone), empresa?.whatsapp && `WhatsApp ${fmtTelefone(empresa.whatsapp)}`, empresa?.email]
        .filter(Boolean)
        .join(' · '),
      [empresa?.endereco, empresa?.cidade].filter(Boolean).join(' - '),
    ].filter(Boolean);
    let yl = y + 10;
    for (const linha of linhas) {
      for (const parte of pdf.splitTextToSize(txt(linha), 210 - M - xEmpresa - 62) as string[]) {
        pdf.text(parte, xEmpresa, yl);
        yl += 3.6;
      }
    }
    pdf.setTextColor(0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    titulo.forEach((t, i) => pdf.text(txt(t), 210 - M, y + 4 + i * 4.5, { align: 'right' }));
    pdf.setFontSize(16);
    pdf.setTextColor(...COR.primaria);
    pdf.text(txt(numero), 210 - M, y + 16, { align: 'right' });
    pdf.setTextColor(0);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    if (subtitulo) pdf.text(txt(subtitulo), 210 - M, y + 21, { align: 'right' });
    this.y = Math.max(yl, y + 24) + 2;
    pdf.setDrawColor(...COR.primaria);
    pdf.setLineWidth(0.6);
    pdf.line(M, this.y, 210 - M, this.y);
    this.y += 4;
  }

  /** Linha de destaque (ex.: RASCUNHO). */
  alerta(texto: string, cor: RGB = COR.vermelho): void {
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setFontSize(9.5);
    this.pdf.setTextColor(...cor);
    this.pdf.text(txt(texto), this.M, this.y + 2);
    this.pdf.setTextColor(0);
    this.y += 6;
  }

  secao(titulo: string): void {
    this.garantir(14);
    const { pdf, M, L } = this;
    pdf.setFillColor(...COR.faixa);
    pdf.rect(M, this.y, L, 6.5, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...COR.faixaTexto);
    pdf.text(txt(titulo.toUpperCase()), M + 2, this.y + 4.5);
    pdf.setTextColor(0);
    this.y += 8;
  }

  /** Pares rótulo/valor em duas colunas. */
  pares(lista: [string, string | undefined | null][]): void {
    const itens = lista.filter(([, v]) => v != null && v !== '');
    const linhas: string[][] = [];
    for (let i = 0; i < itens.length; i += 2) {
      const [k1, v1] = itens[i];
      const [k2, v2] = itens[i + 1] ?? ['', ''];
      linhas.push([txt(k1), txt(v1), txt(k2), txt(v2)]);
    }
    if (!linhas.length) return;
    autoTable(this.pdf, {
      startY: this.y,
      margin: { left: this.M, right: this.M },
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: { top: 0.8, bottom: 0.8, left: 1.2, right: 1.2 }, overflow: 'linebreak' },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: COR.suave, cellWidth: 27 },
        1: { cellWidth: this.L / 2 - 27 },
        2: { fontStyle: 'bold', textColor: COR.suave, cellWidth: 27 },
        3: { cellWidth: this.L / 2 - 27 },
      },
      body: linhas,
    });
    this.y = this.fimTabela();
  }

  paragrafo(rotulo: string, texto?: string | null): void {
    if (!texto?.trim()) return;
    autoTable(this.pdf, {
      startY: this.y,
      margin: { left: this.M, right: this.M },
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: { top: 0.8, bottom: 0.8, left: 1.2, right: 1.2 } },
      columnStyles: { 0: { fontStyle: 'bold', textColor: COR.suave, cellWidth: 27 } },
      body: [[txt(rotulo), txt(texto.trim())]],
    });
    this.y = this.fimTabela() - 1.5;
  }

  tabela(opcoes: Omit<UserOptions, 'startY' | 'margin'>): void {
    autoTable(this.pdf, {
      startY: this.y,
      margin: { left: this.M, right: this.M },
      styles: { fontSize: 8.2, cellPadding: 1.3 },
      headStyles: { fillColor: COR.primaria, fontSize: 8.2 },
      ...opcoes,
    });
    this.y = this.fimTabela();
  }

  /** Faixa colorida com texto em destaque (ex.: situação final, total). */
  faixa(texto: string, cor: RGB, fundo: RGB, alinhar: 'left' | 'right' = 'left'): void {
    this.garantir(12);
    const { pdf, M, L } = this;
    pdf.setFillColor(...fundo);
    pdf.rect(M, this.y, L, 9, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...cor);
    pdf.text(txt(texto), alinhar === 'left' ? M + 3 : 210 - M - 3, this.y + 6, { align: alinhar });
    pdf.setTextColor(0);
    pdf.setFont('helvetica', 'normal');
    this.y += 13;
  }

  rodape(textoEmpresa: string | undefined, identificacao: string): void {
    const { pdf, M, L } = this;
    const total = pdf.getNumberOfPages();
    const gerado = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      pdf.setFontSize(7.2);
      pdf.setTextColor(...COR.suave);
      if (textoEmpresa) pdf.text(txt(textoEmpresa), M, 289, { maxWidth: L - 40 });
      pdf.text(txt(`${identificacao} · gerado em ${gerado} · página ${p} de ${total}`), 210 - M, 293, { align: 'right' });
    }
  }

  /** Grade de fotos (3 por linha, proporção 4:3, com moldura). */
  galeria(titulo: string, fotos: { imagem: { toUint8Array(): Uint8Array } }[]): void {
    if (!fotos.length) return;
    const { pdf, M, L } = this;
    this.secao(titulo);
    const colunas = 3;
    const gap = 4;
    const w = (L - gap * (colunas - 1)) / colunas;
    const h = w * 0.75;
    fotos.forEach((foto, i) => {
      const col = i % colunas;
      if (col === 0) this.garantir(h + 4);
      const x = M + col * (w + gap);
      try {
        const bytes = foto.imagem.toUint8Array();
        const p = pdf.getImageProperties(bytes);
        const escala = Math.min(w / p.width, h / p.height);
        const iw = p.width * escala;
        const ih = p.height * escala;
        pdf.setDrawColor(217, 225, 231);
        pdf.setLineWidth(0.2);
        pdf.rect(x, this.y, w, h);
        pdf.addImage(bytes, 'JPEG', x + (w - iw) / 2, this.y + (h - ih) / 2, iw, ih, undefined, 'FAST');
      } catch {
        pdf.text('Foto indisponível', x + 2, this.y + 5);
      }
      if (col === colunas - 1 || i === fotos.length - 1) this.y += h + gap;
    });
    this.y += 2;
  }

  arquivo(nome: string): File {
    return new File([this.pdf.output('blob')], nome, { type: 'application/pdf' });
  }
}

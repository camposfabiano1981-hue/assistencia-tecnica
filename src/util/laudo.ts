// Laudo técnico em PDF, gerado no próprio aparelho (sem servidor).
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Empresa, Foto, OrdemServico, ResultadoItem } from '../tipos';
import { fmtDataHora, fmtTelefone, numeroOS, rotuloTipoOS } from './formato';
import { avaliarMedicao, ordenados } from './medicao';

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

const ROTULO_RESULTADO: Record<ResultadoItem, string> = { ok: 'Conforme', nok: 'Não conforme', na: 'N/A' };
const COR = { primaria: [14, 90, 116] as [number, number, number], suave: [88, 106, 118] as [number, number, number] };

function limite(min?: number | null, max?: number | null): string {
  const f = (n: number) => n.toLocaleString('pt-BR');
  if (min != null && max != null) return `${f(min)} a ${f(max)}`;
  if (min != null) return `mín. ${f(min)}`;
  if (max != null) return `máx. ${f(max)}`;
  return '-';
}

export async function gerarLaudo(os: OrdemServico, empresa: Empresa | null, fotos: Foto[]): Promise<File> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 14;
  const L = 210 - 2 * M;
  const ALTURA_UTIL = 297 - 18;
  let y = 14;
  const garantir = (espaco: number) => {
    if (y + espaco > ALTURA_UTIL) {
      pdf.addPage();
      y = 16;
    }
  };
  const fimTabela = () => ((pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 4;

  // ---- Cabeçalho ----
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
  const linhasEmpresa = [
    empresa?.documento ? `CNPJ/CPF: ${empresa.documento}` : '',
    [empresa?.telefone && fmtTelefone(empresa.telefone), empresa?.whatsapp && `WhatsApp ${fmtTelefone(empresa.whatsapp)}`, empresa?.email]
      .filter(Boolean)
      .join(' · '),
    [empresa?.endereco, empresa?.cidade].filter(Boolean).join(' - '),
  ].filter(Boolean);
  let yl = y + 10;
  for (const linha of linhasEmpresa) {
    for (const parte of pdf.splitTextToSize(txt(linha), 210 - M - xEmpresa - 62) as string[]) {
      pdf.text(parte, xEmpresa, yl);
      yl += 3.6;
    }
  }
  pdf.setTextColor(0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text('ORDEM DE SERVIÇO', 210 - M, y + 4, { align: 'right' });
  pdf.text('LAUDO TÉCNICO', 210 - M, y + 8.5, { align: 'right' });
  pdf.setFontSize(16);
  pdf.setTextColor(...COR.primaria);
  pdf.text(`Nº ${numeroOS(os.numero)}`, 210 - M, y + 16, { align: 'right' });
  pdf.setTextColor(0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text(txt(rotuloTipoOS[os.tipo]), 210 - M, y + 21, { align: 'right' });
  y = Math.max(yl, y + 24) + 2;
  pdf.setDrawColor(...COR.primaria);
  pdf.setLineWidth(0.6);
  pdf.line(M, y, 210 - M, y);
  y += 4;

  if (os.status !== 'concluida') {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(179, 38, 30);
    pdf.text('RASCUNHO - atendimento ainda não concluído nem assinado', M, y + 2);
    pdf.setTextColor(0);
    y += 6;
  }

  const secao = (titulo: string) => {
    garantir(14);
    pdf.setFillColor(226, 240, 245);
    pdf.rect(M, y, L, 6.5, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(10, 69, 89);
    pdf.text(txt(titulo.toUpperCase()), M + 2, y + 4.5);
    pdf.setTextColor(0);
    y += 8;
  };

  const pares = (lista: [string, string | undefined | null][]) => {
    const itens = lista.filter(([, v]) => v != null && v !== '');
    const linhas: string[][] = [];
    for (let i = 0; i < itens.length; i += 2) {
      const [k1, v1] = itens[i];
      const [k2, v2] = itens[i + 1] ?? ['', ''];
      linhas.push([txt(k1), txt(v1), txt(k2), txt(v2)]);
    }
    if (!linhas.length) return;
    autoTable(pdf, {
      startY: y,
      margin: { left: M, right: M },
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: { top: 0.8, bottom: 0.8, left: 1.2, right: 1.2 }, overflow: 'linebreak' },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: COR.suave, cellWidth: 27 },
        1: { cellWidth: L / 2 - 27 },
        2: { fontStyle: 'bold', textColor: COR.suave, cellWidth: 27 },
        3: { cellWidth: L / 2 - 27 },
      },
      body: linhas,
    });
    y = fimTabela();
  };

  const paragrafo = (rotulo: string, texto?: string | null) => {
    if (!texto?.trim()) return;
    autoTable(pdf, {
      startY: y,
      margin: { left: M, right: M },
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: { top: 0.8, bottom: 0.8, left: 1.2, right: 1.2 } },
      columnStyles: { 0: { fontStyle: 'bold', textColor: COR.suave, cellWidth: 27 } },
      body: [[txt(rotulo), txt(texto.trim())]],
    });
    y = fimTabela() - 1.5;
  };

  // ---- Cliente e equipamento ----
  secao('Cliente');
  pares([
    ['Nome', os.cliente.nome],
    ['CNPJ/CPF', os.cliente.documento],
    ['Endereço', [os.cliente.endereco, os.cliente.cidade].filter(Boolean).join(' - ')],
    ['Telefone', fmtTelefone(os.cliente.telefone)],
  ]);
  secao('Equipamento');
  pares([
    ['Tipo', os.equipamento.tipoNome],
    ['Fabricante', os.equipamento.fabricante],
    ['Modelo', os.equipamento.modelo],
    ['Nº de série', os.equipamento.numeroSerie],
    ['Patrimônio', os.equipamento.patrimonio],
    ['Setor', os.equipamento.setor],
    ['Registro Anvisa', os.equipamento.registroAnvisa],
  ]);

  // ---- Atendimento ----
  secao('Atendimento');
  pares([
    ['Chamado', os.chamadoId ? `nº ${os.chamadoId}` : 'Sem chamado'],
    ['Serviço', rotuloTipoOS[os.tipo]],
    ['Técnico', [os.tecnicoNome, os.tecnicoRegistro].filter(Boolean).join(' - ')],
    ['Início', fmtDataHora(os.inicioEm)],
    ['Término', fmtDataHora(os.fimEm)],
    ['Check-in', os.checkin ? `${os.checkin.lat.toFixed(5)}, ${os.checkin.lng.toFixed(5)} (±${Math.round(os.checkin.precisao)} m)` : null],
  ]);
  paragrafo('Relato do cliente', os.relato);

  // ---- Checklist ----
  const checklist = ordenados(os.checklist);
  if (checklist.length) {
    secao('Checklist de verificação');
    autoTable(pdf, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Item verificado', 'Resultado', 'Observação']],
      body: checklist.map((i) => [txt(i.texto), i.resultado ? ROTULO_RESULTADO[i.resultado] : 'Não verificado', txt(i.obs ?? '')]),
      styles: { fontSize: 8.2, cellPadding: 1.3 },
      headStyles: { fillColor: COR.primaria, fontSize: 8.2 },
      columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 28 } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 1) {
          if (d.cell.raw === 'Não conforme') d.cell.styles.textColor = [179, 38, 30];
          if (d.cell.raw === 'Conforme') d.cell.styles.textColor = [27, 117, 67];
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = fimTabela();
  }

  // ---- Medições ----
  const medidas = ordenados(os.medicoes).filter((m) => m.valor != null);
  if (medidas.length) {
    secao(os.exigeEnsaioSeguranca ? 'Medições e ensaio de segurança elétrica' : 'Medições');
    autoTable(pdf, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Grandeza', 'Valor medido', 'Limite', 'Resultado']],
      body: medidas.map((m) => {
        const r = avaliarMedicao(m.valor, m.min, m.max);
        return [
          txt(m.nome),
          txt(`${m.valor!.toLocaleString('pt-BR')} ${m.unidade}`),
          txt(`${limite(m.min, m.max)} ${m.min != null || m.max != null ? m.unidade : ''}`),
          r === 'aprovado' ? 'Aprovado' : r === 'reprovado' ? 'Reprovado' : 'Registrado',
        ];
      }),
      styles: { fontSize: 8.2, cellPadding: 1.3 },
      headStyles: { fillColor: COR.primaria, fontSize: 8.2 },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 3) {
          if (d.cell.raw === 'Reprovado') d.cell.styles.textColor = [179, 38, 30];
          if (d.cell.raw === 'Aprovado') d.cell.styles.textColor = [27, 117, 67];
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = fimTabela();
  }

  // ---- Serviço ----
  secao('Diagnóstico e serviço executado');
  paragrafo('Diagnóstico', os.diagnostico || '-');
  paragrafo('Serviço executado', os.servicoExecutado || '-');
  if (os.pecas?.length) paragrafo('Peças substituídas', os.pecas.map((p) => `${p.quantidade} x ${p.descricao}`).join('\n'));
  paragrafo('Instrumentos utilizados', os.instrumentos);
  paragrafo('Observações', os.observacoes);
  y += 1;

  // ---- Situação final ----
  garantir(12);
  const liberado = os.liberado;
  pdf.setFillColor(...((liberado === false ? [253, 232, 230] : [227, 243, 233]) as [number, number, number]));
  pdf.rect(M, y, L, 9, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...((liberado === false ? [179, 38, 30] : [27, 117, 67]) as [number, number, number]));
  pdf.text(
    liberado == null ? 'Situação do equipamento: não informada' : liberado ? 'EQUIPAMENTO LIBERADO PARA USO' : 'EQUIPAMENTO NÃO LIBERADO PARA USO',
    M + 3,
    y + 6,
  );
  pdf.setTextColor(0);
  y += 13;

  // ---- Fotos ----
  if (fotos.length) {
    secao(`Registro fotográfico (${fotos.length})`);
    const colunas = 3;
    const gap = 4;
    const w = (L - gap * (colunas - 1)) / colunas;
    const h = w * 0.75;
    fotos.forEach((f, i) => {
      const col = i % colunas;
      if (col === 0) garantir(h + 4);
      const x = M + col * (w + gap);
      try {
        const bytes = f.imagem.toUint8Array();
        const p = pdf.getImageProperties(bytes);
        const escala = Math.min(w / p.width, h / p.height);
        const iw = p.width * escala;
        const ih = p.height * escala;
        pdf.setDrawColor(217, 225, 231);
        pdf.setLineWidth(0.2);
        pdf.rect(x, y, w, h);
        pdf.addImage(bytes, 'JPEG', x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, 'FAST');
      } catch {
        pdf.text('Foto indisponível', x + 2, y + 5);
      }
      if (col === colunas - 1 || i === fotos.length - 1) y += h + gap;
    });
    y += 2;
  }

  // ---- Assinaturas ----
  garantir(46);
  secao('Aceite');
  const yAss = y;
  const metade = L / 2 - 4;
  if (os.assinatura?.imagem) {
    try {
      const bytes = os.assinatura.imagem.toUint8Array();
      const p = pdf.getImageProperties(bytes);
      const hh = 22;
      const ww = Math.min(metade, (p.width / p.height) * hh);
      pdf.addImage(bytes, 'PNG', M, yAss, ww, hh, undefined, 'FAST');
    } catch {
      /* sem imagem */
    }
  }
  pdf.setDrawColor(120);
  pdf.setLineWidth(0.3);
  pdf.line(M, yAss + 24, M + metade, yAss + 24);
  pdf.line(M + L / 2 + 4, yAss + 24, 210 - M, yAss + 24);
  pdf.setFontSize(8.2);
  pdf.setFont('helvetica', 'bold');
  pdf.text(txt(os.assinatura?.nome || 'Cliente'), M, yAss + 28);
  pdf.text(txt(os.tecnicoNome), M + L / 2 + 4, yAss + 28);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COR.suave);
  pdf.text(
    txt(['Cliente / responsável', os.assinatura?.documento, os.assinatura?.em && `assinado em ${fmtDataHora(os.assinatura.em)}`].filter(Boolean).join(' · ')),
    M,
    yAss + 32,
    { maxWidth: metade },
  );
  pdf.text(txt(['Técnico', os.tecnicoRegistro].filter(Boolean).join(' · ')), M + L / 2 + 4, yAss + 32);
  if (empresa?.rtNome) {
    pdf.text(txt(`Responsável técnico: ${empresa.rtNome}${empresa.rtRegistro ? ` - ${empresa.rtRegistro}` : ''}`), M + L / 2 + 4, yAss + 36);
  }
  pdf.setTextColor(0);

  // ---- Rodapé ----
  const total = pdf.getNumberOfPages();
  const gerado = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setFontSize(7.2);
    pdf.setTextColor(...COR.suave);
    if (empresa?.rodapeLaudo) pdf.text(txt(empresa.rodapeLaudo), M, 289, { maxWidth: L - 40 });
    pdf.text(`OS nº ${numeroOS(os.numero)} · gerado em ${gerado} · página ${p} de ${total}`, 210 - M, 293, { align: 'right' });
  }

  const blob = pdf.output('blob');
  return new File([blob], `OS-${numeroOS(os.numero)}.pdf`, { type: 'application/pdf' });
}

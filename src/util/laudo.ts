// Laudo técnico em PDF, gerado no próprio aparelho (sem servidor).
import type { Empresa, Foto, OrdemServico, ResultadoItem } from '../tipos';
import { fmtData, fmtDataHora, fmtTelefone, numeroOS, rotuloTipoOS } from './formato';
import { avaliarMedicao, ordenados } from './medicao';
import { somarMeses } from './datas';
import QRCode from 'qrcode';
import { COR, Folha, txt } from './pdfBase';
import { formatarCodigo, urlVerificacao } from './verificacao';

export { txt };

const ROTULO_RESULTADO: Record<ResultadoItem, string> = { ok: 'Conforme', nok: 'Não conforme', na: 'N/A' };

function limite(min?: number | null, max?: number | null): string {
  const f = (n: number) => n.toLocaleString('pt-BR');
  if (min != null && max != null) return `${f(min)} a ${f(max)}`;
  if (min != null) return `mín. ${f(min)}`;
  if (max != null) return `máx. ${f(max)}`;
  return '-';
}

export async function gerarLaudo(os: OrdemServico, empresa: Empresa | null, fotos: Foto[]): Promise<File> {
  const f = new Folha();
  const { pdf, M, L } = f;
  f.cabecalho(empresa, ['ORDEM DE SERVIÇO', 'LAUDO TÉCNICO'], `Nº ${numeroOS(os.numero)}`, rotuloTipoOS[os.tipo]);
  if (os.status !== 'concluida') f.alerta('RASCUNHO - atendimento ainda não concluído nem assinado');

  // ---- Cliente e equipamento ----
  f.secao('Cliente');
  f.pares([
    ['Nome', os.cliente.nome],
    ['CNPJ/CPF', os.cliente.documento],
    ['Endereço', [os.cliente.endereco, os.cliente.cidade].filter(Boolean).join(' - ')],
    ['Telefone', fmtTelefone(os.cliente.telefone)],
  ]);
  f.secao('Equipamento');
  f.pares([
    ['Tipo', os.equipamento.tipoNome],
    ['Fabricante', os.equipamento.fabricante],
    ['Modelo', os.equipamento.modelo],
    ['Nº de série', os.equipamento.numeroSerie],
    ['Patrimônio', os.equipamento.patrimonio],
    ['Setor', os.equipamento.setor],
    ['Registro Anvisa', os.equipamento.registroAnvisa],
  ]);

  // ---- Atendimento ----
  f.secao('Atendimento');
  f.pares([
    ['Chamado', os.chamadoId ? `nº ${os.chamadoId}` : 'Sem chamado'],
    ['Serviço', rotuloTipoOS[os.tipo]],
    ['Técnico', [os.tecnicoNome, os.tecnicoRegistro].filter(Boolean).join(' - ')],
    ['Início', fmtDataHora(os.inicioEm)],
    ['Término', fmtDataHora(os.fimEm)],
    ['Check-in', os.checkin ? `${os.checkin.lat.toFixed(5)}, ${os.checkin.lng.toFixed(5)} (±${Math.round(os.checkin.precisao)} m)` : null],
  ]);
  f.paragrafo('Relato do cliente', os.relato);

  // ---- Checklist ----
  const checklist = ordenados(os.checklist);
  if (checklist.length) {
    f.secao('Checklist de verificação');
    f.tabela({
      head: [['Item verificado', 'Resultado', 'Observação']],
      body: checklist.map((i) => [txt(i.texto), i.resultado ? ROTULO_RESULTADO[i.resultado] : 'Não verificado', txt(i.obs ?? '')]),
      columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 28 } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 1) {
          if (d.cell.raw === 'Não conforme') d.cell.styles.textColor = COR.vermelho;
          if (d.cell.raw === 'Conforme') d.cell.styles.textColor = COR.verde;
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // ---- Medições ----
  const medidas = ordenados(os.medicoes).filter((m) => m.valor != null);
  if (medidas.length) {
    f.secao(os.exigeEnsaioSeguranca ? 'Medições e ensaio de segurança elétrica' : 'Medições');
    f.tabela({
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
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 3) {
          if (d.cell.raw === 'Reprovado') d.cell.styles.textColor = COR.vermelho;
          if (d.cell.raw === 'Aprovado') d.cell.styles.textColor = COR.verde;
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // ---- Instrumentos de medição (rastreabilidade) ----
  if (os.instrumentosUsados?.length) {
    f.secao('Instrumentos de medição utilizados');
    f.tabela({
      head: [['Instrumento', 'Nº de série', 'Certificado', 'Laboratório', 'Validade']],
      body: os.instrumentosUsados.map((i) => [
        txt(i.descricao),
        txt(i.numeroSerie ?? '-'),
        txt(i.certificado ?? '-'),
        txt(i.laboratorio ?? '-'),
        fmtData(i.validade),
      ]),
    });
  }

  // ---- Serviço ----
  f.secao('Diagnóstico e serviço executado');
  f.paragrafo('Diagnóstico', os.diagnostico || '-');
  f.paragrafo('Serviço executado', os.servicoExecutado || '-');
  if (os.servicos?.length) {
    const qtd = (n: number) => String(n).replace('.', ',');
    f.paragrafo('Serviços realizados', os.servicos.map((x) => `${qtd(x.quantidade)}${x.unidade ? ` ${x.unidade}` : ''} x ${x.descricao}`).join('\n'));
  }
  if (os.pecas?.length) f.paragrafo('Peças substituídas', os.pecas.map((p) => `${p.quantidade} x ${p.descricao}`).join('\n'));
  f.paragrafo('Instrumentos (outros)', os.instrumentos);
  f.paragrafo('Observações', os.observacoes);
  f.y += 1;

  // ---- Exigências atendidas e próximos vencimentos ----
  const cumpridas = (os.exigencias ?? []).filter((e) => os.cumpre?.includes(e.codigo));
  if (cumpridas.length) {
    const base = os.fimEm?.toDate() ?? new Date();
    f.secao('Exigências atendidas neste atendimento');
    f.tabela({
      head: [['Exigência', 'Periodicidade', 'Próximo vencimento']],
      body: cumpridas.map((e) => [
        txt(e.descricao),
        `${e.periodicidadeMeses} meses`,
        os.status === 'concluida' ? somarMeses(base, e.periodicidadeMeses).toLocaleDateString('pt-BR') : 'na conclusão',
      ]),
    });
  }

  // ---- Situação final ----
  const liberado = os.liberado;
  f.faixa(
    liberado == null ? 'Situação do equipamento: não informada' : liberado ? 'EQUIPAMENTO LIBERADO PARA USO' : 'EQUIPAMENTO NÃO LIBERADO PARA USO',
    liberado === false ? COR.vermelho : COR.verde,
    liberado === false ? COR.vermelhoFundo : COR.verdeFundo,
  );

  // ---- Fotos ----
  f.galeria(`Registro fotográfico (${fotos.length})`, fotos);

  // ---- Assinaturas ----
  f.garantir(46);
  f.secao('Aceite');
  const yAss = f.y;
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

  // ---- Autenticidade: QR e código para conferir em /v/CODIGO ----
  if (os.codigoVerificacao) {
    f.y = yAss + 42;
    f.garantir(28);
    const url = urlVerificacao(os.codigoVerificacao);
    const qr = await QRCode.toDataURL(url, { margin: 0, width: 300, errorCorrectionLevel: 'M' });
    pdf.addImage(qr, 'PNG', M, f.y, 22, 22);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COR.primaria);
    pdf.text('Confira a autenticidade deste laudo', M + 26, f.y + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.2);
    pdf.setTextColor(...COR.suave);
    pdf.text(txt(`Leia o QR code ou acesse ${url.replace(/^https?:\/\//, '')}`), M + 26, f.y + 10.5, { maxWidth: L - 28 });
    pdf.setTextColor(0);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Código de verificação: ${formatarCodigo(os.codigoVerificacao)}`, M + 26, f.y + 16);
    pdf.setFont('helvetica', 'normal');
    f.y += 26;
  }

  f.rodape(empresa?.rodapeLaudo, `OS nº ${numeroOS(os.numero)}`);
  return f.arquivo(`OS-${numeroOS(os.numero)}.pdf`);
}

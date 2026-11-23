// PDFs de orçamento e fatura (carregados só quando usados).
import QRCode from 'qrcode';
import type { Empresa, Fatura, ItemValor, Orcamento } from '../tipos';
import { fmtData, fmtDataHora, fmtMoeda, fmtTelefone } from './formato';
import { COR, Folha, txt } from './pdfBase';
import { rotuloFormaPagamento } from '../dados/financeiro';

const n5 = (n: number) => String(n).padStart(5, '0');

function blocoCliente(f: Folha, c: { nome: string; documento?: string; endereco?: string; cidade?: string; telefone?: string }) {
  f.secao('Cliente');
  f.pares([
    ['Nome', c.nome],
    ['CNPJ/CPF', c.documento],
    ['Endereço', [c.endereco, c.cidade].filter(Boolean).join(' - ')],
    ['Telefone', fmtTelefone(c.telefone)],
  ]);
}

function blocoItens(f: Folha, itens: ItemValor[], totais: { totalServicos: number; totalPecas: number; desconto: number; total: number }) {
  f.secao('Itens');
  f.tabela({
    head: [['Tipo', 'Descrição', 'Qtd.', 'Valor unit.', 'Subtotal']],
    body: itens.map((i) => [
      i.tipo === 'servico' ? 'Serviço' : 'Peça',
      txt(i.codigo ? `${i.descricao} (cód. ${i.codigo})` : i.descricao),
      `${String(i.quantidade).replace('.', ',')}${i.unidade ? ` ${i.unidade}` : ''}`,
      fmtMoeda(i.valorUnitario),
      fmtMoeda(i.quantidade * i.valorUnitario),
    ]),
    columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 14, halign: 'right' }, 3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' } },
  });
  f.tabela({
    theme: 'plain',
    body: [
      ['Total de serviços', fmtMoeda(totais.totalServicos)],
      ['Total de peças', fmtMoeda(totais.totalPecas)],
      ...(totais.desconto ? [['Desconto', `- ${fmtMoeda(totais.desconto)}`]] : []),
    ],
    styles: { fontSize: 8.6, cellPadding: 0.9 },
    columnStyles: { 0: { halign: 'right', textColor: COR.suave, fontStyle: 'bold' }, 1: { halign: 'right', cellWidth: 34 } },
  });
  f.y -= 3;
  f.faixa(`TOTAL ${fmtMoeda(totais.total)}`, COR.faixaTexto, COR.faixa, 'right');
}

export async function gerarOrcamentoPDF(o: Orcamento, empresa: Empresa | null, linkPortal?: string): Promise<File> {
  const f = new Folha();
  f.cabecalho(empresa, ['ORÇAMENTO'], `Nº ${n5(o.numero)}`, `Emitido em ${fmtData(o.criadoEm)}`);
  if (o.status === 'rascunho') f.alerta('RASCUNHO - ainda não enviado ao cliente');
  if (o.status === 'cancelado') f.alerta('ORÇAMENTO CANCELADO');
  if (o.status === 'recusado') f.alerta(`RECUSADO pelo cliente em ${fmtDataHora(o.resposta?.em)}`);
  blocoCliente(f, o.cliente);
  f.secao('Equipamento');
  f.pares([
    ['Equipamento', o.equipamentoDescricao],
    ['Chamado', o.chamadoId ? `nº ${o.chamadoId}` : null],
  ]);
  blocoItens(f, o.itens, o);
  f.secao('Condições');
  f.paragrafo('Validade', o.validadeAte ? `Até ${fmtData(o.validadeAte)}` : 'Não informada');
  f.paragrafo('Prazo de execução', o.prazoExecucao);
  f.paragrafo('Pagamento', o.condicoesPagamento);
  f.paragrafo('Garantia', o.garantia);
  f.paragrafo('Observações', o.observacoes);
  f.y += 2;

  if (o.status === 'aprovado' && o.resposta) {
    f.faixa(`APROVADO por ${o.resposta.nome} em ${fmtDataHora(o.resposta.em)} (portal do cliente)`, COR.verde, COR.verdeFundo);
  } else if (o.status === 'enviado') {
    if (linkPortal) {
      f.garantir(10);
      f.pdf.setFontSize(9);
      f.pdf.text(txt(`Para aprovar pelo portal: ${linkPortal}`), f.M, f.y + 3);
      f.y += 8;
    }
    // Aceite em papel, para quem preferir assinar.
    f.garantir(26);
    f.secao('Aceite do cliente');
    f.pdf.setDrawColor(120);
    f.pdf.setLineWidth(0.3);
    f.pdf.line(f.M, f.y + 12, f.M + f.L / 2 - 4, f.y + 12);
    f.pdf.line(f.M + f.L / 2 + 4, f.y + 12, 210 - f.M, f.y + 12);
    f.pdf.setFontSize(8);
    f.pdf.setTextColor(...COR.suave);
    f.pdf.text('Nome e assinatura', f.M, f.y + 16);
    f.pdf.text('Data', f.M + f.L / 2 + 4, f.y + 16);
    f.pdf.setTextColor(0);
    f.y += 20;
  }
  f.rodape(undefined, `Orçamento nº ${n5(o.numero)}`);
  return f.arquivo(`Orcamento-${n5(o.numero)}.pdf`);
}

export async function gerarFaturaPDF(fat: Fatura, empresa: Empresa | null, pix: string | null): Promise<File> {
  const f = new Folha();
  f.cabecalho(empresa, ['FATURA'], `Nº ${n5(fat.numero)}`, `Emitida em ${fmtData(fat.emitidaEm)}`);
  if (fat.status === 'cancelada') f.alerta('FATURA CANCELADA');
  blocoCliente(f, fat.cliente);
  f.secao('Referência');
  f.pares([
    ['Descrição', fat.descricao],
    ['Orçamento', fat.orcamentoId ? `nº ${fat.orcamentoId}` : null],
    ['OS', fat.osIds?.length ? fat.osIds.map((x) => `nº ${x}`).join(', ') : null],
    ['Vencimento', fmtData(fat.vencimento)],
  ]);
  blocoItens(f, fat.itens, fat);
  if (fat.status === 'paga' && fat.pagamento) {
    f.faixa(
      `PAGA em ${fmtData(fat.pagamento.em)} · ${rotuloFormaPagamento[fat.pagamento.forma]} · ${fmtMoeda(fat.pagamento.valor)}`,
      COR.verde,
      COR.verdeFundo,
    );
  }
  if (fat.nfse || fat.nfe) {
    f.secao('Documentos fiscais');
    f.pares([
      ['NFS-e', fat.nfse ? `nº ${fat.nfse.numero}${fat.nfse.emitidaEm ? ` de ${fmtData(fat.nfse.emitidaEm)}` : ''}` : null],
      ['Chave NFS-e', fat.nfse?.chave],
      ['NF-e (peças)', fat.nfe ? `nº ${fat.nfe.numero}` : null],
      ['Chave NF-e', fat.nfe?.chave],
    ]);
  }
  if (pix && fat.status === 'aberta') {
    f.garantir(52);
    f.secao('Pagamento com Pix');
    const qr = await QRCode.toDataURL(pix, { margin: 1, width: 420, errorCorrectionLevel: 'M' });
    f.pdf.addImage(qr, 'PNG', f.M, f.y, 40, 40);
    f.pdf.setFontSize(8.5);
    f.pdf.text('Abra o app do banco, escolha Pix e leia o QR code', f.M + 45, f.y + 5);
    f.pdf.text('ou use o código "copia e cola":', f.M + 45, f.y + 9.5);
    f.pdf.setFont('courier', 'normal');
    f.pdf.setFontSize(7);
    const linhas = f.pdf.splitTextToSize(pix, f.L - 47) as string[];
    linhas.forEach((l, i) => f.pdf.text(l, f.M + 45, f.y + 15 + i * 3.2));
    f.pdf.setFont('helvetica', 'normal');
    f.y += 44;
  }
  f.garantir(10);
  f.pdf.setFontSize(7.5);
  f.pdf.setTextColor(...COR.suave);
  f.pdf.text('Documento de cobrança. Não substitui a nota fiscal.', f.M, f.y + 2);
  f.pdf.setTextColor(0);
  f.rodape(undefined, `Fatura nº ${n5(fat.numero)}`);
  return f.arquivo(`Fatura-${n5(fat.numero)}.pdf`);
}

// PDFs de orçamento e fatura (carregados só quando usados).
import QRCode from 'qrcode';
import type { Chamado, Cliente, Empresa, Fatura, Foto, ItemValor, Orcamento } from '../tipos';
import type { DadosVisa } from '../dados/visa';
import { situacaoDoEquipamento } from '../dados/visa';
import { rotuloSituacao, situacao } from '../dados/vencimentos';
import { fmtData, fmtDataHora, fmtMoeda, fmtTelefone, numeroOS, rotuloCriticidade, rotuloOrigem, rotuloStatusChamado, rotuloTipoOS } from './formato';
import { formatarCodigo } from './verificacao';
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

/** Comprovante do chamado: dados, relato, histórico e fotos enviadas. */
export function gerarChamadoPDF(c: Chamado, empresa: Empresa | null, cliente: Cliente | null, fotos: Foto[]): File {
  const f = new Folha();
  f.cabecalho(empresa, ['CHAMADO TÉCNICO'], `Nº ${c.numero}`, rotuloStatusChamado[c.status]);
  if (c.parado && c.status !== 'concluido' && c.status !== 'cancelado') f.alerta('Equipamento PARADO segundo o cliente.');
  blocoCliente(f, {
    nome: c.clienteNome,
    documento: cliente?.documento,
    endereco: cliente?.endereco,
    cidade: cliente?.cidade,
    telefone: cliente?.whatsapp || cliente?.telefone,
  });
  f.secao('Chamado');
  f.pares([
    ['Equipamento', c.equipamentoDescricao],
    ['Aberto em', `${fmtDataHora(c.abertoEm)} por ${c.abertoPor?.nome ?? '-'}`],
    ['Origem', rotuloOrigem[c.origem]],
    ['Equipamento parado', c.parado ? 'Sim' : 'Não'],
    ['Agendado para', c.agendadoPara ? fmtDataHora(c.agendadoPara) : 'A definir'],
    ['Ordem de serviço', c.osId ? `Nº ${n5(Number(c.osId))}` : '-'],
    ['Contato', c.contato],
  ]);
  f.paragrafo('Relato do cliente', c.relato);
  const historico = [...(c.historico ?? [])].sort((a, b) => a.em.toMillis() - b.em.toMillis());
  if (historico.length) {
    f.secao('Histórico');
    f.tabela({
      head: [['Data e hora', 'Situação', 'Por', 'Observação']],
      body: historico.map((h) => [fmtDataHora(h.em), txt(rotuloStatusChamado[h.status] ?? h.status), txt(h.por ?? ''), txt(h.obs ?? '')]),
      columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 34 }, 2: { cellWidth: 34 } },
    });
  }
  f.galeria(`Fotos enviadas (${fotos.length})`, fotos);
  f.rodape(undefined, `Chamado nº ${c.numero}`);
  return f.arquivo(`chamado-${c.numero}.pdf`);
}

/**
 * Pasta da Vigilância Sanitária: inventário, plano de manutenção (exigências e vencimentos),
 * histórico de atendimentos com o código de autenticidade de cada laudo e documentos do prestador.
 */
export function gerarDossieVisaPDF(d: DadosVisa, empresa: Empresa | null): File {
  const f = new Folha();
  const hoje = new Date();
  f.cabecalho(empresa, ['PASTA DA VIGILÂNCIA SANITÁRIA', 'Registro de manutenção'], hoje.toLocaleDateString('pt-BR'), `${d.equipamentos.length} equipamento(s)`);

  f.secao('Estabelecimento');
  f.pares([
    ['Nome', d.cliente.nome],
    ['CNPJ/CPF', d.cliente.documento],
    ['Endereço', [d.cliente.endereco, d.cliente.cidade].filter(Boolean).join(' - ')],
    ['Contato', d.cliente.contato],
  ]);

  f.secao('Prestador do serviço de manutenção');
  f.pares([
    ['Empresa', empresa?.nome],
    ['CNPJ/CPF', empresa?.documento],
    ['Responsável técnico', [empresa?.rtNome, empresa?.rtRegistro].filter(Boolean).join(' - ')],
    ['Contato', [empresa?.whatsapp && fmtTelefone(empresa.whatsapp), empresa?.email].filter(Boolean).join(' · ')],
  ]);
  const docs = empresa?.documentos ?? [];
  if (docs.length) {
    f.tabela({
      head: [['Documento do prestador', 'Número', 'Validade', 'Situação']],
      body: docs.map((x) => [
        txt(x.nome),
        txt(x.numero ?? ''),
        x.validade ? fmtData(x.validade) : '-',
        x.validade ? rotuloSituacao[situacao(x.validade)] : 'Sem validade',
      ]),
      columnStyles: { 1: { cellWidth: 40 }, 2: { cellWidth: 24 }, 3: { cellWidth: 28 } },
    });
  }

  f.secao('Inventário de equipamentos');
  if (!d.equipamentos.length) f.paragrafo('Equipamentos', 'Nenhum equipamento cadastrado.');
  else
    f.tabela({
      head: [['Equipamento', 'Série / patrimônio', 'Setor', 'Criticidade', 'Última manutenção', 'Situação']],
      body: d.equipamentos.map((e) => [
        txt([e.tipoNome, e.fabricante, e.modelo].filter(Boolean).join(' ')),
        txt([e.numeroSerie, e.patrimonio && `pat. ${e.patrimonio}`].filter(Boolean).join(' / ') || '-'),
        txt(e.setor ?? '-'),
        txt(rotuloCriticidade[e.criticidade]?.split(' (')[0] ?? '-'),
        e.ultimaVisitaEm ? `${fmtData(e.ultimaVisitaEm)}${e.ultimaOS ? ` (OS ${numeroOS(e.ultimaOS)})` : ''}` : '-',
        rotuloSituacao[situacaoDoEquipamento(e)],
      ]),
      columnStyles: { 3: { cellWidth: 20 }, 4: { cellWidth: 30 }, 5: { cellWidth: 24 } },
    });

  const plano = d.equipamentos.flatMap((e) =>
    Object.values(e.vencimentos ?? {}).map((v) => [
      txt([e.tipoNome, e.numeroSerie && `(${e.numeroSerie})`].filter(Boolean).join(' ')),
      txt(v.descricao),
      v.periodicidadeMeses ? `${v.periodicidadeMeses} meses` : '-',
      v.ultimo ? fmtData(v.ultimo) : '-',
      v.proximo ? fmtData(v.proximo) : '-',
      rotuloSituacao[situacao(v.proximo)],
    ]),
  );
  if (plano.length) {
    f.secao('Plano de manutenção e exigências periódicas');
    f.tabela({
      head: [['Equipamento', 'Exigência', 'Periodicidade', 'Último', 'Próximo', 'Situação']],
      body: plano,
      columnStyles: { 2: { cellWidth: 22 }, 3: { cellWidth: 20 }, 4: { cellWidth: 20 }, 5: { cellWidth: 24 } },
    });
  }

  const limite = new Date(hoje);
  limite.setMonth(limite.getMonth() - 24);
  const historico = d.ordens.filter((o) => (o.fimEm?.toMillis() ?? 0) >= limite.getTime());
  f.secao('Histórico de atendimentos (últimos 24 meses)');
  if (!historico.length) f.paragrafo('Atendimentos', 'Nenhum atendimento concluído no período.');
  else
    f.tabela({
      head: [['OS', 'Data', 'Equipamento', 'Tipo', 'Resultado', 'Código do laudo']],
      body: historico.map((o) => [
        numeroOS(o.numero),
        fmtData(o.fimEm),
        txt([o.equipamento.tipoNome, o.equipamento.numeroSerie && `(${o.equipamento.numeroSerie})`].filter(Boolean).join(' ')),
        txt(rotuloTipoOS[o.tipo] ?? o.tipo),
        o.liberado ? 'Liberado' : o.liberado === false ? 'Não liberado' : '-',
        o.codigoVerificacao ? formatarCodigo(o.codigoVerificacao) : '-',
      ]),
      columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 20 }, 4: { cellWidth: 22 }, 5: { cellWidth: 40 } },
    });

  const instrumentos = new Map<string, string[]>();
  for (const o of historico)
    for (const i of o.instrumentosUsados ?? [])
      instrumentos.set(i.id, [txt(i.descricao), txt(i.numeroSerie ?? '-'), txt(i.certificado ?? '-'), txt(i.laboratorio ?? '-'), i.validade ? fmtData(i.validade) : '-']);
  if (instrumentos.size) {
    f.secao('Instrumentos de medição utilizados (rastreabilidade RBC)');
    f.tabela({ head: [['Instrumento', 'Nº de série', 'Certificado', 'Laboratório', 'Validade']], body: [...instrumentos.values()] });
  }

  if (historico.some((o) => o.codigoVerificacao)) {
    f.paragrafo(
      'Autenticidade',
      `Cada laudo pode ser conferido em ${typeof location !== 'undefined' ? location.host : ''}/v, informando o código da tabela acima (ou lendo o QR code impresso no laudo).`,
    );
  }
  f.rodape(undefined, `Pasta da VISA - ${d.cliente.nome}`);
  return f.arquivo(`pasta-visa-${d.cliente.nome.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase().slice(0, 40)}.pdf`);
}

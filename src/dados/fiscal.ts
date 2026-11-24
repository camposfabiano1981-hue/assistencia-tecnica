// Notas fiscais pela Focus NFe. O app monta o pedido (NFS-e Nacional dos serviços, NF-e das peças),
// grava na fatura e avisa a ponte no Google Apps Script, que guarda o token do provedor e grava o resultado.
// Os padrões fiscais (código do serviço, CSOSN, CFOP, PIS/COFINS…) são configuráveis: o contador confere.
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Cliente, ConfigFiscal, Fatura, ItemValor, Peca, StatusEmissao } from '../tipos';

export type TipoNota = 'nfse' | 'nfe';

export const CONFIG_FISCAL_PADRAO: ConfigFiscal = {
  ativo: false,
  ambiente: 'homologacao',
  urlPonte: '',
  cnpj: '',
  inscricaoMunicipal: '',
  inscricaoEstadual: '',
  codigoMunicipio: '',
  uf: '',
  opcaoSimples: '3',
  nfse: { codigoTributacaoNacional: '140101', codigoTributacaoMunicipal: '', tributacaoIss: '1', retencaoIss: '1', descricaoComplementar: '', extras: '' },
  nfe: {
    naturezaOperacao: 'Venda de mercadoria',
    cfopInterno: '5102',
    cfopInterestadual: '6108',
    csosn: '102',
    origem: '0',
    pisCst: '07',
    cofinsCst: '07',
    formaPagamento: '17',
    consumidorFinal: '1',
    presencaComprador: '9',
    extras: '',
  },
};

export const rotuloStatusEmissao: Record<StatusEmissao, string> = {
  solicitada: 'Enviando…',
  processando: 'Aguardando autorização…',
  autorizada: 'Autorizada',
  erro: 'Recusada',
  cancelamento: 'Cancelando…',
  cancelada: 'Cancelada',
};

const so = (s?: string | null) => (s ?? '').replace(/\D/g, '');
const r2 = (n: number) => Math.round(n * 100) / 100;
const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = (i: ItemValor) => `${String(i.quantidade).replace('.', ',')}${i.unidade ? ` ${i.unidade}` : ''} ×`;

/** Data e hora local com fuso: 2026-11-24T10:30:05-03:00 */
export function dataHoraComFuso(d: Date): string {
  const p = (n: number) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const fuso = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${fuso >= 0 ? '+' : '-'}${p(
    fuso / 60,
  )}:${p(fuso % 60)}`;
}

export function dataLocal(d: Date): string {
  return dataHoraComFuso(d).slice(0, 10);
}

/** Desconto da fatura repartido entre serviços e peças na proporção dos valores. */
export function repartirDesconto(f: Pick<Fatura, 'totalServicos' | 'totalPecas' | 'desconto'>): { servicos: number; pecas: number } {
  const base = f.totalServicos + f.totalPecas;
  if (!f.desconto || base <= 0) return { servicos: 0, pecas: 0 };
  const servicos = r2((f.desconto * f.totalServicos) / base);
  return { servicos, pecas: r2(f.desconto - servicos) };
}

/** Campos extras (JSON) definidos nas Configurações, repassados ao provedor. */
export function lerExtras(texto?: string): Record<string, unknown> {
  if (!texto?.trim()) return {};
  const o = JSON.parse(texto) as unknown;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Campos extras: use um objeto JSON, como {"campo": "valor"}.');
  return o as Record<string, unknown>;
}

function semVazios<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;
}

function pendenciasEmpresa(cfg: ConfigFiscal | undefined, tipo: TipoNota): string[] {
  if (!cfg?.ativo) return ['Emissão automática desligada (Configurações → Notas fiscais).'];
  const p: string[] = [];
  if (so(cfg.cnpj).length !== 14) p.push('CNPJ da empresa (Configurações → Notas fiscais).');
  if (so(cfg.codigoMunicipio).length !== 7) p.push('Código IBGE do município da empresa.');
  if (!cfg.urlPonte.trim()) p.push('Endereço da ponte (Google Apps Script).');
  if (tipo === 'nfse' && !so(cfg.nfse.codigoTributacaoNacional)) p.push('Código de tributação nacional do serviço.');
  if (tipo === 'nfe') {
    if (!so(cfg.inscricaoEstadual)) p.push('Inscrição estadual da empresa (necessária para NF-e).');
    if (cfg.uf.trim().length !== 2) p.push('UF da empresa.');
  }
  try {
    lerExtras(tipo === 'nfse' ? cfg.nfse.extras : cfg.nfe.extras);
  } catch (e) {
    p.push((e as Error).message);
  }
  return p;
}

function pendenciasCliente(c: Cliente | null): string[] {
  if (!c) return ['Cadastro do cliente não encontrado.'];
  const d = so(c.documento);
  return d.length === 11 || d.length === 14 ? [] : ['CNPJ ou CPF do cliente (cadastro do cliente).'];
}

/** O que falta para emitir a NFS-e desta fatura (vazio = pode emitir). */
export function pendenciasNfse(f: Fatura, c: Cliente | null, cfg: ConfigFiscal | undefined): string[] {
  const p = [...pendenciasEmpresa(cfg, 'nfse'), ...pendenciasCliente(c)];
  if (f.totalServicos <= 0) p.push('A fatura não tem serviços.');
  return p;
}

/** O que falta para emitir a NF-e das peças desta fatura (vazio = pode emitir). */
export function pendenciasNfe(f: Fatura, c: Cliente | null, cfg: ConfigFiscal | undefined, pecas: Peca[]): string[] {
  const p = [...pendenciasEmpresa(cfg, 'nfe'), ...pendenciasCliente(c)];
  if (f.totalPecas <= 0) p.push('A fatura não tem peças.');
  if (c) {
    if (so(c.cep).length !== 8 || !c.logradouro?.trim() || !c.numero?.trim() || !c.bairro?.trim() || !c.municipio?.trim() || c.uf?.trim().length !== 2) {
      p.push('Endereço completo do cliente com CEP (cadastro do cliente → Endereço para notas fiscais).');
    }
    if (c.indicadorIE === '1' && !so(c.inscricaoEstadual)) p.push('Inscrição estadual do cliente (marcado como contribuinte do ICMS).');
  }
  for (const i of f.itens.filter((x) => x.tipo === 'peca')) {
    const peca = i.pecaId ? pecas.find((x) => x.id === i.pecaId) : undefined;
    if (!i.pecaId) p.push(`Peça "${i.descricao}" não está no estoque: cadastre-a com o NCM e refaça a fatura.`);
    else if (!peca) p.push(`Peça "${i.descricao}" não foi encontrada no estoque.`);
    else if (so(peca.ncm).length !== 8) p.push(`Peça "${i.descricao}" sem NCM de 8 dígitos (Estoque).`);
  }
  return p;
}

/** Corpo da NFS-e Nacional (Focus NFe, /v2/nfsen) com os serviços da fatura. */
export function montarNfse(f: Fatura, c: Cliente, cfg: ConfigFiscal, agora = new Date()): Record<string, unknown> {
  const d = so(c.documento);
  const desconto = repartirDesconto(f).servicos;
  const linhas = f.itens.filter((i) => i.tipo === 'servico').map((i) => `${qtd(i)} ${i.descricao}: ${moeda(r2(i.quantidade * i.valorUnitario))}`);
  const descricao = [`Fatura nº ${f.numero}.`, ...linhas, desconto ? `Desconto: ${moeda(desconto)}.` : '', cfg.nfse.descricaoComplementar?.trim() ?? '']
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
  return semVazios({
    data_emissao: dataHoraComFuso(agora),
    data_competencia: dataLocal(agora),
    codigo_municipio_emissora: so(cfg.codigoMunicipio),
    cnpj_prestador: so(cfg.cnpj),
    inscricao_municipal_prestador: so(cfg.inscricaoMunicipal),
    codigo_opcao_simples_nacional: cfg.opcaoSimples,
    [d.length === 14 ? 'cnpj_tomador' : 'cpf_tomador']: d,
    razao_social_tomador: c.nome.slice(0, 150),
    email_tomador: (c.emailNota || c.email || '').trim(),
    telefone_tomador: so(c.telefone || c.whatsapp),
    codigo_municipio_tomador: so(c.codigoMunicipio),
    cep_tomador: so(c.cep),
    logradouro_tomador: c.logradouro?.trim(),
    numero_tomador: c.numero?.trim(),
    complemento_tomador: c.complemento?.trim(),
    bairro_tomador: c.bairro?.trim(),
    // O serviço é prestado no endereço do cliente (local de incidência do ISS).
    codigo_municipio_prestacao: so(c.codigoMunicipio) || so(cfg.codigoMunicipio),
    codigo_tributacao_nacional_iss: so(cfg.nfse.codigoTributacaoNacional),
    codigo_tributacao_municipal_iss: cfg.nfse.codigoTributacaoMunicipal?.trim(),
    descricao_servico: descricao,
    valor_servico: r2(f.totalServicos - desconto),
    tributacao_iss: cfg.nfse.tributacaoIss,
    tipo_retencao_iss: cfg.nfse.retencaoIss,
    ...lerExtras(cfg.nfse.extras),
  });
}

/** Corpo da NF-e (Focus NFe, /v2/nfe) com as peças da fatura. */
export function montarNfe(f: Fatura, c: Cliente, cfg: ConfigFiscal, pecas: Peca[], agora = new Date()): Record<string, unknown> {
  const d = so(c.documento);
  const interestadual = !!c.uf && !!cfg.uf && c.uf.trim().toUpperCase() !== cfg.uf.trim().toUpperCase();
  const itens = f.itens.filter((i) => i.tipo === 'peca');
  const desconto = repartirDesconto(f).pecas;
  const brutoTotal = r2(itens.reduce((t, i) => t + i.quantidade * i.valorUnitario, 0));
  let resto = desconto;
  const items = itens.map((i, n) => {
    const peca = pecas.find((x) => x.id === i.pecaId);
    const bruto = r2(i.quantidade * i.valorUnitario);
    const desc = n === itens.length - 1 ? r2(resto) : brutoTotal ? r2((desconto * bruto) / brutoTotal) : 0;
    resto = r2(resto - desc);
    const unidade = (i.unidade || peca?.unidade || 'UN').trim().toUpperCase().slice(0, 6);
    return semVazios({
      numero_item: String(n + 1),
      codigo_produto: (peca?.codigo || peca?.id || `P${n + 1}`).slice(0, 60),
      descricao: i.descricao.slice(0, 120),
      cfop: interestadual ? cfg.nfe.cfopInterestadual : cfg.nfe.cfopInterno,
      codigo_ncm: so(peca?.ncm),
      unidade_comercial: unidade,
      quantidade_comercial: i.quantidade,
      valor_unitario_comercial: i.valorUnitario,
      unidade_tributavel: unidade,
      quantidade_tributavel: i.quantidade,
      valor_unitario_tributavel: i.valorUnitario,
      valor_bruto: bruto,
      valor_desconto: desc || undefined,
      icms_origem: cfg.nfe.origem,
      icms_situacao_tributaria: cfg.nfe.csosn,
      pis_situacao_tributaria: cfg.nfe.pisCst,
      cofins_situacao_tributaria: cfg.nfe.cofinsCst,
    });
  });
  const total = r2(brutoTotal - desconto);
  const simples = cfg.opcaoSimples !== '1';
  return semVazios({
    natureza_operacao: cfg.nfe.naturezaOperacao,
    data_emissao: dataHoraComFuso(agora),
    data_entrada_saida: dataHoraComFuso(agora),
    tipo_documento: '1',
    finalidade_emissao: '1',
    local_destino: interestadual ? '2' : '1',
    consumidor_final: cfg.nfe.consumidorFinal,
    presenca_comprador: cfg.nfe.presencaComprador,
    modalidade_frete: '9',
    cnpj_emitente: so(cfg.cnpj),
    nome_destinatario: c.nome.slice(0, 60),
    [d.length === 14 ? 'cnpj_destinatario' : 'cpf_destinatario']: d,
    indicador_inscricao_estadual_destinatario: c.indicadorIE ?? '9',
    inscricao_estadual_destinatario: c.indicadorIE === '1' ? so(c.inscricaoEstadual) : undefined,
    logradouro_destinatario: c.logradouro?.trim(),
    numero_destinatario: c.numero?.trim(),
    complemento_destinatario: c.complemento?.trim(),
    bairro_destinatario: c.bairro?.trim(),
    municipio_destinatario: c.municipio?.trim(),
    uf_destinatario: c.uf?.trim().toUpperCase(),
    cep_destinatario: so(c.cep),
    email_destinatario: (c.emailNota || c.email || '').trim(),
    telefone_destinatario: so(c.telefone || c.whatsapp),
    informacoes_adicionais_contribuinte: [
      `Fatura nº ${f.numero}.`,
      simples ? 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.' : '',
    ]
      .filter(Boolean)
      .join(' '),
    items,
    formas_pagamento: [{ forma_pagamento: cfg.nfe.formaPagamento, valor_pagamento: total }],
    ...lerExtras(cfg.nfe.extras),
  });
}

/** Referência única do pedido no provedor (uma por tentativa). */
export function refNota(faturaId: string, tipo: TipoNota, tentativa: number): string {
  return `fat${faturaId}-${tipo}-${tentativa}`;
}

/** Avisa a ponte para processar já (sem esperar a verificação de 5 minutos). Não carrega dados sensíveis. */
export async function avisarPonte(urlPonte: string, faturaId: string): Promise<boolean> {
  if (!urlPonte) return false;
  try {
    await fetch(urlPonte, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ faturaId }) });
    return true;
  } catch {
    return false;
  }
}

export async function solicitarEmissao(f: Fatura, tipo: TipoNota, payload: Record<string, unknown>, cfg: ConfigFiscal, por: string): Promise<void> {
  if (!navigator.onLine) throw new Error('Emitir nota precisa de internet.');
  const tentativa = (f.emissao?.[tipo]?.tentativa ?? 0) + 1;
  await updateDoc(doc(db, 'faturas', f.id), {
    [`emissao.${tipo}`]: {
      status: 'solicitada',
      ambiente: cfg.ambiente,
      ref: refNota(f.id, tipo, tentativa),
      tentativa,
      payload,
      solicitadaEm: serverTimestamp(),
      por,
      mensagem: null,
      numero: null,
      serie: null,
      chave: null,
      codigoVerificacao: null,
      urlPdf: null,
      urlXml: null,
      autorizadaEm: null,
      justificativa: null,
    },
    atualizadaEm: serverTimestamp(),
  });
  await avisarPonte(cfg.urlPonte, f.id);
}

export async function solicitarCancelamento(f: Fatura, tipo: TipoNota, justificativa: string, cfg: ConfigFiscal): Promise<void> {
  const texto = justificativa.trim();
  if (texto.length < 15) throw new Error('A justificativa do cancelamento precisa ter pelo menos 15 caracteres.');
  await updateDoc(doc(db, 'faturas', f.id), {
    [`emissao.${tipo}.status`]: 'cancelamento',
    [`emissao.${tipo}.justificativa`]: texto.slice(0, 255),
    atualizadaEm: serverTimestamp(),
  });
  await avisarPonte(cfg.urlPonte, f.id);
}

/** Confere se a ponte responde e quais tokens ela tem (nenhum token passa pelo app). */
export async function testarPonte(urlPonte: string): Promise<{ ok: boolean; versao?: string; projeto?: string | null; homologacao?: boolean; producao?: boolean }> {
  const r = await fetch(`${urlPonte}${urlPonte.includes('?') ? '&' : '?'}acao=ping`);
  if (!r.ok) throw new Error(`A ponte respondeu HTTP ${r.status}.`);
  return r.json();
}

// Orçamentos e faturas. Valores ficam separados em serviço × peça (NFS-e × NF-e; Anexo III × I no Simples).
import { Timestamp, arrayUnion, doc, runTransaction, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Empresa, Fatura, FormaPagamento, ItemValor, Orcamento, OrdemServico, SnapshotCliente, StatusOrcamento } from '../tipos';
import type { Tom } from '../util/formato';
import { gerarPix } from '../util/pix';
import { fimDoDia } from '../util/datas';
import { evento, limpo } from './operacoes';

export const novoIdItem = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);
const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function calcularTotais(itens: ItemValor[], desconto: number) {
  const soma = (tipo: ItemValor['tipo']) => r2(itens.filter((i) => i.tipo === tipo).reduce((s, i) => s + r2(i.quantidade * i.valorUnitario), 0));
  const totalServicos = soma('servico');
  const totalPecas = soma('peca');
  const descontoValido = r2(Math.min(Math.max(0, desconto || 0), totalServicos + totalPecas));
  return { totalServicos, totalPecas, desconto: descontoValido, total: r2(totalServicos + totalPecas - descontoValido) };
}

function itensLimpos(itens: ItemValor[]): ItemValor[] {
  return itens
    .filter((i) => i.descricao.trim())
    .map((i) =>
      limpo({
        id: i.id || novoIdItem(),
        tipo: i.tipo,
        descricao: i.descricao.trim().slice(0, 300),
        quantidade: Math.max(0, r2(i.quantidade)),
        valorUnitario: Math.max(0, r2(i.valorUnitario)),
        pecaId: i.pecaId ?? null,
        servicoId: i.servicoId ?? null,
        codigo: i.codigo?.trim(),
        unidade: i.unidade?.trim() || undefined,
      }) as ItemValor,
    );
}

export function snapshotCliente(c: { nome: string; documento?: string; endereco?: string; cidade?: string; telefone?: string; whatsapp?: string }): SnapshotCliente {
  return limpo({ nome: c.nome, documento: c.documento, endereco: c.endereco, cidade: c.cidade, telefone: c.telefone || c.whatsapp }) as SnapshotCliente;
}

// ---------------- Orçamentos ----------------

export interface DadosOrcamento {
  clienteId: string;
  cliente: SnapshotCliente;
  equipamentoId: string | null;
  equipamentoDescricao: string;
  chamadoId: string | null;
  osId: string | null;
  itens: ItemValor[];
  desconto: number;
  validadeAte: Date | null;
  prazoExecucao: string;
  condicoesPagamento: string;
  garantia: string;
  observacoes: string;
}

function camposOrcamento(d: DadosOrcamento) {
  const itens = itensLimpos(d.itens);
  return {
    clienteId: d.clienteId,
    cliente: d.cliente,
    equipamentoId: d.equipamentoId,
    equipamentoDescricao: d.equipamentoDescricao.slice(0, 300),
    chamadoId: d.chamadoId,
    osId: d.osId,
    itens,
    ...calcularTotais(itens, d.desconto),
    validadeAte: d.validadeAte ? Timestamp.fromDate(fimDoDia(d.validadeAte)) : null,
    prazoExecucao: d.prazoExecucao.trim(),
    condicoesPagamento: d.condicoesPagamento.trim(),
    garantia: d.garantia.trim(),
    observacoes: d.observacoes.trim(),
  };
}

export async function criarOrcamento(d: DadosOrcamento, autor: string): Promise<number> {
  const dados = {
    ...camposOrcamento(d),
    status: 'rascunho',
    criadoEm: serverTimestamp(),
    criadoPor: autor,
    enviadoEm: null,
    resposta: null,
    faturaId: null,
    atualizadoEm: serverTimestamp(),
  };
  const contador = doc(db, 'contadores', 'orcamentos');
  return runTransaction(db, async (tx) => {
    const atual = await tx.get(contador);
    const n = (atual.exists() ? (atual.data().n as number) : 0) + 1;
    tx.set(contador, { n });
    tx.set(doc(db, 'orcamentos', String(n)), { ...dados, numero: n });
    return n;
  });
}

export function atualizarOrcamento(id: string, d: DadosOrcamento) {
  return updateDoc(doc(db, 'orcamentos', id), { ...camposOrcamento(d), atualizadoEm: serverTimestamp() });
}

/** Envia ao cliente (aparece no portal para aprovação) e marca o chamado como aguardando aprovação. */
export function enviarOrcamento(o: Orcamento, autor: string) {
  const lote = writeBatch(db);
  lote.update(doc(db, 'orcamentos', o.id), { status: 'enviado', enviadoEm: serverTimestamp(), resposta: null, atualizadoEm: serverTimestamp() });
  if (o.chamadoId) {
    lote.update(doc(db, 'chamados', o.chamadoId), {
      status: 'aguardando',
      atualizadoEm: serverTimestamp(),
      historico: arrayUnion(evento('aguardando', autor, `Orçamento nº ${o.numero} enviado para aprovação`)),
    });
  }
  return lote.commit();
}

export function voltarParaRascunho(o: Orcamento) {
  return updateDoc(doc(db, 'orcamentos', o.id), { status: 'rascunho', resposta: null, atualizadoEm: serverTimestamp() });
}

export function cancelarOrcamento(o: Orcamento) {
  return updateDoc(doc(db, 'orcamentos', o.id), { status: 'cancelado', atualizadoEm: serverTimestamp() });
}

/** Resposta do cliente pelo portal. As regras só permitem mudar status e resposta. */
export function responderOrcamento(o: Orcamento, status: 'aprovado' | 'recusado', pessoa: { uid: string; nome: string }, motivo?: string) {
  const resposta: Record<string, unknown> = { status, nome: pessoa.nome.slice(0, 120), uid: pessoa.uid, em: serverTimestamp() };
  if (motivo?.trim()) resposta.motivo = motivo.trim().slice(0, 500);
  return updateDoc(doc(db, 'orcamentos', o.id), { status, resposta, atualizadoEm: serverTimestamp() });
}

/**
 * Itens da fatura a partir da OS: serviços e peças registrados nela, com os preços atuais da tabela de
 * serviços e do estoque. Sem serviço registrado, entra uma linha de mão de obra para preencher o valor.
 */
export function itensDaOS(
  os: Pick<OrdemServico, 'numero' | 'servicos' | 'pecas'>,
  precos: { servicos: Map<string, number>; pecas: Map<string, number> },
): ItemValor[] {
  const servicos: ItemValor[] = (os.servicos ?? []).map((s) => ({
    id: novoIdItem(),
    tipo: 'servico',
    descricao: s.descricao,
    quantidade: s.quantidade,
    valorUnitario: (s.servicoId && precos.servicos.get(s.servicoId)) || 0,
    servicoId: s.servicoId ?? null,
    ...(s.unidade ? { unidade: s.unidade } : {}),
  }));
  if (!servicos.length) {
    servicos.push({ id: novoIdItem(), tipo: 'servico', descricao: `Mão de obra técnica - OS ${String(os.numero).padStart(5, '0')}`, quantidade: 1, valorUnitario: 0 });
  }
  const pecas: ItemValor[] = (os.pecas ?? []).map((p) => ({
    id: novoIdItem(),
    tipo: 'peca',
    descricao: p.descricao,
    quantidade: p.quantidade,
    valorUnitario: (p.pecaId && precos.pecas.get(p.pecaId)) || 0,
    pecaId: p.pecaId ?? null,
  }));
  return [...servicos, ...pecas];
}

// ---------------- Faturas ----------------

export interface DadosFatura {
  clienteId: string;
  cliente: SnapshotCliente;
  descricao: string;
  orcamentoId: string | null;
  osIds: string[];
  itens: ItemValor[];
  desconto: number;
  vencimento: Date;
  observacoes: string;
}

export async function criarFatura(d: DadosFatura): Promise<number> {
  const itens = itensLimpos(d.itens);
  const contador = doc(db, 'contadores', 'faturas');
  return runTransaction(db, async (tx) => {
    const atual = await tx.get(contador);
    const n = (atual.exists() ? (atual.data().n as number) : 0) + 1;
    tx.set(contador, { n });
    tx.set(doc(db, 'faturas', String(n)), {
      numero: n,
      status: 'aberta',
      clienteId: d.clienteId,
      cliente: d.cliente,
      descricao: d.descricao.trim().slice(0, 300),
      orcamentoId: d.orcamentoId,
      osIds: d.osIds,
      itens,
      ...calcularTotais(itens, d.desconto),
      emitidaEm: serverTimestamp(),
      vencimento: Timestamp.fromDate(fimDoDia(d.vencimento)),
      pixTxid: `FAT${n}`,
      observacoes: d.observacoes.trim(),
      pagamento: null,
      nfse: null,
      nfe: null,
      atualizadaEm: serverTimestamp(),
    });
    if (d.orcamentoId) tx.update(doc(db, 'orcamentos', d.orcamentoId), { faturaId: String(n), atualizadoEm: serverTimestamp() });
    return n;
  });
}

export function registrarPagamento(f: Fatura, p: { em: Date; valor: number; forma: FormaPagamento; obs?: string }) {
  return updateDoc(doc(db, 'faturas', f.id), {
    status: 'paga',
    pagamento: limpo({ em: Timestamp.fromDate(p.em), valor: r2(p.valor), forma: p.forma, obs: p.obs?.trim() }),
    atualizadaEm: serverTimestamp(),
  });
}

export function desfazerPagamento(f: Fatura) {
  return updateDoc(doc(db, 'faturas', f.id), { status: 'aberta', pagamento: null, atualizadaEm: serverTimestamp() });
}

export function registrarNotas(f: Fatura, notas: { nfse?: { numero: string; emitidaEm: Date | null; chave?: string } | null; nfe?: { numero: string; chave?: string } | null }) {
  const campos: Record<string, unknown> = { atualizadaEm: serverTimestamp() };
  if (notas.nfse !== undefined) {
    campos.nfse = notas.nfse?.numero.trim()
      ? limpo({ numero: notas.nfse.numero.trim(), emitidaEm: notas.nfse.emitidaEm ? Timestamp.fromDate(notas.nfse.emitidaEm) : null, chave: notas.nfse.chave?.trim() })
      : null;
  }
  if (notas.nfe !== undefined) {
    campos.nfe = notas.nfe?.numero.trim() ? limpo({ numero: notas.nfe.numero.trim(), chave: notas.nfe.chave?.trim() }) : null;
  }
  return updateDoc(doc(db, 'faturas', f.id), campos);
}

export function cancelarFatura(f: Fatura, motivo: string) {
  const obs = [f.observacoes, `Cancelada: ${motivo.trim()}`].filter(Boolean).join('\n');
  return updateDoc(doc(db, 'faturas', f.id), { status: 'cancelada', observacoes: obs, atualizadaEm: serverTimestamp() });
}

/** Pix copia e cola da cobrança; null se a chave Pix não estiver configurada. */
export function pixDaCobranca(empresa: Empresa | null, valor: number, txid: string, descricao?: string): string | null {
  if (!empresa?.pixChave) return null;
  try {
    return gerarPix({
      chave: empresa.pixChave,
      tipoChave: empresa.pixTipo,
      nome: empresa.pixNome || empresa.nome,
      cidade: empresa.pixCidade || (empresa.cidade ?? '').split(/[-/]/)[0] || 'BRASIL',
      valor,
      txid,
      descricao,
    });
  } catch {
    return null;
  }
}

export const rotuloFormaPagamento: Record<FormaPagamento, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  outro: 'Outro',
};

// ---------------- Rótulos e situação ----------------


export const rotuloStatusOrcamento: Record<StatusOrcamento, string> = {
  rascunho: 'Rascunho',
  enviado: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
};

export const tomStatusOrcamento: Record<StatusOrcamento, Tom> = {
  rascunho: 'neutro',
  enviado: 'alerta',
  aprovado: 'sucesso',
  recusado: 'perigo',
  cancelado: 'neutro',
};

export type SituacaoFatura = 'aberta' | 'vencida' | 'paga' | 'cancelada';

export function situacaoFatura(f: Pick<Fatura, 'status' | 'vencimento'>): SituacaoFatura {
  if (f.status === 'paga' || f.status === 'cancelada') return f.status;
  return f.vencimento && f.vencimento.toMillis() < Date.now() ? 'vencida' : 'aberta';
}

export const rotuloSituacaoFatura: Record<SituacaoFatura, string> = {
  aberta: 'Em aberto',
  vencida: 'Vencida',
  paga: 'Paga',
  cancelada: 'Cancelada',
};

export const tomSituacaoFatura: Record<SituacaoFatura, Tom> = {
  aberta: 'info',
  vencida: 'perigo',
  paga: 'sucesso',
  cancelada: 'neutro',
};

export const EMISSOR_NACIONAL_NFSE = 'https://www.nfse.gov.br/EmissorNacional';

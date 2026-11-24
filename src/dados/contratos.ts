// Contratos de manutenção: valor mensal fixo ou por equipamento, faturas do mês e prazo de atendimento.
import { Timestamp, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Contrato, ItemValor, StatusContrato } from '../tipos';
import { criarFatura, novoIdItem } from './financeiro';
import { limpo } from './operacoes';

export const OBJETO_PADRAO =
  'Manutenção preventiva e corretiva dos equipamentos relacionados neste contrato, com laudo técnico a cada atendimento e registros disponíveis no portal do cliente.';
export const PRAZOS_HORAS = [4, 8, 24, 48, 72];

export const rotuloStatusContrato: Record<StatusContrato, string> = { ativo: 'Ativo', suspenso: 'Suspenso', encerrado: 'Encerrado' };

export type DadosContrato = Omit<Contrato, 'id' | 'numero' | 'status' | 'ultimaCompetencia' | 'criadoEm' | 'criadoPor' | 'atualizadoEm'>;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Valor cobrado por mês: o fixo, ou o valor por equipamento vezes os equipamentos cobertos. */
export function valorMensal(c: Pick<Contrato, 'cobranca' | 'valor' | 'equipamentoIds'>): number {
  return r2(c.cobranca === 'mensal' ? c.valor : c.valor * c.equipamentoIds.length);
}

/** Competência no formato AAAA-MM (mês local). */
export function competenciaDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-11" -> "11/2026" */
export function rotuloCompetencia(c: string): string {
  const [a, m] = c.split('-');
  return `${m}/${a}`;
}

/** Deve gerar fatura nesta competência? Ativo, vigente em algum dia do mês e ainda não faturado. */
export function aFaturar(c: Pick<Contrato, 'status' | 'ultimaCompetencia' | 'inicio' | 'fim'>, competencia: string): boolean {
  if (c.status !== 'ativo') return false;
  if ((c.ultimaCompetencia ?? '') >= competencia) return false;
  const [a, m] = competencia.split('-').map(Number);
  const inicioMes = new Date(a, m - 1, 1).getTime();
  const fimMes = new Date(a, m, 1).getTime();
  if (c.inicio.toMillis() >= fimMes) return false;
  if (c.fim && c.fim.toMillis() < inicioMes) return false;
  return true;
}

/** Vencimento da fatura do mês: o dia combinado; se esse dia já passou ou está muito perto, 3 dias a partir de hoje. */
export function vencimentoDaCompetencia(competencia: string, dia: number, hoje = new Date()): Date {
  const [a, m] = competencia.split('-').map(Number);
  const vencimento = new Date(a, m - 1, Math.min(Math.max(1, Math.round(dia) || 1), 28));
  const minimo = new Date(hoje);
  minimo.setHours(0, 0, 0, 0);
  minimo.setDate(minimo.getDate() + 3);
  return vencimento < minimo ? minimo : vencimento;
}

export function itensDoContrato(c: Pick<Contrato, 'numero' | 'cobranca' | 'valor' | 'equipamentoIds'>, competencia: string): ItemValor[] {
  const base = `Contrato de manutenção nº ${c.numero} - competência ${rotuloCompetencia(competencia)}`;
  return c.cobranca === 'mensal'
    ? [{ id: novoIdItem(), tipo: 'servico', descricao: base, quantidade: 1, valorUnitario: r2(c.valor), unidade: 'mês' }]
    : [{ id: novoIdItem(), tipo: 'servico', descricao: base, quantidade: c.equipamentoIds.length, valorUnitario: r2(c.valor), unidade: 'equipamento' }];
}

/** Contrato ativo que cobre o equipamento na data (o primeiro, se houver mais de um). */
export function contratoDoEquipamento(contratos: Contrato[], equipamentoId: string | null | undefined, em = new Date()): Contrato | null {
  if (!equipamentoId) return null;
  return (
    contratos.find(
      (c) =>
        c.status === 'ativo' &&
        c.equipamentoIds.includes(equipamentoId) &&
        c.inicio.toMillis() <= em.getTime() &&
        (!c.fim || c.fim.toMillis() >= em.getTime()),
    ) ?? null
  );
}

/** Prazo limite para iniciar o atendimento de um chamado coberto. */
export function prazoDoChamado(abertoEm: Date, horas: number): Date {
  return new Date(abertoEm.getTime() + horas * 3600000);
}

export async function criarContrato(d: DadosContrato, autor: string): Promise<number> {
  if (!navigator.onLine) throw new Error('Criar o contrato precisa de internet (para gerar o número).');
  const contador = doc(db, 'contadores', 'contratos');
  return runTransaction(db, async (tx) => {
    const atual = await tx.get(contador);
    const n = (atual.exists() ? (atual.data().n as number) : 0) + 1;
    tx.set(contador, { n });
    tx.set(
      doc(db, 'contratos', String(n)),
      limpo({
        ...d,
        valor: r2(d.valor),
        numero: n,
        status: 'ativo',
        ultimaCompetencia: null,
        criadoEm: serverTimestamp(),
        criadoPor: autor,
        atualizadoEm: serverTimestamp(),
      }),
    );
    return n;
  });
}

export function atualizarContrato(id: string, d: DadosContrato) {
  return updateDoc(doc(db, 'contratos', id), limpo({ ...d, valor: r2(d.valor), atualizadoEm: serverTimestamp() }));
}

export function mudarStatusContrato(id: string, status: StatusContrato) {
  return updateDoc(doc(db, 'contratos', id), { status, atualizadoEm: serverTimestamp() });
}

/** Gera a fatura da competência e marca o contrato como faturado, na mesma transação. */
export function gerarFaturaDoContrato(c: Contrato, competencia: string): Promise<number> {
  return criarFatura({
    clienteId: c.clienteId,
    cliente: c.cliente,
    descricao: `Contrato nº ${c.numero} - manutenção ${rotuloCompetencia(competencia)}`,
    orcamentoId: null,
    osIds: [],
    itens: itensDoContrato(c, competencia),
    desconto: 0,
    vencimento: vencimentoDaCompetencia(competencia, c.diaVencimento),
    observacoes: '',
    contratoId: c.id,
    competencia,
  });
}

/** Data de hoje + n dias, como Timestamp (atalho para os formulários). */
export function tsDe(d: Date | null): Timestamp | null {
  return d ? Timestamp.fromDate(d) : null;
}

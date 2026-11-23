// Preventivas e exigências periódicas (ensaio NBR IEC 62353, qualificação térmica, testes de raio-X…).
import { Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Exigencia, TipoEquipamento, Vencimento } from '../tipos';
import { diasAte } from '../util/datas';

export const CODIGO_PREVENTIVA = 'preventiva';

/** Exigências de um tipo: a preventiva (pela periodicidade) mais as extras cadastradas. */
export function exigenciasDoTipo(tipo: Pick<TipoEquipamento, 'periodicidadeMeses' | 'exigencias'> | null | undefined): Exigencia[] {
  if (!tipo) return [];
  const lista: Exigencia[] = [];
  if (tipo.periodicidadeMeses && tipo.periodicidadeMeses > 0) {
    lista.push({ codigo: CODIGO_PREVENTIVA, descricao: 'Manutenção preventiva', periodicidadeMeses: tipo.periodicidadeMeses });
  }
  for (const e of tipo.exigencias ?? []) {
    if (e.codigo !== CODIGO_PREVENTIVA && e.periodicidadeMeses > 0) lista.push(e);
  }
  return lista;
}

export function menorVencimento(mapa?: Record<string, Vencimento> | null): Timestamp | null {
  let menor: Timestamp | null = null;
  for (const v of Object.values(mapa ?? {})) {
    if (v?.proximo && (!menor || v.proximo.toMillis() < menor.toMillis())) menor = v.proximo;
  }
  return menor;
}

export type Situacao = 'vencido' | 'proximo' | 'em-dia' | 'sem-data';

export function situacao(proximo?: Timestamp | null, janelaDias = 30): Situacao {
  if (!proximo) return 'sem-data';
  const d = diasAte(proximo.toDate());
  if (d < 0) return 'vencido';
  if (d <= janelaDias) return 'proximo';
  return 'em-dia';
}

export const rotuloSituacao: Record<Situacao, string> = {
  vencido: 'Vencido',
  proximo: 'Vence em breve',
  'em-dia': 'Em dia',
  'sem-data': 'Sem data',
};

/** Grava o mapa completo de vencimentos e recalcula a menor data (usada nas consultas). */
export function salvarVencimentos(equipamentoId: string, mapa: Record<string, Vencimento>) {
  return updateDoc(doc(db, 'equipamentos', equipamentoId), { vencimentos: mapa, proximoVencimento: menorVencimento(mapa) });
}

/** "Qualificação térmica (RDC 15)" -> "qualificacao-termica-rdc-15" */
export function codigoDe(descricao: string): string {
  return (
    descricao
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || `exigencia-${Date.now()}`
  );
}

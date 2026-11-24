// Pasta da Vigilância Sanitária: dados do cliente, equipamentos e laudos para o dossiê.
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Cliente, Equipamento, OrdemServico, Vencimento } from '../tipos';
import { situacao, type Situacao } from './vencimentos';

export interface DadosVisa {
  cliente: Cliente;
  equipamentos: Equipamento[];
  ordens: OrdemServico[];
}

/** Lê tudo o que o dossiê precisa. Funciona para a equipe e para o próprio cliente (regras). */
export async function carregarDadosVisa(clienteId: string): Promise<DadosVisa> {
  const [c, eqs, oss] = await Promise.all([
    getDoc(doc(db, 'clientes', clienteId)),
    getDocs(query(collection(db, 'equipamentos'), where('clienteId', '==', clienteId))),
    getDocs(query(collection(db, 'os'), where('clienteId', '==', clienteId), where('status', '==', 'concluida'))),
  ]);
  if (!c.exists()) throw new Error('Cliente não encontrado.');
  return {
    cliente: { id: c.id, ...c.data() } as Cliente,
    equipamentos: eqs.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Equipamento)
      .filter((e) => e.ativo !== false)
      .sort((a, b) => a.tipoNome.localeCompare(b.tipoNome, 'pt-BR') || (a.setor ?? '').localeCompare(b.setor ?? '', 'pt-BR')),
    ordens: oss.docs.map((d) => ({ id: d.id, ...d.data() }) as OrdemServico).sort((a, b) => (b.fimEm?.toMillis() ?? 0) - (a.fimEm?.toMillis() ?? 0)),
  };
}

const GRAVIDADE: Record<Situacao, number> = { vencido: 3, proximo: 2, 'sem-data': 1, 'em-dia': 0 };

/** Pior situação entre as exigências do equipamento (o que a fiscalização vai olhar primeiro). */
export function situacaoDoEquipamento(e: Pick<Equipamento, 'vencimentos'>): Situacao {
  const lista = Object.values(e.vencimentos ?? {});
  if (!lista.length) return 'sem-data';
  return lista.map((v: Vencimento) => situacao(v.proximo)).sort((a, b) => GRAVIDADE[b] - GRAVIDADE[a])[0];
}

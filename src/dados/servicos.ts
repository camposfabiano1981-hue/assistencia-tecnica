// Catálogo de serviços (tabela de preços) usado no orçamento, na fatura e na OS.
import { collection, doc, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { ServicoCatalogo } from '../tipos';
import { normalizar } from '../util/formato';
import { useConsulta } from './hooks';

export const UNIDADES_SERVICO = ['serviço', 'hora', 'visita', 'km', 'equipamento', 'mês'];

/** Ponto de partida: os nomes mais comuns, sem preço (cada empresa define o seu). */
export const SERVICOS_SUGERIDOS: Omit<ServicoCatalogo, 'id'>[] = [
  { descricao: 'Visita técnica', unidade: 'visita', preco: 0, ativo: true },
  { descricao: 'Hora técnica', unidade: 'hora', preco: 0, ativo: true },
  { descricao: 'Deslocamento', unidade: 'km', preco: 0, ativo: true },
  { descricao: 'Manutenção preventiva', unidade: 'equipamento', preco: 0, ativo: true },
  { descricao: 'Manutenção corretiva (mão de obra)', unidade: 'serviço', preco: 0, ativo: true },
  { descricao: 'Instalação de equipamento', unidade: 'equipamento', preco: 0, ativo: true },
  { descricao: 'Ensaio de segurança elétrica (NBR IEC 62353)', unidade: 'equipamento', preco: 0, ativo: true },
  { descricao: 'Qualificação térmica de autoclave', unidade: 'equipamento', preco: 0, ativo: true },
  { descricao: 'Testes de constância do raio-X', unidade: 'equipamento', preco: 0, ativo: true },
];

export function useCatalogoServicos() {
  return useConsulta<ServicoCatalogo>(() => query(collection(db, 'servicos'), orderBy('descricao')), []);
}

/** Serviços disponíveis para escolher (os desativados ficam fora). */
export function useServicosAtivos(): ServicoCatalogo[] {
  return useCatalogoServicos().itens.filter((s) => s.ativo !== false);
}

/** Inclui as sugestões que ainda não existem (pelo nome). Devolve quantas entraram. */
export async function incluirServicosSugeridos(existentes: ServicoCatalogo[]): Promise<number> {
  const nomes = new Set(existentes.map((s) => normalizar(s.descricao)));
  const novos = SERVICOS_SUGERIDOS.filter((s) => !nomes.has(normalizar(s.descricao)));
  if (!novos.length) return 0;
  const lote = writeBatch(db);
  for (const s of novos) lote.set(doc(collection(db, 'servicos')), { ...s, criadoEm: serverTimestamp() });
  await lote.commit();
  return novos.length;
}

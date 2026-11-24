// Cadastro de peças (com estoque) usado no orçamento, na fatura e na OS — no mesmo padrão da tabela de serviços.
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Peca } from '../tipos';
import { normalizar } from '../util/formato';

export const UNIDADES_PECA = ['un', 'pç', 'kit', 'par', 'jogo', 'm', 'cm', 'rolo', 'L', 'mL', 'kg', 'g', 'cx', 'pct'];

/** Ponto de partida: peças comuns em equipamentos odontológicos e hospitalares, sem preço e sem saldo. */
export const PECAS_SUGERIDAS: Omit<Peca, 'id'>[] = [
  { descricao: 'Fusível de vidro 5x20 mm', unidade: 'un' },
  { descricao: 'Lâmpada do refletor odontológico', unidade: 'un' },
  { descricao: 'Rolamento para caneta de alta rotação', unidade: 'un' },
  { descricao: 'Rotor (turbina) para caneta de alta rotação', unidade: 'un' },
  { descricao: 'Kit de anéis de vedação (O-ring)', unidade: 'kit' },
  { descricao: 'Mangueira de ar e água', unidade: 'm' },
  { descricao: 'Válvula solenoide', unidade: 'un' },
  { descricao: 'Filtro de ar do compressor', unidade: 'un' },
  { descricao: 'Borracha de vedação da porta da autoclave', unidade: 'un' },
  { descricao: 'Resistência da autoclave', unidade: 'un' },
  { descricao: 'Sensor de temperatura', unidade: 'un' },
  { descricao: 'Cabo de força', unidade: 'un' },
  { descricao: 'Bateria recarregável (monitor ou desfibrilador)', unidade: 'un' },
  { descricao: 'Sensor de oximetria (SpO2)', unidade: 'un' },
  { descricao: 'Manguito de pressão (braçadeira)', unidade: 'un' },
  { descricao: 'Cabo de paciente de ECG', unidade: 'un' },
].map((p) => ({ ...p, quantidade: 0, minimo: 0, custo: 0, preco: 0, ativo: true }));

/** Inclui as sugestões que ainda não existem (pelo nome). Devolve quantas entraram. */
export async function incluirPecasSugeridas(existentes: Pick<Peca, 'descricao'>[]): Promise<number> {
  const novas = pecasQueFaltam(existentes);
  if (!novas.length) return 0;
  const lote = writeBatch(db);
  for (const p of novas) lote.set(doc(collection(db, 'pecas')), { ...p, criadoEm: serverTimestamp() });
  await lote.commit();
  return novas.length;
}

export function pecasQueFaltam(existentes: Pick<Peca, 'descricao'>[]): Omit<Peca, 'id'>[] {
  const nomes = new Set(existentes.map((p) => normalizar(p.descricao)));
  return PECAS_SUGERIDAS.filter((p) => !nomes.has(normalizar(p.descricao)));
}

/** Peças que podem ser escolhidas no orçamento, na fatura e na OS (as desativadas ficam fora). */
export function pecasAtivas(lista: Peca[]): Peca[] {
  return lista.filter((p) => p.ativo !== false);
}

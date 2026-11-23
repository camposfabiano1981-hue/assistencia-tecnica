// Estoque de peças: cada entrada/saída fica registrada (kardex).
import { collection, doc, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

export function movimentarEstoque(
  pecaId: string,
  tipo: 'entrada' | 'saida' | 'ajuste',
  quantidade: number,
  por: string,
  extra: { osId?: string | null; obs?: string; novaQuantidade?: number } = {},
): Promise<void> {
  const lote = writeBatch(db);
  const ref = doc(db, 'pecas', pecaId);
  if (tipo === 'ajuste') lote.update(ref, { quantidade: extra.novaQuantidade ?? quantidade });
  else lote.update(ref, { quantidade: increment(tipo === 'entrada' ? quantidade : -quantidade) });
  lote.set(doc(collection(db, 'pecas', pecaId, 'movimentos')), {
    tipo,
    quantidade,
    osId: extra.osId ?? null,
    obs: extra.obs ?? '',
    em: serverTimestamp(),
    por,
  });
  return lote.commit();
}

// Avaliação do atendimento pelo cliente: nota de 1 a 5 e comentário, uma por OS concluída.
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { OrdemServico } from '../tipos';

export const ROTULO_NOTA = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente'];

export function avaliarAtendimento(os: OrdemServico, nota: number, comentario: string, pessoa: { uid: string; nome: string }) {
  const texto = comentario.trim().slice(0, 1000);
  return setDoc(doc(db, 'avaliacoes', os.id), {
    osId: os.id,
    osNumero: os.numero,
    chamadoId: os.chamadoId ?? null,
    clienteId: os.clienteId,
    clienteNome: os.cliente.nome,
    tecnicoId: os.tecnicoId,
    tecnicoNome: os.tecnicoNome,
    nota: Math.round(nota),
    ...(texto ? { comentario: texto } : {}),
    por: { uid: pessoa.uid, nome: pessoa.nome.slice(0, 120) },
    em: serverTimestamp(),
  });
}

/** Média das notas (uma casa decimal) ou null. */
export function mediaNotas(notas: number[]): number | null {
  return notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null;
}

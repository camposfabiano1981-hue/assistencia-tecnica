// Leitura em tempo real do Firestore com estado de carregamento e sincronização.
import { useEffect, useState, type DependencyList } from 'react';
import { doc, onSnapshot, type DocumentData, type Query } from 'firebase/firestore';
import { db } from '../firebase';

export interface EstadoDoc<T> {
  dados: T | null;
  carregando: boolean;
  erro: Error | null;
  /** true enquanto houver alteração gravada só no aparelho (ainda não enviada). */
  pendente: boolean;
}

export function useDocumento<T>(caminho: string | null): EstadoDoc<T> {
  const [estado, setEstado] = useState<EstadoDoc<T>>({ dados: null, carregando: !!caminho, erro: null, pendente: false });
  useEffect(() => {
    if (!caminho) {
      setEstado({ dados: null, carregando: false, erro: null, pendente: false });
      return;
    }
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    return onSnapshot(
      doc(db, caminho),
      { includeMetadataChanges: true },
      (snap) =>
        setEstado({
          dados: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null,
          carregando: false,
          erro: null,
          pendente: snap.metadata.hasPendingWrites,
        }),
      (erro) => setEstado({ dados: null, carregando: false, erro, pendente: false }),
    );
  }, [caminho]);
  return estado;
}

export interface EstadoLista<T> {
  itens: T[];
  carregando: boolean;
  erro: Error | null;
  pendente: boolean;
}

export function useConsulta<T>(criar: () => Query<DocumentData> | null, deps: DependencyList): EstadoLista<T> {
  const [estado, setEstado] = useState<EstadoLista<T>>({ itens: [], carregando: true, erro: null, pendente: false });
  useEffect(() => {
    const q = criar();
    if (!q) {
      setEstado({ itens: [], carregando: false, erro: null, pendente: false });
      return;
    }
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) =>
        setEstado({
          itens: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T),
          carregando: false,
          erro: null,
          pendente: snap.metadata.hasPendingWrites,
        }),
      (erro) => setEstado({ itens: [], carregando: false, erro, pendente: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return estado;
}

/** Converte erros do Firebase em mensagens legíveis. */
export function mensagemErro(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? '';
  const mapa: Record<string, string> = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Este e-mail já tem uma conta.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'permission-denied': 'Sem permissão para esta ação.',
    unavailable: 'Sem conexão. Tente de novo quando houver internet.',
    'failed-precondition': 'Esta ação precisa de internet.',
    'resource-exhausted': 'Limite diário do plano gratuito atingido. Tente amanhã.',
  };
  if (mapa[codigo]) return mapa[codigo];
  return e instanceof Error ? e.message : 'Erro inesperado.';
}

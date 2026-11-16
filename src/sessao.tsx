// Sessão: usuário logado, perfil (papel) e dados da empresa, em tempo real.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { clearIndexedDbPersistence, doc, onSnapshot, terminate } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Empresa, Usuario } from './tipos';

interface Sessao {
  usuario: User | null;
  perfil: Usuario | null;
  empresa: Empresa | null;
  carregando: boolean;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [authPronto, setAuthPronto] = useState(false);
  const [perfilPronto, setPerfilPronto] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUsuario(u);
        setAuthPronto(true);
        if (!u) {
          setPerfil(null);
          setPerfilPronto(true);
        } else {
          setPerfilPronto(false);
        }
      }),
    [],
  );

  useEffect(() => {
    if (!usuario) return;
    return onSnapshot(
      doc(db, 'usuarios', usuario.uid),
      (s) => {
        setPerfil(s.exists() ? ({ id: s.id, ...s.data() } as Usuario) : null);
        setPerfilPronto(true);
      },
      () => {
        setPerfil(null);
        setPerfilPronto(true);
      },
    );
  }, [usuario]);

  const ativo = !!perfil?.ativo;
  useEffect(() => {
    if (!ativo) {
      setEmpresa(null);
      return;
    }
    return onSnapshot(
      doc(db, 'config', 'empresa'),
      (s) => setEmpresa(s.exists() ? (s.data() as Empresa) : null),
      () => setEmpresa(null),
    );
  }, [ativo]);

  async function sair() {
    await signOut(auth);
    // Apaga a cópia local dos dados (importante em computador compartilhado — LGPD).
    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch {
      /* outra aba aberta: a cópia local é apagada no próximo acesso */
    }
    location.href = '/login';
  }

  const carregando = !authPronto || (!!usuario && !perfilPronto);
  return (
    <Contexto.Provider value={{ usuario, perfil, empresa, carregando, sair }}>{children}</Contexto.Provider>
  );
}

export function useSessao(): Sessao {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSessao fora do ProvedorSessao');
  return s;
}

export function useEquipe(): boolean {
  const { perfil } = useSessao();
  return !!perfil?.ativo && (perfil.papel === 'gestor' || perfil.papel === 'tecnico');
}

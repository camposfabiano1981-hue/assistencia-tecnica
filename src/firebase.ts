// Inicialização do Firebase.
// Produção: a configuração vem de /__/firebase/init.json (servido pelo próprio Firebase Hosting),
// então nada precisa ser copiado para o código. Desenvolvimento: usa os emuladores locais.
import { deleteApp, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  sendPasswordResetEmail,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

export const USA_EMULADOR = import.meta.env.DEV || import.meta.env.VITE_EMULADOR === '1';

const CONFIG_DEMO: FirebaseOptions = {
  apiKey: 'demo-chave',
  authDomain: 'demo-assistencia.firebaseapp.com',
  projectId: 'demo-assistencia',
  appId: 'demo-app',
};

const CHAVE_CONFIG = 'firebase-config';

export let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
let configAtual: FirebaseOptions;

async function obterConfig(): Promise<FirebaseOptions> {
  if (USA_EMULADOR) return CONFIG_DEMO;
  try {
    const resposta = await fetch('/__/firebase/init.json', { cache: 'no-store' });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const config = (await resposta.json()) as FirebaseOptions;
    localStorage.setItem(CHAVE_CONFIG, JSON.stringify(config));
    return config;
  } catch {
    // Sem internet: usa a configuração guardada no último acesso (modo offline do técnico).
    const salva = localStorage.getItem(CHAVE_CONFIG);
    if (salva) return JSON.parse(salva) as FirebaseOptions;
    throw new Error('Sem conexão para carregar o sistema. Conecte-se à internet e abra o app de novo.');
  }
}

export async function iniciarFirebase(): Promise<void> {
  configAtual = await obterConfig();
  app = initializeApp(configAtual);
  auth = getAuth(app);
  auth.languageCode = 'pt-BR';
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (USA_EMULADOR) {
    const host = location.hostname;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  }
}

/**
 * Cria a conta de login de outra pessoa (cliente ou técnico) sem derrubar a sessão do gestor.
 * Usa uma instância temporária do Firebase com sessão só em memória.
 */
export async function criarContaDeAcesso(email: string): Promise<string> {
  const temporario = initializeApp(configAtual, `conta-${Date.now()}`);
  try {
    const authTemp = initializeAuth(temporario, { persistence: inMemoryPersistence });
    if (USA_EMULADOR) {
      connectAuthEmulator(authTemp, `http://${location.hostname}:9099`, { disableWarnings: true });
    }
    const senhaProvisoria = `${crypto.randomUUID()}Aa1!`;
    const credencial = await createUserWithEmailAndPassword(authTemp, email, senhaProvisoria);
    await signOut(authTemp);
    return credencial.user.uid;
  } finally {
    await deleteApp(temporario);
  }
}

/**
 * Manda o e-mail para a pessoa criar/trocar a senha, com volta para o login do app.
 * Em endereços de prévia (domínio não autorizado no Firebase), manda sem o link de volta.
 */
export async function enviarEmailSenha(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email, { url: `${location.origin}/login` });
  } catch (e) {
    const codigo = (e as { code?: string }).code ?? '';
    if (codigo === 'auth/unauthorized-continue-uri' || codigo === 'auth/invalid-continue-uri') {
      await sendPasswordResetEmail(auth, email);
      return;
    }
    throw e;
  }
}

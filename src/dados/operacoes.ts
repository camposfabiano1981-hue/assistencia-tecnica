// Operações de escrita. As regras do Firestore validam tudo no servidor.
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  Bytes,
  Timestamp,
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, criarContaDeAcesso, db } from '../firebase';
import type {
  Chamado,
  Cliente,
  Empresa,
  Equipamento,
  Foto,
  ItemChecklist,
  Medicao,
  OrdemServico,
  OrigemChamado,
  Papel,
  StatusChamado,
  TipoEquipamento,
  TipoOS,
  Usuario,
} from '../tipos';
import { descreverEquipamento } from '../util/formato';

const evento = (status: StatusChamado, por: string, obs?: string) =>
  obs ? { status, em: Timestamp.now(), por, obs } : { status, em: Timestamp.now(), por };

// ---------------- Chamados ----------------

export interface NovoChamado {
  cliente: Pick<Cliente, 'id' | 'nome'>;
  equipamento: Equipamento | null;
  descricaoOutro?: string;
  relato: string;
  parado: boolean;
  origem: OrigemChamado;
  autor: { uid: string; nome: string };
  contato?: string;
}

/** Abre o chamado com número sequencial (precisa de internet) e envia as fotos. */
export async function criarChamado(entrada: NovoChamado, fotos: Uint8Array[]): Promise<number> {
  const contador = doc(db, 'contadores', 'chamados');
  const descricao = entrada.equipamento
    ? descreverEquipamento(entrada.equipamento)
    : `Outro: ${entrada.descricaoOutro?.trim() || 'não informado'}`;
  const dados: Record<string, unknown> = {
    clienteId: entrada.cliente.id,
    clienteNome: entrada.cliente.nome,
    equipamentoId: entrada.equipamento?.id ?? null,
    equipamentoDescricao: descricao.slice(0, 300),
    relato: entrada.relato.trim().slice(0, 4000),
    parado: entrada.parado,
    status: 'aberto',
    origem: entrada.origem,
    abertoPor: entrada.autor,
    abertoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    qtdFotos: Math.min(fotos.length, 3),
    historico: [evento('aberto', entrada.autor.nome)],
  };
  if (entrada.contato?.trim()) dados.contato = entrada.contato.trim().slice(0, 200);

  const numero = await runTransaction(db, async (tx) => {
    const atual = await tx.get(contador);
    const n = (atual.exists() ? (atual.data().n as number) : 0) + 1;
    tx.set(contador, { n });
    tx.set(doc(db, 'chamados', String(n)), { ...dados, numero: n });
    return n;
  });

  await Promise.all(
    fotos.slice(0, 3).map((f, i) =>
      setDoc(doc(db, 'chamados', String(numero), 'fotos', `f${i + 1}`), {
        imagem: Bytes.fromUint8Array(f),
        clienteId: entrada.cliente.id,
        criadoEm: serverTimestamp(),
      }),
    ),
  );
  return numero;
}

export function mudarStatusChamado(
  chamado: Pick<Chamado, 'id'>,
  status: StatusChamado,
  por: string,
  obs?: string,
  extra: Record<string, unknown> = {},
) {
  return updateDoc(doc(db, 'chamados', chamado.id), {
    status,
    atualizadoEm: serverTimestamp(),
    historico: arrayUnion(evento(status, por, obs)),
    ...extra,
  });
}

export function agendarChamado(chamado: Chamado, quando: Date, por: string) {
  const ts = Timestamp.fromDate(quando);
  const obs = `Agendado para ${quando.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
  const lote = writeBatch(db);
  lote.update(doc(db, 'chamados', chamado.id), {
    status: chamado.status === 'em_atendimento' ? 'em_atendimento' : 'agendado',
    agendadoPara: ts,
    atualizadoEm: serverTimestamp(),
    historico: arrayUnion(evento('agendado', por, obs)),
  });
  if (chamado.osId) lote.update(doc(db, 'os', chamado.osId), { agendadaPara: ts, atualizadaEm: serverTimestamp() });
  return lote.commit();
}

// ---------------- Ordens de serviço ----------------

export interface NovaOS {
  tipo: TipoOS;
  cliente: Cliente;
  equipamento: Equipamento | null;
  chamado: Chamado | null;
  tecnico: Usuario;
  agendadaPara: Date | null;
  relato?: string;
  autor: string;
}

/** Cria a OS com número sequencial, copiando checklist e medições do tipo do equipamento. */
export async function criarOS(e: NovaOS): Promise<number> {
  // O equipamento do chamado é buscado aqui mesmo: não depende de a tela já ter carregado a ficha.
  if (!e.equipamento && e.chamado?.equipamentoId) {
    const s = await getDoc(doc(db, 'equipamentos', e.chamado.equipamentoId));
    if (s.exists()) e = { ...e, equipamento: { id: s.id, ...s.data() } as Equipamento };
  }
  let checklist: Record<string, ItemChecklist> = {};
  let medicoes: Record<string, Medicao> = {};
  let exigeEnsaio = false;
  if (e.equipamento?.tipoId) {
    const t = await getDoc(doc(db, 'tiposEquipamento', e.equipamento.tipoId));
    if (t.exists()) {
      const tipo = t.data() as TipoEquipamento;
      checklist = Object.fromEntries(
        (tipo.checklist ?? []).map((i, ordem) => [i.id, { id: i.id, texto: i.texto, ordem, resultado: null }]),
      );
      medicoes = Object.fromEntries(
        (tipo.medicoes ?? []).map((m, ordem) => [m.id, { ...m, ordem, min: m.min ?? null, max: m.max ?? null, valor: null }]),
      );
      exigeEnsaio = !!tipo.exigeEnsaioSeguranca;
    }
  }
  const eq = e.equipamento;
  const dados = {
    tipo: e.tipo,
    status: 'aberta',
    chamadoId: e.chamado?.id ?? null,
    clienteId: e.cliente.id,
    cliente: limpo({
      nome: e.cliente.nome,
      documento: e.cliente.documento,
      endereco: e.cliente.endereco,
      cidade: e.cliente.cidade,
      telefone: e.cliente.telefone || e.cliente.whatsapp,
    }),
    equipamentoId: eq?.id ?? null,
    equipamento: eq
      ? limpo({
          tipoNome: eq.tipoNome,
          fabricante: eq.fabricante,
          modelo: eq.modelo,
          numeroSerie: eq.numeroSerie,
          patrimonio: eq.patrimonio,
          setor: eq.setor,
          registroAnvisa: eq.registroAnvisa,
        })
      : { tipoNome: e.chamado?.equipamentoDescricao ?? 'Equipamento não cadastrado' },
    tecnicoId: e.tecnico.id,
    tecnicoNome: e.tecnico.nome,
    tecnicoRegistro: e.tecnico.registroProfissional ?? '',
    relato: (e.relato ?? e.chamado?.relato ?? '').slice(0, 4000),
    agendadaPara: e.agendadaPara ? Timestamp.fromDate(e.agendadaPara) : (e.chamado?.agendadoPara ?? null),
    inicioEm: null,
    fimEm: null,
    checkin: null,
    checklist,
    medicoes,
    exigeEnsaioSeguranca: exigeEnsaio,
    diagnostico: '',
    servicoExecutado: '',
    pecas: [],
    instrumentos: '',
    observacoes: '',
    liberado: null,
    assinatura: null,
    qtdFotos: 0,
    criadaEm: serverTimestamp(),
    atualizadaEm: serverTimestamp(),
  };
  const contador = doc(db, 'contadores', 'os');
  return runTransaction(db, async (tx) => {
    const atual = await tx.get(contador);
    const n = (atual.exists() ? (atual.data().n as number) : 0) + 1;
    tx.set(contador, { n });
    tx.set(doc(db, 'os', String(n)), { ...dados, numero: n });
    if (e.chamado) {
      tx.update(doc(db, 'chamados', e.chamado.id), {
        osId: String(n),
        status: e.chamado.status === 'aberto' ? 'agendado' : e.chamado.status,
        atualizadoEm: serverTimestamp(),
        historico: arrayUnion(evento(e.chamado.status === 'aberto' ? 'agendado' : e.chamado.status, e.autor, `OS nº ${n} aberta`)),
      });
    }
    return n;
  });
}

/** Salva campos da OS. Funciona offline: a gravação fica no aparelho e sincroniza depois. */
export function salvarOS(osId: string, campos: Record<string, unknown>): void {
  void updateDoc(doc(db, 'os', osId), { ...campos, atualizadaEm: serverTimestamp() }).catch((e) =>
    console.error('Falha ao salvar OS', e),
  );
}

export function iniciarOS(os: OrdemServico, por: string, checkin: OrdemServico['checkin']): void {
  const lote = writeBatch(db);
  lote.update(doc(db, 'os', os.id), {
    status: 'em_execucao',
    inicioEm: serverTimestamp(),
    checkin: checkin ?? null,
    atualizadaEm: serverTimestamp(),
  });
  if (os.chamadoId) {
    lote.update(doc(db, 'chamados', os.chamadoId), {
      status: 'em_atendimento',
      atualizadoEm: serverTimestamp(),
      historico: arrayUnion(evento('em_atendimento', por, `Técnico ${os.tecnicoNome} iniciou o atendimento`)),
    });
  }
  void lote.commit().catch((e) => console.error('Falha ao iniciar OS', e));
}

export function adicionarFotoOS(os: OrdemServico, imagem: Uint8Array, etapa: Foto['etapa'], legenda = ''): void {
  void addDoc(collection(db, 'os', os.id, 'fotos'), {
    imagem: Bytes.fromUint8Array(imagem),
    etapa,
    legenda,
    clienteId: os.clienteId,
    criadoEm: serverTimestamp(),
  }).catch((e) => console.error('Falha ao enviar foto', e));
  salvarOS(os.id, { qtdFotos: increment(1) });
}

export function removerFotoOS(os: OrdemServico, fotoId: string): void {
  void deleteDoc(doc(db, 'os', os.id, 'fotos', fotoId)).catch((e) => console.error(e));
  salvarOS(os.id, { qtdFotos: increment(-1) });
}

/** Conclui com a assinatura do cliente; depois disso a OS fica somente leitura. */
export function concluirOS(
  os: OrdemServico,
  assinatura: { nome: string; documento?: string; png: Uint8Array },
  liberado: boolean,
  por: string,
): Promise<void> {
  const lote = writeBatch(db);
  const agora = Timestamp.now();
  lote.update(doc(db, 'os', os.id), {
    status: 'concluida',
    liberado,
    ...(os.inicioEm ? {} : { inicioEm: agora }),
    fimEm: agora,
    assinatura: limpo({
      nome: assinatura.nome.trim(),
      documento: assinatura.documento?.trim(),
      imagem: Bytes.fromUint8Array(assinatura.png),
      em: agora,
    }),
    atualizadaEm: serverTimestamp(),
  });
  if (os.chamadoId) {
    lote.update(doc(db, 'chamados', os.chamadoId), {
      status: 'concluido',
      atualizadoEm: serverTimestamp(),
      historico: arrayUnion(
        evento('concluido', por, liberado ? 'Atendimento concluído. Equipamento liberado para uso.' : 'Atendimento concluído. Equipamento NÃO liberado para uso.'),
      ),
    });
  }
  if (os.equipamentoId) {
    lote.update(doc(db, 'equipamentos', os.equipamentoId), { ultimaVisitaEm: agora, ultimaOS: os.numero });
  }
  return lote.commit();
}

export async function carregarFotos(caminhoColecao: string): Promise<Foto[]> {
  const snap = await getDocs(collection(db, caminhoColecao));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Foto)
    .sort((a, b) => (a.criadoEm?.toMillis() ?? 0) - (b.criadoEm?.toMillis() ?? 0));
}

// ---------------- Acessos ----------------

/**
 * Cria o login de um cliente ou técnico e manda o e-mail para a pessoa criar a própria senha.
 * O gestor continua logado.
 */
export async function criarAcesso(p: {
  nome: string;
  email: string;
  papel: Exclude<Papel, 'gestor'>;
  clienteId?: string;
  registroProfissional?: string;
  telefone?: string;
}): Promise<void> {
  const email = p.email.trim().toLowerCase();
  const uid = await criarContaDeAcesso(email);
  await setDoc(
    doc(db, 'usuarios', uid),
    limpo({
      nome: p.nome.trim(),
      email,
      papel: p.papel,
      clienteId: p.papel === 'cliente' ? p.clienteId : undefined,
      registroProfissional: p.registroProfissional?.trim(),
      telefone: p.telefone?.trim(),
      ativo: true,
      criadoEm: serverTimestamp(),
    }),
  );
  await sendPasswordResetEmail(auth, email, { url: `${location.origin}/login` });
}

export function reenviarConvite(email: string) {
  return sendPasswordResetEmail(auth, email, { url: `${location.origin}/login` });
}

export function definirAtivo(usuario: Usuario, ativo: boolean) {
  return updateDoc(doc(db, 'usuarios', usuario.id), {
    ativo,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
    ...(usuario.clienteId ? { clienteId: usuario.clienteId } : {}),
  });
}

// ---------------- Aviso por e-mail (Google Apps Script) ----------------

/** Dispara o e-mail de "novo chamado". Não bloqueia nem falha o fluxo se o aviso não estiver configurado. */
export function avisarNovoChamado(empresa: Empresa | null, c: { numero: number; cliente: string; equipamento: string; parado: boolean; relato: string }) {
  if (!empresa?.avisoUrl) return;
  const corpo = JSON.stringify({
    token: empresa.avisoToken ?? '',
    numero: c.numero,
    cliente: c.cliente,
    equipamento: c.equipamento,
    parado: c.parado,
    relato: c.relato.slice(0, 1500),
    link: `${location.origin}/interno/chamados/${c.numero}`,
  });
  void fetch(empresa.avisoUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: corpo,
  }).catch(() => undefined);
}

/** Remove campos vazios (o Firestore não aceita undefined). */
export function limpo<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;
}

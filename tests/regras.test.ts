// Testes das regras de segurança (rodam no emulador do Firestore).
// npm run test:regras
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Bytes,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-assistencia',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

async function semear(instalar = true) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    if (instalar) await setDoc(doc(db, 'config/instalacao'), { em: Timestamp.now() });
    await setDoc(doc(db, 'config/empresa'), { nome: 'Empresa Teste' });
    await setDoc(doc(db, 'usuarios/gestor'), { nome: 'Gestor', email: 'g@x.com', papel: 'gestor', ativo: true });
    await setDoc(doc(db, 'usuarios/tec'), { nome: 'Técnico', email: 't@x.com', papel: 'tecnico', ativo: true });
    await setDoc(doc(db, 'clientes/c1'), { nome: 'Clínica A', tipo: 'consultorio_odonto', ativo: true });
    await setDoc(doc(db, 'clientes/c2'), { nome: 'Clínica B', tipo: 'clinica', ativo: true });
    await setDoc(doc(db, 'usuarios/cli1'), { nome: 'Dra. Ana', email: 'a@x.com', papel: 'cliente', clienteId: 'c1', ativo: true });
    await setDoc(doc(db, 'usuarios/cli2'), { nome: 'Dr. Beto', email: 'b@x.com', papel: 'cliente', clienteId: 'c2', ativo: true });
    await setDoc(doc(db, 'usuarios/inativo'), { nome: 'Ex', email: 'x@x.com', papel: 'cliente', clienteId: 'c1', ativo: false });
    await setDoc(doc(db, 'equipamentos/e1'), { clienteId: 'c1', clienteNome: 'Clínica A', tipoId: 't1', tipoNome: 'Autoclave', criticidade: 'alta', ativo: true });
    await setDoc(doc(db, 'equipamentos/e2'), { clienteId: 'c2', clienteNome: 'Clínica B', tipoId: 't1', tipoNome: 'Autoclave', criticidade: 'alta', ativo: true });
  });
}

const fs = (uid: string): Firestore => env.authenticatedContext(uid).firestore() as unknown as Firestore;

function chamadoCliente(n: number, extra: Record<string, unknown> = {}) {
  return {
    numero: n,
    clienteId: 'c1',
    clienteNome: 'Clínica A',
    equipamentoId: 'e1',
    equipamentoDescricao: 'Autoclave',
    relato: 'Não liga',
    parado: true,
    status: 'aberto',
    origem: 'portal',
    abertoPor: { uid: 'cli1', nome: 'Dra. Ana' },
    abertoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    qtdFotos: 0,
    historico: [{ status: 'aberto', em: Timestamp.now(), por: 'Dra. Ana' }],
    ...extra,
  };
}

async function abrirChamado(db: Firestore, extra: Record<string, unknown> = {}) {
  const contador = doc(db, 'contadores/chamados');
  return runTransaction(db, async (tx) => {
    const c = await tx.get(contador);
    const n = (c.exists() ? (c.data().n as number) : 0) + 1;
    tx.set(contador, { n });
    tx.set(doc(db, 'chamados', String(n)), chamadoCliente(n, extra));
    return n;
  });
}

function osNova(n: number, extra: Record<string, unknown> = {}) {
  return {
    numero: n,
    tipo: 'corretiva',
    status: 'aberta',
    chamadoId: null,
    clienteId: 'c1',
    cliente: { nome: 'Clínica A' },
    equipamentoId: 'e1',
    equipamento: { tipoNome: 'Autoclave' },
    tecnicoId: 'tec',
    tecnicoNome: 'Técnico',
    checklist: [],
    medicoes: [],
    pecas: [],
    liberado: null,
    qtdFotos: 0,
    ...extra,
  };
}

async function criarOS(db: Firestore, extra: Record<string, unknown> = {}) {
  const contador = doc(db, 'contadores/os');
  return runTransaction(db, async (tx) => {
    const c = await tx.get(contador);
    const n = (c.exists() ? (c.data().n as number) : 0) + 1;
    tx.set(contador, { n });
    tx.set(doc(db, 'os', String(n)), osNova(n, extra));
    return n;
  });
}

describe('instalação (primeiro acesso)', () => {
  it('a primeira pessoa vira gestora e trava a instalação', async () => {
    await semear(false);
    const db = fs('dono');
    const lote = writeBatch(db);
    lote.set(doc(db, 'usuarios/dono'), { nome: 'Dono', email: 'd@x.com', papel: 'gestor', ativo: true });
    lote.set(doc(db, 'config/instalacao'), { em: serverTimestamp() });
    lote.set(doc(db, 'config/publico'), { nome: 'Empresa', whatsapp: '5567999999999' });
    await assertSucceeds(lote.commit());

    const intruso = fs('intruso');
    const lote2 = writeBatch(intruso);
    lote2.set(doc(intruso, 'usuarios/intruso'), { nome: 'Intruso', email: 'i@x.com', papel: 'gestor', ativo: true });
    lote2.set(doc(intruso, 'config/instalacao'), { em: serverTimestamp() });
    await assertFails(lote2.commit());
  });

  it('ninguém se promove a gestor depois de instalado', async () => {
    await semear(true);
    const db = fs('qualquer');
    await assertFails(setDoc(doc(db, 'usuarios/qualquer'), { nome: 'Q', email: 'q@x.com', papel: 'gestor', ativo: true }));
  });

  it('config pública é legível sem login e só aceita nome e WhatsApp', async () => {
    await semear(true);
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertSucceeds(getDoc(doc(anon, 'config/publico')));
    await assertFails(setDoc(doc(fs('gestor'), 'config/publico'), { nome: 'E', whatsapp: '55', extra: 1 }));
    await assertSucceeds(setDoc(doc(fs('gestor'), 'config/publico'), { nome: 'E', whatsapp: '55' }));
  });
});

describe('perfis e cadastros', () => {
  it('conta sem perfil ou inativa não lê nada', async () => {
    await semear();
    await assertFails(getDoc(doc(fs('desconhecido'), 'clientes/c1')));
    await assertFails(getDoc(doc(fs('inativo'), 'clientes/c1')));
    await assertFails(getDoc(doc(fs('desconhecido'), 'config/empresa')));
  });

  it('cliente lê só o próprio cadastro e os próprios equipamentos', async () => {
    await semear();
    const db = fs('cli1');
    await assertSucceeds(getDoc(doc(db, 'clientes/c1')));
    await assertFails(getDoc(doc(db, 'clientes/c2')));
    await assertSucceeds(getDocs(query(collection(db, 'equipamentos'), where('clienteId', '==', 'c1'))));
    await assertFails(getDocs(collection(db, 'equipamentos')));
    await assertFails(getDoc(doc(db, 'equipamentos/e2')));
    await assertFails(setDoc(doc(db, 'equipamentos/novo'), { clienteId: 'c1', tipoNome: 'X' }));
  });

  it('só o gestor cria usuários, e não consegue se desativar', async () => {
    await semear();
    await assertFails(setDoc(doc(fs('tec'), 'usuarios/novo'), { nome: 'N', email: 'n@x.com', papel: 'cliente', clienteId: 'c1', ativo: true }));
    await assertSucceeds(setDoc(doc(fs('gestor'), 'usuarios/novo'), { nome: 'N', email: 'n@x.com', papel: 'cliente', clienteId: 'c1', ativo: true }));
    await assertFails(setDoc(doc(fs('gestor'), 'usuarios/novo2'), { nome: 'N', email: 'n@x.com', papel: 'cliente', clienteId: 'nao-existe', ativo: true }));
    await assertFails(updateDoc(doc(fs('gestor'), 'usuarios/gestor'), { ativo: false }));
  });
});

describe('chamados', () => {
  it('cliente abre chamado com numeração sequencial', async () => {
    await semear();
    const db = fs('cli1');
    expect(await abrirChamado(db)).toBe(1);
    expect(await abrirChamado(db)).toBe(2);
    await assertSucceeds(getDocs(query(collection(db, 'chamados'), where('clienteId', '==', 'c1'))));
  });

  it('cliente não abre chamado em nome de outro, com status forjado ou equipamento alheio', async () => {
    await semear();
    const db = fs('cli1');
    await assertFails(abrirChamado(db, { clienteId: 'c2', clienteNome: 'Clínica B' }));
    await assertFails(abrirChamado(db, { status: 'concluido' }));
    await assertFails(abrirChamado(db, { equipamentoId: 'e2' }));
    await assertFails(abrirChamado(db, { clienteNome: 'Outro nome' }));
    await assertFails(abrirChamado(db, { qtdFotos: 9 }));
    await assertSucceeds(abrirChamado(db, { equipamentoId: null, equipamentoDescricao: 'Outro: compressor' }));
  });

  it('contador não pula números', async () => {
    await semear();
    const db = fs('cli1');
    const lote = writeBatch(db);
    lote.set(doc(db, 'contadores/chamados'), { n: 5 });
    lote.set(doc(db, 'chamados/5'), chamadoCliente(5));
    await assertFails(lote.commit());
  });

  it('cliente não lê chamado de outro cliente nem altera o próprio', async () => {
    await semear();
    await abrirChamado(fs('cli1'));
    await assertFails(getDoc(doc(fs('cli2'), 'chamados/1')));
    await assertFails(updateDoc(doc(fs('cli1'), 'chamados/1'), { status: 'concluido' }));
    await assertSucceeds(updateDoc(doc(fs('tec'), 'chamados/1'), { status: 'agendado' }));
  });

  it('fotos do chamado: até 3, com limite de tamanho', async () => {
    await semear();
    await abrirChamado(fs('cli1'));
    const db = fs('cli1');
    const pequena = Bytes.fromUint8Array(new Uint8Array(50_000));
    const grande = Bytes.fromUint8Array(new Uint8Array(500_000));
    await assertSucceeds(setDoc(doc(db, 'chamados/1/fotos/f1'), { imagem: pequena, clienteId: 'c1' }));
    await assertFails(setDoc(doc(db, 'chamados/1/fotos/f2'), { imagem: grande, clienteId: 'c1' }));
    await assertFails(setDoc(doc(db, 'chamados/1/fotos/f4'), { imagem: pequena, clienteId: 'c1' }));
    await assertFails(setDoc(doc(fs('cli2'), 'chamados/1/fotos/f2'), { imagem: pequena, clienteId: 'c1' }));
    await assertSucceeds(getDoc(doc(fs('tec'), 'chamados/1/fotos/f1')));
  });
});

describe('ordens de serviço', () => {
  it('cliente não cria OS; técnico cria e executa a própria', async () => {
    await semear();
    await assertFails(criarOS(fs('cli1')));
    expect(await criarOS(fs('tec'))).toBe(1);
    await assertSucceeds(updateDoc(doc(fs('tec'), 'os/1'), { status: 'em_execucao', diagnostico: 'Resistência queimada' }));
  });

  it('só conclui com assinatura e depois fica somente leitura', async () => {
    await semear();
    await criarOS(fs('tec'));
    const db = fs('tec');
    await assertFails(updateDoc(doc(db, 'os/1'), { status: 'concluida' }));
    await assertSucceeds(
      updateDoc(doc(db, 'os/1'), {
        status: 'concluida',
        liberado: true,
        assinatura: { nome: 'Dra. Ana', imagem: Bytes.fromUint8Array(new Uint8Array(2000)), em: Timestamp.now() },
      }),
    );
    await assertFails(updateDoc(doc(db, 'os/1'), { diagnostico: 'mudei depois' }));
    await assertFails(updateDoc(doc(fs('gestor'), 'os/1'), { diagnostico: 'mudei depois' }));
    await assertFails(setDoc(doc(db, 'os/1/fotos/x'), { imagem: Bytes.fromUint8Array(new Uint8Array(10)) }));
  });

  it('cliente lê só OS concluída do próprio cadastro', async () => {
    await semear();
    await criarOS(fs('tec'));
    await assertFails(getDoc(doc(fs('cli1'), 'os/1')));
    await updateDoc(doc(fs('tec'), 'os/1'), {
      status: 'concluida',
      liberado: true,
      assinatura: { nome: 'Dra. Ana', imagem: Bytes.fromUint8Array(new Uint8Array(2000)), em: Timestamp.now() },
    });
    await assertSucceeds(getDoc(doc(fs('cli1'), 'os/1')));
    await assertFails(getDoc(doc(fs('cli2'), 'os/1')));
    await assertSucceeds(
      getDocs(query(collection(fs('cli1'), 'os'), where('clienteId', '==', 'c1'), where('status', '==', 'concluida'))),
    );
  });

  it('técnico não edita OS de outro técnico; gestor edita', async () => {
    await semear();
    await criarOS(fs('gestor'), { tecnicoId: 'outro' });
    await assertFails(updateDoc(doc(fs('tec'), 'os/1'), { diagnostico: 'x' }));
    await assertSucceeds(updateDoc(doc(fs('gestor'), 'os/1'), { diagnostico: 'x' }));
  });
});

// ======================= Fase 2 =======================

function orcamentoBase(n: number, extra: Record<string, unknown> = {}) {
  return {
    numero: n,
    status: 'enviado',
    clienteId: 'c1',
    cliente: { nome: 'Clínica A' },
    equipamentoId: 'e1',
    equipamentoDescricao: 'Autoclave',
    chamadoId: null,
    osId: null,
    itens: [{ id: 'a', tipo: 'servico', descricao: 'Mão de obra', quantidade: 1, valorUnitario: 300 }],
    desconto: 0,
    totalServicos: 300,
    totalPecas: 0,
    total: 300,
    validadeAte: Timestamp.fromMillis(Date.now() + 7 * 86400000),
    resposta: null,
    ...extra,
  };
}

async function semearFase2() {
  await semear();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'orcamentos/1'), orcamentoBase(1));
    await setDoc(doc(db, 'orcamentos/2'), orcamentoBase(2, { status: 'rascunho' }));
    await setDoc(doc(db, 'orcamentos/3'), orcamentoBase(3, { validadeAte: Timestamp.fromMillis(Date.now() - 86400000) }));
    await setDoc(doc(db, 'orcamentos/4'), orcamentoBase(4, { clienteId: 'c2' }));
    await setDoc(doc(db, 'faturas/1'), { numero: 1, status: 'aberta', clienteId: 'c1', total: 300 });
    await setDoc(doc(db, 'pecas/p1'), { descricao: 'Guarnição', quantidade: 5, ativo: true });
  });
}

const resposta = (status: string, uid = 'cli1') => ({
  status,
  resposta: { status, nome: 'Dra. Ana', uid, em: serverTimestamp() },
  atualizadoEm: serverTimestamp(),
});

describe('orçamentos (Fase 2)', () => {
  it('cliente vê só orçamentos enviados do próprio cadastro', async () => {
    await semearFase2();
    const db = fs('cli1');
    await assertSucceeds(getDoc(doc(db, 'orcamentos/1')));
    await assertFails(getDoc(doc(db, 'orcamentos/2')));
    await assertFails(getDoc(doc(db, 'orcamentos/4')));
    await assertSucceeds(
      getDocs(query(collection(db, 'orcamentos'), where('clienteId', '==', 'c1'), where('status', 'in', ['enviado', 'aprovado', 'recusado']))),
    );
    await assertFails(getDocs(query(collection(db, 'orcamentos'), where('clienteId', '==', 'c1'))));
  });

  it('cliente aprova ou recusa, mas não altera valores', async () => {
    await semearFase2();
    const db = fs('cli1');
    await assertFails(updateDoc(doc(db, 'orcamentos/1'), { ...resposta('aprovado'), total: 1 }));
    await assertFails(updateDoc(doc(db, 'orcamentos/1'), resposta('aprovado', 'outra-pessoa')));
    await assertFails(updateDoc(doc(db, 'orcamentos/1'), { status: 'aprovado' }));
    await assertSucceeds(updateDoc(doc(db, 'orcamentos/1'), resposta('aprovado')));
    // Depois de respondido, não muda mais pelo cliente.
    await assertFails(updateDoc(doc(db, 'orcamentos/1'), resposta('recusado')));
  });

  it('cliente não responde rascunho, orçamento vencido ou de outro cliente', async () => {
    await semearFase2();
    await assertFails(updateDoc(doc(fs('cli1'), 'orcamentos/2'), resposta('aprovado')));
    await assertFails(updateDoc(doc(fs('cli1'), 'orcamentos/3'), resposta('aprovado')));
    await assertFails(updateDoc(doc(fs('cli1'), 'orcamentos/4'), resposta('aprovado')));
    await assertSucceeds(updateDoc(doc(fs('cli2'), 'orcamentos/4'), resposta('recusado', 'cli2')));
  });

  it('só a equipe cria orçamento, com numeração sequencial', async () => {
    await semear();
    const criar = (db: Firestore) =>
      runTransaction(db, async (tx) => {
        const c = await tx.get(doc(db, 'contadores/orcamentos'));
        const n = (c.exists() ? (c.data().n as number) : 0) + 1;
        tx.set(doc(db, 'contadores/orcamentos'), { n });
        tx.set(doc(db, 'orcamentos', String(n)), orcamentoBase(n, { status: 'rascunho' }));
        return n;
      });
    await assertFails(criar(fs('cli1')));
    expect(await criar(fs('tec'))).toBe(1);
    expect(await criar(fs('gestor'))).toBe(2);
  });
});

describe('faturas, instrumentos e estoque (Fase 2)', () => {
  it('cliente só lê a própria fatura e não altera', async () => {
    await semearFase2();
    await assertSucceeds(getDoc(doc(fs('cli1'), 'faturas/1')));
    await assertFails(getDoc(doc(fs('cli2'), 'faturas/1')));
    await assertFails(updateDoc(doc(fs('cli1'), 'faturas/1'), { status: 'paga' }));
    await assertSucceeds(updateDoc(doc(fs('tec'), 'faturas/1'), { status: 'paga' }));
  });

  it('estoque e instrumentos são só da equipe; movimentos não se alteram', async () => {
    await semearFase2();
    await assertFails(getDoc(doc(fs('cli1'), 'pecas/p1')));
    await assertFails(setDoc(doc(fs('cli1'), 'instrumentos/i1'), { descricao: 'X' }));
    await assertSucceeds(setDoc(doc(fs('tec'), 'instrumentos/i1'), { descricao: 'Analisador', ativo: true }));
    await assertSucceeds(setDoc(doc(fs('tec'), 'pecas/p1/movimentos/m1'), { tipo: 'saida', quantidade: 1 }));
    await assertFails(updateDoc(doc(fs('tec'), 'pecas/p1/movimentos/m1'), { quantidade: 0 }));
    await assertFails(deleteDoc(doc(fs('tec'), 'pecas/p1')));
    await assertSucceeds(deleteDoc(doc(fs('gestor'), 'pecas/p1')));
  });
});

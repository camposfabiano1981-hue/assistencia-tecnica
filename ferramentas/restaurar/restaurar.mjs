#!/usr/bin/env node
// Restaura a cópia de segurança (.json baixado em Mais → Backup e exportação) num projeto do Firebase.
//
//   node restaurar.mjs backup.json --projeto ID-DO-PROJETO --chave conta-de-servico.json            (só confere)
//   node restaurar.mjs backup.json --projeto ID-DO-PROJETO --chave conta-de-servico.json --gravar   (grava)
//
// Opções:
//   --somente clientes,equipamentos   restaura só essas coleções (com as subcoleções delas)
//   --chave arquivo.json              chave JSON de uma conta de serviço do projeto
//                                     (ou defina GOOGLE_APPLICATION_CREDENTIALS). Nos emuladores não precisa.
//
// Os documentos do backup sobrescrevem os de mesmo caminho. Documentos que não estão no backup ficam
// como estão. As contas de acesso (e-mail e senha) não fazem parte do backup: elas ficam no
// Firebase Authentication do projeto.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { GeoPoint, Timestamp, getFirestore } from 'firebase-admin/firestore';

const FORMATO = 'assistencia-tecnica/backup';
const LIMITE_GRATUITO = 20000; // gravações por dia no plano Spark

function lerArgumentos(argv) {
  const op = { arquivo: null, projeto: null, chave: null, gravar: false, somente: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--projeto') op.projeto = argv[++i];
    else if (a === '--chave') op.chave = argv[++i];
    else if (a === '--gravar') op.gravar = true;
    else if (a === '--somente') op.somente = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (!a.startsWith('--') && !op.arquivo) op.arquivo = a;
    else throw new Error(`Opção desconhecida: ${a}`);
  }
  if (!op.arquivo || !op.projeto) {
    throw new Error('Uso: node restaurar.mjs <backup.json> --projeto <id> [--chave conta.json] [--somente clientes,os] [--gravar]');
  }
  return op;
}

/** Desfaz a conversão do backup: {"$data"} -> Timestamp, {"$bytes"} -> bytes, {"$ref"} -> referência. */
function desserializar(v, db) {
  if (Array.isArray(v)) return v.map((x) => desserializar(x, db));
  if (v && typeof v === 'object') {
    const chaves = Object.keys(v);
    if (chaves.length === 1) {
      const [k] = chaves;
      if (k === '$data') return Timestamp.fromDate(new Date(v.$data));
      if (k === '$bytes') return Buffer.from(v.$bytes, 'base64');
      if (k === '$ref') return db.doc(v.$ref);
      if (k === '$geo') return new GeoPoint(v.$geo.lat, v.$geo.lng);
    }
    const saida = {};
    for (const [chave, x] of Object.entries(v)) saida[chave] = desserializar(x, db);
    return saida;
  }
  return v;
}

const grupo = (caminho) =>
  caminho
    .split('/')
    .filter((_, i) => i % 2 === 0)
    .join('/');

async function main() {
  const op = lerArgumentos(process.argv.slice(2));
  const backup = JSON.parse(readFileSync(op.arquivo, 'utf8'));
  if (backup?.formato !== FORMATO || typeof backup.documentos !== 'object') {
    throw new Error('Este arquivo não é uma cópia de segurança do sistema.');
  }
  if (backup.versao !== 1) throw new Error(`Versão de backup não suportada: ${backup.versao}`);

  let caminhos = Object.keys(backup.documentos);
  if (op.somente) caminhos = caminhos.filter((c) => op.somente.includes(c.split('/')[0]));
  const totais = {};
  for (const c of caminhos) totais[grupo(c)] = (totais[grupo(c)] ?? 0) + 1;

  const emulador = process.env.FIRESTORE_EMULATOR_HOST;
  console.log(`Cópia de ${new Date(backup.geradoEm).toLocaleString('pt-BR')} · origem: ${backup.projeto ?? '?'} · fotos: ${backup.incluiFotos ? 'sim' : 'não'}`);
  console.table(totais);
  console.log(`Destino: ${op.projeto}${emulador ? ` (emulador em ${emulador})` : ''} · ${caminhos.length} documento(s)`);
  if (caminhos.length > LIMITE_GRATUITO) {
    console.warn(`Atenção: o plano gratuito grava até ${LIMITE_GRATUITO} documentos por dia. Use --somente para dividir em dias.`);
  }
  if (!op.gravar) {
    console.log('\nNada foi gravado. Confira o resumo acima e repita o comando com --gravar.');
    return;
  }
  if (!emulador) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const resposta = await rl.question(`\nOs documentos acima vão SOBRESCREVER os de mesmo caminho em "${op.projeto}".\nDigite o ID do projeto para confirmar: `);
    rl.close();
    if (resposta.trim() !== op.projeto) {
      console.log('Cancelado. Nada foi gravado.');
      process.exitCode = 1;
      return;
    }
  }

  // No emulador não há credencial: evita a busca (inútil) pelo servidor de metadados do Google Cloud.
  if (emulador) process.env.METADATA_SERVER_DETECTION ??= 'none';
  const credencial = emulador ? undefined : op.chave ? cert(JSON.parse(readFileSync(op.chave, 'utf8'))) : applicationDefault();
  const app = initializeApp({ projectId: op.projeto, ...(credencial ? { credential: credencial } : {}) });
  const db = getFirestore(app);

  // BulkWriter divide em lotes, respeita o limite de tamanho por requisição e tenta de novo em falhas passageiras.
  const escritor = db.bulkWriter();
  const falhas = [];
  let gravados = 0;
  escritor.onWriteResult(() => {
    gravados++;
    if (gravados % 200 === 0) process.stdout.write(`\r${gravados}/${caminhos.length} gravados…`);
  });
  escritor.onWriteError((erro) => {
    if (erro.failedAttempts < 4) return true;
    falhas.push(`${erro.documentRef.path}: ${erro.message}`);
    return false;
  });
  for (const caminho of caminhos) {
    void escritor.set(db.doc(caminho), desserializar(backup.documentos[caminho], db)).catch(() => {});
  }
  await escritor.close();
  process.stdout.write('\r');
  console.log(`${gravados} documento(s) restaurado(s) em ${op.projeto}.`);
  if (falhas.length) {
    console.error(`${falhas.length} falha(s):\n${falhas.slice(0, 20).join('\n')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`Erro: ${e.message}`);
  process.exitCode = 1;
});

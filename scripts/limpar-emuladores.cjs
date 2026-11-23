// Apaga os dados dos emuladores locais (nunca toca no Firebase de verdade) antes do teste ponta a ponta.
const FS = 'http://127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';

(async () => {
  for (const projeto of ['demo-assistencia', 'demo-restaurado']) {
    const r = await fetch(`${FS}/emulator/v1/projects/${projeto}/databases/(default)/documents`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`Firestore (${projeto}): HTTP ${r.status}`);
  }
  const r = await fetch(`${AUTH}/emulator/v1/projects/demo-assistencia/accounts`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`Auth: HTTP ${r.status}`);
  console.log('Emuladores limpos.');
})().catch((e) => {
  console.error(`Não foi possível limpar os emuladores (estão rodando? npm run emuladores): ${e.message}`);
  process.exit(1);
});

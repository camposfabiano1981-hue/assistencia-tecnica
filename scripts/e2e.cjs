// Teste ponta a ponta no emulador: instalação → cliente → equipamento → acesso ao portal →
// chamado pelo celular do cliente → OS executada e assinada → laudo PDF baixado pelo cliente.
// Requer: emuladores (auth 9099, firestore 8080) e `vite` em http://localhost:5173.
// Uso: NODE_PATH=$(npm root -g) node scripts/e2e.cjs
const { chromium, devices } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const APP = process.env.APP_URL || 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const PROJETO = 'demo-assistencia';
const SAIDA = join(__dirname, '..', 'capturas');
mkdirSync(SAIDA, { recursive: true });

const GESTOR = { nome: 'Carlos Técnico', email: 'gestor@empresa.com', senha: 'SenhaForte123' };
const CLIENTE = { nome: 'Dra. Ana Souza', email: 'ana@clinicasorriso.com', senha: 'SenhaCliente1' };

let passo = 0;
const log = (m) => console.log(`[${String(++passo).padStart(2, '0')}] ${m}`);

async function definirSenhaPeloEmulador(email, senha) {
  const r = await fetch(`${AUTH}/emulator/v1/projects/${PROJETO}/oobCodes`);
  const { oobCodes } = await r.json();
  const codigo = oobCodes.filter((c) => c.email === email && c.requestType === 'PASSWORD_RESET').pop();
  if (!codigo) throw new Error(`Sem e-mail de senha para ${email}`);
  const r2 = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-chave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: codigo.oobCode, newPassword: senha }),
  });
  if (!r2.ok) throw new Error(`Falha ao definir senha: ${await r2.text()}`);
}

async function foto(navegador, caminho, cor, texto) {
  const p = await navegador.newPage({ viewport: { width: 1600, height: 1200 } });
  await p.setContent(`<body style="margin:0;background:linear-gradient(135deg,${cor},#222);display:grid;place-items:center;height:1200px;font:bold 90px sans-serif;color:#fff">${texto}</body>`);
  await p.screenshot({ path: caminho, type: 'jpeg', quality: 92 });
  await p.close();
}

async function entrar(pagina, email, senha) {
  await pagina.goto(`${APP}/login`);
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(senha);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
}

async function assinar(pagina) {
  const canvas = pagina.locator('canvas.assinatura');
  await canvas.scrollIntoViewIfNeeded();
  const caixa = await canvas.boundingBox();
  const { x, y, width: w, height: h } = caixa;
  await pagina.mouse.move(x + w * 0.12, y + h * 0.6);
  await pagina.mouse.down();
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    await pagina.mouse.move(x + w * (0.12 + 0.7 * t), y + h * (0.6 - 0.25 * Math.sin(t * Math.PI * 3)), { steps: 2 });
  }
  await pagina.mouse.up();
}

(async () => {
  const navegador = await chromium.launch();
  const fotoChamado = join(SAIDA, 'foto-chamado.jpg');
  const fotoOS = join(SAIDA, 'foto-os.jpg');
  await foto(navegador, fotoChamado, '#b3261e', 'ERRO E3 no visor');
  await foto(navegador, fotoOS, '#0e5a74', 'Guarnição trocada');

  // ---------- Gestor no computador ----------
  const ctxGestor = await navegador.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  const g = await ctxGestor.newPage();
  g.on('dialog', (d) => d.accept());
  g.on('pageerror', (e) => console.log('  [erro na página do gestor]', e.message));

  log('Primeiro acesso: configurar empresa e criar gestor');
  await g.goto(`${APP}/login`);
  await g.getByRole('link', { name: /Configure a empresa/ }).click();
  await g.getByLabel('Nome da empresa').fill('Odonto Hospitalar Assistência Técnica');
  await g.getByLabel('WhatsApp da empresa').fill('(11) 99876-5432');
  await g.getByLabel('Seu nome').fill(GESTOR.nome);
  await g.getByLabel('E-mail').fill(GESTOR.email);
  await g.getByLabel('Senha', { exact: true }).fill(GESTOR.senha);
  await g.getByLabel('Confirme a senha').fill(GESTOR.senha);
  await g.getByRole('button', { name: 'Concluir configuração' }).click();
  await g.waitForURL(`${APP}/interno`);
  await g.getByRole('heading', { name: /Olá, Carlos/ }).waitFor();

  log('Configurações: dados da empresa e responsável técnico');
  await g.goto(`${APP}/interno/config`);
  await g.getByLabel('CNPJ').fill('12.345.678/0001-90');
  await g.getByLabel('Responsável técnico').fill('Carlos Técnico');
  await g.getByLabel('Registro do RT (CFT/CREA)').fill('CFT nº 1234567');
  await g.getByLabel('Cidade / UF').fill('São Paulo - SP');
  await g.getByLabel('Texto de rodapé do laudo').fill('Garantia de 90 dias para o serviço executado.');
  await g.getByRole('button', { name: 'Salvar dados da empresa' }).click();
  await g.getByText('Dados da empresa salvos.').waitFor();

  log('Cadastrar cliente');
  await g.goto(`${APP}/interno/clientes/novo`);
  await g.getByLabel('Nome / razão social').fill('Clínica Sorriso Ltda');
  await g.getByLabel('CNPJ / CPF').fill('98.765.432/0001-10');
  await g.getByLabel('Responsável / contato').fill('Dra. Ana Souza');
  await g.getByLabel('WhatsApp').fill('(11) 91234-5678');
  await g.getByLabel('Endereço').fill('Rua das Flores, 100');
  await g.getByLabel('Cidade / UF').fill('São Paulo - SP');
  await g.getByRole('button', { name: 'Salvar cliente' }).click();
  await g.getByRole('heading', { name: 'Clínica Sorriso Ltda' }).waitFor();
  const urlCliente = g.url();
  const clienteId = urlCliente.split('/').pop();

  log('Cadastrar equipamento (autoclave)');
  await g.getByRole('link', { name: 'Novo', exact: true }).click();
  await g.getByLabel('Tipo de equipamento').selectOption({ label: 'Autoclave' });
  await g.getByLabel('Fabricante').fill('Cristófoli');
  await g.getByLabel('Modelo').fill('Vitale 21');
  await g.getByLabel('Nº de série').fill('AC-2024-0815');
  await g.getByLabel('Setor / sala').fill('Expurgo');
  await g.getByLabel('Criticidade').selectOption('alta');
  await g.getByRole('button', { name: 'Salvar equipamento' }).click();
  await g.getByRole('heading', { name: 'Autoclave' }).waitFor();
  await g.screenshot({ path: join(SAIDA, '04-equipamento-qr.png'), fullPage: true });

  log('Dar acesso ao portal para a cliente');
  await g.goto(urlCliente);
  await g.getByLabel('Nome da pessoa').fill(CLIENTE.nome);
  await g.getByLabel('E-mail').fill(CLIENTE.email);
  await g.getByRole('button', { name: 'Dar acesso ao portal' }).click();
  await g.getByText(/Acesso criado/).waitFor();
  await g.screenshot({ path: join(SAIDA, '03-cliente-acesso.png'), fullPage: true });
  await definirSenhaPeloEmulador(CLIENTE.email, CLIENTE.senha);

  log('Gestor deixa o painel aberto e ativa alertas');
  await g.goto(`${APP}/interno`);
  await g.getByRole('heading', { name: /Olá, Carlos/ }).waitFor();

  // ---------- Cliente no celular ----------
  const ctxCliente = await navegador.newContext({ ...devices['Pixel 7'] });
  const c = await ctxCliente.newPage();
  c.on('pageerror', (e) => console.log('  [erro na página do cliente]', e.message));
  log('Cliente entra no portal pelo celular');
  await entrar(c, CLIENTE.email, CLIENTE.senha);
  await c.waitForURL(`${APP}/portal`);
  await c.getByRole('heading', { name: /Olá, Dra/ }).waitFor();
  await c.screenshot({ path: join(SAIDA, '05-portal-inicio.png') });

  log('Cliente abre chamado com foto');
  await c.getByRole('link', { name: 'Abrir novo chamado' }).click();
  await c.getByLabel('Equipamento').selectOption({ index: 1 });
  await c.getByLabel('O que está acontecendo?').fill('A autoclave não termina o ciclo e mostra erro E3 no visor. Já desligamos e ligamos de novo.');
  await c.getByRole('button', { name: 'Sim, parado' }).click();
  await c.locator('input[type=file]').setInputFiles(fotoChamado);
  await c.locator('.fotos .foto img').first().waitFor();
  await c.getByLabel('Contato e melhor horário (opcional)').fill('Júlia, recepção, de manhã');
  await c.screenshot({ path: join(SAIDA, '06-portal-novo-chamado.png'), fullPage: true });
  await c.getByRole('button', { name: 'Abrir chamado' }).click();
  await c.waitForURL(/\/portal\/chamados\/1\?novo=1/);
  await c.getByText('Chamado aberto!').waitFor();
  await c.screenshot({ path: join(SAIDA, '07-portal-chamado-aberto.png'), fullPage: true });

  log('Painel do gestor mostra o chamado novo');
  await g.getByText(/Novo chamado nº 1/).waitFor({ timeout: 15000 });
  await g.screenshot({ path: join(SAIDA, '08-painel-alerta.png'), fullPage: true });

  log('Gestor agenda e cria a OS');
  await g.goto(`${APP}/interno/chamados/1`);
  await g.getByRole('button', { name: 'Salvar agendamento' }).click();
  await g.getByText(/Agendado para \d/).first().waitFor();
  await g.getByRole('button', { name: 'Criar OS' }).click();
  await g.waitForURL(`${APP}/interno/os/1`);

  // ---------- Técnico em campo (celular) ----------
  const ctxTec = await navegador.newContext({
    ...devices['Pixel 7'],
    geolocation: { latitude: -23.5505, longitude: -46.6333, accuracy: 12 },
    permissions: ['geolocation'],
  });
  const t = await ctxTec.newPage();
  t.on('dialog', (d) => d.accept());
  t.on('pageerror', (e) => console.log('  [erro na página do técnico]', e.message));
  log('Técnico abre a OS no celular e faz check-in');
  await entrar(t, GESTOR.email, GESTOR.senha);
  await t.waitForURL(`${APP}/interno`);
  await t.goto(`${APP}/interno/os/1`);
  await t.getByRole('button', { name: /Iniciar atendimento/ }).click();
  await t.getByText('Em execução', { exact: true }).first().waitFor();

  log('Checklist, medições, foto, diagnóstico e peça');
  await t.getByRole('button', { name: 'Restantes conformes' }).click();
  await t.locator('.item-check').nth(1).getByRole('button', { name: 'Não conf.' }).click();
  const obs = t.locator('.item-check').nth(1).locator('input');
  await obs.fill('Guarnição ressecada, com vazamento de vapor');
  await obs.press('Tab');
  for (const [rotulo, valor] of [
    ['Temperatura no patamar de esterilização', '134'],
    ['Pressão no patamar', '2,1'],
    ['Resistência de aterramento', '0,12'],
  ]) {
    const campo = t.getByLabel(rotulo, { exact: true });
    await campo.fill(valor);
    await campo.press('Tab');
  }
  await t.locator('.foto-adicionar input[type=file]').setInputFiles(fotoOS);
  await t.locator('.fotos .foto img').first().waitFor();
  await t.getByLabel('Diagnóstico (defeito encontrado)').fill('Guarnição da porta ressecada causando perda de pressão e erro E3.');
  await t.getByLabel('Diagnóstico (defeito encontrado)').press('Tab');
  await t.getByLabel('Serviço executado').fill('Substituição da guarnição, limpeza do filtro e ciclo de teste completo sem carga.');
  await t.getByLabel('Serviço executado').press('Tab');
  await t.getByLabel('Descrição da peça').fill('Guarnição da porta 21 L');
  await t.getByRole('button', { name: 'Incluir' }).click();
  await t.getByLabel('Instrumentos utilizados').fill('Termômetro digital série TD-77, certificado RBC nº 4521, válido até 08/2027');
  await t.getByLabel('Instrumentos utilizados').press('Tab');
  await t.screenshot({ path: join(SAIDA, '09-os-execucao.png'), fullPage: true });

  log('Cliente assina e técnico conclui');
  await t.getByRole('button', { name: 'Sim, liberado' }).click();
  await t.getByLabel('Nome de quem assina').fill('Júlia Martins');
  await t.getByLabel('CPF ou cargo (opcional)').fill('Recepcionista');
  await assinar(t);
  await t.getByRole('button', { name: 'Concluir OS' }).click();
  await t.getByText('OS concluída', { exact: true }).waitFor();
  await t.evaluate(() => window.scrollTo(0, 0));
  await t.screenshot({ path: join(SAIDA, '10-os-concluida.png') });

  log('Conferir no banco: data agendada, as 3 medições e o checklist foram gravados');
  const r = await fetch('http://127.0.0.1:8080/v1/projects/demo-assistencia/databases/(default)/documents/os/1', {
    headers: { Authorization: 'Bearer owner' },
  });
  const docOS = (await r.json()).fields;
  if (!docOS.agendadaPara.timestampValue) throw new Error('A OS ficou sem a data agendada');
  const valor = (id) => {
    const v = docOS.medicoes.mapValue.fields[id].mapValue.fields.valor;
    return Number(v.doubleValue ?? v.integerValue);
  };
  const medidas = { temp: valor('m-temp'), press: valor('m-press'), terra: valor('m-terra') };
  if (medidas.temp !== 134 || medidas.press !== 2.1 || medidas.terra !== 0.12) throw new Error(`Medições perdidas: ${JSON.stringify(medidas)}`);
  const itens = Object.values(docOS.checklist.mapValue.fields).map((i) => i.mapValue.fields.resultado.stringValue);
  if (itens.length !== 11 || itens.filter((x) => x === 'nok').length !== 1 || itens.some((x) => !x)) throw new Error(`Checklist incorreto: ${itens}`);
  console.log('     medições', JSON.stringify(medidas), '· checklist', itens.length, 'itens, 1 não conforme');

  log('Técnico gera o laudo PDF');
  const [download] = await Promise.all([t.waitForEvent('download'), t.getByRole('button', { name: 'Gerar laudo e enviar' }).click()]);
  const pdfTec = join(SAIDA, 'laudo-tecnico.pdf');
  await download.saveAs(pdfTec);

  log('Cliente vê o chamado concluído e baixa o laudo');
  await c.goto(`${APP}/portal/chamados/1`);
  await c.getByText('Concluído', { exact: true }).first().waitFor();
  await c.screenshot({ path: join(SAIDA, '11-portal-concluido.png'), fullPage: true });
  const [download2] = await Promise.all([c.waitForEvent('download'), c.getByRole('button', { name: 'Baixar o laudo técnico (PDF)' }).click()]);
  const pdfCli = join(SAIDA, 'laudo-cliente.pdf');
  await download2.saveAs(pdfCli);

  log('Etiquetas QR para impressão');
  await g.goto(`${APP}/interno/etiquetas?cliente=${clienteId}`);
  await g.locator('.etiqueta img').first().waitFor();
  await g.emulateMedia({ media: 'print' });
  await g.screenshot({ path: join(SAIDA, '12-etiquetas-impressao.png') });
  await g.emulateMedia({ media: 'screen' });

  log('Login e página do QR sem login');
  const ctxAnon = await navegador.newContext({ ...devices['Pixel 7'] });
  const a = await ctxAnon.newPage();
  await a.goto(`${APP}/login`);
  await a.getByRole('button', { name: 'Entrar' }).waitFor();
  await a.screenshot({ path: join(SAIDA, '01-login.png') });

  writeFileSync(join(SAIDA, 'resultado.json'), JSON.stringify({ ok: true, clienteId }, null, 2));
  await navegador.close();
  console.log('\nFLUXO COMPLETO OK');
})().catch(async (e) => {
  console.error('\nFALHOU:', e.message);
  process.exit(1);
});

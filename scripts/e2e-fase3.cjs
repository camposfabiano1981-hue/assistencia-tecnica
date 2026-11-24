// Teste ponta a ponta da Fase 3 no emulador. Rode depois de scripts/e2e.cjs e scripts/e2e-fase2.cjs.
// Documentos da empresa → autenticidade do laudo (código no PDF e página pública) → avaliação do atendimento →
// contrato por equipamento, fatura do mês e prazo de atendimento → Pasta da VISA (portal e dossiê) → indicadores → backup.
// Uso: NODE_PATH=$(npm root -g) node scripts/e2e-fase3.cjs
const { chromium, devices } = require('playwright');
const { mkdirSync, readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const APP = process.env.APP_URL || 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080';
const PROJETO = 'demo-assistencia';
const RAIZ = join(__dirname, '..');
const SAIDA = join(RAIZ, 'capturas', 'fase3');
mkdirSync(SAIDA, { recursive: true });

const GESTOR = { email: 'gestor@empresa.com', senha: 'SenhaForte123' };
const CLIENTE = { email: 'ana@clinicasorriso.com', senha: 'SenhaCliente1' };
const { clienteId } = JSON.parse(readFileSync(join(RAIZ, 'capturas', 'resultado.json'), 'utf8'));
const BR = { locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' };

let passo = 0;
const log = (m) => console.log(`[${String(++passo).padStart(2, '0')}] ${m}`);
const confere = (ok, m) => {
  if (!ok) throw new Error(m);
};
function dia(deslocamento = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const competencia = dia(0).slice(0, 7);
const formatarCodigo = (c) => c.match(/.{1,4}/g).join('-');

// ---------- Leitura direta do emulador (Bearer owner ignora as regras): só para conferir ----------
function valorRest(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('bytesValue' in v) return { base64: v.bytesValue };
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(valorRest);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, valorRest(x)]));
  return v;
}
async function lerDoc(caminho) {
  const r = await fetch(`${FS}/v1/projects/${PROJETO}/databases/(default)/documents/${caminho}`, { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) return null;
  return valorRest({ mapValue: { fields: (await r.json()).fields ?? {} } });
}
async function esperarDoc(caminho, cond, ms = 8000) {
  let d;
  for (const fim = Date.now() + ms; Date.now() < fim; await new Promise((r) => setTimeout(r, 200))) {
    d = await lerDoc(caminho);
    if (d && cond(d)) return d;
  }
  return d;
}

// ---------- Ações de tela ----------
async function entrar(pagina, email, senha) {
  await pagina.goto(`${APP}/login`);
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(senha);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
}
/** Abre no visualizador, confere que a página foi desenhada, fotografa, baixa (opcional) e fecha. */
async function visualizar(pagina, rotulo, captura, { baixarComo } = {}) {
  await pagina.getByRole('button', { name: rotulo }).click();
  const paginas = pagina.locator('.visualizador canvas.visualizador-pagina');
  await paginas.first().waitFor();
  await pagina.getByText('Abrindo o documento…').waitFor({ state: 'detached' });
  const pintada = await paginas.first().evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, Math.min(c.height, 400)).data;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 200) return true;
    return false;
  });
  confere(pintada, `${rotulo}: página em branco`);
  await pagina.screenshot({ path: join(SAIDA, captura) });
  let arquivo = null;
  if (baixarComo) {
    const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.locator('.visualizador').getByRole('button', { name: 'Baixar' }).click()]);
    arquivo = join(SAIDA, baixarComo);
    await download.saveAs(arquivo);
  }
  const n = await paginas.count();
  await pagina.getByRole('button', { name: 'Fechar' }).click();
  await pagina.locator('.visualizador').waitFor({ state: 'detached' });
  return { paginas: n, arquivo };
}
const textoPDF = (arquivo) => execFileSync('pdftotext', ['-layout', arquivo, '-'], { encoding: 'utf8' });
const kpi = (pagina, rotulo) => pagina.locator('.kpi', { has: pagina.locator('.kpi-rotulo', { hasText: rotulo }) }).locator('.kpi-valor').innerText();

const paginas = [];
(async () => {
  const navegador = await chromium.launch();
  const erros = [];
  const vigiar = (p, quem) => {
    paginas.push([quem, p]);
    p.on('pageerror', (e) => erros.push(`${quem}: ${e.message}`));
  };

  const ctxG = await navegador.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, ...BR });
  const g = await ctxG.newPage();
  g.on('dialog', (d) => d.accept());
  vigiar(g, 'gestor');
  await entrar(g, GESTOR.email, GESTOR.senha);
  await g.waitForURL(`${APP}/interno`);

  log('Documentos da empresa para a Pasta da VISA');
  await g.goto(`${APP}/interno/config`);
  const docs = g.locator('.cartao', { has: g.getByRole('heading', { name: 'Documentos para a Pasta da VISA' }) });
  for (const [nome, numero, validade, link] of [
    ['Alvará de funcionamento', 'ALV-2026/0456', dia(200), 'https://drive.google.com/file/d/exemplo-alvara/view'],
    ['Registro do responsável técnico (CFT)', 'CFT 1234567', '', ''],
  ]) {
    await docs.getByRole('button', { name: 'Documento', exact: true }).click();
    await docs.getByLabel('Nome do documento').last().fill(nome);
    await docs.getByLabel('Número').last().fill(numero);
    if (validade) await docs.getByLabel('Validade').last().fill(validade);
    if (link) await docs.getByLabel('Link do arquivo').last().fill(link);
  }
  await docs.getByRole('button', { name: 'Salvar documentos' }).click();
  await g.getByText('Documentos salvos.', { exact: false }).waitFor();

  log('Autenticidade: código impresso no laudo e conferência pública sem login');
  const os2 = await lerDoc('os/2');
  confere(/^[2-9A-HJ-NP-Z]{16}$/.test(os2?.codigoVerificacao ?? ''), `OS 2 sem código de verificação: ${os2?.codigoVerificacao}`);
  const codigo = os2.codigoVerificacao;
  const laudo = textoPDF(join(RAIZ, 'capturas', 'fase2', 'laudo-os-2.pdf'));
  confere(laudo.includes(formatarCodigo(codigo)) && laudo.includes('Confira a autenticidade'), 'O laudo não traz o código de verificação');
  const ctxA = await navegador.newContext({ ...devices['Pixel 7'], ...BR });
  const a = await ctxA.newPage();
  vigiar(a, 'visitante');
  await a.goto(`${APP}/v/${codigo}`);
  await a.getByText('Laudo autêntico.', { exact: false }).waitFor();
  await a.getByText('Clínica Sorriso Ltda').waitFor();
  await a.screenshot({ path: join(SAIDA, '01-verificacao-autentica.png'), fullPage: true });
  await a.goto(`${APP}/v/AAAABBBBCCCCDDDD`);
  await a.getByText('Código não encontrado.', { exact: false }).waitFor();
  await a.getByLabel('Código de verificação').fill(formatarCodigo(codigo).toLowerCase());
  await a.getByRole('button', { name: 'Conferir' }).click();
  await a.getByText('Laudo autêntico.', { exact: false }).waitFor();

  log('Cliente avalia o atendimento pelo chamado e pelo link do WhatsApp');
  const ctxC = await navegador.newContext({ ...devices['Pixel 7'], ...BR });
  const c = await ctxC.newPage();
  c.on('dialog', (d) => d.accept());
  vigiar(c, 'cliente');
  await entrar(c, CLIENTE.email, CLIENTE.senha);
  await c.waitForURL(`${APP}/portal`);
  await c.goto(`${APP}/portal/chamados/2?avaliar=1`);
  await c.getByRole('radio', { name: /^5 estrelas/ }).click();
  await c.getByLabel('Comentário (opcional)').fill('Técnico pontual e caprichoso. Explicou tudo o que fez.');
  await c.screenshot({ path: join(SAIDA, '02-avaliacao.png'), fullPage: true });
  await c.getByRole('button', { name: 'Enviar avaliação' }).click();
  await c.getByText('Sua avaliação').waitFor();
  await c.goto(`${APP}/portal/avaliar/1`);
  await c.getByRole('radio', { name: /^4 estrelas/ }).click();
  await c.getByRole('button', { name: 'Enviar avaliação' }).click();
  await c.getByText('Sua avaliação').waitFor();
  const av2 = await esperarDoc('avaliacoes/2', (d) => d.nota === 5);
  confere(av2?.nota === 5 && av2.comentario?.startsWith('Técnico pontual'), 'Avaliação da OS 2 não gravada');
  confere((await esperarDoc('avaliacoes/1', (d) => d.nota === 4))?.nota === 4, 'Avaliação da OS 1 não gravada');
  await g.goto(`${APP}/interno/os/2`);
  await g.getByText('Avaliação do cliente:', { exact: false }).waitFor();

  log('Contrato por equipamento para os 2 equipamentos do cliente; PDF do contrato');
  await g.goto(`${APP}/interno/contratos/novo?cliente=${clienteId}`);
  await g.getByRole('button', { name: 'Marcar todos' }).click();
  await g.getByLabel('Cobrança').selectOption('por-equipamento');
  await g.getByLabel('Valor do contrato').fill('150,00');
  await g.getByLabel('Prazo para atender chamados').selectOption('24');
  await g.getByLabel('Dia do vencimento').fill('10');
  await g.screenshot({ path: join(SAIDA, '03-contrato-editar.png'), fullPage: true });
  await g.getByRole('button', { name: /Salvar contrato \(R\$\s300,00\/mês\)/ }).click();
  await g.waitForURL(`${APP}/interno/contratos/1`);
  const { arquivo: pdfContrato } = await visualizar(g, 'Visualizar contrato (PDF)', '04-contrato-pdf.png', { baixarComo: 'contrato-1.pdf' });
  const contratoTxt = textoPDF(pdfContrato);
  confere(contratoTxt.includes('até 24 horas da abertura do chamado') && /R\$\s150,00 por equipamento/.test(contratoTxt), 'PDF do contrato sem as condições');

  log('Painel avisa o contrato a faturar; fatura do mês com um toque');
  await g.goto(`${APP}/interno`);
  await g.getByText(/1 contrato\(s\) a faturar em/).waitFor();
  await g.goto(`${APP}/interno/contratos/1`);
  await g.getByRole('button', { name: /Gerar fatura de/ }).click();
  await g.waitForURL(`${APP}/interno/faturas/2`);
  const fat2 = await esperarDoc('faturas/2', (d) => d.total === 300);
  confere(fat2?.total === 300 && fat2.contratoId === '1' && fat2.competencia === competencia, `Fatura do contrato: ${JSON.stringify(fat2 && { t: fat2.total, c: fat2.contratoId, m: fat2.competencia })}`);
  confere(fat2.itens[0].quantidade === 2 && fat2.itens[0].valorUnitario === 150, 'Item da fatura do contrato');
  const contrato = await esperarDoc('contratos/1', (d) => d.ultimaCompetencia === competencia);
  confere(contrato?.ultimaCompetencia === competencia, 'Contrato não marcou a competência faturada');
  await g.goto(`${APP}/interno/contratos`);
  await g.locator('.resumo-item', { hasText: 'A faturar em' }).locator('strong', { hasText: '0' }).waitFor();
  await g.screenshot({ path: join(SAIDA, '05-contratos.png'), fullPage: true });

  log('Cliente vê o contrato no Financeiro do portal');
  await c.goto(`${APP}/portal/financeiro`);
  await c.getByText('Contrato de manutenção nº 1').waitFor();
  await visualizar(c, 'Visualizar contrato', '06-portal-contrato.png');

  log('Chamado de equipamento com contrato: prazo de 24 h e indicador de atendimento no prazo');
  await c.goto(`${APP}/portal/novo`);
  const seletor = c.getByLabel('Equipamento');
  await seletor.selectOption(await seletor.locator('option', { hasText: 'Monitor multiparamétrico' }).getAttribute('value'));
  await c.getByLabel('O que está acontecendo?').fill('O monitor desliga sozinho depois de alguns minutos.');
  await c.getByRole('button', { name: 'Sim, parado' }).click();
  await c.getByRole('button', { name: 'Abrir chamado' }).click();
  await c.waitForURL(/\/portal\/chamados\/3\?novo=1/);
  await g.goto(`${APP}/interno/chamados/3`);
  await g.getByText(/iniciar o atendimento até/).waitFor();
  await g.screenshot({ path: join(SAIDA, '07-chamado-prazo-contrato.png'), fullPage: true });
  await g.getByRole('button', { name: 'Salvar agendamento' }).click();
  await g.getByText(/Agendado para \d/).first().waitFor();
  await g.getByRole('button', { name: 'Criar OS' }).click();
  await g.waitForURL(`${APP}/interno/os/3`);
  const ctxT = await navegador.newContext({
    ...devices['Pixel 7'],
    ...BR,
    geolocation: { latitude: -23.5505, longitude: -46.6333, accuracy: 12 },
    permissions: ['geolocation'],
  });
  const t = await ctxT.newPage();
  vigiar(t, 'técnico');
  await entrar(t, GESTOR.email, GESTOR.senha);
  await t.waitForURL(`${APP}/interno`);
  await t.goto(`${APP}/interno/os/3`);
  await t.getByRole('button', { name: /Iniciar atendimento/ }).click();
  await t.getByText('Em execução', { exact: true }).first().waitFor();
  await esperarDoc('chamados/3', (d) => d.status === 'em_atendimento');
  await g.goto(`${APP}/interno/chamados/3`);
  await g.getByText(/dentro do prazo de 24 h/).waitFor();

  log('Pasta da VISA: página no portal, dossiê em PDF e versão interna');
  await c.goto(`${APP}/portal/equipamentos`);
  await c.getByRole('link', { name: 'Pasta da VISA' }).click();
  await c.waitForURL(`${APP}/portal/visa`);
  await c.getByText('Alvará de funcionamento').waitFor();
  await c.getByText('Ensaio de segurança elétrica (ABNT NBR IEC 62353)').waitFor();
  await c.screenshot({ path: join(SAIDA, '08-pasta-visa.png'), fullPage: true });
  const { arquivo: pdfVisa } = await visualizar(c, 'Visualizar dossiê (PDF)', '09-dossie-visa.png', { baixarComo: 'pasta-visa.pdf' });
  const visa = textoPDF(pdfVisa);
  for (const trecho of ['PASTA DA VIGILÂNCIA SANITÁRIA', 'Alvará de funcionamento', 'ALV-2026/0456', 'Monitor multiparamétrico', 'Vencido', formatarCodigo(codigo), 'Testo 735-2']) {
    confere(visa.includes(trecho), `Dossiê sem "${trecho}"`);
  }
  await g.goto(`${APP}/interno/clientes/${clienteId}`);
  await visualizar(g, 'Pasta da VISA (PDF)', '10-dossie-interno.png');

  log('Indicadores: satisfação e atendimento no prazo dos contratos');
  await g.goto(`${APP}/interno/indicadores`);
  await g.locator('.grafico').first().waitFor();
  await g.getByText('Atualizando com o servidor…').waitFor({ state: 'detached' });
  const satisfacao = await kpi(g, 'Satisfação dos clientes');
  const prazo = await kpi(g, 'Contratos: atendimento no prazo');
  confere(satisfacao === '4,5 / 5' && prazo === '100%', `Indicadores: satisfação ${satisfacao}, prazo ${prazo}`);
  await g.getByText('Técnico pontual e caprichoso', { exact: false }).waitFor();
  await g.screenshot({ path: join(SAIDA, '11-indicadores.png'), fullPage: true });

  log('Backup inclui contratos, avaliações e códigos de autenticidade');
  await g.goto(`${APP}/interno/backup`);
  const [download] = await Promise.all([g.waitForEvent('download'), g.getByRole('button', { name: 'Baixar cópia de segurança' }).click()]);
  const arquivoBackup = join(SAIDA, 'backup.json');
  await download.saveAs(arquivoBackup);
  const backup = JSON.parse(readFileSync(arquivoBackup, 'utf8'));
  const esperado = { contratos: 1, avaliacoes: 2, verificacoes: 2, contadores: 5, faturas: 2, chamados: 3, os: 3 };
  for (const [grupo, n] of Object.entries(esperado)) confere(backup.totais[grupo] === n, `Backup: ${grupo} = ${backup.totais[grupo]} (esperado ${n})`);

  await navegador.close();
  if (erros.length) {
    console.log('\nErros de JavaScript nas páginas:\n' + erros.join('\n'));
    process.exit(1);
  }
  console.log('\nFASE 3 COMPLETA OK');
})().catch(async (e) => {
  console.error('\nFALHOU:', e.message);
  for (const [quem, p] of paginas) await p.screenshot({ path: join(SAIDA, `falha-${quem}.png`), fullPage: true }).catch(() => {});
  process.exit(1);
});

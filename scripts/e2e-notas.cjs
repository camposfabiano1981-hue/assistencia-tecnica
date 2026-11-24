// Teste ponta a ponta das notas fiscais no emulador (rode depois das Fases 1, 2 e 3).
// A ponte (Apps Script) e a Focus NFe não existem aqui: o teste intercepta o aviso à ponte e a busca
// de CEP, confere o pedido gravado na fatura e simula o resultado que a ponte gravaria.
// Uso: NODE_PATH=$(npm root -g) node scripts/e2e-notas.cjs
const { chromium, devices } = require('playwright');
const { mkdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const APP = process.env.APP_URL || 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080';
const PROJETO = 'demo-assistencia';
const RAIZ = join(__dirname, '..');
const SAIDA = join(RAIZ, 'capturas', 'notas');
mkdirSync(SAIDA, { recursive: true });

const GESTOR = { email: 'gestor@empresa.com', senha: 'SenhaForte123' };
const CLIENTE = { email: 'ana@clinicasorriso.com', senha: 'SenhaCliente1' };
const { clienteId } = JSON.parse(readFileSync(join(RAIZ, 'capturas', 'resultado.json'), 'utf8'));
const BR = { locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' };
const PONTE = 'https://script.google.com/macros/s/PONTE-DE-TESTE/exec';

let passo = 0;
const log = (m) => console.log(`[${String(++passo).padStart(2, '0')}] ${m}`);
const confere = (ok, m) => {
  if (!ok) throw new Error(m);
};

function valorRest(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(valorRest);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, valorRest(x)]));
  return v;
}
function paraRest(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(paraRest) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, paraRest(x)])) } };
}
async function lerDoc(caminho) {
  const r = await fetch(`${FS}/v1/projects/${PROJETO}/databases/(default)/documents/${caminho}`, { headers: { Authorization: 'Bearer owner' } });
  return r.ok ? valorRest({ mapValue: { fields: (await r.json()).fields ?? {} } }) : null;
}
async function esperarDoc(caminho, cond, ms = 8000) {
  let d;
  for (const fim = Date.now() + ms; Date.now() < fim; await new Promise((r) => setTimeout(r, 200))) {
    d = await lerDoc(caminho);
    if (d && cond(d)) return d;
  }
  return d;
}
/** O que a ponte faria: grava só os campos indicados (máscara) na fatura. */
async function simularPonte(faturaId, tipo, campos) {
  const mascara = Object.keys(campos).map((k) => `emissao.${tipo}.${k}`);
  const url = `${FS}/v1/projects/${PROJETO}/databases/(default)/documents/faturas/${faturaId}?${mascara
    .map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`)
    .join('&')}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: paraRest({ emissao: { [tipo]: campos } }).mapValue.fields }),
  });
  confere(r.ok, `Simulação da ponte: HTTP ${r.status}`);
}
async function entrar(pagina, email, senha) {
  await pagina.goto(`${APP}/login`);
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(senha);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
}
/** CEP e ponte simulados (sem internet externa no teste). */
async function simularServicosExternos(contexto, pings) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  await contexto.route('https://viacep.com.br/ws/**', (route) =>
    route.fulfill({
      status: 200,
      headers: cors,
      body: JSON.stringify({ cep: '79002-000', logradouro: 'Rua 14 de Julho', bairro: 'Centro', localidade: 'Campo Grande', uf: 'MS', ibge: '5002704' }),
    }),
  );
  await contexto.route('https://script.google.com/**', (route) => {
    const req = route.request();
    pings.push({ metodo: req.method(), url: req.url(), corpo: req.postData() });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, versao: '1', projeto: PROJETO, homologacao: true, producao: false }) });
  });
}

const paginas = [];
(async () => {
  const navegador = await chromium.launch();
  const erros = [];
  const vigiar = (p, quem) => {
    paginas.push([quem, p]);
    p.on('pageerror', (e) => erros.push(`${quem}: ${e.message}`));
  };
  const pings = [];
  const ctxG = await navegador.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, ...BR });
  await simularServicosExternos(ctxG, pings);
  const g = await ctxG.newPage();
  vigiar(g, 'gestor');
  await entrar(g, GESTOR.email, GESTOR.senha);
  await g.waitForURL(`${APP}/interno`);

  log('Configurar a emissão: homologação, ponte, inscrições e município pelo CEP; testar a ponte');
  await g.goto(`${APP}/interno/config`);
  const cartao = g.locator('.cartao', { has: g.getByRole('heading', { name: 'Notas fiscais (Focus NFe)' }) });
  await cartao.getByLabel('Emitir notas pelo app').check();
  await cartao.getByLabel('Endereço da ponte').fill(PONTE);
  confere((await cartao.getByLabel('CNPJ da empresa').inputValue()) === '12345678000190', 'CNPJ não veio do cadastro da empresa');
  await cartao.getByLabel('Inscrição municipal').fill('123456');
  await cartao.getByLabel('Inscrição estadual').fill('281234567');
  await cartao.getByLabel('CEP da empresa').fill('79002-000');
  await cartao.getByRole('button', { name: 'Buscar' }).click();
  await g.getByText(/código IBGE 5002704/).waitFor();
  await cartao.getByRole('button', { name: 'Salvar notas fiscais' }).click();
  await g.getByText('Notas fiscais salvas.', { exact: false }).waitFor();
  await cartao.getByRole('button', { name: 'Testar ponte' }).click();
  await g.getByText(/Token de homologação: configurado/).waitFor();
  await cartao.screenshot({ path: join(SAIDA, '01-config-notas.png') });
  const empresa = await esperarDoc('config/empresa', (d) => d.fiscal?.ativo === true);
  confere(empresa.fiscal.codigoMunicipio === '5002704' && empresa.fiscal.uf === 'MS' && empresa.fiscal.nfse.codigoTributacaoNacional === '140101', 'Configuração fiscal não gravada');

  log('Endereço do cliente para as notas pelo CEP');
  await g.goto(`${APP}/interno/clientes/${clienteId}/editar`);
  const endereco = g.locator('.cartao', { has: g.getByRole('heading', { name: 'Endereço para notas fiscais' }) });
  await endereco.getByLabel('CEP', { exact: true }).fill('79002000');
  await endereco.getByRole('button', { name: 'Buscar' }).click();
  await g.getByText(/Campo Grande - MS · código IBGE 5002704/).waitFor();
  await endereco.getByLabel('Número').fill('100');
  await endereco.screenshot({ path: join(SAIDA, '02-endereco-cliente.png') });
  await g.getByRole('button', { name: 'Salvar cliente' }).click();
  await g.waitForURL(`${APP}/interno/clientes/${clienteId}`);
  const cliente = await esperarDoc(`clientes/${clienteId}`, (d) => d.codigoMunicipio === '5002704');
  confere(cliente.logradouro === 'Rua 14 de Julho' && cliente.numero === '100' && cliente.uf === 'MS' && cliente.indicadorIE === '9', 'Endereço fiscal do cliente');

  log('Emitir a NFS-e da fatura do contrato: pedido gravado e ponte avisada');
  await g.goto(`${APP}/interno/faturas/2`);
  const notas = g.locator('.cartao', { has: g.getByRole('heading', { name: 'Notas fiscais' }) });
  await notas.getByText('Homologação').waitFor();
  await notas.getByRole('button', { name: 'Emitir NFS-e' }).click();
  await notas.getByText(/Enviando ao provedor/).waitFor();
  const f2 = await esperarDoc('faturas/2', (d) => d.emissao?.nfse?.status === 'solicitada');
  const p = f2.emissao.nfse;
  confere(p.ref === 'fat2-nfse-1' && p.ambiente === 'homologacao' && p.tentativa === 1, `Pedido: ${JSON.stringify({ ref: p.ref, a: p.ambiente })}`);
  confere(
    p.payload.cnpj_tomador === '98765432000110' &&
      p.payload.cnpj_prestador === '12345678000190' &&
      p.payload.codigo_municipio_prestacao === '5002704' &&
      p.payload.valor_servico === 300 &&
      p.payload.codigo_tributacao_nacional_iss === '140101' &&
      /Contrato de manutenção nº 1/.test(p.payload.descricao_servico),
    `Corpo da NFS-e: ${JSON.stringify(p.payload)}`,
  );
  const ping = pings.find((x) => x.metodo === 'POST');
  confere(ping && JSON.parse(ping.corpo).faturaId === '2', `A ponte não foi avisada: ${JSON.stringify(pings)}`);

  log('A ponte autoriza: número, PDF e aviso de homologação na fatura');
  await simularPonte('2', 'nfse', {
    status: 'autorizada',
    numero: '1001',
    urlPdf: 'https://homologacao.focusnfe.com.br/arquivos/danfse-1001.pdf',
    urlXml: 'https://homologacao.focusnfe.com.br/arquivos/nfse-1001.xml',
    autorizadaEm: new Date(),
  });
  await notas.getByText(/NFS-e nº/).waitFor();
  await notas.getByText(/homologação: sem valor fiscal/).waitFor();
  const linkPdf = notas.getByRole('link', { name: 'PDF da NFS-e' });
  confere((await linkPdf.getAttribute('href')) === 'https://homologacao.focusnfe.com.br/arquivos/danfse-1001.pdf', 'Link do PDF da NFS-e');
  await g.screenshot({ path: join(SAIDA, '03-fatura-nfse-autorizada.png'), fullPage: true });

  log('Portal: nota de homologação não aparece; a de produção aparece com o PDF');
  const ctxC = await navegador.newContext({ ...devices['Pixel 7'], ...BR });
  const c = await ctxC.newPage();
  vigiar(c, 'cliente');
  await entrar(c, CLIENTE.email, CLIENTE.senha);
  await c.waitForURL(`${APP}/portal`);
  await c.goto(`${APP}/portal/faturas/2`);
  await c.getByRole('button', { name: 'Visualizar fatura' }).waitFor();
  confere((await c.getByText(/Nota fiscal de serviço nº/).count()) === 0, 'Nota de homologação apareceu no portal');
  await simularPonte('2', 'nfse', { ambiente: 'producao' });
  await c.getByRole('link', { name: 'Nota fiscal de serviço nº 1001 (PDF)' }).waitFor();
  await c.screenshot({ path: join(SAIDA, '04-portal-nfse.png'), fullPage: true });

  log('NF-e das peças: corpo com NCM e CFOP; recusa mostrada e nova tentativa liberada');
  await g.goto(`${APP}/interno/faturas/1`);
  const notas1 = g.locator('.cartao', { has: g.getByRole('heading', { name: 'Notas fiscais' }) });
  await notas1.getByRole('button', { name: 'Emitir NF-e' }).click();
  const f1 = await esperarDoc('faturas/1', (d) => d.emissao?.nfe?.status === 'solicitada');
  const item = f1.emissao.nfe.payload.items[0];
  confere(
    item.codigo_ncm === '40169300' && item.cfop === '5102' && item.icms_situacao_tributaria === '102' && f1.emissao.nfe.payload.local_destino === '1',
    `Corpo da NF-e: ${JSON.stringify(item)}`,
  );
  await simularPonte('1', 'nfe', { status: 'erro', mensagem: 'Rejeição 778: informado NCM inexistente' });
  await notas1.getByText(/Recusada: Rejeição 778/).waitFor();
  await notas1.getByRole('button', { name: 'Emitir NF-e de novo' }).waitFor();
  await g.screenshot({ path: join(SAIDA, '05-fatura-nfe-recusada.png'), fullPage: true });

  log('Cancelar a NFS-e com justificativa');
  await g.goto(`${APP}/interno/faturas/2`);
  g.once('dialog', (d) => d.accept('Serviço faturado em duplicidade por engano'));
  await g.getByRole('button', { name: 'Cancelar NFS-e' }).click();
  const canc = await esperarDoc('faturas/2', (d) => d.emissao?.nfse?.status === 'cancelamento');
  confere(canc.emissao.nfse.justificativa === 'Serviço faturado em duplicidade por engano', 'Pedido de cancelamento sem justificativa');
  await g.getByText(/Pedido de cancelamento enviado/).waitFor();

  await navegador.close();
  if (erros.length) {
    console.log('\nErros de JavaScript nas páginas:\n' + erros.join('\n'));
    process.exit(1);
  }
  console.log('\nNOTAS FISCAIS OK');
})().catch(async (e) => {
  console.error('\nFALHOU:', e.message);
  for (const [quem, p] of paginas) await p.screenshot({ path: join(SAIDA, `falha-${quem}.png`), fullPage: true }).catch(() => {});
  process.exit(1);
});

// Teste ponta a ponta da Fase 2 no emulador. Rode depois de scripts/e2e.cjs, que deixa a base pronta.
// Pix → instrumentos → estoque → chamado → orçamento → aprovação no portal → OS com instrumento, peça do
// estoque e exigências → baixa do estoque e vencimentos → fatura com Pix → pagamento e NFS-e → portal →
// vencimentos → indicadores → backup e planilhas → restauração do backup em outro projeto do emulador.
// Uso: NODE_PATH=$(npm root -g) node scripts/e2e-fase2.cjs
const { chromium, devices } = require('playwright');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const APP = process.env.APP_URL || 'http://localhost:5173';
const FS = 'http://127.0.0.1:8080';
const PROJETO = 'demo-assistencia';
const RAIZ = join(__dirname, '..');
const SAIDA = join(RAIZ, 'capturas', 'fase2');
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

/** Data local no formato do <input type="date">, deslocada em dias. */
function dia(deslocamento = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const mesesAte = (d) => {
  const h = new Date();
  return (d.getFullYear() - h.getFullYear()) * 12 + d.getMonth() - h.getMonth();
};

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
async function lerDoc(caminho, projeto = PROJETO) {
  const r = await fetch(`${FS}/v1/projects/${projeto}/databases/(default)/documents/${caminho}`, { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) throw new Error(`Documento ${caminho} (${projeto}): HTTP ${r.status}`);
  return valorRest({ mapValue: { fields: (await r.json()).fields ?? {} } });
}
/** A tela mostra a gravação na hora (cache local); o servidor confirma logo depois. Espera até `cond` valer. */
async function esperarDoc(caminho, cond, ms = 8000) {
  let d;
  for (const fim = Date.now() + ms; Date.now() < fim; await new Promise((r) => setTimeout(r, 200))) {
    d = await lerDoc(caminho).catch(() => null);
    if (d && cond(d)) return d;
  }
  return d;
}
async function listar(caminho, projeto = PROJETO) {
  const r = await fetch(`${FS}/v1/projects/${projeto}/databases/(default)/documents/${caminho}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const j = await r.json();
  return (j.documents ?? []).map((d) => ({ id: d.name.split('/').pop(), ...valorRest({ mapValue: { fields: d.fields ?? {} } }) }));
}

// ---------- Pix: confere o BR Code gerado no app ----------
function crc16(s) {
  let crc = 0xffff;
  for (const b of Buffer.from(s, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function tlv(s) {
  const campos = {};
  for (let i = 0; i < s.length; ) {
    const n = Number(s.slice(i + 2, i + 4));
    campos[s.slice(i, i + 2)] = s.slice(i + 4, i + 4 + n);
    i += 4 + n;
  }
  return campos;
}
function conferePix(payload, { valor, txid, chave }) {
  confere(payload.startsWith('000201'), 'Pix sem cabeçalho EMV');
  confere(crc16(payload.slice(0, -4)) === payload.slice(-4), 'CRC do Pix não confere');
  const c = tlv(payload);
  confere(c['53'] === '986' && c['58'] === 'BR', 'Pix: moeda ou país incorretos');
  confere(tlv(c['26'])['00'] === 'br.gov.bcb.pix' && tlv(c['26'])['01'] === chave, `Pix: chave incorreta (${c['26']})`);
  confere(c['54'] === valor.toFixed(2), `Pix: valor ${c['54']}`);
  if (txid) confere(tlv(c['62'])['05'] === txid, `Pix: identificador ${c['62']}`);
  return c;
}

// ---------- Ações de tela ----------
async function entrar(pagina, email, senha) {
  await pagina.goto(`${APP}/login`);
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(senha);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
}
async function assinar(pagina) {
  const canvas = pagina.locator('canvas.assinatura');
  await canvas.scrollIntoViewIfNeeded();
  const { x, y, width: w, height: h } = await canvas.boundingBox();
  await pagina.mouse.move(x + w * 0.12, y + h * 0.6);
  await pagina.mouse.down();
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    await pagina.mouse.move(x + w * (0.12 + 0.7 * t), y + h * (0.6 - 0.25 * Math.sin(t * Math.PI * 3)), { steps: 2 });
  }
  await pagina.mouse.up();
}
/** As caixas refletem o banco: o clique grava e a marca aparece quando o cache local responde. */
async function marcar(caixa) {
  await caixa.click();
  for (const fim = Date.now() + 5000; Date.now() < fim; await new Promise((r) => setTimeout(r, 100))) if (await caixa.isChecked()) return;
  throw new Error('A caixa não ficou marcada');
}
async function baixar(pagina, clicar, nome) {
  const [download] = await Promise.all([pagina.waitForEvent('download'), clicar()]);
  const caminho = join(SAIDA, nome ?? download.suggestedFilename());
  await download.saveAs(caminho);
  return caminho;
}
const linhasCSV = (caminho) => readFileSync(caminho, 'utf8').replace(/^﻿/, '').split('\r\n');
const kpi = (pagina, rotulo) => pagina.locator('.kpi', { has: pagina.locator('.kpi-rotulo', { hasText: rotulo }) }).locator('.kpi-valor').innerText();

const paginas = [];
(async () => {
  const navegador = await chromium.launch();
  navegador.on('disconnected', () => paginas.splice(0));
  const erros = [];
  const vigiar = (p, quem) => {
    paginas.push([quem, p]);
    p.on('pageerror', (e) => erros.push(`${quem}: ${e.message}`));
  };

  // ---------- Gestor no computador ----------
  const ctxG = await navegador.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, ...BR });
  const g = await ctxG.newPage();
  g.on('dialog', (d) => d.accept());
  vigiar(g, 'gestor');
  await entrar(g, GESTOR.email, GESTOR.senha);
  await g.waitForURL(`${APP}/interno`);

  log('Configurar Pix e textos padrão do orçamento; testar o QR de R$ 1,00');
  await g.goto(`${APP}/interno/config`);
  const formPix = g.locator('form').filter({ has: g.getByLabel('Chave Pix', { exact: true }) });
  await formPix.getByLabel('Tipo da chave Pix').selectOption('cnpj');
  await formPix.getByLabel('Chave Pix', { exact: true }).fill('12.345.678/0001-90');
  await formPix.getByLabel('Nome do recebedor').fill('Odonto Hospitalar');
  await formPix.getByLabel('Cidade do recebedor').fill('Sao Paulo');
  await formPix.getByLabel('Validade do orçamento (dias)').fill('15');
  await formPix.getByLabel('Condições de pagamento (padrão)').fill('Pix ou transferência em até 15 dias após a conclusão.');
  await formPix.getByLabel('Garantia (padrão)').fill('90 dias para o serviço e para as peças trocadas.');
  await formPix.getByRole('button', { name: 'Salvar', exact: true }).click();
  await g.getByText('Pix e textos do orçamento salvos.').waitFor();
  await formPix.getByRole('button', { name: 'Testar Pix (R$ 1,00)' }).click();
  conferePix(await g.getByLabel('Código Pix copia e cola').inputValue(), { valor: 1, chave: '12345678000190' });
  await formPix.screenshot({ path: join(SAIDA, '01-config-pix.png') });

  log('Cadastrar instrumentos: termômetro válido e analisador com certificado vencido');
  for (const i of [
    { descricao: 'Termômetro digital com 4 sondas', fabricante: 'Testo', modelo: '735-2', serie: 'TD-77', cert: 'RBC 4521/26', calibrado: dia(-60), validade: dia(305) },
    { descricao: 'Analisador de segurança elétrica', fabricante: 'Fluke', modelo: 'ESA620', serie: 'FL-101', cert: 'RBC 0098/25', calibrado: dia(-370), validade: dia(-5) },
  ]) {
    await g.goto(`${APP}/interno/instrumentos/novo`);
    await g.getByLabel('Descrição', { exact: true }).fill(i.descricao);
    await g.getByLabel('Fabricante').fill(i.fabricante);
    await g.getByLabel('Modelo').fill(i.modelo);
    await g.getByLabel('Nº de série').fill(i.serie);
    await g.getByLabel('Nº do certificado de calibração').fill(i.cert);
    await g.getByLabel('Laboratório (RBC)').fill('Lab. Metrologia Paulista');
    await g.getByLabel('Calibrado em').fill(i.calibrado);
    await g.getByLabel('Validade do certificado').fill(i.validade);
    await g.getByRole('button', { name: 'Salvar instrumento' }).click();
    await g.waitForURL(`${APP}/interno/instrumentos`);
  }
  await g.getByText('Analisador de segurança elétrica').first().waitFor();
  await g.screenshot({ path: join(SAIDA, '02-instrumentos.png'), fullPage: true });

  log('Cadastrar peça no estoque com saldo inicial 3');
  await g.goto(`${APP}/interno/estoque/nova`);
  await g.getByLabel('Descrição', { exact: true }).fill('Guarnição da porta 21 L');
  await g.getByLabel('Código').fill('GU-21');
  await g.getByLabel('Unidade').fill('un');
  await g.getByLabel('NCM (para a NF-e)').fill('40169300');
  await g.getByLabel('Estoque mínimo').fill('1');
  await g.getByLabel('Custo').fill('45,00');
  await g.getByLabel('Preço de venda').fill('120,00');
  await g.getByLabel('Quantidade inicial').fill('3');
  await g.getByRole('button', { name: 'Salvar peça' }).click();
  await g.waitForURL((u) => /\/interno\/estoque\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith('/nova'));
  await g.getByText('Saldo: 3 un').waitFor();
  const pecaId = g.url().split('/').pop();

  // ---------- Cliente no celular ----------
  const ctxC = await navegador.newContext({ ...devices['Pixel 7'], ...BR });
  const c = await ctxC.newPage();
  c.on('dialog', (d) => d.accept()); // "Aprovar o orçamento nº 1 no valor de…?"
  vigiar(c, 'cliente');
  log('Cliente abre o chamado nº 2 pedindo orçamento');
  await entrar(c, CLIENTE.email, CLIENTE.senha);
  await c.waitForURL(`${APP}/portal`);
  await c.getByRole('link', { name: 'Abrir novo chamado' }).click();
  await c.getByLabel('Equipamento').selectOption({ index: 1 });
  await c.getByLabel('O que está acontecendo?').fill('Está saindo vapor pela porta durante o ciclo. Pedimos orçamento antes do conserto.');
  await c.getByRole('button', { name: 'Não, funcionando' }).click();
  await c.getByRole('button', { name: 'Abrir chamado' }).click();
  await c.waitForURL(/\/portal\/chamados\/2\?novo=1/);

  log('Gestor faz o orçamento a partir do chamado: serviço + peça do estoque');
  await g.goto(`${APP}/interno/chamados/2`);
  await g.getByRole('link', { name: 'Fazer orçamento' }).click();
  await g.waitForURL(/\/interno\/orcamentos\/novo\?chamado=2/);
  await g.getByLabel('Equipamento', { exact: true }).locator('option:checked').filter({ hasText: 'Autoclave' }).waitFor({ state: 'attached' });
  // O orçamento já abre com a linha de mão de obra; uma linha extra deixada em branco não deve ir para o documento.
  const item = g.locator('.item-valor').first();
  await item.getByLabel('Descrição do item').fill('Mão de obra: troca da guarnição e ciclo de teste');
  await item.getByLabel('Valor unitário').fill('180,00');
  await g.getByRole('button', { name: 'Serviço', exact: true }).click();
  await g.getByLabel('Adicionar peça do estoque').selectOption({ index: 1 });
  await g.locator('.item-valor').nth(2).getByText('cód. GU-21').waitFor();
  confere((await g.getByLabel('Garantia', { exact: true }).inputValue()).startsWith('90 dias'), 'Garantia padrão não veio da configuração');
  await g.screenshot({ path: join(SAIDA, '03-orcamento-editar.png'), fullPage: true });
  await g.getByRole('button', { name: /Salvar orçamento \(R\$\s300,00\)/ }).click();
  await g.waitForURL(`${APP}/interno/orcamentos/1`);
  confere((await esperarDoc('orcamentos/1', (d) => d.itens?.length > 0)).itens.length === 2, 'A linha em branco não deveria ser salva');
  await g.getByRole('button', { name: 'Enviar ao cliente (portal)' }).click();
  await g.getByText(/Orçamento enviado/).waitFor();
  const pdfOrcamento = await baixar(g, () => g.getByRole('button', { name: 'PDF do orçamento' }).click(), 'orcamento-1.pdf');
  const chamado2 = await esperarDoc('chamados/2', (d) => d.status === 'aguardando');
  confere(chamado2.status === 'aguardando', `Chamado deveria aguardar aprovação: ${chamado2.status}`);

  log('Cliente vê o aviso no portal e aprova o orçamento');
  await c.goto(`${APP}/portal`);
  await c.getByText(/Há 1 orçamento esperando a sua aprovação/).waitFor();
  await c.screenshot({ path: join(SAIDA, '04-portal-aviso-orcamento.png') });
  await c.getByRole('link', { name: 'Ver agora' }).click();
  await c.waitForURL(`${APP}/portal/orcamentos/1`);
  await c.screenshot({ path: join(SAIDA, '05-portal-orcamento.png'), fullPage: true });
  await c.getByRole('button', { name: /Aprovar orçamento/ }).click();
  await c.getByText(/Você aprovou este orçamento/).waitFor();
  const orc = await esperarDoc('orcamentos/1', (d) => d.status === 'aprovado');
  confere(orc.status === 'aprovado' && orc.resposta?.nome && orc.total === 300, `Aprovação não gravada: ${JSON.stringify(orc.resposta)}`);

  log('Painel mostra o orçamento aprovado; gestor agenda e cria a OS');
  await g.goto(`${APP}/interno`);
  await g.getByText(/1 orçamento\(s\) aprovado\(s\)/).waitFor();
  await g.goto(`${APP}/interno/chamados/2`);
  await g.getByRole('button', { name: 'Salvar agendamento' }).click();
  await g.getByText(/Agendado para \d/).first().waitFor();
  await g.getByRole('button', { name: 'Criar OS' }).click();
  await g.waitForURL(`${APP}/interno/os/2`);

  // ---------- Técnico em campo ----------
  const ctxT = await navegador.newContext({
    ...devices['Pixel 7'],
    ...BR,
    geolocation: { latitude: -23.5505, longitude: -46.6333, accuracy: 12 },
    permissions: ['geolocation'],
  });
  const t = await ctxT.newPage();
  t.on('dialog', (d) => d.accept());
  vigiar(t, 'técnico');
  log('Técnico executa a OS 2: instrumento rastreável, peça do estoque e exigências cumpridas');
  await entrar(t, GESTOR.email, GESTOR.senha);
  await t.waitForURL(`${APP}/interno`);
  await t.goto(`${APP}/interno/os/2`);
  await t.getByRole('button', { name: /Iniciar atendimento/ }).click();
  await t.getByText('Em execução', { exact: true }).first().waitFor();
  await t.getByRole('button', { name: 'Restantes conformes' }).click();
  for (const [rotulo, valor] of [
    ['Temperatura no patamar de esterilização', '134'],
    ['Pressão no patamar', '2,1'],
    ['Resistência de aterramento', '0,10'],
  ]) {
    const campo = t.getByLabel(rotulo, { exact: true });
    await campo.fill(valor);
    await campo.press('Tab');
  }
  await marcar(t.getByRole('checkbox', { name: /Termômetro digital com 4 sondas/ }));
  confere(await t.getByRole('checkbox', { name: /Analisador de segurança elétrica/ }).isDisabled(), 'Instrumento com certificado vencido deveria estar bloqueado');
  await marcar(t.getByRole('checkbox', { name: /Manutenção preventiva/ }));
  await marcar(t.getByRole('checkbox', { name: /Qualificação térmica/ }));
  await t.getByLabel('Peça do estoque').selectOption({ index: 1 });
  await t.getByLabel('Quantidade', { exact: true }).fill('1');
  await t.getByRole('button', { name: 'Incluir' }).click();
  await t.getByText('Guarnição da porta 21 L').first().waitFor();
  await t.getByLabel('Diagnóstico (defeito encontrado)').fill('Guarnição ressecada com vazamento de vapor.');
  await t.getByLabel('Diagnóstico (defeito encontrado)').press('Tab');
  await t.getByLabel('Serviço executado').fill('Troca da guarnição, preventiva completa e qualificação térmica com 4 sondas.');
  await t.getByLabel('Serviço executado').press('Tab');
  await t.screenshot({ path: join(SAIDA, '06-os-instrumentos-exigencias.png'), fullPage: true });
  await t.getByRole('button', { name: 'Sim, liberado' }).click();
  await t.getByLabel('Nome de quem assina').fill('Júlia Martins');
  await assinar(t);
  await t.getByRole('button', { name: 'Concluir OS' }).click();
  await t.getByText('OS concluída', { exact: true }).waitFor();
  const laudo = await baixar(t, () => t.getByRole('button', { name: 'Gerar laudo e enviar' }).click(), 'laudo-os-2.pdf');

  log('Conferir no banco: baixa do estoque, movimento da OS, instrumento no laudo e vencimentos');
  const os2 = await esperarDoc('os/2', (d) => d.status === 'concluida');
  confere(os2.status === 'concluida' && os2.estoqueBaixado === true, 'OS sem baixa de estoque');
  confere(os2.instrumentosUsados.length === 1 && os2.instrumentosUsados[0].certificado === 'RBC 4521/26', 'Instrumento não registrado na OS');
  // A baixa roda logo depois da conclusão: espera o saldo chegar a 2.
  const peca = await esperarDoc(`pecas/${pecaId}`, (d) => d.quantidade === 2);
  confere(peca.quantidade === 2, `Saldo da peça deveria ser 2: ${peca.quantidade}`);
  const movimentos = await listar(`pecas/${pecaId}/movimentos`);
  confere(movimentos.some((m) => m.tipo === 'saida' && m.osId === '2' && m.quantidade === 1), `Movimento de saída ausente: ${JSON.stringify(movimentos)}`);
  const equip = await esperarDoc(`equipamentos/${os2.equipamentoId}`, (d) => !!d.vencimentos?.['qualificacao-termica']);
  const prev = equip.vencimentos.preventiva.proximo;
  const qt = equip.vencimentos['qualificacao-termica'].proximo;
  confere(mesesAte(prev) === 6 && mesesAte(qt) === 12, `Vencimentos: preventiva +${mesesAte(prev)}m, qualificação +${mesesAte(qt)}m`);
  confere(equip.proximoVencimento.getTime() === prev.getTime(), 'proximoVencimento deveria ser a data mais próxima');
  console.log(`     saldo 3 → 2 · preventiva ${prev.toLocaleDateString('pt-BR')} · qualificação ${qt.toLocaleDateString('pt-BR')}`);

  log('Gerar a fatura do orçamento aprovado e conferir o Pix (valor e identificador)');
  await g.goto(`${APP}/interno/orcamentos/1`);
  await g.getByRole('link', { name: 'Gerar fatura' }).click();
  await g.waitForURL(/\/interno\/faturas\/nova\?orcamento=1/);
  await g.getByRole('button', { name: /Emitir fatura \(R\$\s300,00\)/ }).click();
  await g.waitForURL(`${APP}/interno/faturas/1`);
  const fat = conferePix(await g.getByLabel('Código Pix copia e cola').inputValue(), { valor: 300, txid: 'FAT1', chave: '12345678000190' });
  confere(fat['59'] === 'Odonto Hospitalar' && fat['60'] === 'Sao Paulo', 'Pix: recebedor incorreto');
  await g.screenshot({ path: join(SAIDA, '07-fatura-pix.png'), fullPage: true });
  const pdfFatura = await baixar(g, () => g.getByRole('button', { name: 'PDF da fatura' }).click(), 'fatura-1.pdf');

  log('Cliente vê a fatura em aberto com o Pix no portal');
  await c.goto(`${APP}/portal/financeiro`);
  await c.getByRole('link', { name: /Fatura nº 1/ }).click();
  await c.getByLabel('Código Pix copia e cola').waitFor();
  await c.screenshot({ path: join(SAIDA, '08-portal-fatura-pix.png'), fullPage: true });

  log('Registrar o pagamento e as notas (NFS-e e NF-e das peças)');
  await g.getByRole('button', { name: 'Marcar como paga' }).click();
  await g.getByText('Pagamento registrado.').waitFor();
  await g.getByLabel('Nº da NFS-e').fill('123');
  await g.getByLabel('Data de emissão').fill(dia(0));
  await g.getByLabel('Nº da NF-e das peças (se houver)').fill('4567');
  await g.getByRole('button', { name: 'Salvar notas' }).click();
  await g.getByText('Notas registradas.').waitFor();
  const fatura = await esperarDoc('faturas/1', (d) => d.status === 'paga' && !!d.nfe?.numero);
  confere(fatura.status === 'paga' && fatura.pagamento.valor === 300 && fatura.nfse.numero === '123' && fatura.nfe.numero === '4567', 'Fatura sem pagamento ou notas');
  confere(fatura.totalServicos === 180 && fatura.totalPecas === 120, `Separação serviço × peça: ${fatura.totalServicos} / ${fatura.totalPecas}`);

  log('Cliente vê a fatura paga, com a NFS-e');
  await c.reload();
  await c.getByText(/nº 123/).waitFor();
  confere(!(await c.getByLabel('Código Pix copia e cola').count()), 'Fatura paga não deveria mostrar Pix');

  log('Planilha do mês para o contador');
  await g.goto(`${APP}/interno/financeiro?aba=faturas`);
  const csvMes = linhasCSV(await baixar(g, () => g.getByRole('button', { name: 'Baixar planilha (CSV)' }).click(), 'faturas-mes.csv'));
  confere(csvMes.length === 2 && csvMes[1].includes(';180,00;120,00;0,00;300,00;') && csvMes[1].includes(';123;'), `CSV do mês: ${csvMes[1]}`);
  await g.screenshot({ path: join(SAIDA, '09-financeiro-faturas.png'), fullPage: true });

  log('Segundo equipamento (monitor) com ensaio 62353 vencido e preventiva em 20 dias');
  await g.goto(`${APP}/interno/clientes/${clienteId}`);
  await g.getByRole('link', { name: 'Novo', exact: true }).click();
  await g.getByLabel('Tipo de equipamento').selectOption({ label: 'Monitor multiparamétrico' });
  await g.getByLabel('Fabricante').fill('Mindray');
  await g.getByLabel('Modelo').fill('uMEC 12');
  await g.getByLabel('Nº de série').fill('MM-3310');
  await g.getByLabel('Setor / sala').fill('Sala de recuperação');
  await g.getByRole('button', { name: 'Salvar equipamento' }).click();
  await g.getByRole('heading', { name: 'Monitor multiparamétrico' }).waitFor();
  for (const [texto, data] of [
    ['62353', dia(-10)],
    ['Manutenção preventiva', dia(20)],
  ]) {
    const linha = g.locator('.cartao', { has: g.getByRole('heading', { name: 'Preventivas e exigências' }) }).locator('.linha', { hasText: texto });
    await linha.getByRole('button', { name: 'Definir data' }).click();
    await linha.getByLabel('Próximo vencimento').fill(data);
    await linha.getByRole('button', { name: 'Salvar', exact: true }).click();
    await linha.getByLabel('Próximo vencimento').waitFor({ state: 'detached' });
  }
  await g.getByText('venceu há 10 dia(s)').waitFor();

  log('Tela de vencimentos e quadro Atenção');
  await g.goto(`${APP}/interno/vencimentos`);
  await g.getByText(/Monitor multiparamétrico/).first().waitFor();
  await g.screenshot({ path: join(SAIDA, '10-vencimentos.png'), fullPage: true });
  await g.goto(`${APP}/interno`);
  await g.getByText(/equipamento\(s\) com preventiva\/exigência vencendo/).waitFor();
  await g.getByText(/instrumento\(s\) com certificado vencendo ou vencido/).waitFor();
  await g.screenshot({ path: join(SAIDA, '11-painel-atencao.png'), fullPage: true });

  log('Indicadores do período');
  await g.goto(`${APP}/interno/indicadores`);
  await g.locator('.grafico').first().waitFor();
  await g.getByText('Atualizando com o servidor…').waitFor({ state: 'detached' });
  const valores = {
    chamados: await kpi(g, 'Chamados abertos'),
    os: await kpi(g, 'OS concluídas'),
    faturado: await kpi(g, 'Faturado'),
    recebido: await kpi(g, 'Recebido'),
    emDia: await kpi(g, 'Equipamentos em dia'),
  };
  confere(valores.chamados === '2' && valores.os === '2', `KPIs de atendimento: ${JSON.stringify(valores)}`);
  confere(/300,00/.test(valores.faturado) && /300,00/.test(valores.recebido), `KPIs financeiros: ${JSON.stringify(valores)}`);
  confere(valores.emDia === '50%', `Equipamentos em dia deveria ser 50%: ${valores.emDia}`);
  console.log('     ', JSON.stringify(valores));
  const barra = g.locator('.grafico').nth(1).locator('rect[role=button]').last();
  await barra.hover();
  await g.locator('.grafico-dica').waitFor();
  await g.screenshot({ path: join(SAIDA, '12-indicadores.png'), fullPage: true });
  await t.goto(`${APP}/interno/indicadores`);
  await t.locator('.grafico').first().waitFor();
  await t.locator('.grafico').first().locator('rect[role=button]').last().tap();
  await t.screenshot({ path: join(SAIDA, '13-indicadores-celular.png'), fullPage: true });

  log('Backup completo com fotos');
  await g.goto(`${APP}/interno/backup`);
  await g.getByLabel(/Incluir as fotos/).check();
  const arquivoBackup = await baixar(g, () => g.getByRole('button', { name: 'Baixar cópia de segurança' }).click(), 'backup.json');
  await g.getByText(/Cópia gerada:/).waitFor();
  const backup = JSON.parse(readFileSync(arquivoBackup, 'utf8'));
  const esperado = {
    usuarios: 2, clientes: 1, tiposEquipamento: 11, equipamentos: 2, chamados: 2, os: 2, orcamentos: 1, faturas: 1,
    instrumentos: 2, pecas: 1, 'pecas/movimentos': 2, config: 3, contadores: 4, 'chamados/fotos': 1, 'os/fotos': 1,
  };
  for (const [grupo, n] of Object.entries(esperado)) confere(backup.totais[grupo] === n, `Backup: ${grupo} = ${backup.totais[grupo]} (esperado ${n})`);
  confere(Object.keys(backup.documentos).length === Object.values(backup.totais).reduce((a, b) => a + b, 0), 'Backup: totais não batem com os documentos');
  const os1 = backup.documentos['os/1'];
  confere(os1.assinatura.imagem.$bytes?.length > 100 && /^\d{4}-\d\d-\d\dT/.test(os1.criadaEm.$data), 'Backup: assinatura ou datas sem o tipo');
  await g.screenshot({ path: join(SAIDA, '14-backup.png'), fullPage: true });

  log('Planilhas de OS e de equipamentos com vencimentos');
  const csvOS = linhasCSV(await baixar(g, () => g.getByRole('button', { name: 'Baixar planilha: Ordens de serviço' }).click()));
  confere(csvOS.length === 3 && csvOS[2].includes('Termômetro digital com 4 sondas Testo 735-2 nº TD-77') && csvOS[2].includes('1 × Guarnição da porta 21 L'), `CSV de OS: ${csvOS[2]}`);
  const csvEq = linhasCSV(await baixar(g, () => g.getByRole('button', { name: 'Baixar planilha: Equipamentos e vencimentos' }).click()));
  confere(csvEq.length === 3 && csvEq.some((l) => l.includes('Monitor multiparamétrico') && l.includes(';Vencido;')), `CSV de equipamentos: ${csvEq.join(' | ')}`);
  const csvEst = linhasCSV(await baixar(g, () => g.getByRole('button', { name: 'Baixar planilha: Estoque' }).click()));
  confere(csvEst[1].startsWith('GU-21;Guarnição da porta 21 L;un;2;1;Não;45,00;120,00;90,00;40169300;Sim'), `CSV de estoque: ${csvEst[1]}`);

  log('Restaurar o backup em outro projeto (conferência primeiro, depois gravação)');
  const ferramenta = join(RAIZ, 'ferramentas', 'restaurar', 'restaurar.mjs');
  const env = { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' };
  const seco = execFileSync(process.execPath, [ferramenta, arquivoBackup, '--projeto', 'demo-restaurado'], { env, encoding: 'utf8' });
  confere(seco.includes('Nada foi gravado') && !(await listar('clientes', 'demo-restaurado')).length, 'A conferência não deveria gravar nada');
  const gravado = execFileSync(process.execPath, [ferramenta, arquivoBackup, '--projeto', 'demo-restaurado', '--gravar'], { env, encoding: 'utf8' });
  console.log(`     ${gravado.trim().split('\n').pop()}`);
  for (const col of ['clientes', 'equipamentos', 'chamados', 'os', 'orcamentos', 'faturas', 'instrumentos', 'pecas', 'usuarios']) {
    const n = (await listar(col, 'demo-restaurado')).length;
    confere(n === backup.totais[col], `Restauração: ${col} = ${n} (esperado ${backup.totais[col]})`);
  }
  const [orig, rest] = [await lerDoc('os/1'), await lerDoc('os/1', 'demo-restaurado')];
  confere(rest.assinatura.imagem.base64 === orig.assinatura.imagem.base64, 'Restauração: assinatura diferente');
  confere(rest.criadaEm instanceof Date && rest.criadaEm.getTime() === orig.criadaEm.getTime(), 'Restauração: data diferente ou sem tipo');
  confere((await listar(`pecas/${pecaId}/movimentos`, 'demo-restaurado')).length === 2, 'Restauração: movimentos do estoque');
  confere((await listar('chamados/1/fotos', 'demo-restaurado')).length === 1, 'Restauração: foto do chamado');

  writeFileSync(join(SAIDA, 'resultado.json'), JSON.stringify({ ok: true, pecaId, pdfs: [pdfOrcamento, pdfFatura, laudo] }, null, 2));
  await navegador.close();
  if (erros.length) {
    console.log('\nErros de JavaScript nas páginas:\n' + erros.join('\n'));
    process.exit(1);
  }
  console.log('\nFASE 2 COMPLETA OK');
})().catch(async (e) => {
  console.error('\nFALHOU:', e.message);
  for (const [quem, p] of paginas) await p.screenshot({ path: join(SAIDA, `falha-${quem}.png`), fullPage: true }).catch(() => {});
  process.exit(1);
});

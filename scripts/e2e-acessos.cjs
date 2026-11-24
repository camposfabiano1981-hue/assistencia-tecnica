// Teste ponta a ponta do menu lateral, da tela inicial com indicadores, dos níveis de acesso (vários gestores,
// administrativo e técnico) e do cadastro de peças. Rode depois de e2e.cjs, e2e-fase2.cjs e e2e-fase3.cjs.
// Uso: NODE_PATH=$(npm root -g) node scripts/e2e-acessos.cjs
const { chromium, devices } = require('playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

const APP = process.env.APP_URL || 'http://localhost:5173';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const PROJETO = 'demo-assistencia';
const SAIDA = join(__dirname, '..', 'capturas', 'acessos');
mkdirSync(SAIDA, { recursive: true });

const BR = { locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' };
const GESTOR = { nome: 'Carlos Técnico', email: 'gestor@empresa.com', senha: 'SenhaForte123' };
const CLIENTE = { email: 'ana@clinicasorriso.com', senha: 'SenhaCliente1' };
const SOCIA = { nome: 'Beatriz Sócia', email: 'beatriz@empresa.com', senha: 'SenhaSocia123' };
const ADM = { nome: 'Rita Administrativo', email: 'rita@empresa.com', senha: 'SenhaRita123' };
const TEC = { nome: 'Paulo Técnico', email: 'paulo@empresa.com', senha: 'SenhaPaulo123' };

let passo = 0;
const log = (m) => console.log(`[${String(++passo).padStart(2, '0')}] ${m}`);
const confere = (ok, m) => {
  if (!ok) throw new Error(m);
};

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

/** Papel gravado no banco para o e-mail (leitura direta do emulador, sem regras). */
async function papelNoBanco(email) {
  const r = await fetch(`${FS}/v1/projects/${PROJETO}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId: 'usuarios' }], where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: email } } } },
    }),
  });
  const [linha] = await r.json();
  const f = linha?.document?.fields;
  return f ? { papel: f.papel?.stringValue, ativo: f.ativo?.booleanValue } : null;
}
async function esperarPapel(email, cond, ms = 8000) {
  let d;
  for (const fim = Date.now() + ms; Date.now() < fim; await new Promise((r) => setTimeout(r, 200))) {
    d = await papelNoBanco(email);
    if (d && cond(d)) return d;
  }
  return d;
}

async function entrar(pagina, email, senha) {
  await pagina.goto(`${APP}/login`);
  await pagina.getByLabel('E-mail').fill(email);
  await pagina.getByLabel('Senha', { exact: true }).fill(senha);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.waitForURL((u) => u.pathname === '/interno' || u.pathname === '/portal');
}

const menu = (p) => p.getByRole('navigation', { name: 'Menu principal' });
/** Captura da página inteira numa tela alta o bastante: o menu lateral acompanha a altura toda. */
async function fotoInteira(p, arquivo) {
  const antes = p.viewportSize();
  const altura = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: antes.width, height: Math.max(antes.height, altura) });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: join(SAIDA, arquivo) });
  await p.setViewportSize(antes);
}
/** Abre a gaveta do menu (celular) e espera a animação terminar. */
async function abrirGaveta(p) {
  await p.getByRole('button', { name: 'Abrir menu' }).click();
  await p.locator('.menu-lateral[data-aberto="true"]').waitFor();
  await p.waitForFunction(() => getComputedStyle(document.querySelector('.menu-lateral')).transform === 'none');
}
async function gruposDoMenu(p) {
  return menu(p).locator('button.menu-grupo').allInnerTexts().then((l) => l.map((t) => t.trim()));
}
async function textoKpis(p) {
  await p.locator('.kpi-link').first().waitFor();
  // Espera os números chegarem (enquanto carrega, o valor é "…").
  await p.waitForFunction(() => [...document.querySelectorAll('.kpi-valor')].every((e) => e.textContent.trim() !== '…'));
  return p.locator('.kpi-link .kpi-rotulo').allInnerTexts().then((l) => l.map((t) => t.trim()));
}

const paginas = [];
(async () => {
  const navegador = await chromium.launch();
  const erros = [];
  const vigiar = (p, quem) => {
    paginas.push([quem, p]);
    p.on('dialog', (d) => d.accept());
    p.on('pageerror', (e) => erros.push(`${quem}: ${e.message}`));
  };

  // ---------- Gestor no computador ----------
  const ctxG = await navegador.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2, ...BR });
  const g = await ctxG.newPage();
  vigiar(g, 'gestor');

  log('Gestor entra: menu lateral com todos os grupos e tela inicial com indicadores');
  await entrar(g, GESTOR.email, GESTOR.senha);
  await g.getByRole('heading', { name: /Olá, Carlos/ }).waitFor();
  await menu(g).waitFor();
  const grupos = await gruposDoMenu(g);
  confere(grupos.join('|') === 'Atendimento|Financeiro|Cadastros|Relatórios|Administração', `Grupos do menu do gestor: ${grupos}`);
  await g.locator('.painel-graficos .grafico').nth(1).waitFor();
  const kpis = await textoKpis(g);
  for (const k of ['Novos chamados', 'Atendimentos hoje', 'A receber', 'Orçamentos aguardando', 'Preventivas em 30 dias', 'Satisfação dos clientes', 'Contratos ativos']) {
    confere(kpis.includes(k), `Falta o indicador "${k}" no painel do gestor: ${kpis}`);
  }
  confere(kpis.some((k) => k.startsWith('Faturado em')), 'Falta o faturado do mês no painel');
  const satisfacao = await g.locator('.kpi-link', { hasText: 'Satisfação dos clientes' }).locator('.kpi-valor').innerText();
  confere(satisfacao === '4,5 / 5', `Satisfação no painel: ${satisfacao}`);
  await fotoInteira(g, '01-painel-gestor.png');

  log('Submenu: abrir Cadastros e ir para Peças e estoque');
  const cadastros = menu(g).getByRole('button', { name: 'Cadastros' });
  confere((await cadastros.getAttribute('aria-expanded')) === 'false', 'Cadastros deveria começar fechado');
  await cadastros.click();
  confere((await cadastros.getAttribute('aria-expanded')) === 'true', 'Cadastros não abriu');
  await menu(g).getByRole('link', { name: 'Peças e estoque' }).click();
  await g.waitForURL(`${APP}/interno/estoque`);
  // A navegação é uma transição do React: espera o menu marcar o item da página.
  await menu(g).locator('a.active[aria-current="page"]', { hasText: 'Peças e estoque' }).waitFor({ timeout: 5000 });
  // Abrir outro grupo fecha o anterior (um submenu por vez).
  await menu(g).getByRole('button', { name: 'Financeiro' }).click();
  confere((await cadastros.getAttribute('aria-expanded')) === 'false', 'Cadastros deveria fechar ao abrir Financeiro');
  await menu(g).getByRole('link', { name: 'Faturas' }).click();
  await g.waitForURL(`${APP}/interno/faturas`);
  await g.getByRole('heading', { name: 'Faturas', exact: true }).waitFor();
  await g.goto(`${APP}/interno/financeiro?aba=orcamentos`);
  await g.waitForURL(`${APP}/interno/orcamentos`);

  log('Peças no padrão dos serviços: sugestões, preço, fabricante e escolha no orçamento');
  await g.goto(`${APP}/interno/estoque`);
  await g.getByText('Guarnição da porta 21 L').waitFor();
  await g.getByRole('button', { name: 'Incluir peças comuns que faltam' }).click();
  await g.getByText(/16 peça\(s\) incluída\(s\)/).waitFor();
  const fusivel = g.getByRole('link', { name: /Fusível de vidro 5x20 mm/ });
  await fusivel.getByText('Sem preço').waitFor();
  await fusivel.click();
  await g.getByLabel('Preço de venda').fill('4,50');
  await g.getByLabel('Fabricante ou marca').fill('Genérico');
  await g.getByLabel('Aplicação (equipamentos em que serve)').fill('Autoclaves e compressores');
  await g.getByLabel('Estoque mínimo').fill('10');
  await g.getByRole('button', { name: 'Salvar peça' }).click();
  await g.getByText('Peça salva.').waitFor();
  await g.getByRole('button', { name: 'Excluir peça' }).waitFor();
  await g.goto(`${APP}/interno/estoque`);
  await g.getByRole('link', { name: /Fusível de vidro 5x20 mm.*Genérico.*R\$ 4,50\/un/ }).waitFor();
  await g.getByRole('searchbox', { name: 'Buscar peça' }).fill('compressor');
  await g.getByRole('link', { name: /Filtro de ar do compressor/ }).waitFor();
  await g.getByRole('link', { name: /Fusível de vidro/ }).waitFor(); // achado pela aplicação
  await g.getByRole('searchbox', { name: 'Buscar peça' }).fill('');
  await fotoInteira(g, '02-pecas.png');
  await g.goto(`${APP}/interno/orcamentos/novo`);
  await g.getByLabel('Adicionar peça cadastrada').locator('option', { hasText: 'Fusível de vidro 5x20 mm — R$ 4,50' }).waitFor({ state: 'attached' });

  log('Equipe e acessos: cadastrar uma sócia gestora, uma administrativa e um técnico');
  await g.goto(`${APP}/interno/equipe`);
  await g.getByRole('heading', { name: 'Equipe e acessos' }).waitFor();
  confere((await g.getByLabel(`Nível de acesso de ${GESTOR.nome}`).count()) === 0, 'O gestor não pode mudar o próprio nível');
  for (const [p, nivel] of [
    [SOCIA, 'Gestor'],
    [ADM, 'Técnico'],
    [TEC, 'Técnico'],
  ]) {
    await g.getByLabel('Nome', { exact: true }).fill(p.nome);
    await g.getByLabel('E-mail', { exact: true }).fill(p.email);
    await g.getByLabel('Nível de acesso', { exact: true }).selectOption({ label: nivel });
    await g.getByRole('button', { name: 'Adicionar à equipe' }).click();
    await g.getByText(`${p.nome} entrou na equipe como ${nivel}.`, { exact: false }).waitFor();
  }
  log('Mudar o nível de Rita para Administrativo');
  await g.getByLabel(`Nível de acesso de ${ADM.nome}`).selectOption('administrativo');
  await g.getByText(`${ADM.nome} agora tem o nível Administrativo.`, { exact: false }).waitFor();
  const rita = await esperarPapel(ADM.email, (d) => d.papel === 'administrativo');
  confere(rita?.papel === 'administrativo', `Nível de Rita no banco: ${JSON.stringify(rita)}`);
  confere((await esperarPapel(SOCIA.email, (d) => d.papel === 'gestor'))?.papel === 'gestor', 'Sócia não ficou gestora');
  await g.getByText('hoje são 2', { exact: false }).waitFor();
  await fotoInteira(g, '03-equipe-e-acessos.png');
  for (const p of [SOCIA, ADM, TEC]) await definirSenhaPeloEmulador(p.email, p.senha);

  // ---------- Técnico no celular ----------
  log('Técnico no celular: gaveta do menu sem Financeiro e sem Administração');
  const ctxT = await navegador.newContext({ ...devices['Pixel 7'], ...BR });
  const t = await ctxT.newPage();
  vigiar(t, 'tecnico');
  await entrar(t, TEC.email, TEC.senha);
  await t.getByRole('heading', { name: /Olá, Paulo/ }).waitFor();
  const kpisTec = await textoKpis(t);
  confere(kpisTec.join('|') === 'Novos chamados|Minhas OS hoje|Minhas OS em aberto|Preventivas em 30 dias', `Indicadores do técnico: ${kpisTec}`);
  confere((await t.locator('.painel-graficos .grafico').count()) === 1, 'O técnico deveria ver só o gráfico de chamados');
  await t.screenshot({ path: join(SAIDA, '04-painel-tecnico-celular.png'), fullPage: true });
  const abrir = t.getByRole('button', { name: 'Abrir menu' });
  await abrirGaveta(t);
  const gruposTec = await gruposDoMenu(t);
  confere(gruposTec.join('|') === 'Atendimento|Cadastros|Relatórios', `Grupos do menu do técnico: ${gruposTec}`);
  await menu(t).getByRole('button', { name: 'Cadastros' }).click();
  await t.screenshot({ path: join(SAIDA, '05-menu-tecnico-celular.png') });
  await t.keyboard.press('Escape');
  await t.locator('.menu-lateral[data-aberto="false"]').waitFor({ state: 'attached' });
  confere((await abrir.getAttribute('aria-expanded')) === 'false', 'A gaveta não fechou com Esc');

  log('Técnico não entra no financeiro nem nas configurações');
  for (const rota of ['faturas', 'orcamentos/novo', 'contratos', 'config', 'equipe', 'backup']) {
    await t.goto(`${APP}/interno/${rota}`);
    await t.getByRole('heading', { name: 'Área fora do seu nível de acesso' }).waitFor();
  }
  await t.screenshot({ path: join(SAIDA, '06-sem-acesso-celular.png') });

  log('Técnico consulta peças e serviços sem alterar preços, e registra entrada no estoque');
  await t.goto(`${APP}/interno/estoque`);
  await t.getByText('O cadastro e os preços são feitos pelo gestor ou pelo administrativo', { exact: false }).waitFor();
  confere((await t.getByRole('link', { name: 'Nova peça' }).count()) === 0, 'Técnico não deveria ver "Nova peça"');
  confere((await t.getByText('Valor em estoque (custo)').count()) === 0, 'Técnico não deveria ver o valor em estoque');
  await t.getByRole('link', { name: /Fusível de vidro 5x20 mm/ }).click();
  confere(await t.getByLabel('Preço de venda').isDisabled(), 'Preço deveria estar bloqueado para o técnico');
  confere((await t.getByRole('button', { name: 'Salvar peça' }).count()) === 0, 'Técnico não deveria salvar a peça');
  await t.getByLabel('Quantidade do movimento').fill('12');
  await t.getByRole('button', { name: 'Registrar' }).click();
  await t.getByText('Movimento registrado.').waitFor();
  await t.getByText('Saldo: 12 un').waitFor();
  await t.goto(`${APP}/interno/servicos`);
  await t.getByText('Tabela só para consulta', { exact: false }).waitFor();
  confere((await t.getByRole('link', { name: 'Novo', exact: true }).count()) === 0, 'Técnico não deveria criar serviço');
  await t.goto(`${APP}/interno/indicadores`);
  await t.locator('.grafico').first().waitFor();
  confere((await t.getByRole('heading', { name: 'Faturamento' }).count()) === 0, 'Técnico não deveria ver o faturamento');

  // ---------- Administrativo no computador ----------
  log('Administrativo: financeiro sim, administração não');
  const ctxA = await navegador.newContext({ viewport: { width: 1280, height: 860 }, ...BR });
  const a = await ctxA.newPage();
  vigiar(a, 'administrativo');
  await entrar(a, ADM.email, ADM.senha);
  await a.getByRole('heading', { name: /Olá, Rita/ }).waitFor();
  const gruposAdm = await gruposDoMenu(a);
  confere(gruposAdm.join('|') === 'Atendimento|Financeiro|Cadastros|Relatórios', `Grupos do menu do administrativo: ${gruposAdm}`);
  confere((await textoKpis(a)).some((k) => k.startsWith('Faturado em')), 'Administrativo deveria ver o faturado do mês');
  await a.goto(`${APP}/interno/config`);
  await a.getByRole('heading', { name: 'Área fora do seu nível de acesso' }).waitFor();
  await a.goto(`${APP}/interno/faturas`);
  await a.getByRole('link', { name: /Fatura nº|nº 1/ }).first().waitFor();
  await a.goto(`${APP}/interno/backup`);
  await a.getByText('A cópia de segurança completa é feita pelo gestor', { exact: false }).waitFor();

  // ---------- Segunda gestora ----------
  log('A sócia (segunda gestora) administra a equipe: bloqueia e libera o técnico');
  const ctxS = await navegador.newContext({ viewport: { width: 1280, height: 860 }, ...BR });
  const s = await ctxS.newPage();
  vigiar(s, 'socia');
  await entrar(s, SOCIA.email, SOCIA.senha);
  await menu(s).getByRole('button', { name: 'Administração' }).click();
  await menu(s).getByRole('link', { name: 'Equipe e acessos' }).click();
  await s.getByRole('heading', { name: 'Equipe e acessos' }).waitFor();
  confere((await s.getByLabel(`Nível de acesso de ${SOCIA.nome}`).count()) === 0, 'A sócia não pode mudar o próprio nível');
  const linhaPaulo = s.locator('.pessoa', { hasText: TEC.nome });
  await linhaPaulo.getByRole('button', { name: 'Bloquear' }).click();
  await s.getByText(`Acesso de ${TEC.nome} bloqueado.`).waitFor();
  confere((await esperarPapel(TEC.email, (d) => d.ativo === false))?.ativo === false, 'Técnico não foi bloqueado');
  await t.getByText('Acesso ainda não liberado').waitFor();
  await linhaPaulo.getByRole('button', { name: 'Liberar' }).click();
  await s.getByText(`Acesso de ${TEC.nome} liberado.`).waitFor();

  // ---------- Portal do cliente ----------
  log('Portal do cliente no celular: menu lateral com Abrir chamado em destaque');
  const ctxC = await navegador.newContext({ ...devices['Pixel 7'], ...BR });
  const c = await ctxC.newPage();
  vigiar(c, 'cliente');
  await entrar(c, CLIENTE.email, CLIENTE.senha);
  await abrirGaveta(c);
  const itensPortal = await menu(c).getByRole('link').allInnerTexts();
  confere(
    itensPortal.map((i) => i.trim()).join('|') === 'Meus chamados|Abrir chamado|Meus equipamentos|Pasta da VISA|Financeiro|Minha conta',
    `Itens do portal: ${itensPortal}`,
  );
  await c.screenshot({ path: join(SAIDA, '07-portal-menu-celular.png') });
  await menu(c).getByRole('link', { name: 'Pasta da VISA' }).click();
  await c.waitForURL(`${APP}/portal/visa`);
  confere((await c.getByRole('button', { name: 'Abrir menu' }).getAttribute('aria-expanded')) === 'false', 'A gaveta deveria fechar ao navegar');

  await navegador.close();
  if (erros.length) {
    console.log('\nErros de JavaScript nas páginas:\n' + erros.join('\n'));
    process.exit(1);
  }
  console.log('\nMENU, PAINEL E ACESSOS OK');
})().catch(async (e) => {
  console.error('\nFALHOU:', e.message);
  for (const [quem, p] of paginas) await p.screenshot({ path: join(SAIDA, `falha-${quem}.png`), fullPage: true }).catch(() => {});
  process.exit(1);
});

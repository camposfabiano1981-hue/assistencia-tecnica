// Gera os ícones PNG do app a partir de public/favicon.svg.
// Uso: NODE_PATH=$(npm root -g) node scripts/gerar-icones.cjs  (requer Playwright)
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const pub = join(__dirname, '..', 'public');
const svg = readFileSync(join(pub, 'favicon.svg'), 'utf8');
const saidas = [
  { arquivo: 'pwa-192.png', lado: 192, margem: 0 },
  { arquivo: 'pwa-512.png', lado: 512, margem: 0 },
  { arquivo: 'apple-touch-icon.png', lado: 180, margem: 0 },
  { arquivo: 'pwa-512-maskable.png', lado: 512, margem: 0.1 },
];
(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  for (const s of saidas) {
    const interno = Math.round(s.lado * (1 - s.margem * 2));
    await pagina.setViewportSize({ width: s.lado, height: s.lado });
    await pagina.setContent(
      `<html><body style="margin:0;background:#0e5a74;display:grid;place-items:center;width:${s.lado}px;height:${s.lado}px">` +
        svg.replace('<svg ', `<svg width="${interno}" height="${interno}" `) +
        '</body></html>',
    );
    await pagina.screenshot({ path: join(pub, s.arquivo) });
  }
  await navegador.close();
  console.log('ícones gerados');
})();

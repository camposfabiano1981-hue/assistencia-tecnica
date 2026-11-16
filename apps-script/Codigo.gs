/**
 * Aviso de novo chamado por e-mail (gratuito, Google Apps Script).
 * Cole este arquivo em script.google.com — passo a passo em apps-script/LEIA-ME.md.
 *
 * Propriedades do script (Configurações do projeto → Propriedades do script):
 *   EMAIL_DESTINO  e-mail(s) que recebem os avisos, separados por vírgula
 *   TOKEN          o mesmo "Código de segurança" salvo no app (Configurações → Aviso por e-mail)
 *   APP_URL        endereço do sistema, ex.: https://seu-projeto.web.app
 */
function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var destino = props.getProperty('EMAIL_DESTINO');
  var token = props.getProperty('TOKEN') || '';
  var app = (props.getProperty('APP_URL') || '').replace(/\/+$/, '');
  var d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (erro) {
    return resposta('json inválido');
  }
  if (!destino) return resposta('sem destino');
  if (token && d.token !== token) return resposta('negado');

  // Limite contra abuso: até 40 avisos por hora.
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('contagem') || 0);
  if (n >= 40) return resposta('limite');
  cache.put('contagem', String(n + 1), 3600);

  var limpa = function (s, max) { return String(s == null ? '' : s).slice(0, max); };
  var numero = String(d.numero || '').replace(/\D/g, '').slice(0, 9);
  var teste = !numero || numero === '0';
  // O link é montado aqui (não vem do navegador), para ninguém injetar endereço falso no e-mail.
  var link = app && !teste ? app + '/interno/chamados/' + numero : app;

  var assunto = teste
    ? 'Teste do aviso de chamados'
    : 'Chamado nº ' + numero + (d.parado ? ' · PARADO' : '') + ' — ' + limpa(d.cliente, 80);
  var corpo = [
    'Cliente: ' + limpa(d.cliente, 120),
    'Equipamento: ' + limpa(d.equipamento, 200),
    'Equipamento parado: ' + (d.parado ? 'SIM' : 'não'),
    '',
    limpa(d.relato, 1500),
    '',
    link ? 'Abrir no sistema: ' + link : '',
  ].join('\n');

  MailApp.sendEmail({ to: destino, subject: assunto, body: corpo, name: 'Chamados' });
  return resposta('ok');
}

function resposta(texto) {
  return ContentService.createTextOutput(texto);
}

/** Rode esta função uma vez pelo editor para autorizar o envio e conferir se o e-mail chega. */
function testar() {
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  doPost({ postData: { contents: JSON.stringify({ token: token, numero: 0, cliente: 'TESTE', equipamento: 'Teste manual', parado: false, relato: 'Se este e-mail chegou, o aviso está funcionando.' }) } });
}

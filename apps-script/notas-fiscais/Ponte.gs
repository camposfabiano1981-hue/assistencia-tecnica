/**
 * Ponte das notas fiscais: app (Firebase) -> Focus NFe -> fatura no Firestore.
 *
 * Por que existe: o token da Focus NFe não pode ficar no app (qualquer celular o leria). Ele fica nas
 * Propriedades deste script, que roda na sua conta Google, de graça. O app grava o pedido de emissão
 * na fatura e chama esta ponte; a ponte envia à Focus, consulta a autorização e grava o resultado
 * (número, chave, PDF e XML) de volta na fatura. Uma verificação a cada 5 minutos conclui o que ficar
 * pendente.
 *
 * Instalação: veja LEIA-ME.md nesta pasta. Propriedades do script:
 *   FIREBASE_PROJETO          ID do projeto do Firebase (ex.: assist-tec)
 *   FOCUS_TOKEN_HOMOLOGACAO   token de homologação da Focus NFe (testes)
 *   FOCUS_TOKEN_PRODUCAO      token de produção da Focus NFe (só depois dos testes)
 */
var VERSAO_PONTE = '1';
var BASES = { homologacao: 'https://homologacao.focusnfe.com.br', producao: 'https://api.focusnfe.com.br' };
var ROTAS = { nfse: '/v2/nfsen', nfe: '/v2/nfe' };
var PENDENTES = ['solicitada', 'processando', 'cancelamento'];

function propriedades_() {
  var p = PropertiesService.getScriptProperties();
  return {
    projeto: p.getProperty('FIREBASE_PROJETO'),
    tokens: { homologacao: p.getProperty('FOCUS_TOKEN_HOMOLOGACAO'), producao: p.getProperty('FOCUS_TOKEN_PRODUCAO') },
  };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** GET ?acao=ping: o app confere se a ponte responde e quais tokens estão configurados (sem revelá-los). */
function doGet(e) {
  var cfg = propriedades_();
  if (e && e.parameter && e.parameter.acao === 'ping') {
    return json_({ ok: true, versao: VERSAO_PONTE, projeto: cfg.projeto || null, homologacao: !!cfg.tokens.homologacao, producao: !!cfg.tokens.producao });
  }
  return json_({ ok: false, erro: 'Use POST com {"faturaId": "..."}.' });
}

/** POST {"faturaId": "12"}: processa já os pedidos dessa fatura. Só lê o que está gravado no Firestore. */
function doPost(e) {
  var corpo = {};
  try {
    corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (x) {
    corpo = {};
  }
  var id = String(corpo.faturaId || '').replace(/[^0-9A-Za-z_-]/g, '');
  if (!id) return json_({ ok: false, erro: 'faturaId ausente.' });
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return json_({ ok: false, erro: 'Ponte ocupada; a verificação de 5 minutos conclui.' });
  try {
    return json_({ ok: true, resultado: processarFatura_(id) });
  } catch (x) {
    return json_({ ok: false, erro: String(x) });
  } finally {
    trava.releaseLock();
  }
}

/** Gatilho de tempo (a cada 5 minutos): conclui pedidos pendentes. */
function verificarPendentes() {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return;
  try {
    var ids = {};
    ['nfse', 'nfe'].forEach(function (tipo) {
      buscarPendentes_(tipo).forEach(function (id) {
        ids[id] = true;
      });
    });
    Object.keys(ids).forEach(function (id) {
      try {
        processarFatura_(id);
      } catch (x) {
        console.error('Fatura ' + id + ': ' + x);
      }
    });
  } finally {
    trava.releaseLock();
  }
}

function processarFatura_(id) {
  var fatura = lerDocumento_('faturas/' + id);
  if (!fatura) return 'fatura não encontrada';
  var resultado = {};
  ['nfse', 'nfe'].forEach(function (tipo) {
    var pedido = fatura.emissao && fatura.emissao[tipo];
    if (pedido && PENDENTES.indexOf(pedido.status) >= 0) resultado[tipo] = processarPedido_(id, tipo, pedido);
  });
  return resultado;
}

function processarPedido_(id, tipo, pedido) {
  var cfg = propriedades_();
  var base = BASES[pedido.ambiente];
  var token = cfg.tokens[pedido.ambiente];
  if (!base || !token) {
    return gravarPedido_(id, tipo, { status: 'erro', mensagem: 'Token da Focus NFe de ' + pedido.ambiente + ' não configurado na ponte.' });
  }
  var url = base + ROTAS[tipo] + '/' + encodeURIComponent(pedido.ref);

  // Em homologação a nota não tem valor fiscal: não vira o número oficial da fatura.
  var oficial = pedido.ambiente === 'producao';

  if (pedido.status === 'solicitada') {
    var envio = http_('post', base + ROTAS[tipo] + '?ref=' + encodeURIComponent(pedido.ref), token, pedido.payload || {});
    if (envio.codigo >= 200 && envio.codigo < 300) {
      gravarPedido_(id, tipo, { status: 'processando', mensagem: null });
      Utilities.sleep(2500);
      return consultar_(id, tipo, url, token, base, oficial);
    }
    // Mesma referência já recebida (reenvio depois de uma queda): só consulta.
    if (envio.codigo === 422 && /ja.?(foi|existe)|already/i.test(JSON.stringify(envio.corpo))) return consultar_(id, tipo, url, token, base, oficial);
    return gravarPedido_(id, tipo, { status: 'erro', mensagem: mensagemDe_(envio) });
  }

  if (pedido.status === 'processando') return consultar_(id, tipo, url, token, base, oficial);

  // Cancelamento
  var canc = http_('delete', url, token, { justificativa: pedido.justificativa || '' });
  var situacao = (canc.corpo && canc.corpo.status) || '';
  if (canc.codigo >= 200 && canc.codigo < 300 && /cancelad/.test(situacao)) {
    return gravarPedido_(id, tipo, { status: 'cancelada', mensagem: null }, oficial ? limparResumo_(tipo) : null);
  }
  return gravarPedido_(id, tipo, { status: 'autorizada', mensagem: 'Cancelamento não aceito: ' + mensagemDe_(canc) });
}

function limparResumo_(tipo) {
  return tipo === 'nfse' ? { nfse: null } : { nfe: null };
}

function consultar_(id, tipo, url, token, base, oficial) {
  var r = http_('get', url, token);
  var c = r.corpo || {};
  if (r.codigo === 404) return 'processando';
  if (c.status === 'autorizado') {
    var absoluto = function (caminho) {
      if (!caminho) return null;
      return /^https?:/i.test(caminho) ? caminho : base + caminho;
    };
    var campos = {
      status: 'autorizada',
      mensagem: null,
      numero: c.numero != null ? String(c.numero) : null,
      serie: c.serie != null ? String(c.serie) : null,
      chave: c.chave_nfe || c.chave_nfse || c.chave_acesso || c.chave || null,
      codigoVerificacao: c.codigo_verificacao || null,
      urlPdf: absoluto(c.url_danfse || c.caminho_danfe || c.url || null),
      urlXml: absoluto(c.caminho_xml_nota_fiscal || null),
      autorizadaEm: new Date(),
    };
    var resumo =
      tipo === 'nfse'
        ? { nfse: { numero: campos.numero || '', emitidaEm: c.data_emissao ? new Date(c.data_emissao) : new Date(), chave: campos.chave || campos.codigoVerificacao || '' } }
        : { nfe: { numero: campos.numero || '', chave: campos.chave || '' } };
    return gravarPedido_(id, tipo, campos, oficial ? resumo : null);
  }
  if (c.status === 'erro_autorizacao' || c.status === 'denegado') return gravarPedido_(id, tipo, { status: 'erro', mensagem: mensagemDe_(r) });
  if (c.status === 'cancelado') return gravarPedido_(id, tipo, { status: 'cancelada', mensagem: null }, oficial ? limparResumo_(tipo) : null);
  return 'processando';
}

function mensagemDe_(r) {
  var c = r.corpo || {};
  if (c.erros && c.erros.length) {
    return c.erros
      .map(function (e) {
        return (e.mensagem || e.codigo || '') + (e.correcao ? ' (' + e.correcao + ')' : '');
      })
      .join('; ');
  }
  return c.mensagem_sefaz || c.mensagem || 'HTTP ' + r.codigo;
}

function http_(metodo, url, token, corpo) {
  var opcoes = { method: metodo, muteHttpExceptions: true, headers: { Authorization: 'Basic ' + Utilities.base64Encode(token + ':') } };
  if (corpo) {
    opcoes.contentType = 'application/json';
    opcoes.payload = JSON.stringify(corpo);
  }
  var resposta = UrlFetchApp.fetch(url, opcoes);
  var texto = resposta.getContentText();
  var json;
  try {
    json = JSON.parse(texto);
  } catch (x) {
    json = { mensagem: String(texto).slice(0, 300) };
  }
  return { codigo: resposta.getResponseCode(), corpo: json };
}

// ---------------- Firestore (REST, com a autorização da sua conta, dona do projeto) ----------------

function urlFirestore_(caminho) {
  return 'https://firestore.googleapis.com/v1/projects/' + propriedades_().projeto + '/databases/(default)/documents' + (caminho ? '/' + caminho : '');
}

function firestore_(metodo, url, corpo) {
  var opcoes = {
    method: metodo,
    muteHttpExceptions: true,
    // x-goog-user-project: cobra a chamada no projeto do Firebase (onde o Firestore está ativo).
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': propriedades_().projeto },
  };
  if (corpo) {
    opcoes.contentType = 'application/json';
    opcoes.payload = JSON.stringify(corpo);
  }
  var r = UrlFetchApp.fetch(url, opcoes);
  var codigo = r.getResponseCode();
  if (codigo === 404) return null;
  if (codigo >= 300) throw new Error('Firestore ' + codigo + ': ' + String(r.getContentText()).slice(0, 300));
  return JSON.parse(r.getContentText() || '{}');
}

function lerDocumento_(caminho) {
  var d = firestore_('get', urlFirestore_(caminho));
  return d && d.fields ? deValor_({ mapValue: { fields: d.fields } }) : null;
}

function buscarPendentes_(tipo) {
  var consulta = {
    structuredQuery: {
      from: [{ collectionId: 'faturas' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'emissao.' + tipo + '.status' },
          op: 'IN',
          value: { arrayValue: { values: PENDENTES.map(function (s) { return { stringValue: s }; }) } },
        },
      },
      limit: 50,
    },
  };
  var resposta = firestore_('post', urlFirestore_('') + ':runQuery', consulta) || [];
  return resposta
    .filter(function (x) { return x.document; })
    .map(function (x) { return x.document.name.split('/').pop(); });
}

/** Grava só os campos informados (máscara), sem apagar o resto da fatura. */
function gravarPedido_(id, tipo, campos, resumoFatura) {
  var mascara = [];
  var pedido = {};
  Object.keys(campos).forEach(function (k) {
    pedido[k] = campos[k];
    mascara.push('emissao.' + tipo + '.' + k);
  });
  pedido.atualizadaEm = new Date();
  mascara.push('emissao.' + tipo + '.atualizadaEm');
  var documento = { emissao: {} };
  documento.emissao[tipo] = pedido;
  if (resumoFatura) {
    Object.keys(resumoFatura).forEach(function (k) {
      documento[k] = resumoFatura[k];
      mascara.push(k);
    });
  }
  var url =
    urlFirestore_('faturas/' + id) +
    '?' +
    mascara.map(function (m) { return 'updateMask.fieldPaths=' + encodeURIComponent(m); }).join('&') +
    '&currentDocument.exists=true';
  firestore_('patch', url, { fields: paraValor_(documento).mapValue.fields });
  return campos.status;
}

function paraValor_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(paraValor_) } };
  var campos = {};
  Object.keys(v).forEach(function (k) {
    campos[k] = paraValor_(v[k]);
  });
  return { mapValue: { fields: campos } };
}

function deValor_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(deValor_);
  if ('mapValue' in v) {
    var o = {};
    var campos = v.mapValue.fields || {};
    Object.keys(campos).forEach(function (k) {
      o[k] = deValor_(campos[k]);
    });
    return o;
  }
  return null;
}

/** Rode uma vez no editor: confere o acesso ao Firestore e cria a verificação a cada 5 minutos. */
function instalar() {
  var cfg = propriedades_();
  if (!cfg.projeto) throw new Error('Crie a propriedade FIREBASE_PROJETO (ex.: assist-tec).');
  firestore_('get', urlFirestore_('config/instalacao'));
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'verificarPendentes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('verificarPendentes').timeBased().everyMinutes(5).create();
  console.log('Ponte pronta: Firestore acessível; verificação a cada 5 minutos criada.');
  console.log('Tokens: homologação ' + (cfg.tokens.homologacao ? 'ok' : 'FALTA') + ', produção ' + (cfg.tokens.producao ? 'ok' : 'ainda não'));
}

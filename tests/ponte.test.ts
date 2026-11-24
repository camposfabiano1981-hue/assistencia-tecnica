// A ponte roda no Google Apps Script; aqui ela roda num ambiente simulado (Focus NFe e Firestore falsos).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

type Resposta = { codigo: number; corpo: unknown };
type Chamada = { metodo: string; url: string; corpo?: Record<string, unknown>; headers: Record<string, string> };

/* eslint-disable @typescript-eslint/no-explicit-any */
function carregar(fatura: Record<string, any>, focus: (c: Chamada) => Resposta, props: Record<string, string> = {}) {
  const propriedades: Record<string, string> = { FIREBASE_PROJETO: 'assist-tec', FOCUS_TOKEN_HOMOLOGACAO: 'tok-h', ...props };
  const estado = { fatura: structuredClone(fatura), focus: [] as Chamada[], firestore: [] as Chamada[] };
  const sandbox: any = {
    console: { log() {}, error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => propriedades[k] ?? null }) },
    ScriptApp: { getOAuthToken: () => 'oauth-dono' },
    Utilities: { sleep() {}, base64Encode: (s: string) => Buffer.from(s).toString('base64') },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { createTextOutput: (t: string) => ({ texto: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  };
  const responder = (codigo: number, corpo: unknown) => ({ getResponseCode: () => codigo, getContentText: () => JSON.stringify(corpo) });
  sandbox.UrlFetchApp = {
    fetch(url: string, op: any) {
      const c: Chamada = { metodo: op.method, url, corpo: op.payload ? JSON.parse(op.payload) : undefined, headers: op.headers ?? {} };
      if (url.startsWith('https://firestore.googleapis.com/')) {
        estado.firestore.push(c);
        if (url.endsWith(':runQuery')) {
          const st = estado.fatura.emissao?.nfse?.status ?? estado.fatura.emissao?.nfe?.status;
          return responder(200, ['solicitada', 'processando', 'cancelamento'].includes(st) ? [{ document: { name: 'projects/p/databases/(default)/documents/faturas/7' } }] : [{}]);
        }
        if (op.method === 'get') return responder(200, { name: 'faturas/7', fields: sandbox.paraValor_(estado.fatura).mapValue.fields });
        if (op.method === 'patch') {
          const novos = sandbox.deValor_({ mapValue: { fields: c.corpo!.fields } });
          const mascaras = [...new URL(url).searchParams.getAll('updateMask.fieldPaths')];
          for (const m of mascaras) {
            const partes = m.split('.');
            let origem: any = novos;
            let destino: any = estado.fatura;
            for (const p of partes.slice(0, -1)) {
              origem = origem?.[p];
              destino[p] = destino[p] ?? {};
              destino = destino[p];
            }
            destino[partes[partes.length - 1]] = origem?.[partes[partes.length - 1]] ?? null;
          }
          return responder(200, {});
        }
      }
      estado.focus.push(c);
      const r = focus(c);
      return responder(r.codigo, r.corpo);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync('apps-script/notas-fiscais/Ponte.gs', 'utf8'), sandbox);
  return { sandbox, estado };
}

const pedido = (extra: Record<string, unknown>) => ({ ambiente: 'homologacao', ref: 'fat7-nfse-1', tentativa: 1, payload: { valor_servico: 270 }, ...extra });
const post = (s: any) => JSON.parse(s.doPost({ postData: { contents: '{"faturaId":"7"}' } }).texto);

describe('ponte das notas fiscais (Apps Script)', () => {
  it('responde ao teste sem revelar os tokens', () => {
    const { sandbox } = carregar({}, () => ({ codigo: 500, corpo: {} }));
    expect(JSON.parse(sandbox.doGet({ parameter: { acao: 'ping' } }).texto)).toEqual({ ok: true, versao: '1', projeto: 'assist-tec', homologacao: true, producao: false });
  });

  it('envia a NFS-e, consulta e grava número, PDF e XML na fatura sem apagar o resto', () => {
    const { sandbox, estado } = carregar(
      { numero: 7, total: 300, emissao: { nfse: pedido({ status: 'solicitada' }) } },
      (c) =>
        c.metodo === 'post'
          ? { codigo: 202, corpo: { status: 'processando_autorizacao' } }
          : {
              codigo: 200,
              corpo: {
                status: 'autorizado',
                numero: '123',
                codigo_verificacao: 'AB12',
                url_danfse: 'https://homologacao.focusnfe.com.br/arquivos/danfse.pdf',
                caminho_xml_nota_fiscal: '/arquivos/nfse.xml',
                data_emissao: '2026-11-24T10:30:00-03:00',
              },
            },
    );
    expect(post(sandbox)).toEqual({ ok: true, resultado: { nfse: 'autorizada' } });
    const [envio, consulta] = estado.focus;
    expect(envio).toMatchObject({ metodo: 'post', url: 'https://homologacao.focusnfe.com.br/v2/nfsen?ref=fat7-nfse-1', corpo: { valor_servico: 270 } });
    expect(envio.headers.Authorization).toBe(`Basic ${Buffer.from('tok-h:').toString('base64')}`);
    expect(consulta).toMatchObject({ metodo: 'get', url: 'https://homologacao.focusnfe.com.br/v2/nfsen/fat7-nfse-1' });
    expect(estado.fatura.emissao.nfse).toMatchObject({
      status: 'autorizada',
      numero: '123',
      codigoVerificacao: 'AB12',
      urlPdf: 'https://homologacao.focusnfe.com.br/arquivos/danfse.pdf',
      urlXml: 'https://homologacao.focusnfe.com.br/arquivos/nfse.xml',
      ref: 'fat7-nfse-1',
      payload: { valor_servico: 270 },
    });
    // Homologação: a nota de teste não vira o número oficial da fatura.
    expect(estado.fatura.nfse).toBeUndefined();
    expect(estado.fatura.total).toBe(300);
    // Firestore com a conta do dono e cobrança no projeto do Firebase.
    expect(estado.firestore.every((c) => c.headers.Authorization === 'Bearer oauth-dono' && c.headers['x-goog-user-project'] === 'assist-tec')).toBe(true);
    expect(estado.firestore.filter((c) => c.metodo === 'patch').every((c) => c.url.includes('currentDocument.exists=true'))).toBe(true);
  });

  it('em produção, a nota autorizada vira o número oficial da fatura', () => {
    const { sandbox, estado } = carregar(
      { emissao: { nfse: pedido({ status: 'solicitada', ambiente: 'producao' }) } },
      (c) => (c.metodo === 'post' ? { codigo: 202, corpo: {} } : { codigo: 200, corpo: { status: 'autorizado', numero: '77', data_emissao: '2026-11-24T10:30:00-03:00' } }),
      { FOCUS_TOKEN_PRODUCAO: 'tok-p' },
    );
    post(sandbox);
    expect(estado.focus[0].url).toBe('https://api.focusnfe.com.br/v2/nfsen?ref=fat7-nfse-1');
    expect(estado.focus[0].headers.Authorization).toBe(`Basic ${Buffer.from('tok-p:').toString('base64')}`);
    expect(estado.fatura.nfse).toMatchObject({ numero: '77' });
  });

  it('grava a recusa do provedor com a mensagem', () => {
    const { sandbox, estado } = carregar({ emissao: { nfse: pedido({ status: 'solicitada' }) } }, () => ({
      codigo: 422,
      corpo: { erros: [{ codigo: 'E1', mensagem: 'CNPJ do tomador inválido', correcao: 'confira o cadastro' }] },
    }));
    post(sandbox);
    expect(estado.fatura.emissao.nfse).toMatchObject({ status: 'erro', mensagem: 'CNPJ do tomador inválido (confira o cadastro)' });
  });

  it('sem o token do ambiente, não chama o provedor', () => {
    const { sandbox, estado } = carregar({ emissao: { nfse: pedido({ status: 'solicitada', ambiente: 'producao' }) } }, () => ({ codigo: 200, corpo: {} }));
    post(sandbox);
    expect(estado.focus).toHaveLength(0);
    expect(estado.fatura.emissao.nfse.mensagem).toMatch(/producao não configurado/);
  });

  it('cancela a NF-e com a justificativa e limpa o número da fatura', () => {
    const { sandbox, estado } = carregar(
      { nfe: { numero: '55', chave: 'x' }, emissao: { nfe: pedido({ status: 'cancelamento', ambiente: 'producao', ref: 'fat7-nfe-1', justificativa: 'Peça devolvida pelo cliente' }) } },
      () => ({ codigo: 200, corpo: { status: 'cancelado' } }),
      { FOCUS_TOKEN_PRODUCAO: 'tok-p' },
    );
    post(sandbox);
    expect(estado.focus[0]).toMatchObject({ metodo: 'delete', url: 'https://api.focusnfe.com.br/v2/nfe/fat7-nfe-1', corpo: { justificativa: 'Peça devolvida pelo cliente' } });
    expect(estado.fatura.emissao.nfe.status).toBe('cancelada');
    expect(estado.fatura.nfe).toBeNull();
  });

  it('a verificação de 5 minutos conclui o que ficou em processamento', () => {
    const { sandbox, estado } = carregar({ emissao: { nfse: pedido({ status: 'processando' }) } }, () => ({ codigo: 200, corpo: { status: 'autorizado', numero: '9' } }));
    sandbox.verificarPendentes();
    expect(estado.firestore[0].url).toMatch(/:runQuery$/);
    expect(estado.fatura.emissao.nfse).toMatchObject({ status: 'autorizada', numero: '9' });
  });
});

// Código de verificação de autenticidade dos laudos (impresso no PDF e conferido em /v/CODIGO).
// 16 caracteres de um alfabeto sem 0/O/1/I: 80 bits aleatórios, fáceis de ditar e digitar.
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function gerarCodigoVerificacao(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => ALFABETO[b % 32]).join('');
}

/** "K7Q2MX9P…" -> "K7Q2-MX9P-…" */
export function formatarCodigo(codigo: string): string {
  return codigo.match(/.{1,4}/g)?.join('-') ?? codigo;
}

/** Aceita o código digitado com hífens, espaços ou minúsculas. */
export function normalizarCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function codigoValido(codigo: string): boolean {
  return codigo.length === 16 && [...codigo].every((c) => ALFABETO.includes(c));
}

export function urlVerificacao(codigo: string, origem = typeof location !== 'undefined' ? location.origin : ''): string {
  return `${origem}/v/${codigo}`;
}

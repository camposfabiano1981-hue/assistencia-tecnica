import { describe, expect, it } from 'vitest';
import { codigoValido, formatarCodigo, gerarCodigoVerificacao, normalizarCodigo, urlVerificacao } from '../src/util/verificacao';

describe('código de verificação do laudo', () => {
  it('tem 16 caracteres sem 0, O, 1 ou I e não se repete', () => {
    const codigos = new Set(Array.from({ length: 2000 }, gerarCodigoVerificacao));
    expect(codigos.size).toBe(2000);
    for (const c of codigos) {
      expect(c).toMatch(/^[2-9A-HJ-NP-Z]{16}$/);
      expect(codigoValido(c)).toBe(true);
    }
  });

  it('aceita o código digitado com hífens, espaços e minúsculas', () => {
    expect(normalizarCodigo(' k7q2-mx9p abcd-2345 ')).toBe('K7Q2MX9PABCD2345');
    expect(formatarCodigo('K7Q2MX9PABCD2345')).toBe('K7Q2-MX9P-ABCD-2345');
    expect(codigoValido('K7Q2MX9PABCD234')).toBe(false);
    expect(codigoValido('K7Q2MX9PABCD234O')).toBe(false);
    expect(urlVerificacao('K7Q2MX9PABCD2345', 'https://assist-tec.web.app')).toBe('https://assist-tec.web.app/v/K7Q2MX9PABCD2345');
  });
});

import { describe, expect, it } from 'vitest';
import { crc16, gerarPix, lerPix, normalizarChavePix, textoPix } from '../src/util/pix';

describe('Pix copia e cola (BR Code)', () => {
  it('CRC-16/CCITT-FALSE confere com o valor de referência', () => {
    // Valor de verificação padrão do algoritmo para "123456789".
    expect(crc16('123456789')).toBe('29B1');
  });

  it('reproduz o exemplo do Manual do BR Code do Banco Central', () => {
    const exemplo =
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000' +
      '5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
    expect(crc16(exemplo)).toBe('1D3D');
  });

  it('monta o payload com valor, recebedor e identificador', () => {
    const p = gerarPix({
      chave: '12.345.678/0001-90',
      tipoChave: 'cnpj',
      nome: 'Odonto Hospitalar Assistência Técnica',
      cidade: 'São Paulo',
      valor: 1234.5,
      txid: 'FAT-0007',
    });
    const c = lerPix(p);
    expect(c['00']).toBe('01');
    expect(c['52']).toBe('0000');
    expect(c['53']).toBe('986');
    expect(c['54']).toBe('1234.50');
    expect(c['58']).toBe('BR');
    expect(c['59']).toBe('Odonto Hospitalar Assiste'); // 25 caracteres, sem acento
    expect(c['60']).toBe('Sao Paulo');
    const conta = lerPix(c['26']);
    expect(conta['00']).toBe('br.gov.bcb.pix');
    expect(conta['01']).toBe('12345678000190');
    expect(lerPix(c['62'])['05']).toBe('FAT0007');
    // O CRC final cobre todo o texto anterior, inclusive "6304".
    expect(c['63']).toBe(crc16(p.slice(0, -4)));
  });

  it('sem identificador usa *** e sem valor omite o campo 54', () => {
    const c = lerPix(gerarPix({ chave: 'contato@empresa.com', tipoChave: 'email', nome: 'Empresa', cidade: 'Campo Grande' }));
    expect(c['54']).toBeUndefined();
    expect(lerPix(c['62'])['05']).toBe('***');
  });

  it('normaliza chaves e textos', () => {
    expect(normalizarChavePix('(67) 99999-1234', 'telefone')).toBe('+5567999991234');
    expect(normalizarChavePix('5567999991234', 'telefone')).toBe('+5567999991234');
    expect(normalizarChavePix('123.456.789-09', 'cpf')).toBe('12345678909');
    expect(normalizarChavePix(' Contato@Empresa.COM ', 'email')).toBe('contato@empresa.com');
    expect(textoPix('Corumbá – Ação & Cia', 30)).toBe('Corumba Acao Cia');
  });

  it('recusa chave vazia', () => {
    expect(() => gerarPix({ chave: '', nome: 'X', cidade: 'Y' })).toThrow();
  });
});

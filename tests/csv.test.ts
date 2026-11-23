import { describe, expect, it } from 'vitest';
import { gerarCSV } from '../src/util/csv';

describe('CSV para Excel brasileiro', () => {
  it('usa ponto e vírgula, vírgula decimal e BOM', () => {
    const csv = gerarCSV(['Cliente', 'Valor', 'Qtd'], [['Clínica Sorriso', 1234.5, 2]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1)).toBe('Cliente;Valor;Qtd\r\nClínica Sorriso;1234,50;2');
  });
  it('protege aspas, quebras de linha e fórmulas', () => {
    const csv = gerarCSV(['Relato'], [['Disse "urgente"; ok'], ['=HYPERLINK("x")'], ['linha1\nlinha2']]);
    const linhas = csv.slice(1).split('\r\n');
    expect(linhas[1]).toBe('"Disse ""urgente""; ok"');
    expect(linhas[2]).toBe(`"'=HYPERLINK(""x"")"`);
    expect(linhas[3]).toBe('"linha1\nlinha2"');
  });
});

import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { situacaoDoEquipamento } from '../src/dados/visa';

const dias = (n: number) => Timestamp.fromMillis(Date.now() + n * 86400000);
const v = (proximo: Timestamp | null) => ({ descricao: 'x', periodicidadeMeses: 12, ultimo: null, proximo });

describe('situação do equipamento na Pasta da VISA', () => {
  it('mostra a pior situação entre as exigências', () => {
    expect(situacaoDoEquipamento({ vencimentos: { a: v(dias(200)), b: v(dias(-3)) } })).toBe('vencido');
    expect(situacaoDoEquipamento({ vencimentos: { a: v(dias(200)), b: v(dias(10)) } })).toBe('proximo');
    expect(situacaoDoEquipamento({ vencimentos: { a: v(dias(200)) } })).toBe('em-dia');
    expect(situacaoDoEquipamento({ vencimentos: { a: v(dias(200)), b: v(null) } })).toBe('sem-data');
    expect(situacaoDoEquipamento({})).toBe('sem-data');
  });
});

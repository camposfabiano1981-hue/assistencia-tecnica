import { describe, expect, it } from 'vitest';
import { deInputData, diasAte, paraInputData, somarMeses } from '../src/util/datas';

describe('datas', () => {
  it('soma meses sem pular para o mês seguinte', () => {
    expect(paraInputData(somarMeses(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
    expect(paraInputData(somarMeses(new Date(2026, 10, 23), 6))).toBe('2027-05-23');
    expect(paraInputData(somarMeses(new Date(2027, 7, 31), 6))).toBe('2028-02-29');
  });
  it('conta dias até a data', () => {
    const hoje = new Date(2026, 10, 23, 15);
    expect(diasAte(new Date(2026, 10, 23, 8), hoje)).toBe(0);
    expect(diasAte(new Date(2026, 11, 3), hoje)).toBe(10);
    expect(diasAte(new Date(2026, 10, 20), hoje)).toBe(-3);
  });
  it('converte o valor do campo de data', () => {
    expect(paraInputData(deInputData('2026-12-05'))).toBe('2026-12-05');
    expect(deInputData('05/12/2026')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { inicioDoMes, mesmoDia, moedaEixo, serieMensal, textoVariacao, ultimosMeses, variacao } from '../src/dados/indicadores';
import { maximoRedondo } from '../src/componentes/GraficoColunas';

const mes = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`;

describe('indicadores do painel', () => {
  it('últimos meses atravessando a virada do ano, do mais antigo ao atual', () => {
    expect(ultimosMeses(new Date(2026, 1, 15, 10), 6).map(mes)).toEqual(['2025-9', '2025-10', '2025-11', '2025-12', '2026-1', '2026-2']);
    const inicio = inicioDoMes(new Date(2026, 0, 31, 23, 59), 1);
    expect([inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), inicio.getHours()]).toEqual([2025, 11, 1, 0]);
  });

  it('série mensal soma por mês e ignora o que está fora do período', () => {
    const meses = ultimosMeses(new Date(2026, 10, 24), 3);
    const serie = serieMensal(meses, [
      [new Date(2026, 8, 30, 23, 30), 100],
      [new Date(2026, 10, 1, 0, 5), 50.5],
      [new Date(2026, 10, 20), 25],
      [new Date(2026, 5, 1), 999],
    ]);
    expect(serie.map((p) => p.valor)).toEqual([100, 0, 75.5]);
    expect(serie.map((p) => p.rotulo)).toEqual(['set/26', 'out/26', 'nov/26']);
    expect(serie[2].rotuloLongo).toBe('novembro de 2026');
  });

  it('variação sobre o mês anterior', () => {
    const outubro = new Date(2026, 9, 1);
    expect(variacao(120, 100)).toBeCloseTo(0.2);
    expect(variacao(50, 0)).toBeNull();
    expect(textoVariacao(120, 100, outubro)).toBe('↑ 20% sobre outubro');
    expect(textoVariacao(80, 100, outubro)).toBe('↓ 20% sobre outubro');
    expect(textoVariacao(100.2, 100, outubro)).toBe('igual a outubro');
    expect(textoVariacao(100, 0, outubro)).toBe('sem faturas em outubro');
    expect(textoVariacao(0, 0, outubro)).toBe('nada em outubro também');
  });

  it('topo do eixo: redondo, e par para contagens (marca do meio inteira)', () => {
    expect([3, 5, 7, 9, 25, 120].map((n) => maximoRedondo(n, true))).toEqual([4, 6, 8, 10, 50, 200]);
    expect([0.4, 3, 600, 1234.5].map((n) => maximoRedondo(n))).toEqual([0.5, 5, 1000, 2000]);
    expect(maximoRedondo(0, true)).toBe(2);
  });

  it('eixo em reais e mesmo dia', () => {
    expect(moedaEixo(2500)).toBe('R$ 2.500');
    expect(moedaEixo(12500)).toBe('R$ 12,5 mil');
    expect(mesmoDia(new Date(2026, 10, 24, 8), new Date(2026, 10, 24, 22))).toBe(true);
    expect(mesmoDia(new Date(2026, 10, 24), new Date(2025, 10, 24))).toBe(false);
  });
});

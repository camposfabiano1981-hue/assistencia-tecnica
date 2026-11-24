// Contas dos indicadores (painel inicial e página Indicadores): meses do período, séries mensais e variação.
import type { PontoColuna } from '../componentes/GraficoColunas';

/** Primeiro dia do mês, à meia-noite, `voltar` meses antes do mês de `hoje`. */
export function inicioDoMes(hoje: Date, voltar = 0): Date {
  return new Date(hoje.getFullYear(), hoje.getMonth() - voltar, 1);
}

/** Os últimos `n` meses (primeiro dia de cada um), do mais antigo para o atual. */
export function ultimosMeses(hoje: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, i) => inicioDoMes(hoje, n - 1 - i));
}

const chaveMes = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

export function rotuloMes(d: Date): Omit<PontoColuna, 'valor'> {
  return {
    rotulo: `${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${String(d.getFullYear()).slice(2)}`,
    rotuloLongo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  };
}

/** Soma os valores por mês; datas fora dos meses pedidos são ignoradas. Centavos arredondados. */
export function serieMensal(meses: Date[], pares: [Date, number][]): PontoColuna[] {
  const soma = new Map<string, number>();
  for (const [d, v] of pares) soma.set(chaveMes(d), (soma.get(chaveMes(d)) ?? 0) + v);
  return meses.map((d) => ({ ...rotuloMes(d), valor: Math.round((soma.get(chaveMes(d)) ?? 0) * 100) / 100 }));
}

/** Variação do mês atual sobre o anterior (0,12 = +12%); null quando o anterior é zero. */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return (atual - anterior) / anterior;
}

/** Texto curto da variação: "↑ 12% sobre outubro", "↓ 5% sobre outubro", "igual a outubro". */
export function textoVariacao(atual: number, anterior: number, mesAnterior: Date): string {
  const nome = mesAnterior.toLocaleDateString('pt-BR', { month: 'long' });
  const v = variacao(atual, anterior);
  if (v == null) return atual ? `sem faturas em ${nome}` : `nada em ${nome} também`;
  const pct = Math.round(Math.abs(v) * 100);
  if (pct === 0) return `igual a ${nome}`;
  return `${v > 0 ? '↑' : '↓'} ${pct}% sobre ${nome}`;
}

/** Eixo em reais: inteiro até 10 mil, compacto acima (R$ 10 mil). */
export function moedaEixo(n: number): string {
  if (n >= 10000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/** Mesmo dia (calendário local). */
export function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

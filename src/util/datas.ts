// Utilidades de data (sem dependências).

/** Soma meses mantendo o dia; em meses mais curtos, cai no último dia (31/01 + 1 mês = 28/02). */
export function somarMeses(d: Date, meses: number): Date {
  const r = new Date(d);
  const dia = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + meses);
  const ultimo = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(dia, ultimo));
  return r;
}

export function somarDias(d: Date, dias: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
}

export function fimDoDia(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function inicioDoDia(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Dias inteiros de hoje até a data (negativo = já passou). */
export function diasAte(d: Date, hoje = new Date()): number {
  return Math.round((inicioDoDia(d).getTime() - inicioDoDia(hoje).getTime()) / 86400000);
}

/** "2026-11-23" (input type=date) <-> Date local. */
export function paraInputData(d: Date | null | undefined): string {
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function deInputData(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d, 12, 0, 0);
}

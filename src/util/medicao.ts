/** Classifica uma medição contra os limites do tipo de equipamento. */
export function avaliarMedicao(
  valor: number | null,
  min?: number | null,
  max?: number | null,
): 'aprovado' | 'reprovado' | 'sem-limite' | 'pendente' {
  if (valor == null || Number.isNaN(valor)) return 'pendente';
  if (min == null && max == null) return 'sem-limite';
  if (min != null && valor < min) return 'reprovado';
  if (max != null && valor > max) return 'reprovado';
  return 'aprovado';
}

/** Itens de um mapa (checklist/medições da OS) na ordem do modelo. Aceita também o formato antigo em lista. */
export function ordenados<T extends { ordem?: number }>(m?: Record<string, T> | T[] | null): T[] {
  if (!m) return [];
  const lista = Array.isArray(m) ? m : Object.values(m);
  return [...lista].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

// Planilhas CSV no formato do Excel brasileiro: ponto e vírgula, vírgula decimal e acentos (UTF-8 com BOM).
export type Celula = string | number | boolean | null | undefined | Date;

function celula(v: Celula): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toLocaleDateString('pt-BR');
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
  let s = String(v);
  // Evita que texto digitado por terceiros vire fórmula ao abrir no Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gerarCSV(cabecalho: string[], linhas: Celula[][]): string {
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
}

export function baixarArquivo(nome: string, conteudo: BlobPart, tipo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

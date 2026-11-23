// Ícones em traço (SVG embutido, sem dependências).
const caminhos: Record<string, string> = {
  painel: 'M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chamados: 'M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1zM8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 12h6M9 16h4',
  chave: 'M14.5 4.5a4 4 0 0 0-5 5L3.5 15.5a1.4 1.4 0 0 0 2 2l6-6a4 4 0 0 0 5-5l-2.3 2.3-2-.5-.5-2z',
  pessoas: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.9M15.5 4.1a3.5 3.5 0 0 1 0 6.8',
  mais: 'M5 12h.01M12 12h.01M19 12h.01',
  mais_circulo: 'M12 8v8M8 12h8M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18',
  caixa: 'M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5',
  usuario: 'M19 20a7 7 0 0 0-14 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  sair: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2h-2z',
  config: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4.4V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  lista: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  whatsapp: 'M3.5 20.5 5 16a8.5 8.5 0 1 1 3 3zM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8a4 4 0 0 1-2.3-2.3l.8-1-1-2z',
  pdf: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
  sino: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  voltar: 'M15 18l-6-6 6-6',
  seta: 'M9 18l6-6-6-6',
  lixo: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  local: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  editar: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  nuvem: 'M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5A4 4 0 0 1 17.5 18z',
  offline: 'M3 3l18 18M8.5 8.6A4.5 4.5 0 0 0 7 18h10.5M14 6.3a6 6 0 0 1 3.8 4.2A4 4 0 0 1 20.6 16',
  impressora: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
  moeda: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M15 9.3c-.5-.9-1.6-1.4-3-1.4-1.7 0-3 .8-3 2s1.3 1.7 3 2.1 3 .9 3 2.1-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.3v11.4',
  calendario: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4M8 14h3v3H8z',
  grafico: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
};

export function Icone({ nome, tamanho = 22, className }: { nome: keyof typeof caminhos | string; tamanho?: number; className?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={nome === 'mais' ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={caminhos[nome] ?? caminhos.mais} />
    </svg>
  );
}

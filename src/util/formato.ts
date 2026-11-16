import type { Timestamp } from 'firebase/firestore';
import type {
  CategoriaEquipamento,
  Criticidade,
  OrigemChamado,
  StatusChamado,
  StatusOS,
  TipoCliente,
  TipoOS,
} from '../tipos';

export function fmtData(t?: Timestamp | null): string {
  return t ? t.toDate().toLocaleDateString('pt-BR') : '—';
}

export function fmtDataHora(t?: Timestamp | null): string {
  if (!t) return '—';
  return t.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** "há 5 min", "há 2 h", "ontem", ou a data. */
export function fmtRelativo(t?: Timestamp | null): string {
  if (!t) return '—';
  const seg = (Date.now() - t.toMillis()) / 1000;
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return 'ontem';
  return fmtData(t);
}

/** Date -> valor do <input type="datetime-local">. */
export function paraInputDataHora(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function numeroOS(n: number): string {
  return String(n).padStart(5, '0');
}

export function soDigitos(s: string | undefined | null): string {
  return (s ?? '').replace(/\D/g, '');
}

export function fmtTelefone(s?: string): string {
  const d = soDigitos(s).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s ?? '';
}

export const rotuloStatusChamado: Record<StatusChamado, string> = {
  aberto: 'Aberto',
  agendado: 'Agendado',
  em_atendimento: 'Em atendimento',
  aguardando: 'Aguardando peça/aprovação',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const tomStatusChamado: Record<StatusChamado, Tom> = {
  aberto: 'alerta',
  agendado: 'info',
  em_atendimento: 'roxo',
  aguardando: 'laranja',
  concluido: 'sucesso',
  cancelado: 'neutro',
};

export const rotuloStatusOS: Record<StatusOS, string> = {
  aberta: 'Aberta',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
};

export const tomStatusOS: Record<StatusOS, Tom> = {
  aberta: 'info',
  em_execucao: 'roxo',
  concluida: 'sucesso',
};

export const rotuloTipoOS: Record<TipoOS, string> = {
  corretiva: 'Manutenção corretiva',
  preventiva: 'Manutenção preventiva',
  instalacao: 'Instalação',
  ensaio: 'Ensaio / calibração',
  outro: 'Outro serviço',
};

export const rotuloTipoCliente: Record<TipoCliente, string> = {
  consultorio_odonto: 'Consultório odontológico',
  clinica: 'Clínica',
  hospital: 'Hospital',
  laboratorio: 'Laboratório',
  outro: 'Outro',
};

export const rotuloCategoria: Record<CategoriaEquipamento, string> = {
  odontologico: 'Odontológico',
  hospitalar: 'Hospitalar',
  infraestrutura: 'Infraestrutura',
};

export const rotuloCriticidade: Record<Criticidade, string> = {
  alta: 'Alta (suporte à vida ou atendimento para)',
  media: 'Média',
  baixa: 'Baixa',
};

export const rotuloOrigem: Record<OrigemChamado, string> = {
  portal: 'Portal do cliente',
  whatsapp: 'WhatsApp',
  telefone: 'Telefone',
  presencial: 'Presencial',
};

export type Tom = 'info' | 'sucesso' | 'alerta' | 'perigo' | 'neutro' | 'roxo' | 'laranja';

export function descreverEquipamento(e: {
  tipoNome: string;
  fabricante?: string;
  modelo?: string;
  numeroSerie?: string;
  setor?: string;
}): string {
  const partes = [e.tipoNome, [e.fabricante, e.modelo].filter(Boolean).join(' ')].filter(Boolean);
  let txt = partes.join(' — ');
  if (e.numeroSerie) txt += ` (série ${e.numeroSerie})`;
  if (e.setor) txt += ` · ${e.setor}`;
  return txt;
}

/** Para busca: minúsculas e sem acentos. */
export function normalizar(s: string | undefined | null): string {
  return (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

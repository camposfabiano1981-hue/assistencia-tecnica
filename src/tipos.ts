// Modelo de dados (coleções do Firestore).
import type { Bytes, Timestamp } from 'firebase/firestore';

export type Papel = 'gestor' | 'tecnico' | 'cliente';

/** usuarios/{uid} — perfil de quem acessa o sistema. */
export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  clienteId?: string | null;
  telefone?: string;
  registroProfissional?: string;
  criadoEm?: Timestamp;
}

/** config/empresa — dados da empresa usados no app e no laudo. */
export interface Empresa {
  nome: string;
  documento?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  rtNome?: string;
  rtRegistro?: string;
  rodapeLaudo?: string;
  logo?: Bytes | null;
  logoTipo?: string;
  avisoUrl?: string;
  avisoToken?: string;
}

/** config/publico — o mínimo legível sem login (página do QR). */
export interface ConfigPublica {
  nome: string;
  whatsapp?: string;
}

export type TipoCliente = 'consultorio_odonto' | 'clinica' | 'hospital' | 'laboratorio' | 'outro';

/** clientes/{id} */
export interface Cliente {
  id: string;
  nome: string;
  documento?: string;
  tipo: TipoCliente;
  contato?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  observacoes?: string;
  ativo: boolean;
  criadoEm?: Timestamp;
}

export interface ItemChecklistModelo {
  id: string;
  texto: string;
}

export interface MedicaoModelo {
  id: string;
  nome: string;
  unidade: string;
  min?: number | null;
  max?: number | null;
}

export type CategoriaEquipamento = 'odontologico' | 'hospitalar' | 'infraestrutura';

/** tiposEquipamento/{id} — modelo de checklist e medições por tipo. */
export interface TipoEquipamento {
  id: string;
  nome: string;
  categoria: CategoriaEquipamento;
  checklist: ItemChecklistModelo[];
  medicoes: MedicaoModelo[];
  periodicidadeMeses?: number | null;
  exigeEnsaioSeguranca?: boolean;
  observacoes?: string;
}

export type Criticidade = 'alta' | 'media' | 'baixa';

/** equipamentos/{id} */
export interface Equipamento {
  id: string;
  clienteId: string;
  clienteNome: string;
  tipoId: string;
  tipoNome: string;
  fabricante?: string;
  modelo?: string;
  numeroSerie?: string;
  patrimonio?: string;
  registroAnvisa?: string;
  setor?: string;
  criticidade: Criticidade;
  ativo: boolean;
  observacoes?: string;
  ultimaVisitaEm?: Timestamp | null;
  ultimaOS?: number | null;
  criadoEm?: Timestamp;
}

export type StatusChamado =
  | 'aberto'
  | 'agendado'
  | 'em_atendimento'
  | 'aguardando'
  | 'concluido'
  | 'cancelado';

export type OrigemChamado = 'portal' | 'whatsapp' | 'telefone' | 'presencial';

export interface EventoHistorico {
  status: StatusChamado;
  em: Timestamp;
  por: string;
  obs?: string;
}

/** chamados/{numero} */
export interface Chamado {
  id: string;
  numero: number;
  clienteId: string;
  clienteNome: string;
  equipamentoId: string | null;
  equipamentoDescricao: string;
  relato: string;
  parado: boolean;
  status: StatusChamado;
  origem: OrigemChamado;
  abertoPor: { uid: string; nome: string };
  abertoEm: Timestamp;
  atualizadoEm: Timestamp;
  agendadoPara?: Timestamp | null;
  osId?: string | null;
  qtdFotos: number;
  contato?: string;
  historico: EventoHistorico[];
}

export type TipoOS = 'corretiva' | 'preventiva' | 'instalacao' | 'ensaio' | 'outro';
export type StatusOS = 'aberta' | 'em_execucao' | 'concluida';
export type ResultadoItem = 'ok' | 'nok' | 'na';

export interface ItemChecklist {
  id: string;
  texto: string;
  ordem: number;
  resultado: ResultadoItem | null;
  obs?: string;
}

export interface Medicao {
  id: string;
  nome: string;
  unidade: string;
  ordem: number;
  min?: number | null;
  max?: number | null;
  valor: number | null;
}

export interface PecaUsada {
  id: string;
  descricao: string;
  quantidade: number;
}

/** Cópia dos dados no momento do atendimento: o laudo não muda se o cadastro mudar depois. */
export interface SnapshotCliente {
  nome: string;
  documento?: string;
  endereco?: string;
  cidade?: string;
  telefone?: string;
}

export interface SnapshotEquipamento {
  tipoNome: string;
  fabricante?: string;
  modelo?: string;
  numeroSerie?: string;
  patrimonio?: string;
  setor?: string;
  registroAnvisa?: string;
}

export interface Assinatura {
  nome: string;
  documento?: string;
  imagem: Bytes;
  em: Timestamp;
}

/** os/{numero} — ordem de serviço / laudo técnico. */
export interface OrdemServico {
  id: string;
  numero: number;
  tipo: TipoOS;
  status: StatusOS;
  chamadoId: string | null;
  clienteId: string;
  cliente: SnapshotCliente;
  equipamentoId: string | null;
  equipamento: SnapshotEquipamento;
  tecnicoId: string;
  tecnicoNome: string;
  tecnicoRegistro?: string;
  relato?: string;
  agendadaPara?: Timestamp | null;
  inicioEm?: Timestamp | null;
  fimEm?: Timestamp | null;
  checkin?: { lat: number; lng: number; precisao: number } | null;
  /** Mapas por id: cada item é gravado no seu próprio campo (sem uma gravação apagar a outra). */
  checklist: Record<string, ItemChecklist>;
  medicoes: Record<string, Medicao>;
  exigeEnsaioSeguranca: boolean;
  diagnostico: string;
  servicoExecutado: string;
  pecas: PecaUsada[];
  instrumentos: string;
  observacoes: string;
  liberado: boolean | null;
  assinatura?: Assinatura | null;
  qtdFotos: number;
  criadaEm: Timestamp;
  atualizadaEm: Timestamp;
}

/** chamados/{n}/fotos/{id} e os/{n}/fotos/{id} */
export interface Foto {
  id: string;
  imagem: Bytes;
  legenda?: string;
  etapa?: 'antes' | 'depois' | 'outro';
  clienteId: string;
  criadoEm?: Timestamp;
}

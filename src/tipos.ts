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
  // Pix (Fase 2)
  pixChave?: string;
  pixTipo?: 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria';
  pixNome?: string;
  pixCidade?: string;
  // Textos padrão do orçamento
  orcGarantia?: string;
  orcCondicoes?: string;
  orcValidadeDias?: number;
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
  /** Exigências periódicas além da preventiva (ensaio, qualificação, testes…). */
  exigencias?: Exigencia[];
}

/** Exigência periódica de um tipo de equipamento. A preventiva usa o código "preventiva". */
export interface Exigencia {
  codigo: string;
  descricao: string;
  periodicidadeMeses: number;
}

/** Situação de uma exigência em um equipamento. */
export interface Vencimento {
  descricao: string;
  periodicidadeMeses: number | null;
  ultimo: Timestamp | null;
  proximo: Timestamp | null;
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
  /** Por código de exigência (preventiva, ensaio-62353…). */
  vencimentos?: Record<string, Vencimento>;
  /** Menor data entre os vencimentos: permite consultar o que vence logo. */
  proximoVencimento?: Timestamp | null;
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
  /** Vínculo com o estoque: a conclusão da OS dá baixa. */
  pecaId?: string | null;
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
  // Fase 2
  instrumentosUsados?: InstrumentoUsado[];
  /** Exigências do tipo do equipamento (cópia no momento da OS). */
  exigencias?: Exigencia[];
  /** Códigos das exigências que este atendimento cumpre. */
  cumpre?: string[];
  /** Vencimentos do equipamento quando a OS foi criada (para recalcular sem internet). */
  vencimentosEquipamento?: Record<string, Vencimento>;
  orcamentoId?: string | null;
  faturaId?: string | null;
  estoqueBaixado?: boolean;
  /** Serviços realizados (do catálogo ou avulsos). */
  servicos?: ServicoUsado[];
  /** Fase 3: código impresso no laudo para conferir a autenticidade em /v/CODIGO. */
  codigoVerificacao?: string;
}

/** Registro público de autenticidade de um laudo (verificacoes/{codigo}): só dados não sensíveis. */
export interface Verificacao {
  id: string;
  tipo: 'laudo';
  osId: string;
  osNumero: number;
  tipoOS: string;
  empresa: { nome: string; documento?: string };
  clienteNome: string;
  equipamento: { tipoNome: string; fabricante?: string; modelo?: string; numeroSerie?: string };
  tecnicoNome: string;
  concluidaEm: Timestamp;
  liberado: boolean | null;
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

// ---------------- Fase 2 ----------------

export interface InstrumentoUsado {
  id: string;
  descricao: string;
  numeroSerie?: string;
  certificado?: string;
  laboratorio?: string;
  validade: Timestamp | null;
}

/** instrumentos/{id} — padrões de medição (analisadores, termômetros…) com certificado RBC. */
export interface Instrumento {
  id: string;
  descricao: string;
  fabricante?: string;
  modelo?: string;
  numeroSerie?: string;
  certificado?: string;
  laboratorio?: string;
  calibradoEm?: Timestamp | null;
  validade: Timestamp | null;
  ativo: boolean;
}

/** pecas/{id} — estoque. */
export interface Peca {
  id: string;
  codigo?: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  minimo: number;
  custo: number;
  preco: number;
  ncm?: string;
  ativo: boolean;
}

/** pecas/{id}/movimentos/{id} — entradas e saídas (kardex). */
export interface MovimentoEstoque {
  id: string;
  tipo: 'entrada' | 'saida' | 'ajuste';
  quantidade: number;
  osId?: string | null;
  obs?: string;
  em: Timestamp;
  por: string;
}

export interface ItemValor {
  id: string;
  tipo: 'servico' | 'peca';
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  pecaId?: string | null;
  /** Vínculo com o catálogo de serviços (tabela de preços). */
  servicoId?: string | null;
  codigo?: string;
  unidade?: string;
}

/** Catálogo de serviços (tabela de preços): coleção servicos. */
export interface ServicoCatalogo {
  id: string;
  codigo?: string;
  descricao: string;
  unidade: string;
  preco: number;
  ativo: boolean;
}

/** Serviço registrado na OS: do catálogo ou avulso (sem preço: o valor entra na fatura). */
export interface ServicoUsado {
  id: string;
  descricao: string;
  quantidade: number;
  unidade?: string;
  servicoId?: string | null;
}

export type StatusOrcamento = 'rascunho' | 'enviado' | 'aprovado' | 'recusado' | 'cancelado';

export interface RespostaCliente {
  status: 'aprovado' | 'recusado';
  nome: string;
  uid: string;
  em: Timestamp;
  motivo?: string;
}

/** orcamentos/{numero} */
export interface Orcamento {
  id: string;
  numero: number;
  status: StatusOrcamento;
  clienteId: string;
  cliente: SnapshotCliente;
  equipamentoId: string | null;
  equipamentoDescricao: string;
  chamadoId: string | null;
  osId: string | null;
  itens: ItemValor[];
  desconto: number;
  totalServicos: number;
  totalPecas: number;
  total: number;
  validadeAte: Timestamp | null;
  prazoExecucao: string;
  condicoesPagamento: string;
  garantia: string;
  observacoes: string;
  criadoEm: Timestamp;
  criadoPor: string;
  enviadoEm?: Timestamp | null;
  resposta?: RespostaCliente | null;
  faturaId?: string | null;
  atualizadoEm: Timestamp;
}

export type StatusFatura = 'aberta' | 'paga' | 'cancelada';
export type FormaPagamento = 'pix' | 'boleto' | 'transferencia' | 'dinheiro' | 'cartao' | 'outro';

/** faturas/{numero} */
export interface Fatura {
  id: string;
  numero: number;
  status: StatusFatura;
  clienteId: string;
  cliente: SnapshotCliente;
  descricao: string;
  orcamentoId: string | null;
  osIds: string[];
  itens: ItemValor[];
  desconto: number;
  totalServicos: number;
  totalPecas: number;
  total: number;
  emitidaEm: Timestamp;
  vencimento: Timestamp;
  pixTxid: string;
  observacoes: string;
  pagamento?: { em: Timestamp; valor: number; forma: FormaPagamento; obs?: string } | null;
  nfse?: { numero: string; emitidaEm: Timestamp | null; chave?: string } | null;
  nfe?: { numero: string; chave?: string } | null;
  atualizadaEm: Timestamp;
}

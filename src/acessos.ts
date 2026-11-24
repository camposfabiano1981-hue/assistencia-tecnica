// Níveis de acesso: o que cada pessoa da equipe vê e faz no app.
// As regras do Firestore (firestore.rules) aplicam as mesmas travas no servidor; aqui só se esconde
// o que a pessoa não pode usar.
import type { Papel, Usuario } from './tipos';

export type PapelEquipe = Exclude<Papel, 'cliente'>;

/** Ordem em que os níveis aparecem nas listas. */
export const PAPEIS_EQUIPE: PapelEquipe[] = ['gestor', 'administrativo', 'tecnico'];

/** Quem pode ser o técnico responsável de uma OS. */
export const PAPEIS_TECNICOS: PapelEquipe[] = ['gestor', 'tecnico'];

export const ROTULO_PAPEL: Record<Papel, string> = {
  gestor: 'Gestor',
  administrativo: 'Administrativo',
  tecnico: 'Técnico',
  cliente: 'Cliente',
};

export const TOM_PAPEL: Record<Papel, 'roxo' | 'sucesso' | 'info' | 'neutro'> = {
  gestor: 'roxo',
  administrativo: 'sucesso',
  tecnico: 'info',
  cliente: 'neutro',
};

export type Permissao =
  /** Orçamentos, faturas, contratos e preços de peças e serviços. */
  | 'financeiro'
  /** Planilhas para o contador. */
  | 'planilhas'
  /** Cópia de segurança completa. */
  | 'backup'
  /** Dados da empresa, Pix, documentos e avisos. */
  | 'configuracoes'
  /** Equipe e níveis de acesso. */
  | 'equipe'
  /** Tipos de equipamento e checklists. */
  | 'tipos'
  /** Excluir cadastros (cliente, equipamento, serviço, peça, instrumento). */
  | 'excluir'
  /** Dar, bloquear e reenviar o acesso de clientes ao portal. */
  | 'acessoPortal'
  /** Editar e reagendar OS de qualquer técnico. */
  | 'todasOS';

const PERMISSOES: Record<PapelEquipe, readonly Permissao[]> = {
  gestor: ['financeiro', 'planilhas', 'backup', 'configuracoes', 'equipe', 'tipos', 'excluir', 'acessoPortal', 'todasOS'],
  administrativo: ['financeiro', 'planilhas', 'acessoPortal', 'todasOS'],
  tecnico: [],
};

/** A pessoa logada pode usar esta área? Cliente e conta bloqueada nunca podem. */
export function pode(perfil: Pick<Usuario, 'papel' | 'ativo'> | null | undefined, permissao: Permissao): boolean {
  if (!perfil?.ativo || perfil.papel === 'cliente') return false;
  return PERMISSOES[perfil.papel]?.includes(permissao) ?? false;
}

export function ehEquipe(perfil: Pick<Usuario, 'papel' | 'ativo'> | null | undefined): boolean {
  return !!perfil?.ativo && (PAPEIS_EQUIPE as Papel[]).includes(perfil.papel);
}

/** Resumo de cada nível para a página Equipe e acessos. */
export const RESUMO_PAPEL: Record<PapelEquipe, { pode: string[]; naoPode: string[] }> = {
  gestor: {
    pode: ['Tudo do administrativo e do técnico', 'Configurações da empresa', 'Equipe e níveis de acesso', 'Tipos e checklists', 'Excluir cadastros', 'Cópia de segurança'],
    naoPode: ['Rebaixar ou bloquear a si mesmo (outro gestor pode)'],
  },
  administrativo: {
    pode: ['Chamados, agenda e OS de todos', 'Clientes e acesso deles ao portal', 'Orçamentos, faturas e contratos', 'Preços de serviços e peças', 'Indicadores e planilhas do contador'],
    naoPode: ['Configurações e equipe', 'Excluir cadastros', 'Cópia de segurança'],
  },
  tecnico: {
    pode: ['Chamados e as OS dele (checklist, fotos, laudo)', 'Clientes e equipamentos', 'Consultar peças e dar baixa no estoque', 'Instrumentos e vencimentos', 'Indicadores de atendimento'],
    naoPode: ['Orçamentos, faturas, contratos e valores', 'Alterar preços', 'Configurações e equipe'],
  },
};

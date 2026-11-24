import { describe, expect, it } from 'vitest';
import { PAPEIS_EQUIPE, PAPEIS_TECNICOS, ROTULO_PAPEL, ehEquipe, pode, type Permissao } from '../src/acessos';
import type { Papel } from '../src/tipos';

const p = (papel: Papel, ativo = true) => ({ papel, ativo });
const TODAS: Permissao[] = ['financeiro', 'planilhas', 'backup', 'configuracoes', 'equipe', 'tipos', 'excluir', 'acessoPortal', 'todasOS'];

describe('níveis de acesso', () => {
  it('o gestor pode tudo', () => {
    for (const x of TODAS) expect(pode(p('gestor'), x)).toBe(true);
  });

  it('o administrativo cuida do financeiro e dos acessos de clientes, sem configurações nem equipe', () => {
    const adm = p('administrativo');
    expect(TODAS.filter((x) => pode(adm, x))).toEqual(['financeiro', 'planilhas', 'acessoPortal', 'todasOS']);
  });

  it('o técnico não vê o financeiro nem a administração', () => {
    for (const x of TODAS) expect(pode(p('tecnico'), x)).toBe(false);
  });

  it('cliente, conta bloqueada e sessão sem perfil não têm permissão da equipe', () => {
    for (const x of TODAS) {
      expect(pode(p('cliente'), x)).toBe(false);
      expect(pode(p('gestor', false), x)).toBe(false);
      expect(pode(null, x)).toBe(false);
    }
    expect(ehEquipe(p('cliente'))).toBe(false);
    expect(ehEquipe(p('tecnico', false))).toBe(false);
    expect(PAPEIS_EQUIPE.every((papel) => ehEquipe(p(papel)))).toBe(true);
  });

  it('só gestor e técnico aparecem como técnico responsável da OS; todos os níveis têm nome', () => {
    expect(PAPEIS_TECNICOS).toEqual(['gestor', 'tecnico']);
    expect(Object.values(ROTULO_PAPEL)).toEqual(['Gestor', 'Administrativo', 'Técnico', 'Cliente']);
  });
});

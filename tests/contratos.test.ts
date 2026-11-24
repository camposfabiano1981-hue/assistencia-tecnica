import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  aFaturar,
  competenciaDe,
  contratoDoEquipamento,
  itensDoContrato,
  prazoDoChamado,
  rotuloCompetencia,
  valorMensal,
  vencimentoDaCompetencia,
} from '../src/dados/contratos';
import type { Contrato } from '../src/tipos';

const ts = (a: number, m: number, d: number) => Timestamp.fromDate(new Date(a, m - 1, d));
const contrato = (extra: Partial<Contrato> = {}) =>
  ({
    id: '1',
    numero: 1,
    status: 'ativo',
    cobranca: 'mensal',
    valor: 450,
    equipamentoIds: ['e1', 'e2', 'e3'],
    inicio: ts(2026, 3, 10),
    fim: null,
    ultimaCompetencia: null,
    diaVencimento: 10,
    ...extra,
  }) as Contrato;

describe('contratos de manutenção', () => {
  it('calcula o valor mensal fixo ou por equipamento', () => {
    expect(valorMensal(contrato())).toBe(450);
    expect(valorMensal(contrato({ cobranca: 'por-equipamento', valor: 120.5 }))).toBe(361.5);
  });

  it('fatura cada competência uma vez, só dentro da vigência', () => {
    expect(aFaturar(contrato(), '2026-03')).toBe(true); // começou no meio do mês
    expect(aFaturar(contrato(), '2026-02')).toBe(false); // antes do início
    expect(aFaturar(contrato({ ultimaCompetencia: '2026-11' }), '2026-11')).toBe(false);
    expect(aFaturar(contrato({ ultimaCompetencia: '2026-10' }), '2026-11')).toBe(true);
    expect(aFaturar(contrato({ fim: ts(2026, 10, 31) }), '2026-11')).toBe(false); // terminou antes
    expect(aFaturar(contrato({ fim: ts(2026, 11, 5) }), '2026-11')).toBe(true); // termina no mês
    expect(aFaturar(contrato({ status: 'suspenso' }), '2026-11')).toBe(false);
  });

  it('vence no dia combinado, ou em 3 dias se esse dia já passou', () => {
    const hoje = new Date(2026, 10, 2);
    expect(vencimentoDaCompetencia('2026-11', 10, hoje)).toEqual(new Date(2026, 10, 10));
    expect(vencimentoDaCompetencia('2026-11', 10, new Date(2026, 10, 24))).toEqual(new Date(2026, 10, 27));
    expect(vencimentoDaCompetencia('2026-02', 31, new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 28));
  });

  it('monta o item da fatura com a competência', () => {
    const [mensal] = itensDoContrato(contrato(), '2026-11');
    expect(mensal).toMatchObject({ tipo: 'servico', quantidade: 1, valorUnitario: 450, unidade: 'mês' });
    expect(mensal.descricao).toBe('Contrato de manutenção nº 1 - competência 11/2026');
    const [porEq] = itensDoContrato(contrato({ cobranca: 'por-equipamento', valor: 120 }), '2026-11');
    expect(porEq).toMatchObject({ quantidade: 3, valorUnitario: 120, unidade: 'equipamento' });
    expect(competenciaDe(new Date(2026, 0, 31))).toBe('2026-01');
    expect(rotuloCompetencia('2026-01')).toBe('01/2026');
  });

  it('acha o contrato que cobre o equipamento e o prazo do chamado', () => {
    const lista = [contrato({ id: 'x', status: 'encerrado' }), contrato({ id: 'y' })];
    expect(contratoDoEquipamento(lista, 'e2', new Date(2026, 10, 1))?.id).toBe('y');
    expect(contratoDoEquipamento(lista, 'e9', new Date(2026, 10, 1))).toBeNull();
    expect(contratoDoEquipamento(lista, 'e2', new Date(2026, 0, 1))).toBeNull(); // antes do início
    expect(prazoDoChamado(new Date(2026, 10, 2, 9, 0), 24)).toEqual(new Date(2026, 10, 3, 9, 0));
  });
});

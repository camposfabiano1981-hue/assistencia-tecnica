import { describe, expect, it } from 'vitest';
import { calcularTotais, itensDaOS } from '../src/dados/financeiro';
import type { OrdemServico } from '../src/tipos';

describe('fatura a partir da OS', () => {
  it('usa os serviços e as peças da OS com os preços atuais da tabela e do estoque', () => {
    const os = {
      numero: 7,
      servicos: [
        { id: 'a', descricao: 'Hora técnica', quantidade: 2, unidade: 'hora', servicoId: 'h' },
        { id: 'b', descricao: 'Limpeza do filtro', quantidade: 1 },
      ],
      pecas: [
        { id: 'c', descricao: 'Guarnição', quantidade: 1, pecaId: 'g' },
        { id: 'd', descricao: 'Parafuso', quantidade: 4 },
      ],
    } as unknown as OrdemServico;
    const itens = itensDaOS(os, { servicos: new Map([['h', 150]]), pecas: new Map([['g', 120]]) });
    expect(itens.map((i) => [i.tipo, i.descricao, i.quantidade, i.valorUnitario])).toEqual([
      ['servico', 'Hora técnica', 2, 150],
      ['servico', 'Limpeza do filtro', 1, 0],
      ['peca', 'Guarnição', 1, 120],
      ['peca', 'Parafuso', 4, 0],
    ]);
    expect(itens[0]).toMatchObject({ servicoId: 'h', unidade: 'hora' });
    expect(calcularTotais(itens, 0)).toMatchObject({ totalServicos: 300, totalPecas: 120, total: 420 });
    expect(new Set(itens.map((i) => i.id)).size).toBe(4);
  });

  it('sem serviço registrado, cria a linha de mão de obra para preencher o valor', () => {
    const itens = itensDaOS({ numero: 12, pecas: [] } as unknown as OrdemServico, { servicos: new Map(), pecas: new Map() });
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ tipo: 'servico', descricao: 'Mão de obra técnica - OS 00012', valorUnitario: 0 });
  });
});

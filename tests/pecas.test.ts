import { describe, expect, it } from 'vitest';
import { PECAS_SUGERIDAS, UNIDADES_PECA, pecasAtivas, pecasQueFaltam } from '../src/dados/pecas';
import type { Peca } from '../src/tipos';

describe('cadastro de peças', () => {
  it('as sugestões entram ativas, sem preço, sem saldo e com unidade conhecida', () => {
    expect(PECAS_SUGERIDAS.length).toBeGreaterThanOrEqual(10);
    for (const p of PECAS_SUGERIDAS) {
      expect(p).toMatchObject({ quantidade: 0, minimo: 0, custo: 0, preco: 0, ativo: true });
      expect(UNIDADES_PECA).toContain(p.unidade);
    }
    expect(new Set(PECAS_SUGERIDAS.map((p) => p.descricao)).size).toBe(PECAS_SUGERIDAS.length);
  });

  it('não repete sugestão já cadastrada, mesmo com outra grafia', () => {
    const faltam = pecasQueFaltam([{ descricao: 'FUSIVEL DE VIDRO 5X20 MM' }, { descricao: 'Valvula solenoide' }]);
    expect(faltam).toHaveLength(PECAS_SUGERIDAS.length - 2);
    expect(faltam.map((p) => p.descricao)).not.toContain('Fusível de vidro 5x20 mm');
    expect(pecasQueFaltam(PECAS_SUGERIDAS)).toEqual([]);
  });

  it('peças desativadas ficam fora das listas de escolha', () => {
    const lista = [
      { id: 'a', descricao: 'A', ativo: true },
      { id: 'b', descricao: 'B', ativo: false },
      { id: 'c', descricao: 'C' },
    ] as Peca[];
    expect(pecasAtivas(lista).map((p) => p.id)).toEqual(['a', 'c']);
  });
});

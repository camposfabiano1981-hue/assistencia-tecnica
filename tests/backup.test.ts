import { describe, expect, it } from 'vitest';
import { Bytes, Timestamp } from 'firebase/firestore';
import { grupoDoCaminho, serializar } from '../src/dados/backup';
import { csvOS } from '../src/dados/exportar';
import type { OrdemServico } from '../src/tipos';

describe('cópia de segurança', () => {
  it('preserva datas e imagens em JSON', () => {
    const v = serializar({
      em: Timestamp.fromDate(new Date('2026-11-23T13:00:00Z')),
      assinatura: { imagem: Bytes.fromUint8Array(new Uint8Array([1, 2, 255])) },
      lista: [{ a: Timestamp.fromMillis(0) }],
      nulo: null,
      n: 3.5,
      s: 'x',
    });
    expect(v).toEqual({
      em: { $data: '2026-11-23T13:00:00.000Z' },
      assinatura: { imagem: { $bytes: 'AQL/' } },
      lista: [{ a: { $data: '1970-01-01T00:00:00.000Z' } }],
      nulo: null,
      n: 3.5,
      s: 'x',
    });
    // O resultado precisa sobreviver a JSON.stringify/parse sem mudar.
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('agrupa subcoleções nos totais', () => {
    expect(grupoDoCaminho('chamados/12/fotos/f1')).toBe('chamados/fotos');
    expect(grupoDoCaminho('pecas/abc/movimentos/x')).toBe('pecas/movimentos');
    expect(grupoDoCaminho('config/empresa')).toBe('config');
  });
});

describe('planilha de OS', () => {
  it('lista exigências atendidas, instrumentos, serviços e peças', () => {
    const os = {
      numero: 7,
      tipo: 'preventiva',
      status: 'concluida',
      cliente: { nome: 'Clínica Sorriso', documento: '12.345.678/0001-90' },
      equipamento: { tipoNome: 'Autoclave', fabricante: 'Cristófoli', modelo: 'Vitale 21', numeroSerie: 'AB123' },
      tecnicoNome: 'Fabiano',
      liberado: true,
      exigencias: [
        { codigo: 'preventiva', descricao: 'Manutenção preventiva', periodicidadeMeses: 6 },
        { codigo: 'qualificacao-termica', descricao: 'Qualificação térmica', periodicidadeMeses: 12 },
      ],
      cumpre: ['preventiva', 'qualificacao-termica'],
      instrumentosUsados: [{ id: 'i1', descricao: 'Datalogger', numeroSerie: 'DL-9', validade: null }],
      servicos: [
        { id: 's1', descricao: 'Hora técnica', quantidade: 1.5, unidade: 'hora', servicoId: 'h1' },
        { id: 's2', descricao: 'Limpeza do filtro', quantidade: 1 },
      ],
      pecas: [{ id: 'p1', descricao: 'Vedação da porta', quantidade: 1 }],
      diagnostico: '',
      servicoExecutado: 'Limpeza e troca da vedação',
    } as unknown as OrdemServico;
    const linhas = csvOS([os]).slice(1).split('\r\n');
    expect(linhas).toHaveLength(2);
    const c = linhas[1].split(';');
    expect(c[0]).toBe('00007');
    expect(c[6]).toBe('Cristófoli Vitale 21');
    expect(c[13]).toBe('Sim');
    expect(c[14]).toBe('Manutenção preventiva, Qualificação térmica');
    expect(c[15]).toBe('Datalogger nº DL-9');
    expect(c[16]).toBe('1,5 hora × Hora técnica, 1 × Limpeza do filtro');
    expect(c[17]).toBe('1 × Vedação da porta');
  });
});

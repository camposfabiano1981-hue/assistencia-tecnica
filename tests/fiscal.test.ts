import { describe, expect, it } from 'vitest';
import { CONFIG_FISCAL_PADRAO, dataHoraComFuso, montarNfe, montarNfse, pendenciasNfe, pendenciasNfse, refNota, repartirDesconto } from '../src/dados/fiscal';
import type { Cliente, ConfigFiscal, Fatura, Peca } from '../src/tipos';

const cfg: ConfigFiscal = {
  ...CONFIG_FISCAL_PADRAO,
  ativo: true,
  urlPonte: 'https://script.google.com/macros/s/x/exec',
  cnpj: '12.345.678/0001-90',
  inscricaoMunicipal: '123.456',
  inscricaoEstadual: '28.123.456-7',
  codigoMunicipio: '5002704',
  uf: 'MS',
};
const cliente = {
  id: 'c1',
  nome: 'Clínica Sorriso Ltda',
  documento: '98.765.432/0001-10',
  email: 'contato@clinica.com',
  telefone: '(67) 3231-0000',
  cep: '79002-000',
  logradouro: 'Rua 14 de Julho',
  numero: '100',
  bairro: 'Centro',
  municipio: 'Campo Grande',
  uf: 'MS',
  codigoMunicipio: '5002704',
  indicadorIE: '9',
} as Cliente;
const pecas = [
  { id: 'p1', codigo: 'GU-21', descricao: 'Guarnição', unidade: 'un', ncm: '4016.93.00' },
  { id: 'p2', codigo: '', descricao: 'Filtro', unidade: 'pc', ncm: '84219999' },
] as Peca[];
const fatura = {
  id: '7',
  numero: 7,
  totalServicos: 300,
  totalPecas: 200,
  desconto: 50,
  total: 450,
  itens: [
    { id: 'a', tipo: 'servico', descricao: 'Hora técnica', quantidade: 2, valorUnitario: 150, unidade: 'hora', servicoId: 'h' },
    { id: 'b', tipo: 'peca', descricao: 'Guarnição da porta', quantidade: 1, valorUnitario: 120, pecaId: 'p1' },
    { id: 'c', tipo: 'peca', descricao: 'Filtro de ar', quantidade: 2, valorUnitario: 40, pecaId: 'p2' },
  ],
} as unknown as Fatura;
const agora = new Date(2026, 10, 24, 10, 30, 5);

describe('notas fiscais', () => {
  it('reparte o desconto entre serviços e peças', () => {
    expect(repartirDesconto(fatura)).toEqual({ servicos: 30, pecas: 20 });
    expect(repartirDesconto({ totalServicos: 100, totalPecas: 0, desconto: 0 })).toEqual({ servicos: 0, pecas: 0 });
  });

  it('data com fuso no formato do provedor', () => {
    expect(dataHoraComFuso(agora)).toMatch(/^2026-11-24T10:30:05[+-]\d{2}:\d{2}$/);
    expect(refNota('7', 'nfse', 2)).toBe('fat7-nfse-2');
  });

  it('monta a NFS-e com os serviços, o tomador e o local da prestação', () => {
    const n = montarNfse(fatura, cliente, { ...cfg, nfse: { ...cfg.nfse, extras: '{"regime_especial_tributacao": "0"}' } }, agora);
    expect(n).toMatchObject({
      data_competencia: '2026-11-24',
      codigo_municipio_emissora: '5002704',
      cnpj_prestador: '12345678000190',
      inscricao_municipal_prestador: '123456',
      codigo_opcao_simples_nacional: '3',
      cnpj_tomador: '98765432000110',
      razao_social_tomador: 'Clínica Sorriso Ltda',
      email_tomador: 'contato@clinica.com',
      cep_tomador: '79002000',
      codigo_municipio_prestacao: '5002704',
      codigo_tributacao_nacional_iss: '140101',
      valor_servico: 270,
      tributacao_iss: '1',
      tipo_retencao_iss: '1',
      regime_especial_tributacao: '0',
    });
    expect(n.descricao_servico).toContain('2 hora × Hora técnica');
    expect(n.descricao_servico).toContain('Desconto: R$');
    expect(n).not.toHaveProperty('cpf_tomador');
    expect(n).not.toHaveProperty('complemento_tomador'); // vazio sai do corpo
  });

  it('monta a NF-e das peças com NCM, CSOSN e desconto por item', () => {
    const n = montarNfe(fatura, cliente, cfg, pecas, agora) as Record<string, unknown> & { items: Record<string, unknown>[] };
    expect(n).toMatchObject({
      natureza_operacao: 'Venda de mercadoria',
      local_destino: '1',
      consumidor_final: '1',
      cnpj_emitente: '12345678000190',
      cnpj_destinatario: '98765432000110',
      indicador_inscricao_estadual_destinatario: '9',
      municipio_destinatario: 'Campo Grande',
      uf_destinatario: 'MS',
      cep_destinatario: '79002000',
      formas_pagamento: [{ forma_pagamento: '17', valor_pagamento: 180 }],
    });
    expect(n.items).toHaveLength(2);
    expect(n.items[0]).toMatchObject({ numero_item: '1', codigo_produto: 'GU-21', cfop: '5102', codigo_ncm: '40169300', unidade_comercial: 'UN', valor_bruto: 120, icms_situacao_tributaria: '102', pis_situacao_tributaria: '07' });
    expect(n.items[1]).toMatchObject({ codigo_produto: 'p2', codigo_ncm: '84219999', unidade_comercial: 'PC', quantidade_comercial: 2, valor_bruto: 80 });
    const descontos = n.items.reduce((t, i) => t + Number(i.valor_desconto ?? 0), 0);
    expect(Math.round(descontos * 100) / 100).toBe(20);
    expect(String(n.informacoes_adicionais_contribuinte)).toContain('Simples Nacional');
    // Cliente de outro estado: CFOP interestadual.
    const fora = montarNfe(fatura, { ...cliente, uf: 'SP' }, cfg, pecas, agora) as { local_destino: string; items: { cfop: string }[] };
    expect(fora.local_destino).toBe('2');
    expect(fora.items[0].cfop).toBe('6108');
  });

  it('lista o que falta antes de emitir', () => {
    expect(pendenciasNfse(fatura, cliente, cfg)).toEqual([]);
    expect(pendenciasNfe(fatura, cliente, cfg, pecas)).toEqual([]);
    expect(pendenciasNfse(fatura, cliente, { ...cfg, ativo: false })[0]).toMatch(/desligada/);
    expect(pendenciasNfse(fatura, { ...cliente, documento: '123' }, cfg)).toContain('CNPJ ou CPF do cliente (cadastro do cliente).');
    const semNcm = pendenciasNfe(fatura, { ...cliente, cep: '' }, cfg, [{ ...pecas[0], ncm: '' }, pecas[1]]);
    expect(semNcm.some((p) => p.includes('Endereço completo do cliente'))).toBe(true);
    expect(semNcm.some((p) => p.includes('sem NCM'))).toBe(true);
    const avulsa = { ...fatura, itens: [...fatura.itens, { id: 'd', tipo: 'peca', descricao: 'Parafuso', quantidade: 4, valorUnitario: 1 }] } as Fatura;
    expect(pendenciasNfe(avulsa, cliente, cfg, pecas).some((p) => p.includes('não está no estoque'))).toBe(true);
    expect(pendenciasNfse(fatura, cliente, { ...cfg, nfse: { ...cfg.nfse, extras: '[1,2]' } }).some((p) => p.includes('objeto JSON'))).toBe(true);
  });
});

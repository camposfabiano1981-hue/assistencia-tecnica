// Planilhas para o contador e backup.
import type { Timestamp } from 'firebase/firestore';
import type { Cliente, Equipamento, Fatura, Instrumento, OrdemServico, Peca } from '../tipos';
import { gerarCSV } from '../util/csv';
import { fmtData, fmtDataHora, numeroOS, rotuloCriticidade, rotuloStatusOS, rotuloTipoCliente, rotuloTipoOS } from '../util/formato';
import { rotuloFormaPagamento, rotuloSituacaoFatura, situacaoFatura } from './financeiro';
import { menorVencimento, rotuloSituacao, situacao } from './vencimentos';

export const moeda = (n: number | null | undefined) => (n ?? 0).toFixed(2).replace('.', ',');

export function csvFaturas(lista: Fatura[]): string {
  return gerarCSV(
    ['Número', 'Emissão', 'Vencimento', 'Cliente', 'CNPJ/CPF', 'Descrição', 'Serviços (R$)', 'Peças (R$)', 'Desconto (R$)', 'Total (R$)', 'Situação', 'Pago em', 'Forma', 'Valor pago (R$)', 'NFS-e', 'Emissão NFS-e', 'NF-e (peças)'],
    [...lista]
      .sort((a, b) => a.numero - b.numero)
      .map((f) => [
        f.numero,
        f.emitidaEm?.toDate(),
        f.vencimento?.toDate(),
        f.cliente.nome,
        f.cliente.documento,
        f.descricao,
        moeda(f.totalServicos),
        moeda(f.totalPecas),
        moeda(f.desconto),
        moeda(f.total),
        rotuloSituacaoFatura[situacaoFatura(f)],
        f.pagamento?.em?.toDate(),
        f.pagamento ? rotuloFormaPagamento[f.pagamento.forma] : '',
        f.pagamento ? moeda(f.pagamento.valor) : '',
        f.nfse?.numero,
        f.nfse?.emitidaEm?.toDate(),
        f.nfe?.numero,
      ]),
  );
}

const dataHora = (t?: Timestamp | null) => (t ? fmtDataHora(t) : '');
const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

export function csvOS(lista: OrdemServico[]): string {
  return gerarCSV(
    ['OS', 'Tipo', 'Situação', 'Cliente', 'CNPJ/CPF', 'Equipamento', 'Fabricante/modelo', 'Nº de série', 'Patrimônio', 'Técnico', 'Agendada para', 'Início', 'Conclusão', 'Liberado para uso', 'Exigências atendidas', 'Instrumentos', 'Peças', 'Diagnóstico', 'Serviço executado'],
    [...lista]
      .sort((a, b) => a.numero - b.numero)
      .map((o) => [
        numeroOS(o.numero),
        rotuloTipoOS[o.tipo],
        rotuloStatusOS[o.status],
        o.cliente.nome,
        o.cliente.documento,
        o.equipamento.tipoNome,
        [o.equipamento.fabricante, o.equipamento.modelo].filter(Boolean).join(' '),
        o.equipamento.numeroSerie,
        o.equipamento.patrimonio,
        o.tecnicoNome,
        dataHora(o.agendadaPara),
        dataHora(o.inicioEm),
        dataHora(o.fimEm),
        o.liberado ?? '',
        (o.cumpre ?? []).map((c) => o.exigencias?.find((e) => e.codigo === c)?.descricao ?? c).join(', '),
        (o.instrumentosUsados ?? []).map((i) => [i.descricao, i.numeroSerie && `nº ${i.numeroSerie}`].filter(Boolean).join(' ')).join(', '),
        (o.pecas ?? []).map((p) => `${p.quantidade} × ${p.descricao}`).join(', '),
        o.diagnostico,
        o.servicoExecutado,
      ]),
  );
}

export function csvEquipamentos(lista: Equipamento[]): string {
  return gerarCSV(
    ['Cliente', 'Tipo', 'Fabricante', 'Modelo', 'Nº de série', 'Patrimônio', 'Registro Anvisa', 'Setor', 'Criticidade', 'Ativo', 'Última visita', 'Última OS', 'Próximo vencimento', 'Situação', 'Vencimentos'],
    [...lista]
      .sort((a, b) => porNome(a.clienteNome, b.clienteNome) || porNome(a.tipoNome, b.tipoNome))
      .map((e) => {
        const proximo = menorVencimento(e.vencimentos) ?? e.proximoVencimento ?? null;
        const vencimentos = Object.values(e.vencimentos ?? {})
          .sort((a, b) => (a.proximo?.toMillis() ?? Infinity) - (b.proximo?.toMillis() ?? Infinity))
          .map((v) => `${v.descricao}: ${v.proximo ? fmtData(v.proximo) : 'sem data'} (${rotuloSituacao[situacao(v.proximo)].toLowerCase()})`)
          .join(', ');
        return [
          e.clienteNome,
          e.tipoNome,
          e.fabricante,
          e.modelo,
          e.numeroSerie,
          e.patrimonio,
          e.registroAnvisa,
          e.setor,
          rotuloCriticidade[e.criticidade]?.split(' (')[0],
          e.ativo,
          e.ultimaVisitaEm?.toDate(),
          e.ultimaOS ? numeroOS(e.ultimaOS) : '',
          proximo?.toDate(),
          proximo ? rotuloSituacao[situacao(proximo)] : '',
          vencimentos,
        ];
      }),
  );
}

export function csvClientes(lista: Cliente[]): string {
  return gerarCSV(
    ['Nome', 'CNPJ/CPF', 'Tipo', 'Contato', 'Telefone', 'WhatsApp', 'E-mail', 'Endereço', 'Cidade', 'Ativo', 'Observações'],
    [...lista]
      .sort((a, b) => porNome(a.nome, b.nome))
      .map((c) => [c.nome, c.documento, rotuloTipoCliente[c.tipo], c.contato, c.telefone, c.whatsapp, c.email, c.endereco, c.cidade, c.ativo, c.observacoes]),
  );
}

export function csvEstoque(lista: Peca[]): string {
  return gerarCSV(
    ['Código', 'Descrição', 'Unidade', 'Quantidade', 'Mínimo', 'Repor', 'Custo (R$)', 'Preço (R$)', 'Valor em estoque (R$)', 'NCM', 'Ativa'],
    [...lista]
      .sort((a, b) => porNome(a.descricao, b.descricao))
      .map((p) => [
        p.codigo,
        p.descricao,
        p.unidade,
        p.quantidade,
        p.minimo,
        p.ativo !== false && p.quantidade <= p.minimo,
        moeda(p.custo),
        moeda(p.preco),
        moeda(Math.max(0, p.quantidade) * (p.custo ?? 0)),
        p.ncm,
        p.ativo,
      ]),
  );
}

export function csvInstrumentos(lista: Instrumento[]): string {
  return gerarCSV(
    ['Descrição', 'Fabricante', 'Modelo', 'Nº de série', 'Certificado', 'Laboratório', 'Calibrado em', 'Validade', 'Situação', 'Ativo'],
    [...lista]
      .sort((a, b) => porNome(a.descricao, b.descricao))
      .map((i) => [
        i.descricao,
        i.fabricante,
        i.modelo,
        i.numeroSerie,
        i.certificado,
        i.laboratorio,
        i.calibradoEm?.toDate(),
        i.validade?.toDate(),
        rotuloSituacao[situacao(i.validade)],
        i.ativo,
      ]),
  );
}

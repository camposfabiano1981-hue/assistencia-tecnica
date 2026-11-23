// Planilhas para o contador e backup.
import type { Fatura } from '../tipos';
import { gerarCSV } from '../util/csv';
import { rotuloFormaPagamento, rotuloSituacaoFatura, situacaoFatura } from './financeiro';

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

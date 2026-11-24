// Quadro "Atenção" do painel: o que precisa de ação fora dos chamados.
import { Link } from 'react-router';
import { Timestamp, collection, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useConsulta, useDocumento } from '../dados/hooks';
import { situacaoFatura } from '../dados/financeiro';
import { ultimoBackup } from '../dados/backup';
import { usePode } from '../sessao';
import type { Contrato, Equipamento, Fatura, Instrumento, Orcamento, Peca } from '../tipos';
import { aFaturar, competenciaDe, rotuloCompetencia } from '../dados/contratos';
import { diasAte, somarDias } from '../util/datas';
import { fmtMoeda } from '../util/formato';
import { Icone } from './Icone';
import { Cartao } from './ui';

/** Lembrete mensal de cópia de segurança (para o gestor, depois do primeiro mês de uso). */
function useLembreteBackup(): string | null {
  const podeBackup = usePode('backup');
  const instalacao = useDocumento<{ em?: Timestamp }>('config/instalacao');
  if (!podeBackup || !instalacao.dados?.em) return null;
  const dias = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias(instalacao.dados.em.toDate()) < 30) return null;
  const ultimo = ultimoBackup();
  if (!ultimo) return 'Nenhuma cópia de segurança baixada neste aparelho';
  return dias(ultimo) > 30 ? `Última cópia de segurança há ${dias(ultimo)} dias` : null;
}

export function QuadroAtencao() {
  const lembreteBackup = useLembreteBackup();
  // O técnico não vê o financeiro: as consultas de orçamentos, faturas e contratos nem são feitas.
  const financeiro = usePode('financeiro');
  const orc = useConsulta<Orcamento>(() => (financeiro ? query(collection(db, 'orcamentos'), where('status', 'in', ['enviado', 'aprovado'])) : null), [financeiro]);
  const fat = useConsulta<Fatura>(() => (financeiro ? query(collection(db, 'faturas'), where('status', '==', 'aberta')) : null), [financeiro]);
  const venc = useConsulta<Equipamento>(
    () => query(collection(db, 'equipamentos'), where('proximoVencimento', '<=', Timestamp.fromDate(somarDias(new Date(), 30)))),
    [],
  );
  const inst = useConsulta<Instrumento>(() => query(collection(db, 'instrumentos')), []);
  const pecas = useConsulta<Peca>(() => query(collection(db, 'pecas')), []);
  const contratos = useConsulta<Contrato>(() => (financeiro ? query(collection(db, 'contratos'), where('status', '==', 'ativo')) : null), [financeiro]);

  const aguardando = orc.itens.filter((o) => o.status === 'enviado').length;
  const aprovadosSemFatura = orc.itens.filter((o) => o.status === 'aprovado' && !o.faturaId).length;
  const vencidas = fat.itens.filter((f) => situacaoFatura(f) === 'vencida');
  const equipamentos = venc.itens.filter((e) => e.ativo !== false).length;
  const certificados = inst.itens.filter((i) => i.ativo !== false && i.validade && diasAte(i.validade.toDate()) <= 30).length;
  const repor = pecas.itens.filter((p) => p.ativo !== false && p.minimo > 0 && p.quantidade <= p.minimo).length;
  const competencia = competenciaDe(new Date());
  const aFaturarMes = contratos.itens.filter((c) => aFaturar(c, competencia)).length;
  const terminando = contratos.itens.filter((c) => c.fim && diasAte(c.fim.toDate()) >= 0 && diasAte(c.fim.toDate()) <= 30).length;

  const itens: { n: number; texto: string; para: string; icone: string; forte?: boolean; rotulo?: string }[] = [
    { n: aprovadosSemFatura, texto: 'orçamento(s) aprovado(s) para executar/faturar', para: '/interno/orcamentos', icone: 'moeda', forte: true },
    { n: aguardando, texto: 'orçamento(s) aguardando o cliente', para: '/interno/orcamentos', icone: 'relogio' },
    { n: vencidas.length, texto: `fatura(s) vencida(s) · ${fmtMoeda(vencidas.reduce((t, f) => t + f.total, 0))}`, para: '/interno/faturas', icone: 'moeda', forte: true },
    { n: equipamentos, texto: 'equipamento(s) com preventiva/exigência vencendo em 30 dias', para: '/interno/vencimentos', icone: 'calendario' },
    { n: certificados, texto: 'instrumento(s) com certificado vencendo ou vencido', para: '/interno/instrumentos', icone: 'lista' },
    { n: aFaturarMes, texto: `contrato(s) a faturar em ${rotuloCompetencia(competencia)}`, para: '/interno/contratos', icone: 'moeda', forte: true },
    { n: terminando, texto: 'contrato(s) terminam em até 30 dias', para: '/interno/contratos', icone: 'lista' },
    { n: repor, texto: 'peça(s) no estoque mínimo', para: '/interno/estoque', icone: 'caixa' },
    { n: lembreteBackup ? 1 : 0, texto: 'backup', rotulo: lembreteBackup ?? '', para: '/interno/backup', icone: 'nuvem' },
  ].filter((i) => i.n > 0);

  if (!itens.length) return null;
  return (
    <Cartao titulo="Atenção">
      <div className="lista">
        {itens.map((i) => (
          <Link key={i.texto} to={i.para} className="linha">
            <Icone nome={i.icone} tamanho={20} />
            <div className="linha-texto">
              <div className="linha-titulo" style={{ fontWeight: i.forte ? 750 : 600 }}>
                {i.rotulo || `${i.n} ${i.texto}`}
              </div>
            </div>
            <Icone nome="seta" tamanho={18} className="linha-seta" />
          </Link>
        ))}
      </div>
    </Cartao>
  );
}

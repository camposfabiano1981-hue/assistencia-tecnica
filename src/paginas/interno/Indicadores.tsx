// Indicadores do período: atendimento, tempos, resolução, conformidade e faturamento.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Timestamp, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { mensagemErro, useConsulta } from '../../dados/hooks';
import { menorVencimento } from '../../dados/vencimentos';
import type { Chamado, Equipamento, Fatura, OrdemServico } from '../../tipos';
import { fmtMoeda } from '../../util/formato';
import { diasAte } from '../../util/datas';
import { GraficoColunas, type PontoColuna } from '../../componentes/GraficoColunas';
import { Aviso, CabecalhoPagina, Carregando, Cartao, useOnline } from '../../componentes/ui';

const PERIODOS = [3, 6, 12] as const;

function fmtDuracao(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const h = ms / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${(h / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`;
}

/** Eixo em reais: inteiro até 10 mil, compacto acima (R$ 10 mil). */
function moedaEixo(n: number): string {
  if (n >= 10000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function Kpi({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-rotulo">{rotulo}</span>
      <strong className="kpi-valor">{valor}</strong>
      {detalhe && <span className="kpi-detalhe">{detalhe}</span>}
    </div>
  );
}

export function Indicadores() {
  const [meses, setMeses] = useState<(typeof PERIODOS)[number]>(6);
  const inicio = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - (meses - 1));
    return d;
  }, [meses]);
  const desde = Timestamp.fromDate(inicio);
  const chamados = useConsulta<Chamado>(() => query(collection(db, 'chamados'), where('abertoEm', '>=', desde)), [meses]);
  const ordens = useConsulta<OrdemServico>(() => query(collection(db, 'os'), where('fimEm', '>=', desde)), [meses]);
  const faturas = useConsulta<Fatura>(() => query(collection(db, 'faturas'), where('emitidaEm', '>=', desde)), [meses]);
  const pagas = useConsulta<Fatura>(() => query(collection(db, 'faturas'), where('status', '==', 'paga')), []);
  const equip = useConsulta<Equipamento>(() => query(collection(db, 'equipamentos'), where('proximoVencimento', '!=', null)), []);

  const online = useOnline();
  const consultas = [chamados, ordens, faturas, pagas, equip];
  const carregando = consultas.some((c) => c.carregando);
  const erro = consultas.find((c) => c.erro)?.erro ?? null;
  // Primeiro chegam os dados guardados no aparelho; os números se completam quando o servidor responde.
  const atualizando = !carregando && consultas.some((c) => c.doCache);

  // Meses do período (o atual por último).
  const mesesLista = Array.from({ length: meses }, (_, i) => {
    const d = new Date(inicio);
    d.setMonth(d.getMonth() + i);
    return d;
  });
  const chaveMes = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const rotular = (d: Date): Omit<PontoColuna, 'valor'> => ({
    rotulo: `${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}/${String(d.getFullYear()).slice(2)}`,
    rotuloLongo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  });

  const validas = faturas.itens.filter((f) => f.status !== 'cancelada');
  const porMes = (pares: [Date, number][]) => {
    const soma = new Map<string, number>();
    for (const [d, v] of pares) soma.set(chaveMes(d), (soma.get(chaveMes(d)) ?? 0) + v);
    return mesesLista.map((d) => ({ ...rotular(d), valor: Math.round((soma.get(chaveMes(d)) ?? 0) * 100) / 100 }));
  };
  const serieChamados = porMes(chamados.itens.filter((c) => c.abertoEm).map((c) => [c.abertoEm.toDate(), 1]));
  const serieFaturamento = porMes(validas.filter((f) => f.emitidaEm).map((f) => [f.emitidaEm.toDate(), f.total]));

  // Tempos
  const tma = media(
    chamados.itens.flatMap((c) => {
      const inicioAtendimento = (c.historico ?? []).filter((h) => h.status === 'em_atendimento').sort((a, b) => a.em.toMillis() - b.em.toMillis())[0];
      return inicioAtendimento && c.abertoEm ? [inicioAtendimento.em.toMillis() - c.abertoEm.toMillis()] : [];
    }),
  );
  const concluidas = ordens.itens.filter((o) => o.status === 'concluida');
  const tmr = media(concluidas.flatMap((o) => (o.inicioEm && o.fimEm ? [o.fimEm.toMillis() - o.inicioEm.toMillis()] : [])));

  // Resolvido na 1ª visita: corretiva sem novo chamado do mesmo equipamento em 30 dias.
  const corretivas = concluidas.filter((o) => o.tipo === 'corretiva' && o.equipamentoId && o.fimEm);
  const reincidentes = corretivas.filter((o) =>
    chamados.itens.some(
      (c) =>
        c.equipamentoId === o.equipamentoId &&
        c.id !== o.chamadoId &&
        c.abertoEm &&
        c.abertoEm.toMillis() > o.fimEm!.toMillis() &&
        c.abertoEm.toMillis() <= o.fimEm!.toMillis() + 30 * 86400000,
    ),
  );
  const primeiraVisita = corretivas.length ? 1 - reincidentes.length / corretivas.length : null;

  // Conformidade: equipamentos com todas as exigências dentro do prazo.
  const comExigencias = equip.itens.filter((e) => e.ativo !== false);
  const emDia = comExigencias.filter((e) => {
    const menor = menorVencimento(e.vencimentos) ?? e.proximoVencimento ?? null;
    return menor ? diasAte(menor.toDate()) >= 0 : true;
  });

  // Financeiro
  const faturado = validas.reduce((t, f) => t + f.total, 0);
  const servicos = validas.reduce((t, f) => t + f.totalServicos, 0);
  const pecasValor = validas.reduce((t, f) => t + f.totalPecas, 0);
  const recebido = pagas.itens.filter((f) => (f.pagamento?.em?.toMillis() ?? 0) >= inicio.getTime()).reduce((t, f) => t + (f.pagamento?.valor ?? 0), 0);
  const emAberto = validas.filter((f) => f.status === 'aberta').reduce((t, f) => t + f.total, 0);

  // Equipamentos com mais chamados no período.
  const contagem = new Map<string, { nome: string; cliente: string; n: number }>();
  for (const c of chamados.itens) {
    if (!c.equipamentoId) continue;
    const atual = contagem.get(c.equipamentoId) ?? { nome: c.equipamentoDescricao, cliente: c.clienteNome, n: 0 };
    contagem.set(c.equipamentoId, { ...atual, n: atual.n + 1 });
  }
  const top = [...contagem.entries()].filter(([, v]) => v.n > 1).sort((a, b) => b[1].n - a[1].n).slice(0, 5);

  return (
    <>
      <CabecalhoPagina titulo="Indicadores" voltar="/interno/mais" />
      <div className="filtros" role="group" aria-label="Período: últimos meses">
        {PERIODOS.map((p) => (
          <button key={p} type="button" aria-pressed={meses === p} onClick={() => setMeses(p)}>
            {p} meses
          </button>
        ))}
      </div>
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {atualizando && (
        <p className="pequeno" role="status">
          {online ? 'Atualizando com o servidor…' : 'Sem internet: números com base no que está salvo neste aparelho.'}
        </p>
      )}
      {carregando ? (
        <Carregando />
      ) : (
        <>
          <h2 className="secao-titulo">Atendimento</h2>
          <div className="kpis">
            <Kpi rotulo="Chamados abertos" valor={String(chamados.itens.length)} detalhe={`${chamados.itens.filter((c) => c.origem === 'portal').length} pelo portal`} />
            <Kpi rotulo="OS concluídas" valor={String(concluidas.length)} detalhe={`${concluidas.filter((o) => o.tipo === 'preventiva').length} preventivas`} />
            <Kpi rotulo="Tempo até o atendimento" valor={fmtDuracao(tma)} detalhe="abertura do chamado → início da OS" />
            <Kpi rotulo="Tempo de reparo" valor={fmtDuracao(tmr)} detalhe="início → conclusão da OS" />
            <Kpi rotulo="Resolvido na 1ª visita" valor={pct(primeiraVisita)} detalhe={`${corretivas.length} corretivas, ${reincidentes.length} com retorno em 30 dias`} />
            <Kpi
              rotulo="Equipamentos em dia"
              valor={comExigencias.length ? pct(emDia.length / comExigencias.length) : '—'}
              detalhe={`${emDia.length} de ${comExigencias.length} com preventiva/exigências no prazo`}
            />
          </div>

          <GraficoColunas titulo="Chamados por mês" subtitulo={`Últimos ${meses} meses`} unidade="chamados" dados={serieChamados} formatar={(n) => String(Math.round(n))} />

          <h2 className="secao-titulo">Faturamento</h2>
          <div className="kpis">
            <Kpi rotulo="Faturado" valor={fmtMoeda(faturado)} detalhe={`${validas.length} fatura(s) · ticket médio ${fmtMoeda(validas.length ? faturado / validas.length : 0)}`} />
            <Kpi rotulo="Recebido" valor={fmtMoeda(recebido)} detalhe="pagamentos registrados no período" />
            <Kpi rotulo="Em aberto" valor={fmtMoeda(emAberto)} detalhe="das faturas emitidas no período" />
            <Kpi
              rotulo="Serviços × peças"
              valor={faturado ? `${Math.round((servicos / (servicos + pecasValor || 1)) * 100)}% / ${Math.round((pecasValor / (servicos + pecasValor || 1)) * 100)}%` : '—'}
              detalhe={`${fmtMoeda(servicos)} em serviços · ${fmtMoeda(pecasValor)} em peças`}
            />
          </div>

          <GraficoColunas
            titulo="Faturamento por mês"
            subtitulo="Faturas emitidas, sem as canceladas"
            unidade="faturado"
            dados={serieFaturamento}
            formatar={(n) => fmtMoeda(n)}
            formatarEixo={moedaEixo}
          />

          {!!top.length && (
            <Cartao titulo="Equipamentos com mais chamados">
              <p className="pequeno" style={{ marginTop: 0 }}>Retornos frequentes podem indicar defeito recorrente, uso inadequado ou fim de vida útil.</p>
              <ol className="ranking">
                {top.map(([id, v]) => (
                  <li key={id}>
                    <Link to={`/interno/equipamentos/${id}`}>{v.nome}</Link>
                    <span className="pequeno"> · {v.cliente}</span>
                    <strong>{v.n} chamados</strong>
                  </li>
                ))}
              </ol>
            </Cartao>
          )}
        </>
      )}
    </>
  );
}

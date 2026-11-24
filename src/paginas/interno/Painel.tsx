// Tela inicial: indicadores do dia e do mês, gráficos dos últimos 6 meses, agenda e o que pede atenção.
// Gestor e administrativo veem também o financeiro; o técnico vê a própria agenda e os números do atendimento.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Timestamp, collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { usePode, useSessao } from '../../sessao';
import { mensagemErro, useConsulta } from '../../dados/hooks';
import type { Avaliacao, Chamado, Contrato, Equipamento, Fatura, Orcamento, OrdemServico } from '../../tipos';
import { situacaoFatura } from '../../dados/financeiro';
import { aFaturar, competenciaDe } from '../../dados/contratos';
import { mediaNotas } from '../../dados/avaliacoes';
import { inicioDoMes, mesmoDia, moedaEixo, serieMensal, textoVariacao, ultimosMeses } from '../../dados/indicadores';
import { ROTULO_PAPEL } from '../../acessos';
import { diasAte, somarDias } from '../../util/datas';
import { fmtDataHora, fmtMoeda, fmtRelativo, numeroOS, rotuloStatusOS, rotuloTipoOS, tomStatusOS } from '../../util/formato';
import { alertasAtivos, prepararAlertas, tocarAlerta } from '../../util/alerta';
import { GraficoColunas } from '../../componentes/GraficoColunas';
import { QuadroAtencao } from '../../componentes/Atencao';
import { Icone } from '../../componentes/Icone';
import { Aviso, Botao, CabecalhoPagina, Carregando, Cartao, LinhaLista, LinkBotao, Selo } from '../../componentes/ui';

const MESES_GRAFICO = 6;
const ATIVOS: Chamado['status'][] = ['aberto', 'agendado', 'em_atendimento', 'aguardando'];

function AtivarAlertas() {
  const [ativo, setAtivo] = useState(alertasAtivos());
  if (ativo) return null;
  return (
    <Aviso tom="info">
      Ative os alertas para ouvir um som e receber notificação quando um cliente abrir chamado (com o app aberto).
      <div className="acoes">
        <Botao
          variante="secundario"
          icone="sino"
          onClick={() =>
            void prepararAlertas().then((p) => {
              tocarAlerta();
              setAtivo(p === 'granted');
            })
          }
        >
          Ativar alertas
        </Botao>
      </div>
    </Aviso>
  );
}

/** Dica de instalação no celular (some depois de "Entendi" ou quando o app já está instalado). */
function DicaInstalar() {
  const [oculta, setOculta] = useState(() => {
    try {
      return localStorage.getItem('dica-instalar') === 'ok';
    } catch {
      return false;
    }
  });
  const instalado = typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches;
  const celular = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 959px)').matches;
  if (oculta || instalado || !celular) return null;
  return (
    <Aviso tom="info">
      Instale o app no celular: no Chrome, toque nos três pontinhos e em <strong>Instalar app</strong>. Ele abre sem a barra do
      navegador e funciona sem internet nas OS já baixadas.
      <div className="acoes">
        <Botao
          variante="fantasma"
          onClick={() => {
            try {
              localStorage.setItem('dica-instalar', 'ok');
            } catch {
              /* sem armazenamento: só esconde agora */
            }
            setOculta(true);
          }}
        >
          Entendi
        </Botao>
      </div>
    </Aviso>
  );
}

function rotuloDia(d: Date): string {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = new Date(d);
  dia.setHours(0, 0, 0, 0);
  const dif = Math.round((dia.getTime() - hoje.getTime()) / 86400000);
  if (dif < 0) return 'Atrasadas';
  if (dif === 0) return 'Hoje';
  if (dif === 1) return 'Amanhã';
  return dia.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

function Indicador({ rotulo, valor, detalhe, para, icone, alerta }: { rotulo: string; valor: string; detalhe?: string; para: string; icone: string; alerta?: boolean }) {
  return (
    <Link to={para} className={`kpi kpi-link${alerta ? ' kpi-alerta' : ''}`}>
      <span className="kpi-rotulo">
        <Icone nome={icone} tamanho={16} />
        {rotulo}
      </span>
      <strong className="kpi-valor">{valor}</strong>
      {detalhe && <span className="kpi-detalhe">{detalhe}</span>}
    </Link>
  );
}

export function Painel() {
  const { perfil } = useSessao();
  const financeiro = usePode('financeiro');
  const meuId = perfil?.id ?? '';
  const tecnico = perfil?.papel === 'tecnico';

  const agora = new Date();
  const meses = ultimosMeses(agora, MESES_GRAFICO);
  const desde = useMemo(() => Timestamp.fromDate(inicioDoMes(new Date(), MESES_GRAFICO - 1)), []);
  const limiteVencimento = useMemo(() => Timestamp.fromDate(somarDias(new Date(), 30)), []);

  const ativos = useConsulta<Chamado>(() => query(collection(db, 'chamados'), where('status', 'in', ATIVOS)), []);
  const chamados = useConsulta<Chamado>(() => query(collection(db, 'chamados'), where('abertoEm', '>=', desde)), [desde]);
  const ordens = useConsulta<OrdemServico>(() => query(collection(db, 'os'), where('status', 'in', ['aberta', 'em_execucao'])), []);
  const vencendo = useConsulta<Equipamento>(() => query(collection(db, 'equipamentos'), where('proximoVencimento', '<=', limiteVencimento)), [limiteVencimento]);
  const avaliacoes = useConsulta<Avaliacao>(() => query(collection(db, 'avaliacoes'), where('em', '>=', desde)), [desde]);
  const faturas = useConsulta<Fatura>(() => (financeiro ? query(collection(db, 'faturas'), where('emitidaEm', '>=', desde)) : null), [financeiro, desde]);
  const abertas = useConsulta<Fatura>(() => (financeiro ? query(collection(db, 'faturas'), where('status', '==', 'aberta')) : null), [financeiro]);
  const orcamentos = useConsulta<Orcamento>(() => (financeiro ? query(collection(db, 'orcamentos'), where('status', '==', 'enviado')) : null), [financeiro]);
  const contratos = useConsulta<Contrato>(() => (financeiro ? query(collection(db, 'contratos'), where('status', '==', 'ativo')) : null), [financeiro]);

  const consultas = [ativos, chamados, ordens, vencendo, avaliacoes, faturas, abertas, orcamentos, contratos];
  const erro = consultas.find((c) => c.erro)?.erro ?? null;
  const n = (c: { carregando: boolean }, valor: string) => (c.carregando ? '…' : valor);

  // Chamados
  const novos = ativos.itens.filter((c) => c.status === 'aberto').sort((a, b) => b.numero - a.numero);
  const parados = novos.filter((c) => c.parado).length;
  const aguardando = ativos.itens.filter((c) => c.status === 'aguardando');

  // Agenda (o técnico vê a própria)
  const daAgenda = tecnico ? ordens.itens.filter((o) => o.tecnicoId === meuId) : ordens.itens;
  const hoje = daAgenda.filter((o) => o.status === 'em_execucao' || (o.agendadaPara && mesmoDia(o.agendadaPara.toDate(), agora)));
  const emExecucao = daAgenda.filter((o) => o.status === 'em_execucao').length;
  const semData = daAgenda.filter((o) => o.status === 'aberta' && !o.agendadaPara).length;
  const agenda = [...daAgenda].sort(
    (a, b) => (a.agendadaPara?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (b.agendadaPara?.toMillis() ?? Number.MAX_SAFE_INTEGER),
  );
  const grupos = new Map<string, OrdemServico[]>();
  for (const o of agenda) {
    const chave = o.status === 'em_execucao' ? 'Em execução agora' : o.agendadaPara ? rotuloDia(o.agendadaPara.toDate()) : 'Sem data marcada';
    grupos.set(chave, [...(grupos.get(chave) ?? []), o]);
  }

  // Preventivas e exigências
  const equipamentos = vencendo.itens.filter((e) => e.ativo !== false);
  const vencidos = equipamentos.filter((e) => e.proximoVencimento && diasAte(e.proximoVencimento.toDate()) < 0).length;

  // Financeiro do mês
  const validas = faturas.itens.filter((f) => f.status !== 'cancelada');
  const serieFaturamento = serieMensal(meses, validas.filter((f) => f.emitidaEm).map((f) => [f.emitidaEm.toDate(), f.total]));
  const faturadoMes = serieFaturamento[serieFaturamento.length - 1]?.valor ?? 0;
  const faturadoAnterior = serieFaturamento[serieFaturamento.length - 2]?.valor ?? 0;
  const aReceber = abertas.itens.reduce((t, f) => t + f.total, 0);
  const vencidas = abertas.itens.filter((f) => situacaoFatura(f) === 'vencida');
  const totalVencido = vencidas.reduce((t, f) => t + f.total, 0);
  const emPropostas = orcamentos.itens.reduce((t, o) => t + o.total, 0);
  const competencia = competenciaDe(agora);
  const contratosAFaturar = contratos.itens.filter((c) => aFaturar(c, competencia)).length;
  const nomeMes = agora.toLocaleDateString('pt-BR', { month: 'long' });

  const serieChamados = serieMensal(meses, chamados.itens.filter((c) => c.abertoEm).map((c) => [c.abertoEm.toDate(), 1]));
  const notaMedia = mediaNotas(avaliacoes.itens.map((a) => a.nota));

  const dataHoje = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="painel">
      <CabecalhoPagina
        titulo={`Olá, ${perfil?.nome?.split(' ')[0] ?? ''}`}
        subtitulo={`${dataHoje.charAt(0).toUpperCase()}${dataHoje.slice(1)} · ${perfil ? ROTULO_PAPEL[perfil.papel] : ''}`}
      />
      <div className="acoes painel-atalhos">
        <LinkBotao para="/interno/chamados/novo" variante="secundario" icone="chamados">
          Registrar chamado
        </LinkBotao>
        <LinkBotao para="/interno/os/nova" variante="secundario" icone="chave">
          Nova OS
        </LinkBotao>
        {financeiro && (
          <LinkBotao para="/interno/orcamentos/novo" variante="secundario" icone="moeda">
            Novo orçamento
          </LinkBotao>
        )}
      </div>
      <AtivarAlertas />
      <DicaInstalar />
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}

      <h2 className="secao-titulo">Indicadores</h2>
      <div className="kpis kpis-painel">
        <Indicador
          rotulo="Novos chamados"
          icone="sino"
          para="/interno/chamados?f=aberto"
          valor={n(ativos, String(novos.length))}
          detalhe={novos.length ? (parados ? `${parados} com equipamento parado` : 'esperando agendamento') : 'nenhum esperando'}
          alerta={novos.length > 0}
        />
        <Indicador
          rotulo={tecnico ? 'Minhas OS hoje' : 'Atendimentos hoje'}
          icone="calendario"
          para="/interno/os"
          valor={n(ordens, String(hoje.length))}
          detalhe={`${emExecucao} em execução · ${semData} sem data`}
        />
        {financeiro ? (
          <>
            <Indicador
              rotulo={`Faturado em ${nomeMes}`}
              icone="moeda"
              para="/interno/faturas"
              valor={n(faturas, fmtMoeda(faturadoMes))}
              detalhe={faturas.carregando ? undefined : textoVariacao(faturadoMes, faturadoAnterior, inicioDoMes(agora, 1))}
            />
            <Indicador
              rotulo="A receber"
              icone="relogio"
              para="/interno/faturas"
              valor={n(abertas, fmtMoeda(aReceber))}
              detalhe={vencidas.length ? `${fmtMoeda(totalVencido)} vencido (${vencidas.length})` : 'nada vencido'}
              alerta={vencidas.length > 0}
            />
            <Indicador
              rotulo="Orçamentos aguardando"
              icone="lista"
              para="/interno/orcamentos"
              valor={n(orcamentos, String(orcamentos.itens.length))}
              detalhe={orcamentos.itens.length ? `${fmtMoeda(emPropostas)} em propostas` : 'nenhum com o cliente'}
            />
          </>
        ) : (
          <Indicador
            rotulo="Minhas OS em aberto"
            icone="chave"
            para="/interno/os"
            valor={n(ordens, String(daAgenda.length))}
            detalhe={daAgenda.length ? `${semData} sem data marcada` : 'nenhuma pendente'}
          />
        )}
        <Indicador
          rotulo="Preventivas em 30 dias"
          icone="calendario"
          para="/interno/vencimentos"
          valor={n(vencendo, String(equipamentos.length))}
          detalhe={vencidos ? `${vencidos} já vencida(s)` : 'nenhuma vencida'}
          alerta={vencidos > 0}
        />
        {financeiro && (
          <>
            <Indicador
              rotulo="Satisfação dos clientes"
              icone="usuario"
              para="/interno/indicadores"
              valor={n(avaliacoes, notaMedia == null ? '—' : `${notaMedia.toLocaleString('pt-BR')} / 5`)}
              detalhe={`${avaliacoes.itens.length} avaliação(ões) em ${MESES_GRAFICO} meses`}
            />
            <Indicador
              rotulo="Contratos ativos"
              icone="lista"
              para="/interno/contratos"
              valor={n(contratos, String(contratos.itens.length))}
              detalhe={contratosAFaturar ? `${contratosAFaturar} a faturar em ${nomeMes}` : `todos faturados em ${nomeMes}`}
              alerta={contratosAFaturar > 0}
            />
          </>
        )}
      </div>

      <div className="painel-graficos">
        {chamados.carregando ? (
          <Carregando />
        ) : (
          <GraficoColunas
            titulo="Chamados por mês"
            subtitulo={`Últimos ${MESES_GRAFICO} meses`}
            unidade="chamados"
            dados={serieChamados}
            formatar={(v) => String(Math.round(v))}
          />
        )}
        {financeiro &&
          (faturas.carregando ? (
            <Carregando />
          ) : (
            <GraficoColunas
              titulo="Faturamento por mês"
              subtitulo="Faturas emitidas, sem as canceladas"
              unidade="faturado"
              dados={serieFaturamento}
              formatar={(v) => fmtMoeda(v)}
              formatarEixo={moedaEixo}
            />
          ))}
      </div>
      <p className="pequeno painel-mais">
        <Link to="/interno/indicadores">Ver todos os indicadores</Link> (tempos de atendimento, resolução na 1ª visita, conformidade e mais).
      </p>

      <div className="painel-colunas">
        <div>
          <Cartao titulo="Novos chamados" acoes={<Link to="/interno/chamados">Todos</Link>}>
            {ativos.carregando ? (
              <Carregando />
            ) : !novos.length ? (
              <p className="pequeno" style={{ margin: 0 }}>Nenhum chamado esperando agendamento.</p>
            ) : (
              <div className="lista">
                {novos.slice(0, 8).map((c) => (
                  <LinhaLista
                    key={c.id}
                    para={`/interno/chamados/${c.id}`}
                    titulo={`Nº ${c.numero} · ${c.clienteNome}`}
                    detalhe={`${c.equipamentoDescricao} · ${fmtRelativo(c.abertoEm)}`}
                    lateral={c.parado ? <Selo tom="perigo">Parado</Selo> : <Selo tom="alerta">Novo</Selo>}
                  />
                ))}
              </div>
            )}
          </Cartao>

          <Cartao titulo={tecnico ? 'Minha agenda' : 'Agenda de atendimentos'} acoes={<Link to="/interno/os">Todas as OS</Link>}>
            {ordens.carregando ? (
              <Carregando />
            ) : !agenda.length ? (
              <p className="pequeno" style={{ margin: 0 }}>{tecnico ? 'Nenhuma OS sua em aberto.' : 'Nenhuma OS em aberto.'}</p>
            ) : (
              [...grupos.entries()].map(([dia, lista]) => (
                <div key={dia}>
                  <h3 className="secao-titulo" style={{ marginTop: 8 }}>{dia}</h3>
                  <div className="lista">
                    {lista.map((o) => (
                      <LinhaLista
                        key={o.id}
                        para={`/interno/os/${o.id}`}
                        titulo={`${o.agendadaPara ? fmtDataHora(o.agendadaPara).split(' ')[1] + ' · ' : ''}${o.cliente.nome}`}
                        detalhe={`OS ${numeroOS(o.numero)} · ${rotuloTipoOS[o.tipo]} · ${o.equipamento.tipoNome}${tecnico ? '' : ` · ${o.tecnicoNome}`}`}
                        lateral={<Selo tom={tomStatusOS[o.status]}>{rotuloStatusOS[o.status]}</Selo>}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </Cartao>
        </div>

        <div>
          <QuadroAtencao />
          {!!aguardando.length && (
            <Cartao titulo="Aguardando peça ou aprovação">
              <div className="lista">
                {aguardando.map((c) => (
                  <LinhaLista key={c.id} para={`/interno/chamados/${c.id}`} titulo={`Nº ${c.numero} · ${c.clienteNome}`} detalhe={c.equipamentoDescricao} />
                ))}
              </div>
            </Cartao>
          )}
        </div>
      </div>
    </div>
  );
}

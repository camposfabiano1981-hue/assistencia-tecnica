// Contratos de manutenção: lista com o faturamento do mês, cadastro e detalhe.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Timestamp, collection, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import {
  OBJETO_PADRAO,
  PRAZOS_HORAS,
  aFaturar,
  atualizarContrato,
  competenciaDe,
  criarContrato,
  gerarFaturaDoContrato,
  mudarStatusContrato,
  rotuloCompetencia,
  rotuloStatusContrato,
  valorMensal,
  type DadosContrato,
} from '../../dados/contratos';
import { rotuloSituacaoFatura, situacaoFatura, snapshotCliente, tomSituacaoFatura } from '../../dados/financeiro';
import type { Cliente, CobrancaContrato, Contrato, Equipamento, Fatura, StatusContrato } from '../../tipos';
import { descreverEquipamento, fmtData, fmtMoeda, type Tom } from '../../util/formato';
import { deInputData, fimDoDia, inicioDoDia, paraInputData } from '../../util/datas';
import { CampoNumero } from '../../componentes/Valores';
import { BotaoVisualizar } from '../../componentes/Visualizador';
import {
  AreaTexto,
  Aviso,
  Botao,
  CabecalhoPagina,
  Campo,
  Carregando,
  Cartao,
  Info,
  LinhaLista,
  LinkBotao,
  Selecao,
  Selo,
  Vazio,
} from '../../componentes/ui';

const TOM: Record<StatusContrato, Tom> = { ativo: 'sucesso', suspenso: 'alerta', encerrado: 'neutro' };
const n5 = (n: number) => String(n).padStart(5, '0');

// ======================= Lista =======================

export function ListaContratos() {
  const { itens, carregando, erro } = useConsulta<Contrato>(() => query(collection(db, 'contratos'), orderBy('numero', 'desc')), []);
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);
  const competencia = competenciaDe(new Date());
  const ativos = itens.filter((c) => c.status === 'ativo');
  const pendentes = itens.filter((c) => aFaturar(c, competencia));
  const receita = ativos.reduce((t, c) => t + valorMensal(c), 0);

  async function gerar() {
    if (!window.confirm(`Gerar ${pendentes.length} fatura(s) de ${rotuloCompetencia(competencia)}?`)) return;
    setMsg(null);
    setGerando(true);
    let feitas = 0;
    const falhas: string[] = [];
    for (const c of pendentes) {
      try {
        await gerarFaturaDoContrato(c, competencia);
        feitas++;
      } catch (e) {
        falhas.push(`contrato nº ${c.numero}: ${mensagemErro(e)}`);
      }
    }
    setGerando(false);
    setMsg(
      falhas.length
        ? { tom: 'erro', texto: `${feitas} fatura(s) gerada(s). Não deu certo: ${falhas.join('; ')}` }
        : { tom: 'sucesso', texto: `${feitas} fatura(s) gerada(s). Envie pelo WhatsApp em Financeiro → Faturas.` },
    );
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Contratos"
        subtitulo="Manutenção com valor mensal"
        acoes={<LinkBotao para="/interno/contratos/novo" icone="mais_circulo">Novo</LinkBotao>}
      />
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <div className="resumo">
        <div className="resumo-item">
          <strong>{ativos.length}</strong>
          <span>Contratos ativos</span>
        </div>
        <div className="resumo-item">
          <strong className="numero">{fmtMoeda(receita)}</strong>
          <span>Receita mensal</span>
        </div>
        <div className={`resumo-item ${pendentes.length ? 'alerta' : ''}`}>
          <strong>{pendentes.length}</strong>
          <span>A faturar em {rotuloCompetencia(competencia)}</span>
        </div>
      </div>
      {!!pendentes.length && (
        <Cartao titulo={`Faturas de ${rotuloCompetencia(competencia)}`}>
          <p className="pequeno" style={{ marginTop: 0 }}>
            Uma fatura por contrato, com Pix e vencimento no dia combinado. Total: {fmtMoeda(pendentes.reduce((t, c) => t + valorMensal(c), 0))}.
          </p>
          <Botao icone="moeda" carregando={gerando} onClick={() => void gerar()}>
            Gerar {pendentes.length} fatura(s) de {rotuloCompetencia(competencia)}
          </Botao>
        </Cartao>
      )}
      {carregando ? (
        <Carregando />
      ) : !itens.length ? (
        <Vazio icone="lista" titulo="Nenhum contrato ainda">
          Contrato de manutenção com valor fixo por mês ou por equipamento: as faturas do mês saem com um toque e o prazo de atendimento aparece
          nos chamados.
        </Vazio>
      ) : (
        <div className="lista">
          {itens.map((c) => (
            <LinhaLista
              key={c.id}
              para={`/interno/contratos/${c.id}`}
              titulo={`Contrato nº ${c.numero} · ${c.cliente.nome}`}
              detalhe={`${fmtMoeda(valorMensal(c))}/mês · ${c.equipamentoIds.length} equipamento(s) · atendimento em até ${c.prazoAtendimentoHoras} h${
                c.fim ? ` · até ${fmtData(c.fim)}` : ''
              }`}
              lateral={
                <>
                  <Selo tom={TOM[c.status]}>{rotuloStatusContrato[c.status]}</Selo>
                  {aFaturar(c, competencia) && <Selo tom="alerta">A faturar</Selo>}
                </>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

// ======================= Cadastro =======================

type Form = {
  clienteId: string;
  equipamentoIds: string[];
  objeto: string;
  cobranca: CobrancaContrato;
  valor: number;
  pecasIncluidas: boolean;
  visitas: string;
  prazo: string;
  inicio: string;
  fim: string;
  dia: string;
  reajuste: string;
  observacoes: string;
};

export function ContratoEditar() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { perfil } = useSessao();
  const existente = useDocumento<Contrato>(id ? `contratos/${id}` : null);
  const clientes = useConsulta<Cliente>(() => query(collection(db, 'clientes'), orderBy('nome')), []);
  const [f, setF] = useState<Form | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const equipamentos = useConsulta<Equipamento>(
    () => (f?.clienteId ? query(collection(db, 'equipamentos'), where('clienteId', '==', f.clienteId)) : null),
    [f?.clienteId],
  );

  useEffect(() => {
    if (f) return;
    if (id) {
      const c = existente.dados;
      if (!c) return;
      setF({
        clienteId: c.clienteId,
        equipamentoIds: c.equipamentoIds,
        objeto: c.objeto,
        cobranca: c.cobranca,
        valor: c.valor,
        pecasIncluidas: c.pecasIncluidas,
        visitas: String(c.visitasPreventivasAno ?? 0),
        prazo: String(c.prazoAtendimentoHoras),
        inicio: paraInputData(c.inicio.toDate()),
        fim: paraInputData(c.fim?.toDate() ?? null),
        dia: String(c.diaVencimento),
        reajuste: c.reajuste ?? '',
        observacoes: c.observacoes ?? '',
      });
      return;
    }
    setF({
      clienteId: params.get('cliente') ?? '',
      equipamentoIds: [],
      objeto: OBJETO_PADRAO,
      cobranca: 'mensal',
      valor: 0,
      pecasIncluidas: false,
      visitas: '0',
      prazo: '24',
      inicio: paraInputData(new Date()),
      fim: '',
      dia: '10',
      reajuste: 'Anual, pelo IPCA acumulado nos últimos 12 meses.',
      observacoes: '',
    });
  }, [f, id, existente.dados, params]);

  if (!f || (id && existente.carregando)) return <Carregando />;
  if (id && existente.dados?.status === 'encerrado') {
    return <Aviso tom="alerta">Este contrato está encerrado. Reative-o para editar. <Link to={`/interno/contratos/${id}`}>Voltar</Link></Aviso>;
  }
  const ativosDoCliente = equipamentos.itens.filter((e) => e.ativo !== false || f.equipamentoIds.includes(e.id));
  const total = valorMensal({ cobranca: f.cobranca, valor: f.valor, equipamentoIds: f.equipamentoIds });
  const alternar = (eid: string) =>
    setF({ ...f, equipamentoIds: f.equipamentoIds.includes(eid) ? f.equipamentoIds.filter((x) => x !== eid) : [...f.equipamentoIds, eid] });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErro('');
    const cliente = clientes.itens.find((c) => c.id === f.clienteId);
    if (!cliente) return setErro('Escolha o cliente.');
    const cobertos = equipamentos.itens.filter((x) => f.equipamentoIds.includes(x.id));
    if (!cobertos.length) return setErro('Marque pelo menos um equipamento coberto.');
    if (f.valor <= 0) return setErro('Informe o valor.');
    const inicio = deInputData(f.inicio);
    if (!inicio) return setErro('Informe o início da vigência.');
    const fim = f.fim ? deInputData(f.fim) : null;
    if (fim && fim < inicio) return setErro('O fim da vigência precisa ser depois do início.');
    const dia = Number(f.dia);
    if (!(dia >= 1 && dia <= 28)) return setErro('O dia do vencimento vai de 1 a 28.');
    const dados: DadosContrato = {
      clienteId: cliente.id,
      cliente: snapshotCliente(cliente),
      equipamentoIds: cobertos.map((x) => x.id),
      equipamentos: cobertos.map((x) => ({ id: x.id, descricao: descreverEquipamento(x) })),
      objeto: f.objeto.trim() || OBJETO_PADRAO,
      cobranca: f.cobranca,
      valor: f.valor,
      pecasIncluidas: f.pecasIncluidas,
      visitasPreventivasAno: Math.max(0, Math.round(Number(f.visitas) || 0)),
      prazoAtendimentoHoras: Number(f.prazo) || 24,
      // A vigência vale o dia inteiro: das 0h do primeiro dia às 23h59 do último.
      inicio: Timestamp.fromDate(inicioDoDia(inicio)),
      fim: fim ? Timestamp.fromDate(fimDoDia(fim)) : null,
      diaVencimento: dia,
      reajuste: f.reajuste.trim(),
      observacoes: f.observacoes.trim(),
    };
    setSalvando(true);
    try {
      if (id) {
        await atualizarContrato(id, dados);
        navegar(`/interno/contratos/${id}`, { replace: true });
      } else {
        const n = await criarContrato(dados, perfil?.nome ?? 'Equipe');
        navegar(`/interno/contratos/${n}`, { replace: true });
      }
    } catch (err) {
      setErro(mensagemErro(err));
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar}>
      <CabecalhoPagina titulo={id ? `Editar contrato nº ${existente.dados?.numero ?? ''}` : 'Novo contrato'} voltar={true} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <Selecao rotulo="Cliente" value={f.clienteId} disabled={!!id} onChange={(e) => setF({ ...f, clienteId: e.target.value, equipamentoIds: [] })}>
          <option value="">Escolha o cliente…</option>
          {clientes.itens.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Selecao>
      </Cartao>
      {f.clienteId && (
        <Cartao
          titulo={`Equipamentos cobertos (${f.equipamentoIds.length})`}
          acoes={
            !!ativosDoCliente.length && (
              <Botao type="button" variante="fantasma" onClick={() => setF({ ...f, equipamentoIds: ativosDoCliente.map((x) => x.id) })}>
                Marcar todos
              </Botao>
            )
          }
        >
          {equipamentos.carregando ? (
            <Carregando />
          ) : !ativosDoCliente.length ? (
            <p className="pequeno" style={{ margin: 0 }}>
              Este cliente ainda não tem equipamentos cadastrados.
            </p>
          ) : (
            ativosDoCliente.map((x) => (
              <label key={x.id} className="marcador">
                <input type="checkbox" checked={f.equipamentoIds.includes(x.id)} onChange={() => alternar(x.id)} />
                <span>{descreverEquipamento(x)}</span>
              </label>
            ))
          )}
        </Cartao>
      )}
      <Cartao titulo="Valores e prazos">
        <div className="grade grade-2">
          <Selecao rotulo="Cobrança" value={f.cobranca} onChange={(e) => setF({ ...f, cobranca: e.target.value as CobrancaContrato })}>
            <option value="mensal">Valor fixo por mês</option>
            <option value="por-equipamento">Valor por equipamento, por mês</option>
          </Selecao>
          <div className="campo">
            <span className="campo-rotulo">{f.cobranca === 'mensal' ? 'Valor mensal (R$)' : 'Valor por equipamento (R$)'}</span>
            <CampoNumero rotulo="Valor do contrato" className="campo-valor" valor={f.valor} aoMudar={(n) => setF({ ...f, valor: n })} />
          </div>
        </div>
        <p className="pequeno" style={{ marginTop: 0 }}>
          Total por mês: <strong>{fmtMoeda(total)}</strong>
          {f.cobranca === 'por-equipamento' && ` (${f.equipamentoIds.length} equipamento(s))`}
        </p>
        <label className="marcador">
          <input type="checkbox" checked={f.pecasIncluidas} onChange={(e) => setF({ ...f, pecasIncluidas: e.target.checked })} />
          <span>
            Peças incluídas no valor
            <span className="pequeno" style={{ display: 'block' }}>Sem esta marca, as peças são orçadas à parte.</span>
          </span>
        </label>
        <div className="grade grade-3">
          <Selecao rotulo="Prazo para atender chamados" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })}>
            {PRAZOS_HORAS.map((h) => (
              <option key={h} value={h}>
                até {h} horas
              </option>
            ))}
          </Selecao>
          <Campo
            rotulo="Visitas preventivas por ano"
            type="number"
            min={0}
            value={f.visitas}
            onChange={(e) => setF({ ...f, visitas: e.target.value })}
            ajuda="0 = conforme cada tipo de equipamento"
          />
          <Campo rotulo="Dia do vencimento" type="number" min={1} max={28} value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} />
          <Campo rotulo="Início da vigência" type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} />
          <Campo rotulo="Fim da vigência (opcional)" type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} />
        </div>
        <Campo rotulo="Reajuste" value={f.reajuste} onChange={(e) => setF({ ...f, reajuste: e.target.value })} />
      </Cartao>
      <Cartao titulo="Texto do contrato">
        <AreaTexto rotulo="Objeto" rows={3} value={f.objeto} onChange={(e) => setF({ ...f, objeto: e.target.value })} />
        <AreaTexto
          rotulo="Disposições adicionais (opcional)"
          rows={3}
          value={f.observacoes}
          onChange={(e) => setF({ ...f, observacoes: e.target.value })}
          ajuda="Entram como última cláusula do PDF."
        />
        <p className="pequeno" style={{ marginBottom: 0 }}>
          O PDF é um modelo de referência: revise o texto com o seu advogado antes de assinar.
        </p>
      </Cartao>
      <Botao type="submit" carregando={salvando} bloco>
        Salvar contrato ({fmtMoeda(total)}/mês)
      </Botao>
    </form>
  );
}

// ======================= Detalhe =======================

export function ContratoDetalhe() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { empresa } = useSessao();
  const { dados: c, carregando, erro } = useDocumento<Contrato>(`contratos/${id}`);
  const faturas = useConsulta<Fatura>(() => query(collection(db, 'faturas'), where('contratoId', '==', id)), [id]);
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (carregando) return <Carregando />;
  if (erro || !c) return <Vazio titulo="Contrato não encontrado" />;
  const competencia = competenciaDe(new Date());
  const pendente = aFaturar(c, competencia);

  async function status(novo: StatusContrato, pergunta: string) {
    if (!window.confirm(pergunta)) return;
    setMsg(null);
    try {
      await mudarStatusContrato(id, novo);
      setMsg({ tom: 'sucesso', texto: `Contrato ${rotuloStatusContrato[novo].toLowerCase()}.` });
    } catch (e) {
      setMsg({ tom: 'erro', texto: mensagemErro(e) });
    }
  }

  async function faturar() {
    if (!c) return;
    setOcupado(true);
    try {
      const n = await gerarFaturaDoContrato(c, competencia);
      navegar(`/interno/faturas/${n}`);
    } catch (e) {
      setMsg({ tom: 'erro', texto: mensagemErro(e) });
      setOcupado(false);
    }
  }

  const lista = [...faturas.itens].sort((a, b) => b.numero - a.numero);
  return (
    <>
      <CabecalhoPagina
        titulo={`Contrato nº ${c.numero}`}
        subtitulo={<Link to={`/interno/clientes/${c.clienteId}`}>{c.cliente.nome}</Link>}
        voltar="/interno/contratos"
        acoes={<Selo tom={TOM[c.status]}>{rotuloStatusContrato[c.status]}</Selo>}
      />
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <Cartao>
        <dl className="infos">
          <Info rotulo="Valor mensal">
            {c.cobranca === 'mensal'
              ? fmtMoeda(valorMensal(c))
              : `${fmtMoeda(valorMensal(c))} (${fmtMoeda(c.valor)} × ${c.equipamentoIds.length} equipamento(s))`}
          </Info>
          <Info rotulo="Peças">{c.pecasIncluidas ? 'Incluídas no valor' : 'Orçadas à parte'}</Info>
          <Info rotulo="Prazo de atendimento">{`até ${c.prazoAtendimentoHoras} horas da abertura do chamado`}</Info>
          <Info rotulo="Preventivas">{c.visitasPreventivasAno ? `${c.visitasPreventivasAno} visita(s) por ano` : 'Conforme cada tipo de equipamento'}</Info>
          <Info rotulo="Vigência">{`${fmtData(c.inicio)} ${c.fim ? `a ${fmtData(c.fim)}` : '· prazo indeterminado'}`}</Info>
          <Info rotulo="Vencimento">{`todo dia ${c.diaVencimento}`}</Info>
          <Info rotulo="Reajuste">{c.reajuste}</Info>
          <Info rotulo="Última fatura">{c.ultimaCompetencia ? rotuloCompetencia(c.ultimaCompetencia) : '—'}</Info>
        </dl>
      </Cartao>
      <Cartao titulo={`Equipamentos cobertos (${c.equipamentos.length})`}>
        <div className="lista">
          {c.equipamentos.map((e) => (
            <LinhaLista key={e.id} para={`/interno/equipamentos/${e.id}`} titulo={e.descricao} />
          ))}
        </div>
      </Cartao>
      <div className="acoes-coluna" style={{ marginBottom: 14 }}>
        {pendente && (
          <Botao icone="moeda" carregando={ocupado} bloco onClick={() => void faturar()}>
            Gerar fatura de {rotuloCompetencia(competencia)}
          </Botao>
        )}
        <BotaoVisualizar
          rotulo="Visualizar contrato (PDF)"
          bloco
          gerar={async () => {
            const { gerarContratoPDF } = await import('../../util/documentos');
            return { arquivo: gerarContratoPDF(c, empresa), texto: `Contrato de manutenção nº ${n5(c.numero)} - ${c.cliente.nome}` };
          }}
        />
        {c.status !== 'encerrado' && (
          <LinkBotao para={`/interno/contratos/${c.id}/editar`} variante="secundario" icone="editar" bloco>
            Editar
          </LinkBotao>
        )}
        {c.status === 'ativo' && (
          <Botao variante="secundario" bloco onClick={() => void status('suspenso', 'Suspender este contrato? As faturas mensais param até reativar.')}>
            Suspender
          </Botao>
        )}
        {c.status !== 'ativo' && (
          <Botao variante="secundario" bloco onClick={() => void status('ativo', 'Reativar este contrato?')}>
            Reativar
          </Botao>
        )}
        {c.status !== 'encerrado' && (
          <Botao variante="perigo" bloco onClick={() => void status('encerrado', 'Encerrar este contrato?')}>
            Encerrar contrato
          </Botao>
        )}
      </div>
      <Cartao titulo="Faturas do contrato">
        {!lista.length ? (
          <p className="pequeno" style={{ margin: 0 }}>Nenhuma fatura ainda.</p>
        ) : (
          <div className="lista">
            {lista.map((x) => {
              const s = situacaoFatura(x);
              return (
                <LinhaLista
                  key={x.id}
                  para={`/interno/faturas/${x.id}`}
                  titulo={`Fatura nº ${x.numero} · ${fmtMoeda(x.total)}`}
                  detalhe={x.competencia ? `competência ${rotuloCompetencia(x.competencia)} · vence ${fmtData(x.vencimento)}` : `vence ${fmtData(x.vencimento)}`}
                  lateral={<Selo tom={tomSituacaoFatura[s]}>{rotuloSituacaoFatura[s]}</Selo>}
                />
              );
            })}
          </div>
        )}
      </Cartao>
    </>
  );
}

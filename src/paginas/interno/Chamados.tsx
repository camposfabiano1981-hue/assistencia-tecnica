import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import { agendarChamado, criarChamado, criarOS, mudarStatusChamado } from '../../dados/operacoes';
import type { Chamado, Cliente, Equipamento, Orcamento, StatusChamado, TipoOS, Usuario } from '../../tipos';
import { rotuloStatusOrcamento, tomStatusOrcamento } from '../../dados/financeiro';
import { fmtMoeda } from '../../util/formato';
import {
  fmtDataHora,
  fmtRelativo,
  normalizar,
  numeroOS,
  paraInputDataHora,
  rotuloOrigem,
  rotuloStatusChamado,
  rotuloTipoOS,
  tomStatusChamado,
} from '../../util/formato';
import { abrirWhatsApp } from '../../util/whatsapp';
import { FormChamado, type DadosFormChamado } from '../../componentes/FormChamado';
import { GaleriaFotos } from '../../componentes/Fotos';
import { Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, Info, LinhaLista, LinkBotao, Selecao, Selo, Vazio } from '../../componentes/ui';
import { BotaoVisualizarChamado } from '../../componentes/Documentos';

const FILTROS: { valor: StatusChamado | 'todos' | 'ativos'; rotulo: string }[] = [
  { valor: 'ativos', rotulo: 'Em andamento' },
  { valor: 'aberto', rotulo: 'Novos' },
  { valor: 'agendado', rotulo: 'Agendados' },
  { valor: 'em_atendimento', rotulo: 'Em atendimento' },
  { valor: 'aguardando', rotulo: 'Aguardando' },
  { valor: 'concluido', rotulo: 'Concluídos' },
  { valor: 'cancelado', rotulo: 'Cancelados' },
  { valor: 'todos', rotulo: 'Todos' },
];

export function ListaChamados() {
  const [params, setParams] = useSearchParams();
  const filtro = (params.get('f') as (typeof FILTROS)[number]['valor']) || 'ativos';
  const [busca, setBusca] = useState('');
  const { itens, carregando, erro } = useConsulta<Chamado>(() => query(collection(db, 'chamados'), orderBy('numero', 'desc'), limit(300)), []);
  const termo = normalizar(busca);
  const lista = itens
    .filter((c) =>
      filtro === 'todos' ? true : filtro === 'ativos' ? !['concluido', 'cancelado'].includes(c.status) : c.status === filtro,
    )
    .filter((c) => !termo || normalizar(`${c.numero} ${c.clienteNome} ${c.equipamentoDescricao} ${c.relato}`).includes(termo));

  return (
    <>
      <CabecalhoPagina titulo="Chamados" acoes={<LinkBotao para="/interno/chamados/novo" icone="mais_circulo">Registrar</LinkBotao>} />
      <div className="filtros" role="group" aria-label="Filtrar por situação">
        {FILTROS.map((f) => (
          <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setParams({ f: f.valor })}>
            {f.rotulo}
          </button>
        ))}
      </div>
      <div className="busca">
        <input type="search" placeholder="Buscar por número, cliente ou equipamento" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {carregando ? (
        <Carregando />
      ) : !lista.length ? (
        <Vazio icone="chamados" titulo="Nenhum chamado aqui" />
      ) : (
        <div className="lista">
          {lista.map((c) => (
            <LinhaLista
              key={c.id}
              para={`/interno/chamados/${c.id}`}
              titulo={`Nº ${c.numero} · ${c.clienteNome}`}
              detalhe={`${c.equipamentoDescricao} · ${fmtRelativo(c.abertoEm)}`}
              lateral={
                <>
                  <Selo tom={tomStatusChamado[c.status]}>{rotuloStatusChamado[c.status]}</Selo>
                  {c.parado && !['concluido', 'cancelado'].includes(c.status) && <Selo tom="perigo">Parado</Selo>}
                </>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Chamado recebido por telefone, WhatsApp ou pessoalmente. */
export function NovoChamadoInterno() {
  const { perfil, empresa } = useSessao();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [clienteId, setClienteId] = useState(params.get('cliente') ?? '');
  const clientes = useConsulta<Cliente>(() => query(collection(db, 'clientes'), orderBy('nome')), []);
  const equipamentos = useConsulta<Equipamento>(
    () => (clienteId ? query(collection(db, 'equipamentos'), where('clienteId', '==', clienteId)) : null),
    [clienteId],
  );
  const cliente = clientes.itens.find((c) => c.id === clienteId);
  void empresa;

  async function enviar(d: DadosFormChamado) {
    if (!cliente) throw new Error('Escolha o cliente.');
    try {
      const numero = await criarChamado(
        {
          cliente: { id: cliente.id, nome: cliente.nome },
          equipamento: d.equipamento,
          descricaoOutro: d.descricaoOutro,
          relato: d.relato,
          parado: d.parado,
          origem: d.origem,
          autor: { uid: perfil!.id, nome: perfil!.nome },
          contato: d.contato,
        },
        d.fotos,
      );
      navegar(`/interno/chamados/${numero}`, { replace: true });
    } catch (e) {
      throw new Error(mensagemErro(e));
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Registrar chamado" subtitulo="Pedido recebido por WhatsApp, telefone ou pessoalmente" voltar="/interno/chamados" />
      <Cartao>
        <Selecao rotulo="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Escolha o cliente…</option>
          {clientes.itens.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </Selecao>
        {!clientes.carregando && !clientes.itens.length && (
          <p className="pequeno">
            Nenhum cliente cadastrado. <Link to="/interno/clientes/novo">Cadastre o cliente</Link> primeiro.
          </p>
        )}
      </Cartao>
      {cliente &&
        (equipamentos.carregando ? (
          <Carregando />
        ) : (
          <FormChamado key={cliente.id} interno equipamentos={equipamentos.itens.filter((e) => e.ativo !== false)} equipamentoInicial={params.get('equipamento')} aoEnviar={enviar} />
        ))}
    </>
  );
}

export function ChamadoInterno() {
  const { id = '' } = useParams();
  const { perfil } = useSessao();
  const { dados: c, carregando, erro } = useDocumento<Chamado>(`chamados/${id}`);
  const cliente = useDocumento<Cliente>(c ? `clientes/${c.clienteId}` : null);
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [obs, setObs] = useState('');

  if (carregando) return <Carregando />;
  if (erro || !c) return <Vazio titulo="Chamado não encontrado" />;
  const zap = cliente.dados?.whatsapp || cliente.dados?.telefone;
  const encerrado = c.status === 'concluido' || c.status === 'cancelado';
  const historico = [...(c.historico ?? [])].sort((a, b) => b.em.toMillis() - a.em.toMillis());
  const nome = perfil?.nome ?? 'Equipe';

  async function status(s: StatusChamado, texto?: string) {
    setMsg(null);
    try {
      await mudarStatusChamado(c!, s, nome, texto || undefined);
      setObs('');
      setMsg({ tom: 'sucesso', texto: `Chamado marcado como "${rotuloStatusChamado[s]}".` });
    } catch (e) {
      setMsg({ tom: 'erro', texto: mensagemErro(e) });
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo={`Chamado nº ${c.numero}`}
        subtitulo={<Link to={`/interno/clientes/${c.clienteId}`}>{c.clienteNome}</Link>}
        voltar="/interno/chamados"
        acoes={<Selo tom={tomStatusChamado[c.status]}>{rotuloStatusChamado[c.status]}</Selo>}
      />
      {c.parado && !encerrado && <Aviso tom="erro">Equipamento PARADO segundo o cliente.</Aviso>}
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}

      <Cartao titulo="Relato">
        <p className="relato">{c.relato}</p>
        <dl className="infos" style={{ marginTop: 12 }}>
          <Info rotulo="Equipamento">
            {c.equipamentoId ? <Link to={`/interno/equipamentos/${c.equipamentoId}`}>{c.equipamentoDescricao}</Link> : c.equipamentoDescricao}
          </Info>
          <Info rotulo="Contato">{c.contato}</Info>
          <Info rotulo="Aberto">{`${fmtDataHora(c.abertoEm)} por ${c.abertoPor?.nome} (${rotuloOrigem[c.origem]})`}</Info>
          <Info rotulo="Agendado para">{c.agendadoPara ? fmtDataHora(c.agendadoPara) : 'Não agendado'}</Info>
        </dl>
        {c.qtdFotos > 0 && (
          <div style={{ marginTop: 12 }}>
            <GaleriaFotos caminho={`chamados/${c.id}/fotos`} />
          </div>
        )}
        <div className="acoes">
          <BotaoVisualizarChamado chamado={c} />
        </div>
      </Cartao>

      {!encerrado && <Agendar chamado={c} nome={nome} zap={zap} />}

      <OSDoChamado chamado={c} cliente={cliente.dados} />
      <OrcamentosDoChamado chamado={c} />

      {zap && (
        <Cartao titulo="Mensagens para o cliente (WhatsApp)">
          <div className="acoes" style={{ marginTop: 0 }}>
            <Botao variante="whatsapp" icone="whatsapp" onClick={() => abrirWhatsApp(zap, `Olá! Recebemos o seu chamado nº ${c.numero} (${c.equipamentoDescricao}). Já vamos agendar o atendimento.`)}>
              Recebemos
            </Botao>
            {c.agendadoPara && (
              <Botao variante="whatsapp" icone="whatsapp" onClick={() => abrirWhatsApp(zap, `Olá! O atendimento do chamado nº ${c.numero} está agendado para ${fmtDataHora(c.agendadoPara)}.`)}>
                Agendamento
              </Botao>
            )}
            <Botao variante="whatsapp" icone="whatsapp" onClick={() => abrirWhatsApp(zap, `Olá! O técnico está a caminho para o atendimento do chamado nº ${c.numero}.`)}>
              A caminho
            </Botao>
            {c.status === 'concluido' && (
              <Botao
                variante="whatsapp"
                icone="whatsapp"
                onClick={() => abrirWhatsApp(zap, `Olá! O atendimento do chamado nº ${c.numero} foi concluído. O laudo está disponível no portal: ${location.origin}/portal/chamados/${c.numero}`)}
              >
                Concluído
              </Botao>
            )}
          </div>
        </Cartao>
      )}

      <Cartao titulo="Situação do chamado">
        <Campo rotulo="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: aguardando placa do fornecedor" />
        <div className="acoes" style={{ marginTop: 0 }}>
          {!encerrado && c.status !== 'aguardando' && (
            <Botao variante="secundario" onClick={() => status('aguardando', obs)}>Aguardando peça/aprovação</Botao>
          )}
          {c.status === 'aguardando' && (
            <Botao variante="secundario" onClick={() => status(c.agendadoPara ? 'agendado' : 'aberto', obs || 'Retomado')}>Retomar</Botao>
          )}
          {!encerrado && (
            <Botao variante="perigo" onClick={() => (obs.trim() ? status('cancelado', obs) : setMsg({ tom: 'erro', texto: 'Escreva o motivo do cancelamento na observação.' }))}>
              Cancelar chamado
            </Botao>
          )}
          {c.status === 'cancelado' && <Botao variante="secundario" onClick={() => status('aberto', obs || 'Reaberto')}>Reabrir</Botao>}
        </div>
      </Cartao>

      <Cartao titulo="Histórico">
        <ol className="tempo">
          {historico.map((h, i) => (
            <li key={i}>
              <strong>{rotuloStatusChamado[h.status]}</strong>
              {h.obs && <div>{h.obs}</div>}
              <small>
                {fmtDataHora(h.em)} · {h.por}
              </small>
            </li>
          ))}
        </ol>
      </Cartao>
    </>
  );
}

function Agendar({ chamado, nome, zap }: { chamado: Chamado; nome: string; zap?: string }) {
  const inicial = chamado.agendadoPara?.toDate() ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  })();
  const [quando, setQuando] = useState(paraInputDataHora(inicial));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <Cartao titulo={chamado.agendadoPara ? 'Reagendar' : 'Agendar atendimento'}>
      {msg && <Aviso tom="sucesso">{msg}</Aviso>}
      <Campo rotulo="Data e hora" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
      <div className="acoes" style={{ marginTop: 0 }}>
        <Botao
          carregando={salvando}
          icone="relogio"
          onClick={async () => {
            setSalvando(true);
            try {
              const d = new Date(quando);
              await agendarChamado(chamado, d, nome);
              setMsg(`Agendado para ${d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`);
            } finally {
              setSalvando(false);
            }
          }}
        >
          Salvar agendamento
        </Botao>
        {zap && (
          <Botao
            variante="whatsapp"
            icone="whatsapp"
            onClick={() =>
              abrirWhatsApp(zap, `Olá! O atendimento do chamado nº ${chamado.numero} ficou agendado para ${new Date(quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Podemos confirmar?`)
            }
          >
            Confirmar com o cliente
          </Botao>
        )}
      </div>
    </Cartao>
  );
}

function OSDoChamado({ chamado, cliente }: { chamado: Chamado; cliente: Cliente | null }) {
  const { perfil } = useSessao();
  const navegar = useNavigate();
  const equipe = useConsulta<Usuario>(() => query(collection(db, 'usuarios'), where('papel', 'in', ['gestor', 'tecnico'])), []);
  const equipamento = useDocumento<Equipamento>(chamado.equipamentoId ? `equipamentos/${chamado.equipamentoId}` : null);
  const [tipo, setTipo] = useState<TipoOS>('corretiva');
  const [tecnicoId, setTecnicoId] = useState('');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');

  if (chamado.osId) {
    return (
      <Cartao titulo="Ordem de serviço">
        <p style={{ marginTop: 0 }}>Este chamado já tem a OS nº {numeroOS(Number(chamado.osId))}.</p>
        <LinkBotao para={`/interno/os/${chamado.osId}`} icone="chave" bloco>
          Abrir a OS
        </LinkBotao>
      </Cartao>
    );
  }
  if (chamado.status === 'cancelado' || chamado.status === 'concluido') return null;

  const ativos = equipe.itens.filter((u) => u.ativo);
  const padrao = tecnicoId || (perfil?.papel === 'tecnico' ? perfil.id : (ativos.find((u) => u.papel === 'tecnico')?.id ?? perfil?.id ?? ''));

  async function criar() {
    setErro('');
    const tecnico = ativos.find((u) => u.id === padrao);
    if (!tecnico || !cliente) return setErro('Escolha o técnico.');
    if (!navigator.onLine) return setErro('Criar a OS precisa de internet (para gerar o número).');
    setCriando(true);
    try {
      const n = await criarOS({
        tipo,
        cliente,
        equipamento: equipamento.dados,
        chamado,
        tecnico,
        agendadaPara: null, // a transação usa o agendamento mais recente do chamado
        autor: perfil?.nome ?? 'Equipe',
      });
      navegar(`/interno/os/${n}`);
    } catch (e) {
      setErro(mensagemErro(e));
      setCriando(false);
    }
  }

  return (
    <Cartao titulo="Ordem de serviço">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="grade grade-2">
        <Selecao rotulo="Tipo de serviço" value={tipo} onChange={(e) => setTipo(e.target.value as TipoOS)}>
          {Object.entries(rotuloTipoOS).map(([v, r]) => (
            <option key={v} value={v}>{r}</option>
          ))}
        </Selecao>
        <Selecao rotulo="Técnico" value={padrao} onChange={(e) => setTecnicoId(e.target.value)}>
          {ativos.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </Selecao>
      </div>
      {!chamado.equipamentoId && (
        <p className="pequeno" style={{ marginTop: 0 }}>
          O equipamento não está cadastrado. A OS sai sem checklist; se preferir, cadastre o equipamento antes.
        </p>
      )}
      <Botao icone="chave" carregando={criando} disabled={equipamento.carregando || equipe.carregando || !cliente} onClick={criar} bloco>
        Criar OS
      </Botao>
    </Cartao>
  );
}

function OrcamentosDoChamado({ chamado }: { chamado: Chamado }) {
  const { itens } = useConsulta<Orcamento>(() => query(collection(db, 'orcamentos'), where('chamadoId', '==', chamado.id)), [chamado.id]);
  const lista = [...itens].sort((a, b) => b.numero - a.numero);
  if (chamado.status === 'cancelado' && !lista.length) return null;
  return (
    <Cartao
      titulo="Orçamentos"
      acoes={chamado.status !== 'cancelado' && <LinkBotao para={`/interno/orcamentos/novo?chamado=${chamado.id}`} variante="secundario" icone="mais_circulo">Fazer orçamento</LinkBotao>}
    >
      {!lista.length ? (
        <p className="pequeno" style={{ margin: 0 }}>Se o reparo precisar de aprovação de valores, faça o orçamento: o cliente aprova pelo portal.</p>
      ) : (
        <div className="lista">
          {lista.map((o) => (
            <LinhaLista
              key={o.id}
              para={`/interno/orcamentos/${o.id}`}
              titulo={`Orç. ${String(o.numero).padStart(5, '0')} · ${fmtMoeda(o.total)}`}
              detalhe={o.resposta ? `${o.resposta.status === 'aprovado' ? 'Aprovado' : 'Recusado'} por ${o.resposta.nome}` : undefined}
              lateral={<Selo tom={tomStatusOrcamento[o.status]}>{rotuloStatusOrcamento[o.status]}</Selo>}
            />
          ))}
        </div>
      )}
    </Cartao>
  );
}

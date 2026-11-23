import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import { criarOS } from '../../dados/operacoes';
import type { Cliente, Equipamento, OrdemServico, StatusOS, TipoOS, Usuario } from '../../tipos';
import { descreverEquipamento, fmtData, fmtDataHora, normalizar, numeroOS, paraInputDataHora, rotuloStatusOS, rotuloTipoOS, tomStatusOS } from '../../util/formato';
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, LinhaLista, LinkBotao, Selecao, Selo, Vazio } from '../../componentes/ui';

const FILTROS: { valor: StatusOS | 'abertas' | 'todas'; rotulo: string }[] = [
  { valor: 'abertas', rotulo: 'Em aberto' },
  { valor: 'concluida', rotulo: 'Concluídas' },
  { valor: 'todas', rotulo: 'Todas' },
];

export function ListaOS() {
  const [params, setParams] = useSearchParams();
  const filtro = (params.get('f') as (typeof FILTROS)[number]['valor']) || 'abertas';
  const [busca, setBusca] = useState('');
  const { itens, carregando, erro } = useConsulta<OrdemServico>(() => query(collection(db, 'os'), orderBy('numero', 'desc'), limit(300)), []);
  const termo = normalizar(busca);
  const lista = itens
    .filter((o) => (filtro === 'todas' ? true : filtro === 'abertas' ? o.status !== 'concluida' : o.status === filtro))
    .filter((o) => !termo || normalizar(`${o.numero} ${o.cliente.nome} ${o.equipamento.tipoNome} ${o.equipamento.numeroSerie ?? ''}`).includes(termo));

  return (
    <>
      <CabecalhoPagina titulo="Ordens de serviço" acoes={<LinkBotao para="/interno/os/nova" icone="mais_circulo">Nova</LinkBotao>} />
      <div className="filtros" role="group" aria-label="Filtrar">
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
        <Vazio icone="chave" titulo="Nenhuma OS aqui" />
      ) : (
        <div className="lista">
          {lista.map((o) => (
            <LinhaLista
              key={o.id}
              para={`/interno/os/${o.id}`}
              titulo={`OS ${numeroOS(o.numero)} · ${o.cliente.nome}`}
              detalhe={`${rotuloTipoOS[o.tipo]} · ${o.equipamento.tipoNome} · ${o.status === 'concluida' ? `concluída ${fmtData(o.fimEm)}` : o.agendadaPara ? fmtDataHora(o.agendadaPara) : 'sem data'}`}
              lateral={<Selo tom={tomStatusOS[o.status]}>{rotuloStatusOS[o.status]}</Selo>}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** OS sem chamado: preventiva programada, instalação, ensaio… */
export function NovaOS() {
  const { perfil } = useSessao();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const doEquipamento = useDocumento<Equipamento>(params.get('equipamento') ? `equipamentos/${params.get('equipamento')}` : null);
  const [clienteId, setClienteId] = useState(params.get('cliente') ?? '');
  const [equipamentoId, setEquipamentoId] = useState(params.get('equipamento') ?? '');
  const [tipo, setTipo] = useState<TipoOS>((params.get('tipo') as TipoOS) || 'preventiva');
  const [tecnicoId, setTecnicoId] = useState('');
  const [quando, setQuando] = useState('');
  const [relato, setRelato] = useState('');
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const clientes = useConsulta<Cliente>(() => query(collection(db, 'clientes'), orderBy('nome')), []);
  const idCliente = clienteId || doEquipamento.dados?.clienteId || '';
  const equipamentos = useConsulta<Equipamento>(
    () => (idCliente ? query(collection(db, 'equipamentos'), where('clienteId', '==', idCliente)) : null),
    [idCliente],
  );
  const equipe = useConsulta<Usuario>(() => query(collection(db, 'usuarios'), where('papel', 'in', ['gestor', 'tecnico'])), []);

  if (clientes.carregando || equipe.carregando || doEquipamento.carregando) return <Carregando />;
  const ativos = equipe.itens.filter((u) => u.ativo);
  const tecnico = tecnicoId || (perfil?.papel === 'tecnico' ? perfil.id : (ativos.find((u) => u.papel === 'tecnico')?.id ?? perfil?.id ?? ''));

  async function criar() {
    setErro('');
    const cliente = clientes.itens.find((c) => c.id === idCliente);
    const tec = ativos.find((u) => u.id === tecnico);
    if (!cliente) return setErro('Escolha o cliente.');
    if (!tec) return setErro('Escolha o técnico.');
    if (!navigator.onLine) return setErro('Criar a OS precisa de internet (para gerar o número).');
    setCriando(true);
    try {
      const n = await criarOS({
        tipo,
        cliente,
        equipamento: equipamentos.itens.find((e) => e.id === equipamentoId) ?? null,
        chamado: null,
        tecnico: tec,
        agendadaPara: quando ? new Date(quando) : null,
        relato,
        autor: perfil?.nome ?? 'Equipe',
      });
      navegar(`/interno/os/${n}`, { replace: true });
    } catch (e) {
      setErro(mensagemErro(e));
      setCriando(false);
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Nova OS" subtitulo="Preventiva, instalação, ensaio ou serviço sem chamado" voltar={true} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <Selecao
          rotulo="Cliente"
          value={idCliente}
          onChange={(e) => {
            setClienteId(e.target.value);
            setEquipamentoId('');
          }}
        >
          <option value="">Escolha o cliente…</option>
          {clientes.itens.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </Selecao>
        <Selecao rotulo="Equipamento" value={equipamentoId} onChange={(e) => setEquipamentoId(e.target.value)} disabled={!idCliente}>
          <option value="">Sem equipamento cadastrado</option>
          {equipamentos.itens.map((e) => (
            <option key={e.id} value={e.id}>{descreverEquipamento(e)}</option>
          ))}
        </Selecao>
        <div className="grade grade-2">
          <Selecao rotulo="Tipo de serviço" value={tipo} onChange={(e) => setTipo(e.target.value as TipoOS)}>
            {Object.entries(rotuloTipoOS).map(([v, r]) => (
              <option key={v} value={v}>{r}</option>
            ))}
          </Selecao>
          <Selecao rotulo="Técnico" value={tecnico} onChange={(e) => setTecnicoId(e.target.value)}>
            {ativos.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </Selecao>
        </div>
        <Campo rotulo="Agendada para (opcional)" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} min={paraInputDataHora(new Date(Date.now() - 86400000))} />
        <AreaTexto rotulo="Motivo / solicitação (opcional)" rows={3} value={relato} onChange={(e) => setRelato(e.target.value)} />
      </Cartao>
      <Botao icone="chave" carregando={criando} onClick={criar} bloco>
        Criar OS
      </Botao>
    </>
  );
}

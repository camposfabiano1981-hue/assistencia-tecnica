import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { addDoc, collection, doc, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import type { Chamado, Cliente, Criticidade, Equipamento, OrdemServico, TipoEquipamento } from '../../tipos';
import {
  descreverEquipamento,
  fmtData,
  fmtRelativo,
  normalizar,
  numeroOS,
  rotuloCriticidade,
  rotuloStatusChamado,
  rotuloStatusOS,
  rotuloTipoOS,
  tomStatusChamado,
  tomStatusOS,
} from '../../util/formato';
import { QrCode, urlEquipamento } from '../../componentes/QrCode';
import { CartaoVencimentos } from './Controle';
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

export function ListaEquipamentos() {
  const { itens, carregando, erro } = useConsulta<Equipamento>(() => query(collection(db, 'equipamentos'), orderBy('clienteNome')), []);
  const [busca, setBusca] = useState('');
  const termo = normalizar(busca);
  const filtrados = itens.filter((e) =>
    normalizar(`${e.clienteNome} ${e.tipoNome} ${e.fabricante ?? ''} ${e.modelo ?? ''} ${e.numeroSerie ?? ''} ${e.patrimonio ?? ''}`).includes(termo),
  );
  return (
    <>
      <CabecalhoPagina
        titulo="Equipamentos"
        subtitulo={carregando ? undefined : `${itens.length} cadastrado(s)`}
        acoes={<LinkBotao para="/interno/equipamentos/novo" icone="mais_circulo">Novo</LinkBotao>}
      />
      <div className="busca">
        <input type="search" placeholder="Buscar por cliente, tipo, modelo ou série" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {carregando ? (
        <Carregando />
      ) : !filtrados.length ? (
        <Vazio icone="caixa" titulo="Nenhum equipamento">Cadastre os equipamentos a partir da página de cada cliente.</Vazio>
      ) : (
        <div className="lista">
          {filtrados.map((e) => (
            <LinhaLista
              key={e.id}
              para={`/interno/equipamentos/${e.id}`}
              titulo={descreverEquipamento(e)}
              detalhe={`${e.clienteNome} · última visita ${fmtData(e.ultimaVisitaEm)}`}
              lateral={!e.ativo ? <Selo>Inativo</Selo> : e.criticidade === 'alta' ? <Selo tom="perigo">Crítico</Selo> : null}
            />
          ))}
        </div>
      )}
    </>
  );
}

const VAZIO = {
  clienteId: '',
  tipoId: '',
  fabricante: '',
  modelo: '',
  numeroSerie: '',
  patrimonio: '',
  registroAnvisa: '',
  setor: '',
  criticidade: 'media' as Criticidade,
  observacoes: '',
  ativo: true,
};

export function EquipamentoEditar() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const existente = useDocumento<Equipamento>(id ? `equipamentos/${id}` : null);
  const clientes = useConsulta<Cliente>(() => query(collection(db, 'clientes'), orderBy('nome')), []);
  const tipos = useConsulta<TipoEquipamento>(() => query(collection(db, 'tiposEquipamento'), orderBy('nome')), []);
  const [f, setF] = useState<typeof VAZIO | null>(id ? null : { ...VAZIO, clienteId: params.get('cliente') ?? '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (id && !f && existente.dados) {
    setF({ ...VAZIO, ...Object.fromEntries(Object.entries(existente.dados).filter(([k]) => k in VAZIO)) } as typeof VAZIO);
  }
  if (!f || clientes.carregando || tipos.carregando) return <Carregando />;
  const muda = (k: keyof typeof VAZIO) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    const cliente = clientes.itens.find((c) => c.id === f.clienteId);
    const tipo = tipos.itens.find((t) => t.id === f.tipoId);
    if (!cliente || !tipo) return setErro('Escolha o cliente e o tipo do equipamento.');
    setErro('');
    setSalvando(true);
    const dados = {
      ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])),
      clienteNome: cliente.nome,
      tipoNome: tipo.nome,
    };
    try {
      if (id) {
        await updateDoc(doc(db, 'equipamentos', id), dados);
        navegar(`/interno/equipamentos/${id}`, { replace: true });
      } else {
        const ref = await addDoc(collection(db, 'equipamentos'), { ...dados, ativo: true, ultimaVisitaEm: null, ultimaOS: null, criadoEm: serverTimestamp() });
        navegar(`/interno/equipamentos/${ref.id}`, { replace: true });
      }
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar}>
      <CabecalhoPagina titulo={id ? 'Editar equipamento' : 'Novo equipamento'} voltar={true} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <Selecao rotulo="Cliente" required value={f.clienteId} onChange={muda('clienteId')}>
          <option value="">Escolha o cliente…</option>
          {clientes.itens.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </Selecao>
        <Selecao rotulo="Tipo de equipamento" required value={f.tipoId} onChange={muda('tipoId')} ajuda="O tipo define o checklist e as medições da OS.">
          <option value="">Escolha o tipo…</option>
          {tipos.itens.map((t) => (
            <option key={t.id} value={t.id}>{t.nome}</option>
          ))}
        </Selecao>
        <div className="grade grade-2">
          <Campo rotulo="Fabricante" value={f.fabricante} onChange={muda('fabricante')} />
          <Campo rotulo="Modelo" value={f.modelo} onChange={muda('modelo')} />
          <Campo rotulo="Nº de série" value={f.numeroSerie} onChange={muda('numeroSerie')} />
          <Campo rotulo="Patrimônio" value={f.patrimonio} onChange={muda('patrimonio')} />
          <Campo rotulo="Registro Anvisa" value={f.registroAnvisa} onChange={muda('registroAnvisa')} inputMode="numeric" />
          <Campo rotulo="Setor / sala" value={f.setor} onChange={muda('setor')} placeholder="Ex.: Consultório 2" />
        </div>
        <Selecao rotulo="Criticidade" value={f.criticidade} onChange={muda('criticidade')}>
          {Object.entries(rotuloCriticidade).map(([v, r]) => (
            <option key={v} value={v}>{r}</option>
          ))}
        </Selecao>
        <AreaTexto rotulo="Observações" rows={3} value={f.observacoes} onChange={muda('observacoes')} />
        {id && (
          <label className="marcador">
            <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
            <span>Equipamento ativo</span>
          </label>
        )}
      </Cartao>
      <Botao type="submit" carregando={salvando} bloco>
        Salvar equipamento
      </Botao>
    </form>
  );
}

export function EquipamentoDetalhe() {
  const { id = '' } = useParams();
  const eq = useDocumento<Equipamento>(`equipamentos/${id}`);
  const chamados = useConsulta<Chamado>(() => query(collection(db, 'chamados'), where('equipamentoId', '==', id)), [id]);
  const ordens = useConsulta<OrdemServico>(() => query(collection(db, 'os'), where('equipamentoId', '==', id)), [id]);

  if (eq.carregando) return <Carregando />;
  const e = eq.dados;
  if (!e) return <Vazio titulo="Equipamento não encontrado" />;
  const listaOS = [...ordens.itens].sort((a, b) => b.numero - a.numero);
  const listaChamados = [...chamados.itens].sort((a, b) => b.numero - a.numero);

  return (
    <>
      <CabecalhoPagina
        titulo={e.tipoNome}
        subtitulo={e.clienteNome}
        voltar={`/interno/clientes/${e.clienteId}`}
        acoes={<LinkBotao para={`/interno/equipamentos/${id}/editar`} variante="secundario" icone="editar">Editar</LinkBotao>}
      />
      {!e.ativo && <Aviso tom="alerta">Equipamento inativo.</Aviso>}
      <Cartao>
        <dl className="infos">
          <Info rotulo="Fabricante">{e.fabricante}</Info>
          <Info rotulo="Modelo">{e.modelo}</Info>
          <Info rotulo="Nº de série">{e.numeroSerie}</Info>
          <Info rotulo="Patrimônio">{e.patrimonio}</Info>
          <Info rotulo="Registro Anvisa">{e.registroAnvisa}</Info>
          <Info rotulo="Setor">{e.setor}</Info>
          <Info rotulo="Criticidade">{rotuloCriticidade[e.criticidade]}</Info>
          <Info rotulo="Última visita">{e.ultimaOS ? `${fmtData(e.ultimaVisitaEm)} (OS ${numeroOS(e.ultimaOS)})` : 'Nenhuma'}</Info>
        </dl>
        {e.observacoes && <p className="relato" style={{ marginTop: 12 }}>{e.observacoes}</p>}
        <div className="acoes">
          <LinkBotao para={`/interno/os/nova?equipamento=${id}`} icone="chave">Nova OS</LinkBotao>
          <LinkBotao para={`/interno/chamados/novo?cliente=${e.clienteId}&equipamento=${id}`} variante="secundario" icone="chamados">
            Registrar chamado
          </LinkBotao>
        </div>
      </Cartao>

      <CartaoVencimentos equipamento={e} />

      <Cartao titulo="Etiqueta QR" acoes={<LinkBotao para={`/interno/etiquetas?equipamento=${id}`} variante="secundario" icone="impressora">Imprimir</LinkBotao>}>
        <div className="qr-grande">
          <QrCode texto={urlEquipamento(id)} tamanho={180} alt="QR do equipamento" />
        </div>
        <p className="pequeno" style={{ textAlign: 'center' }}>
          O cliente aponta a câmera e cai direto no formulário de chamado deste equipamento.
        </p>
      </Cartao>

      <Cartao titulo={`Ordens de serviço (${listaOS.length})`}>
        {ordens.carregando ? (
          <Carregando />
        ) : !listaOS.length ? (
          <p className="pequeno">Nenhuma OS ainda.</p>
        ) : (
          <div className="lista">
            {listaOS.map((o) => (
              <LinhaLista
                key={o.id}
                para={`/interno/os/${o.id}`}
                titulo={`OS ${numeroOS(o.numero)} · ${rotuloTipoOS[o.tipo]}`}
                detalhe={`${o.tecnicoNome} · ${fmtData(o.fimEm ?? o.agendadaPara ?? o.criadaEm)}`}
                lateral={<Selo tom={tomStatusOS[o.status]}>{rotuloStatusOS[o.status]}</Selo>}
              />
            ))}
          </div>
        )}
      </Cartao>

      <Cartao titulo={`Chamados (${listaChamados.length})`}>
        {chamados.carregando ? (
          <Carregando />
        ) : !listaChamados.length ? (
          <p className="pequeno">Nenhum chamado para este equipamento.</p>
        ) : (
          <div className="lista">
            {listaChamados.map((c) => (
              <LinhaLista
                key={c.id}
                para={`/interno/chamados/${c.id}`}
                titulo={`Nº ${c.numero} · ${c.relato.slice(0, 60)}`}
                detalhe={fmtRelativo(c.abertoEm)}
                lateral={<Selo tom={tomStatusChamado[c.status]}>{rotuloStatusChamado[c.status]}</Selo>}
              />
            ))}
          </div>
        )}
      </Cartao>
    </>
  );
}

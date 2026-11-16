import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { addDoc, collection, doc, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import { criarAcesso, definirAtivo, reenviarConvite } from '../../dados/operacoes';
import type { Chamado, Cliente, Equipamento, TipoCliente, Usuario } from '../../tipos';
import {
  descreverEquipamento,
  fmtData,
  fmtRelativo,
  fmtTelefone,
  normalizar,
  rotuloStatusChamado,
  rotuloTipoCliente,
  tomStatusChamado,
} from '../../util/formato';
import { abrirWhatsApp } from '../../util/whatsapp';
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

export function ListaClientes() {
  const { itens, carregando, erro } = useConsulta<Cliente>(() => query(collection(db, 'clientes'), orderBy('nome')), []);
  const [busca, setBusca] = useState('');
  const termo = normalizar(busca);
  const filtrados = itens.filter((c) => normalizar(`${c.nome} ${c.documento ?? ''} ${c.cidade ?? ''} ${c.contato ?? ''}`).includes(termo));
  return (
    <>
      <CabecalhoPagina
        titulo="Clientes"
        subtitulo={carregando ? undefined : `${itens.length} cadastrado(s)`}
        acoes={<LinkBotao para="/interno/clientes/novo" icone="mais_circulo">Novo</LinkBotao>}
      />
      <div className="busca">
        <input type="search" placeholder="Buscar por nome, CNPJ, cidade ou contato" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {carregando ? (
        <Carregando />
      ) : !filtrados.length ? (
        <Vazio icone="pessoas" titulo={itens.length ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}>
          Cadastre clínicas, consultórios e hospitais para registrar equipamentos e liberar o portal.
        </Vazio>
      ) : (
        <div className="lista">
          {filtrados.map((c) => (
            <LinhaLista
              key={c.id}
              para={`/interno/clientes/${c.id}`}
              titulo={c.nome}
              detalhe={[rotuloTipoCliente[c.tipo], c.cidade, c.contato].filter(Boolean).join(' · ')}
              lateral={!c.ativo && <Selo>Inativo</Selo>}
            />
          ))}
        </div>
      )}
    </>
  );
}

const VAZIO = { nome: '', tipo: 'consultorio_odonto' as TipoCliente, documento: '', contato: '', telefone: '', whatsapp: '', email: '', endereco: '', cidade: '', observacoes: '', ativo: true };

export function ClienteEditar() {
  const { id } = useParams();
  const navegar = useNavigate();
  const existente = useDocumento<Cliente>(id ? `clientes/${id}` : null);
  const [f, setF] = useState<typeof VAZIO | null>(id ? null : VAZIO);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (id && !f && existente.dados) {
    const c = existente.dados;
    setF({ ...VAZIO, ...Object.fromEntries(Object.entries(c).filter(([k]) => k in VAZIO)) } as typeof VAZIO);
  }
  if (!f) return <Carregando />;
  const muda = (k: keyof typeof VAZIO) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErro('');
    setSalvando(true);
    const dados = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    try {
      if (id) {
        await updateDoc(doc(db, 'clientes', id), dados);
        navegar(`/interno/clientes/${id}`, { replace: true });
      } else {
        const ref = await addDoc(collection(db, 'clientes'), { ...dados, ativo: true, criadoEm: serverTimestamp() });
        navegar(`/interno/clientes/${ref.id}`, { replace: true });
      }
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar}>
      <CabecalhoPagina titulo={id ? 'Editar cliente' : 'Novo cliente'} voltar={id ? `/interno/clientes/${id}` : '/interno/clientes'} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <Campo rotulo="Nome / razão social" required value={f.nome} onChange={muda('nome')} />
        <div className="grade grade-2">
          <Selecao rotulo="Tipo" value={f.tipo} onChange={muda('tipo')}>
            {Object.entries(rotuloTipoCliente).map(([v, r]) => (
              <option key={v} value={v}>{r}</option>
            ))}
          </Selecao>
          <Campo rotulo="CNPJ / CPF" value={f.documento} onChange={muda('documento')} inputMode="numeric" />
          <Campo rotulo="Responsável / contato" value={f.contato} onChange={muda('contato')} />
          <Campo rotulo="E-mail" type="email" value={f.email} onChange={muda('email')} />
          <Campo rotulo="WhatsApp" inputMode="tel" value={f.whatsapp} onChange={muda('whatsapp')} placeholder="(67) 99999-9999" />
          <Campo rotulo="Telefone" inputMode="tel" value={f.telefone} onChange={muda('telefone')} />
          <Campo rotulo="Endereço" value={f.endereco} onChange={muda('endereco')} />
          <Campo rotulo="Cidade / UF" value={f.cidade} onChange={muda('cidade')} />
        </div>
        <AreaTexto rotulo="Observações" rows={3} value={f.observacoes} onChange={muda('observacoes')} />
        {id && (
          <label className="marcador">
            <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
            <span>Cliente ativo</span>
          </label>
        )}
      </Cartao>
      <Botao type="submit" carregando={salvando} bloco>
        Salvar cliente
      </Botao>
    </form>
  );
}

export function ClienteDetalhe() {
  const { id = '' } = useParams();
  const cliente = useDocumento<Cliente>(`clientes/${id}`);
  const equipamentos = useConsulta<Equipamento>(() => query(collection(db, 'equipamentos'), where('clienteId', '==', id)), [id]);
  const chamados = useConsulta<Chamado>(() => query(collection(db, 'chamados'), where('clienteId', '==', id)), [id]);

  if (cliente.carregando) return <Carregando />;
  const c = cliente.dados;
  if (!c) return <Vazio titulo="Cliente não encontrado" />;
  const zap = c.whatsapp || c.telefone;
  const recentes = [...chamados.itens].sort((a, b) => b.numero - a.numero).slice(0, 8);

  return (
    <>
      <CabecalhoPagina
        titulo={c.nome}
        subtitulo={rotuloTipoCliente[c.tipo]}
        voltar="/interno/clientes"
        acoes={<LinkBotao para={`/interno/clientes/${id}/editar`} variante="secundario" icone="editar">Editar</LinkBotao>}
      />
      {!c.ativo && <Aviso tom="alerta">Cliente inativo.</Aviso>}
      <Cartao>
        <dl className="infos">
          <Info rotulo="CNPJ / CPF">{c.documento}</Info>
          <Info rotulo="Contato">{c.contato}</Info>
          <Info rotulo="WhatsApp">{fmtTelefone(c.whatsapp)}</Info>
          <Info rotulo="Telefone">{fmtTelefone(c.telefone)}</Info>
          <Info rotulo="E-mail">{c.email}</Info>
          <Info rotulo="Endereço">{[c.endereco, c.cidade].filter(Boolean).join(' - ')}</Info>
        </dl>
        {c.observacoes && <p className="relato" style={{ marginTop: 12 }}>{c.observacoes}</p>}
        <div className="acoes">
          {zap && (
            <Botao variante="whatsapp" icone="whatsapp" onClick={() => abrirWhatsApp(zap, `Olá, ${c.contato || c.nome}!`)}>
              WhatsApp
            </Botao>
          )}
          <LinkBotao para={`/interno/chamados/novo?cliente=${id}`} variante="secundario" icone="chamados">
            Registrar chamado
          </LinkBotao>
        </div>
      </Cartao>

      <AcessosPortal cliente={c} />

      <Cartao
        titulo={`Equipamentos (${equipamentos.itens.length})`}
        acoes={
          <>
            <LinkBotao para={`/interno/etiquetas?cliente=${id}`} variante="secundario" icone="qr">Etiquetas</LinkBotao>
            <LinkBotao para={`/interno/equipamentos/novo?cliente=${id}`} icone="mais_circulo">Novo</LinkBotao>
          </>
        }
      >
        {equipamentos.carregando ? (
          <Carregando />
        ) : !equipamentos.itens.length ? (
          <p className="pequeno">Nenhum equipamento cadastrado para este cliente.</p>
        ) : (
          <div className="lista">
            {equipamentos.itens.map((e) => (
              <LinhaLista
                key={e.id}
                para={`/interno/equipamentos/${e.id}`}
                titulo={descreverEquipamento(e)}
                detalhe={`Última visita: ${fmtData(e.ultimaVisitaEm)}`}
                lateral={!e.ativo && <Selo>Inativo</Selo>}
              />
            ))}
          </div>
        )}
      </Cartao>

      <Cartao titulo="Chamados recentes">
        {chamados.carregando ? (
          <Carregando />
        ) : !recentes.length ? (
          <p className="pequeno">Nenhum chamado ainda.</p>
        ) : (
          <div className="lista">
            {recentes.map((ch) => (
              <LinhaLista
                key={ch.id}
                para={`/interno/chamados/${ch.id}`}
                titulo={`Nº ${ch.numero} · ${ch.equipamentoDescricao}`}
                detalhe={fmtRelativo(ch.abertoEm)}
                lateral={<Selo tom={tomStatusChamado[ch.status]}>{rotuloStatusChamado[ch.status]}</Selo>}
              />
            ))}
          </div>
        )}
      </Cartao>
    </>
  );
}

/** Logins do cliente no portal: cada pessoa recebe um e-mail para criar a própria senha. */
function AcessosPortal({ cliente }: { cliente: Cliente }) {
  const { perfil } = useSessao();
  const acessos = useConsulta<Usuario>(() => query(collection(db, 'usuarios'), where('clienteId', '==', cliente.id)), [cliente.id]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState(cliente.email ?? '');
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string; convidado?: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const gestor = perfil?.papel === 'gestor';
  const zap = cliente.whatsapp || cliente.telefone;

  async function dar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setEnviando(true);
    try {
      await criarAcesso({ nome, email, papel: 'cliente', clienteId: cliente.id });
      setMsg({ tom: 'sucesso', texto: `Acesso criado. ${email} vai receber um e-mail para criar a senha.`, convidado: nome || email });
      setNome('');
      setEmail('');
    } catch (err) {
      setMsg({ tom: 'erro', texto: mensagemErro(err) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao titulo="Acesso ao portal do cliente">
      {acessos.carregando ? (
        <Carregando />
      ) : acessos.itens.length ? (
        <div className="lista" style={{ marginBottom: 14 }}>
          {acessos.itens.map((u) => (
            <div key={u.id} className="linha">
              <div className="linha-texto">
                <div className="linha-titulo">{u.nome}</div>
                <div className="linha-detalhe">{u.email}</div>
              </div>
              <div className="linha-lateral">
                <Selo tom={u.ativo ? 'sucesso' : 'neutro'}>{u.ativo ? 'Ativo' : 'Bloqueado'}</Selo>
                {gestor && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="botao botao-fantasma" onClick={() => void reenviarConvite(u.email).then(() => setMsg({ tom: 'sucesso', texto: `E-mail de senha reenviado para ${u.email}.` }))}>
                      Reenviar e-mail
                    </button>
                    <button type="button" className="botao botao-fantasma" onClick={() => void definirAtivo(u, !u.ativo)}>
                      {u.ativo ? 'Bloquear' : 'Liberar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="pequeno">Ninguém deste cliente acessa o portal ainda.</p>
      )}
      {msg && (
        <Aviso tom={msg.tom}>
          {msg.texto}
          {msg.convidado && zap && (
            <div className="acoes">
              <Botao
                variante="whatsapp"
                icone="whatsapp"
                onClick={() =>
                  abrirWhatsApp(
                    zap,
                    `Olá, ${msg.convidado}! Liberamos o seu acesso ao nosso portal de atendimento. Abra o e-mail que enviamos para criar a sua senha e depois entre em ${location.origin} para abrir chamados e baixar laudos.`,
                  )
                }
              >
                Avisar no WhatsApp
              </Botao>
            </div>
          )}
        </Aviso>
      )}
      {gestor ? (
        <form onSubmit={dar}>
          <div className="grade grade-2">
            <Campo rotulo="Nome da pessoa" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Dra. Ana (recepção)" />
            <Campo rotulo="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Botao type="submit" variante="secundario" icone="usuario" carregando={enviando}>
            Dar acesso ao portal
          </Botao>
        </form>
      ) : (
        <p className="pequeno">Somente o gestor libera acessos.</p>
      )}
    </Cartao>
  );
}

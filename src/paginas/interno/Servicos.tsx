// Catálogo de serviços (tabela de preços): lista e cadastro.
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useDocumento } from '../../dados/hooks';
import { UNIDADES_SERVICO, incluirServicosSugeridos, useCatalogoServicos } from '../../dados/servicos';
import type { ServicoCatalogo } from '../../tipos';
import { fmtMoeda, normalizar } from '../../util/formato';
import { CampoNumero } from '../../componentes/Valores';
import { Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, LinhaLista, LinkBotao, Selo, Vazio } from '../../componentes/ui';

export function ListaServicos() {
  const { itens, carregando, erro } = useCatalogoServicos();
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [incluindo, setIncluindo] = useState(false);
  const lista = itens.filter((s) => normalizar(`${s.descricao} ${s.codigo ?? ''}`).includes(normalizar(busca)));

  async function sugerir() {
    setMsg(null);
    setIncluindo(true);
    try {
      const n = await incluirServicosSugeridos(itens);
      setMsg({ tom: 'sucesso', texto: n ? `${n} serviço(s) incluído(s). Toque em cada um para definir o preço.` : 'As sugestões já estão na lista.' });
    } catch (e) {
      setMsg({ tom: 'erro', texto: mensagemErro(e) });
    } finally {
      setIncluindo(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Serviços e preços"
        subtitulo="Escolha estes serviços no orçamento, na fatura e na OS"
        voltar="/interno/mais"
        acoes={<LinkBotao para="/interno/servicos/novo" icone="mais_circulo">Novo</LinkBotao>}
      />
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {carregando ? (
        <Carregando />
      ) : !itens.length ? (
        <Vazio icone="chave" titulo="Nenhum serviço cadastrado">
          Cadastre o que você cobra (visita, hora técnica, preventiva, ensaio…) com o preço. Os serviços com valor diferente a cada vez
          continuam podendo ser lançados como avulsos.
          <div className="acoes" style={{ justifyContent: 'center' }}>
            <Botao variante="secundario" carregando={incluindo} onClick={() => void sugerir()}>
              Incluir serviços sugeridos
            </Botao>
          </div>
        </Vazio>
      ) : (
        <>
          {itens.length > 8 && <Campo rotulo="Buscar serviço" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} />}
          <div className="lista">
            {lista.map((s) => (
              <LinhaLista
                key={s.id}
                para={`/interno/servicos/${s.id}`}
                titulo={s.descricao}
                detalhe={`${s.codigo ? `cód. ${s.codigo} · ` : ''}${fmtMoeda(s.preco)} por ${s.unidade}`}
                lateral={s.ativo === false ? <Selo>Inativo</Selo> : !s.preco ? <Selo tom="alerta">Sem preço</Selo> : undefined}
              />
            ))}
          </div>
          <div className="acoes">
            <Botao variante="fantasma" carregando={incluindo} onClick={() => void sugerir()}>
              Incluir serviços sugeridos que faltam
            </Botao>
          </div>
        </>
      )}
    </>
  );
}

type Form = { descricao: string; codigo: string; unidade: string; preco: number; ativo: boolean };

export function ServicoEditar() {
  const { id = 'novo' } = useParams();
  const novo = id === 'novo';
  const navegar = useNavigate();
  const { perfil } = useSessao();
  const existente = useDocumento<ServicoCatalogo>(novo ? null : `servicos/${id}`);
  const [f, setF] = useState<Form | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (f) return;
    if (novo) setF({ descricao: '', codigo: '', unidade: 'serviço', preco: 0, ativo: true });
    else if (existente.dados) {
      const s = existente.dados;
      setF({ descricao: s.descricao, codigo: s.codigo ?? '', unidade: s.unidade || 'serviço', preco: s.preco ?? 0, ativo: s.ativo !== false });
    }
  }, [f, novo, existente.dados]);

  if (!novo && existente.carregando) return <Carregando />;
  if (!novo && !existente.dados) return <Vazio titulo="Serviço não encontrado" />;
  if (!f) return <Carregando />;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    const descricao = f.descricao.trim();
    if (!descricao) return setErro('Informe a descrição.');
    if (f.preco < 0) return setErro('O preço não pode ser negativo.');
    setErro('');
    setSalvando(true);
    const dados = { descricao, codigo: f.codigo.trim(), unidade: f.unidade.trim() || 'serviço', preco: f.preco, ativo: f.ativo, atualizadoEm: serverTimestamp() };
    try {
      if (novo) await addDoc(collection(db, 'servicos'), { ...dados, criadoEm: serverTimestamp() });
      else await updateDoc(doc(db, 'servicos', id), dados);
      navegar('/interno/servicos', { replace: true });
    } catch (err) {
      setErro(mensagemErro(err));
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!window.confirm('Excluir este serviço da tabela? Orçamentos e faturas já feitos não mudam.')) return;
    try {
      await deleteDoc(doc(db, 'servicos', id));
      navegar('/interno/servicos', { replace: true });
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  return (
    <form onSubmit={salvar}>
      <CabecalhoPagina titulo={novo ? 'Novo serviço' : f.descricao || 'Serviço'} voltar="/interno/servicos" />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <Campo rotulo="Descrição" required value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: Hora técnica" />
        <div className="grade grade-3">
          <Campo rotulo="Código (opcional)" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
          <Campo rotulo="Unidade" list="unidades-servico" value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })} ajuda="Ex.: hora, visita, km" />
          <div className="campo">
            <span className="campo-rotulo">Preço (R$)</span>
            <CampoNumero rotulo="Preço" className="campo-valor" valor={f.preco} aoMudar={(n) => setF({ ...f, preco: n })} />
          </div>
        </div>
        <datalist id="unidades-servico">
          {UNIDADES_SERVICO.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <label className="marcador">
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
          <span>
            Disponível para escolher
            <span className="pequeno" style={{ display: 'block' }}>Desmarque para tirar da lista sem apagar.</span>
          </span>
        </label>
        <Botao type="submit" carregando={salvando}>
          Salvar serviço
        </Botao>
      </Cartao>
      {!novo && perfil?.papel === 'gestor' && (
        <Botao type="button" variante="perigo" icone="lixo" onClick={() => void excluir()}>
          Excluir serviço
        </Botao>
      )}
    </form>
  );
}

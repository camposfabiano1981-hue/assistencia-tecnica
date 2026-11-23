// Execução da OS no celular do técnico. Funciona sem internet: tudo é salvo no aparelho e sincroniza depois.
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSessao } from '../../sessao';
import { mensagemErro, useDocumento } from '../../dados/hooks';
import { adicionarFotoOS, concluirOS, iniciarOS, removerFotoOS, salvarOS } from '../../dados/operacoes';
import type { Cliente, Fatura, Instrumento, InstrumentoUsado, Orcamento, OrdemServico, Peca, ResultadoItem, ServicoCatalogo, ServicoUsado } from '../../tipos';
import { fmtData, fmtDataHora, numeroOS, rotuloStatusOS, rotuloTipoOS, tomStatusOS } from '../../util/formato';
import { arrayRemove, arrayUnion, collection, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useConsulta } from '../../dados/hooks';
import { somarMeses, diasAte } from '../../util/datas';
import { avaliarMedicao, ordenados } from '../../util/medicao';
import { abrirWhatsApp } from '../../util/whatsapp';
import { PadAssinatura, type AssinaturaRef } from '../../componentes/Assinatura';
import { GaleriaFotos } from '../../componentes/Fotos';
import { Icone } from '../../componentes/Icone';
import { BotaoLaudo } from '../../componentes/Laudo';
import { BotaoVisualizarLaudo } from '../../componentes/Documentos';
import { rotuloStatusOrcamento } from '../../dados/financeiro';
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, IndicadorSincronia, Info, LinkBotao, Selo, Vazio } from '../../componentes/ui';

const ROTULO: Record<ResultadoItem, string> = { ok: 'Conforme', nok: 'Não conf.', na: 'N/A' };

export function ExecutarOS() {
  const { id = '' } = useParams();
  const { perfil } = useSessao();
  const { dados: os, carregando, erro, pendente } = useDocumento<OrdemServico>(`os/${id}`);
  const cliente = useDocumento<Cliente>(os ? `clientes/${os.clienteId}` : null);

  if (carregando) return <Carregando />;
  if (erro || !os) return <Vazio titulo="OS não encontrada">{erro ? mensagemErro(erro) : 'Ela pode não ter sido baixada para este aparelho.'}</Vazio>;
  const concluida = os.status === 'concluida';
  const editavel = !concluida && (perfil?.papel === 'gestor' || os.tecnicoId === perfil?.id);
  const zap = cliente.dados?.whatsapp || cliente.dados?.telefone;

  return (
    <>
      <CabecalhoPagina
        titulo={`OS ${numeroOS(os.numero)}`}
        subtitulo={`${rotuloTipoOS[os.tipo]} · ${os.cliente.nome}`}
        voltar="/interno/os"
        acoes={<Selo tom={tomStatusOS[os.status]}>{rotuloStatusOS[os.status]}</Selo>}
      />
      <div style={{ marginBottom: 12 }}>
        <IndicadorSincronia pendente={pendente} />
      </div>
      {!editavel && !concluida && <Aviso tom="alerta">Esta OS é de {os.tecnicoNome}. Somente o técnico dela ou o gestor podem editar.</Aviso>}
      {concluida && <Concluida os={os} zap={zap} />}

      <Cartao titulo="Atendimento">
        <dl className="infos">
          <Info rotulo="Cliente">
            <Link to={`/interno/clientes/${os.clienteId}`}>{os.cliente.nome}</Link>
          </Info>
          <Info rotulo="Endereço">{[os.cliente.endereco, os.cliente.cidade].filter(Boolean).join(' - ')}</Info>
          <Info rotulo="Equipamento">
            {os.equipamentoId ? <Link to={`/interno/equipamentos/${os.equipamentoId}`}>{os.equipamento.tipoNome}</Link> : os.equipamento.tipoNome}
          </Info>
          <Info rotulo="Modelo / série">{[os.equipamento.fabricante, os.equipamento.modelo, os.equipamento.numeroSerie && `série ${os.equipamento.numeroSerie}`].filter(Boolean).join(' · ')}</Info>
          <Info rotulo="Agendada">{fmtDataHora(os.agendadaPara)}</Info>
          <Info rotulo="Técnico">{os.tecnicoNome}</Info>
          {os.chamadoId && (
            <Info rotulo="Chamado">
              <Link to={`/interno/chamados/${os.chamadoId}`}>nº {os.chamadoId}</Link>
            </Info>
          )}
          <VinculosOS os={os} />
          {os.inicioEm && <Info rotulo="Início">{fmtDataHora(os.inicioEm)}</Info>}
        </dl>
        {os.relato && <p className="relato" style={{ marginTop: 12 }}>{os.relato}</p>}
        <div className="acoes">
          {zap && (
            <Botao variante="whatsapp" icone="whatsapp" onClick={() => abrirWhatsApp(zap, `Olá! Sou o técnico ${os.tecnicoNome} e estou a caminho para o atendimento (OS ${numeroOS(os.numero)}).`)}>
              Avisar que está a caminho
            </Botao>
          )}
          {os.cliente.endereco && (
            <a className="botao botao-secundario" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([os.cliente.endereco, os.cliente.cidade].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">
              <Icone nome="local" tamanho={20} />
              <span>Mapa</span>
            </a>
          )}
        </div>
        {editavel && os.status === 'aberta' && (
          <div className="acoes-coluna">
            <BotaoIniciar os={os} />
          </div>
        )}
      </Cartao>

      <Checklist os={os} editavel={editavel} />
      <Medicoes os={os} editavel={editavel} />
      <Instrumentos os={os} editavel={editavel} />
      <Exigencias os={os} editavel={editavel} />

      <Cartao titulo={`Fotos (${os.qtdFotos ?? 0})`}>
        <GaleriaFotos
          caminho={`os/${os.id}/fotos`}
          aoAdicionar={editavel ? (b) => adicionarFotoOS(os, b, os.status === 'aberta' ? 'antes' : 'depois') : undefined}
          aoRemover={editavel ? (fotoId) => removerFotoOS(os, fotoId) : undefined}
        />
      </Cartao>

      <Cartao titulo="Diagnóstico e serviço">
        <TextoOS rotulo="Diagnóstico (defeito encontrado)" valor={os.diagnostico} desabilitado={!editavel} aoSalvar={(v) => salvarOS(os.id, { diagnostico: v })} />
        <TextoOS rotulo="Serviço executado" valor={os.servicoExecutado} desabilitado={!editavel} aoSalvar={(v) => salvarOS(os.id, { servicoExecutado: v })} />
        <ServicosOS os={os} editavel={editavel} />
        <Pecas os={os} editavel={editavel} />
        <TextoOS
          rotulo="Outros instrumentos (texto livre)"
          linhas={2}
          valor={os.instrumentos}
          desabilitado={!editavel}
          placeholder="Ex.: analisador de segurança elétrica, série 1234, certificado RBC nº 5678, válido até 03/2027"
          aoSalvar={(v) => salvarOS(os.id, { instrumentos: v })}
        />
        <TextoOS rotulo="Observações e recomendações" linhas={2} valor={os.observacoes} desabilitado={!editavel} aoSalvar={(v) => salvarOS(os.id, { observacoes: v })} />
      </Cartao>

      {editavel && <Conclusao os={os} />}
      {!concluida && (
        <div className="acoes-coluna">
          <BotaoVisualizarLaudo os={os} rotulo="Visualizar OS (rascunho)" bloco />
          <LinkBotao para={`/interno/orcamentos/novo?os=${os.id}`} variante="secundario" icone="moeda" bloco>
            Fazer orçamento desta OS
          </LinkBotao>
        </div>
      )}
    </>
  );
}

function obterLocal(): Promise<OrdemServico['checkin']> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

function BotaoIniciar({ os }: { os: OrdemServico }) {
  const { perfil } = useSessao();
  const [buscando, setBuscando] = useState(false);
  return (
    <Botao
      icone="local"
      carregando={buscando}
      bloco
      onClick={async () => {
        setBuscando(true);
        const local = await obterLocal();
        iniciarOS(os, perfil?.nome ?? 'Técnico', local);
        setBuscando(false);
      }}
    >
      {buscando ? 'Registrando localização…' : 'Iniciar atendimento (check-in)'}
    </Botao>
  );
}

function TextoOS({ rotulo, valor, aoSalvar, desabilitado, linhas = 3, placeholder }: { rotulo: string; valor?: string; aoSalvar: (v: string) => void; desabilitado?: boolean; linhas?: number; placeholder?: string }) {
  const [v, setV] = useState(valor ?? '');
  const editando = useRef(false);
  useEffect(() => {
    if (!editando.current) setV(valor ?? '');
  }, [valor]);
  return (
    <AreaTexto
      rotulo={rotulo}
      rows={linhas}
      value={v}
      placeholder={desabilitado ? undefined : placeholder}
      disabled={desabilitado}
      onFocus={() => (editando.current = true)}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        editando.current = false;
        if (v !== (valor ?? '')) aoSalvar(v);
      }}
    />
  );
}

function EntradaLinha({ valor, aoSalvar, desabilitado, placeholder, rotulo, numerico }: { valor: string; aoSalvar: (v: string) => void; desabilitado?: boolean; placeholder?: string; rotulo: string; numerico?: boolean }) {
  const [v, setV] = useState(valor);
  const editando = useRef(false);
  useEffect(() => {
    if (!editando.current) setV(valor);
  }, [valor]);
  return (
    <input
      aria-label={rotulo}
      inputMode={numerico ? 'decimal' : undefined}
      value={v}
      placeholder={placeholder}
      disabled={desabilitado}
      onFocus={() => (editando.current = true)}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        editando.current = false;
        if (v !== valor) aoSalvar(v);
      }}
      style={{ width: '100%', minHeight: 44, padding: '8px 10px', border: '1px solid #c5d0d8', borderRadius: 9, marginTop: 8, textAlign: numerico ? 'right' : 'left' }}
    />
  );
}

function Checklist({ os, editavel }: { os: OrdemServico; editavel: boolean }) {
  const itens = ordenados(os.checklist);
  if (!itens.length) return null;
  const total = itens.length;
  const feitos = itens.filter((i) => i.resultado).length;
  // Cada item é gravado no seu próprio campo: toques rápidos e sincronização offline não se sobrescrevem.
  const marcar = (id: string, atual: ResultadoItem | null, r: ResultadoItem) =>
    salvarOS(os.id, { [`checklist.${id}.resultado`]: atual === r ? null : r });
  return (
    <Cartao
      titulo={`Checklist (${feitos}/${total})`}
      acoes={
        editavel &&
        feitos < total && (
          <Botao
            variante="fantasma"
            onClick={() => salvarOS(os.id, Object.fromEntries(itens.filter((it) => !it.resultado).map((it) => [`checklist.${it.id}.resultado`, 'ok'])))}
          >
            Restantes conformes
          </Botao>
        )
      }
    >
      {itens.map((it) => (
        <div className="item-check" key={it.id}>
          <div className="item-check-texto">{it.texto}</div>
          <div className="tres">
            {(['ok', 'nok', 'na'] as ResultadoItem[]).map((r) => (
              <button key={r} type="button" className={`r-${r}`} aria-pressed={it.resultado === r} disabled={!editavel} onClick={() => marcar(it.id, it.resultado, r)}>
                {ROTULO[r]}
              </button>
            ))}
          </div>
          {(it.resultado === 'nok' || it.obs) && (
            <EntradaLinha
              rotulo={`Observação: ${it.texto}`}
              valor={it.obs ?? ''}
              placeholder="O que foi encontrado?"
              desabilitado={!editavel}
              aoSalvar={(v) => salvarOS(os.id, { [`checklist.${it.id}.obs`]: v })}
            />
          )}
        </div>
      ))}
    </Cartao>
  );
}

function Medicoes({ os, editavel }: { os: OrdemServico; editavel: boolean }) {
  const medicoes = ordenados(os.medicoes);
  if (!medicoes.length) return null;
  const salvar = (id: string, texto: string) => {
    const t = texto.trim().replace(',', '.');
    const valor = t === '' ? null : Number(t);
    if (valor !== null && Number.isNaN(valor)) return;
    salvarOS(os.id, { [`medicoes.${id}.valor`]: valor });
  };
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  return (
    <Cartao titulo={os.exigeEnsaioSeguranca ? 'Medições e ensaio de segurança elétrica' : 'Medições'}>
      {os.exigeEnsaioSeguranca && (
        <p className="pequeno" style={{ marginTop: 0 }}>
          Equipamento eletromédico: registre os ensaios (ABNT NBR IEC 62353) e informe o analisador em "Instrumentos utilizados".
        </p>
      )}
      {medicoes.map((m) => {
        const r = avaliarMedicao(m.valor, m.min, m.max);
        const limite = m.min != null && m.max != null ? `${fmt(m.min)} a ${fmt(m.max)}` : m.min != null ? `mín. ${fmt(m.min)}` : m.max != null ? `máx. ${fmt(m.max)}` : 'sem limite';
        return (
          <div className="medicao" key={m.id}>
            <div>
              <strong>{m.nome}</strong>
              <small>
                Limite: {limite} {m.min != null || m.max != null ? m.unidade : ''}
              </small>
              {r === 'reprovado' && <Selo tom="perigo">Fora do limite</Selo>}
              {r === 'aprovado' && <Selo tom="sucesso">Dentro do limite</Selo>}
            </div>
            <div>
              <EntradaLinha
                rotulo={m.nome}
                numerico
                valor={m.valor == null ? '' : String(m.valor).replace('.', ',')}
                placeholder={m.unidade}
                desabilitado={!editavel}
                aoSalvar={(t) => salvar(m.id, t)}
              />
            </div>
          </div>
        );
      })}
    </Cartao>
  );
}

/** Atalhos para o orçamento e a fatura ligados a esta OS (direto ou pelo chamado). */
function VinculosOS({ os }: { os: OrdemServico }) {
  const orcs = useConsulta<Orcamento>(
    () => query(collection(db, 'orcamentos'), os.chamadoId ? where('chamadoId', '==', os.chamadoId) : where('osId', '==', os.id)),
    [os.id, os.chamadoId],
  );
  const fats = useConsulta<Fatura>(() => query(collection(db, 'faturas'), where('osIds', 'array-contains', os.id)), [os.id]);
  const orcamentos = [...orcs.itens].sort((a, b) => a.numero - b.numero);
  const faturas = new Map<string, number>();
  for (const f of fats.itens) faturas.set(f.id, f.numero);
  for (const o of orcamentos) if (o.faturaId) faturas.set(o.faturaId, Number(o.faturaId));
  return (
    <>
      {!!orcamentos.length && (
        <Info rotulo="Orçamento">
          {orcamentos.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ', '}
              <Link to={`/interno/orcamentos/${o.id}`}>nº {o.numero}</Link> <span className="pequeno">({rotuloStatusOrcamento[o.status].toLowerCase()})</span>
            </span>
          ))}
        </Info>
      )}
      {!!faturas.size && (
        <Info rotulo="Fatura">
          {[...faturas].map(([id, numero], i) => (
            <span key={id}>
              {i > 0 && ', '}
              <Link to={`/interno/faturas/${id}`}>nº {numero}</Link>
            </span>
          ))}
        </Info>
      )}
    </>
  );
}

/** Serviços realizados: da tabela de serviços ou avulsos. O preço entra só na fatura. */
function ServicosOS({ os, editavel }: { os: OrdemServico; editavel: boolean }) {
  const [descricao, setDescricao] = useState('');
  const [qtd, setQtd] = useState('1');
  const [servicoId, setServicoId] = useState('');
  const tabela = useConsulta<ServicoCatalogo>(() => (editavel ? query(collection(db, 'servicos'), orderBy('descricao')) : null), [editavel]);
  const ativos = tabela.itens.filter((x) => x.ativo !== false);
  const servicos = os.servicos ?? [];
  const incluir = () => {
    const daTabela = ativos.find((x) => x.id === servicoId);
    const texto = daTabela?.descricao ?? descricao.trim();
    if (!texto) return;
    const quantidade = Math.max(0.01, Number(qtd.replace(',', '.')) || 1);
    const item: ServicoUsado = {
      id: crypto.randomUUID().slice(0, 8),
      descricao: texto,
      quantidade,
      servicoId: daTabela?.id ?? null,
      ...(daTabela?.unidade ? { unidade: daTabela.unidade } : {}),
    };
    salvarOS(os.id, { servicos: arrayUnion(item) });
    setDescricao('');
    setQtd('1');
    setServicoId('');
  };
  return (
    <div className="campo">
      <span className="campo-rotulo">Serviços realizados</span>
      {!servicos.length && !editavel && <span className="pequeno">Nenhum.</span>}
      {servicos.map((x) => (
        <div className="editor-linha" key={x.id}>
          <span style={{ flex: 1 }}>
            {String(x.quantidade).replace('.', ',')}
            {x.unidade ? ` ${x.unidade}` : ''} × {x.descricao}
            {x.servicoId && <span className="pequeno"> · tabela</span>}
          </span>
          {editavel && (
            <button type="button" className="icone-botao" aria-label="Remover serviço" onClick={() => salvarOS(os.id, { servicos: arrayRemove(x) })}>
              <Icone nome="lixo" tamanho={18} />
            </button>
          )}
        </div>
      ))}
      {editavel && !!ativos.length && (
        <select className="seletor-acao" style={{ width: '100%', marginBottom: 8 }} aria-label="Serviço cadastrado" value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
          <option value="">Serviço da tabela (ou digite abaixo um avulso)…</option>
          {ativos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.descricao} ({x.unidade})
            </option>
          ))}
        </select>
      )}
      {editavel && (
        <div className="editor-linha">
          {!servicoId && <input placeholder="Serviço avulso (ex.: limpeza do filtro)" value={descricao} onChange={(e) => setDescricao(e.target.value)} aria-label="Descrição do serviço" />}
          {servicoId && <span style={{ flex: 1 }} className="pequeno">Quantidade ({ativos.find((x) => x.id === servicoId)?.unidade}):</span>}
          <input className="curto" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label="Quantidade do serviço" />
          <Botao type="button" variante="secundario" onClick={incluir}>
            Incluir serviço
          </Botao>
        </div>
      )}
    </div>
  );
}

function Pecas({ os, editavel }: { os: OrdemServico; editavel: boolean }) {
  const [descricao, setDescricao] = useState('');
  const [qtd, setQtd] = useState('1');
  const [pecaId, setPecaId] = useState('');
  const estoque = useConsulta<Peca>(() => (editavel ? query(collection(db, 'pecas'), orderBy('descricao')) : null), [editavel]);
  const pecas = os.pecas ?? [];
  const incluir = () => {
    const doEstoque = estoque.itens.find((x) => x.id === pecaId);
    const texto = doEstoque?.descricao ?? descricao.trim();
    if (!texto) return;
    const quantidade = Math.max(0.01, Number(qtd.replace(',', '.')) || 1);
    const peca = { id: crypto.randomUUID().slice(0, 8), descricao: texto, quantidade, pecaId: doEstoque?.id ?? null };
    salvarOS(os.id, { pecas: arrayUnion(peca) });
    setDescricao('');
    setQtd('1');
    setPecaId('');
  };
  return (
    <div className="campo">
      <span className="campo-rotulo">Peças substituídas</span>
      {!pecas.length && !editavel && <span className="pequeno">Nenhuma.</span>}
      {pecas.map((p, i) => (
        <div className="editor-linha" key={p.id ?? i}>
          <span style={{ flex: 1 }}>
            {String(p.quantidade).replace('.', ',')} × {p.descricao}
            {p.pecaId && <span className="pequeno"> · estoque{os.status === 'concluida' ? ' (baixado)' : ''}</span>}
          </span>
          {editavel && (
            <button type="button" className="icone-botao" aria-label="Remover peça" onClick={() => salvarOS(os.id, { pecas: arrayRemove(p) })}>
              <Icone nome="lixo" tamanho={18} />
            </button>
          )}
        </div>
      ))}
      {editavel && !!estoque.itens.length && (
        <select className="seletor-acao" style={{ width: '100%', marginBottom: 8 }} aria-label="Peça do estoque" value={pecaId} onChange={(e) => setPecaId(e.target.value)}>
          <option value="">Peça do estoque (ou digite abaixo uma avulsa)…</option>
          {estoque.itens
            .filter((x) => x.ativo !== false)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.descricao} — saldo {String(x.quantidade).replace('.', ',')} {x.unidade}
              </option>
            ))}
        </select>
      )}
      {editavel && (
        <div className="editor-linha">
          {!pecaId && <input placeholder="Peça avulsa (ex.: guarnição da porta)" value={descricao} onChange={(e) => setDescricao(e.target.value)} aria-label="Descrição da peça" />}
          {pecaId && <span style={{ flex: 1 }} className="pequeno">Quantidade usada:</span>}
          <input className="curto" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label="Quantidade" />
          <Botao type="button" variante="secundario" onClick={incluir}>
            Incluir peça
          </Botao>
        </div>
      )}
    </div>
  );
}

function Conclusao({ os }: { os: OrdemServico }) {
  const { perfil } = useSessao();
  const pad = useRef<AssinaturaRef>(null);
  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function concluir() {
    setErro('');
    if (os.liberado == null) return setErro('Informe se o equipamento foi liberado para uso.');
    if (!nome.trim()) return setErro('Digite o nome de quem está assinando.');
    if (pad.current?.vazia()) return setErro('Peça para o cliente assinar no quadro.');
    const pendentes = ordenados(os.checklist).filter((i) => !i.resultado).length;
    if (pendentes && !window.confirm(`${pendentes} item(ns) do checklist sem resposta. Concluir mesmo assim?`)) return;
    if (!os.diagnostico?.trim() && !os.servicoExecutado?.trim() && !window.confirm('Diagnóstico e serviço executado estão em branco. Concluir mesmo assim?')) return;
    setEnviando(true);
    try {
      const png = await pad.current!.png();
      const envio = concluirOS(os, { nome, documento, png }, os.liberado, perfil?.nome ?? 'Técnico');
      envio.catch((e) => setErro(`O servidor recusou a conclusão: ${mensagemErro(e)}`));
      // Com internet, espera a confirmação; sem internet, fica salvo no aparelho e sincroniza depois.
      if (navigator.onLine) await envio;
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao titulo="Conclusão e assinatura do cliente" className="cartao-destaque">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="campo">
        <span className="campo-rotulo">Equipamento liberado para uso?</span>
        <div className="escolha">
          <button type="button" aria-pressed={os.liberado === true} onClick={() => salvarOS(os.id, { liberado: true })}>
            Sim, liberado
          </button>
          <button type="button" className="escolha-perigo" aria-pressed={os.liberado === false} onClick={() => salvarOS(os.id, { liberado: false })}>
            Não liberado
          </button>
        </div>
      </div>
      <div className="grade grade-2">
        <Campo rotulo="Nome de quem assina" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
        <Campo rotulo="CPF ou cargo (opcional)" value={documento} onChange={(e) => setDocumento(e.target.value)} autoComplete="off" />
      </div>
      <PadAssinatura ref={pad} />
      <div className="acoes-coluna">
        <Botao icone="check" carregando={enviando} onClick={concluir} bloco>
          Concluir OS
        </Botao>
      </div>
      <p className="pequeno">Depois de concluída, a OS não pode mais ser alterada.</p>
    </Cartao>
  );
}

function Concluida({ os, zap }: { os: OrdemServico; zap?: string }) {
  return (
    <Cartao titulo="OS concluída" className="cartao-destaque">
      <p style={{ marginTop: 0 }}>
        Assinada por <strong>{os.assinatura?.nome}</strong> em {fmtDataHora(os.assinatura?.em)}.{' '}
        {os.liberado ? 'Equipamento liberado para uso.' : <strong style={{ color: 'var(--perigo)' }}>Equipamento NÃO liberado para uso.</strong>}
      </p>
      <div className="acoes-coluna">
        <BotaoVisualizarLaudo os={os} rotulo="Visualizar laudo" bloco />
        <BotaoLaudo os={os} rotulo="Gerar laudo e enviar" bloco />
        <LinkBotao para={`/interno/faturas/nova?os=${os.id}`} variante="secundario" icone="moeda" bloco>
          Faturar esta OS
        </LinkBotao>
        {zap && (
          <Botao
            variante="whatsapp"
            icone="whatsapp"
            bloco
            onClick={() =>
              abrirWhatsApp(
                zap,
                `Olá! O atendimento da OS ${numeroOS(os.numero)} (${os.equipamento.tipoNome}) foi concluído. O laudo também fica disponível no portal: ${location.origin}/portal/equipamentos`,
              )
            }
          >
            Avisar o cliente no WhatsApp
          </Botao>
        )}
      </div>
    </Cartao>
  );
}

/** Instrumentos de medição usados (rastreabilidade RBC). Certificado vencido não pode ser escolhido. */
function Instrumentos({ os, editavel }: { os: OrdemServico; editavel: boolean }) {
  const { itens } = useConsulta<Instrumento>(() => query(collection(db, 'instrumentos'), orderBy('descricao')), []);
  const usados = os.instrumentosUsados ?? [];
  const disponiveis = itens.filter((i) => i.ativo !== false || usados.some((u) => u.id === i.id));
  if (!disponiveis.length && !usados.length) {
    return editavel ? (
      <Cartao titulo="Instrumentos de medição">
        <p className="pequeno" style={{ margin: 0 }}>
          Cadastre analisadores e termômetros em <Link to="/interno/instrumentos">Instrumentos</Link> para registrá-los no laudo com o certificado.
        </p>
      </Cartao>
    ) : null;
  }
  const alternar = (i: Instrumento) => {
    const atual = usados.find((u) => u.id === i.id);
    if (atual) return salvarOS(os.id, { instrumentosUsados: arrayRemove(atual) });
    const snap: InstrumentoUsado = {
      id: i.id,
      descricao: [i.descricao, i.fabricante, i.modelo].filter(Boolean).join(' '),
      ...(i.numeroSerie ? { numeroSerie: i.numeroSerie } : {}),
      ...(i.certificado ? { certificado: i.certificado } : {}),
      ...(i.laboratorio ? { laboratorio: i.laboratorio } : {}),
      validade: i.validade ?? null,
    };
    salvarOS(os.id, { instrumentosUsados: arrayUnion(snap) });
  };
  const lista = editavel ? disponiveis : [];
  return (
    <Cartao titulo={`Instrumentos de medição (${usados.length})`}>
      {lista.map((i) => {
        const vencido = !!i.validade && diasAte(i.validade.toDate()) < 0;
        const marcado = usados.some((u) => u.id === i.id);
        return (
          <label key={i.id} className="marcador" style={{ opacity: vencido && !marcado ? 0.6 : 1 }}>
            <input type="checkbox" checked={marcado} disabled={vencido && !marcado} onChange={() => alternar(i)} />
            <span>
              {i.descricao} {i.numeroSerie && `· série ${i.numeroSerie}`}
              <br />
              <span className="pequeno">
                {vencido ? <strong style={{ color: 'var(--perigo)' }}>Certificado vencido em {fmtData(i.validade)}</strong> : `Certificado ${i.certificado ?? '—'} · válido até ${fmtData(i.validade)}`}
              </span>
            </span>
          </label>
        );
      })}
      {!editavel &&
        usados.map((u) => (
          <p key={u.id} style={{ margin: '4px 0' }}>
            {u.descricao} {u.numeroSerie && `· série ${u.numeroSerie}`} <span className="pequeno">· cert. {u.certificado ?? '—'} · válido até {fmtData(u.validade)}</span>
          </p>
        ))}
    </Cartao>
  );
}

/** Exigências periódicas que este atendimento cumpre: ao concluir, o vencimento do equipamento avança. */
function Exigencias({ os, editavel }: { os: OrdemServico; editavel: boolean }) {
  const exigencias = os.exigencias ?? [];
  if (!exigencias.length) return null;
  const cumpre = os.cumpre ?? [];
  const base = os.fimEm?.toDate() ?? new Date();
  return (
    <Cartao titulo="Este atendimento cumpre">
      {exigencias.map((e) => {
        const marcado = cumpre.includes(e.codigo);
        return (
          <label key={e.codigo} className="marcador">
            <input
              type="checkbox"
              checked={marcado}
              disabled={!editavel}
              onChange={() => salvarOS(os.id, { cumpre: marcado ? arrayRemove(e.codigo) : arrayUnion(e.codigo) })}
            />
            <span>
              {e.descricao}
              <br />
              <span className="pequeno">
                {marcado ? `Próximo vencimento: ${somarMeses(base, e.periodicidadeMeses).toLocaleDateString('pt-BR')}` : `A cada ${e.periodicidadeMeses} meses`}
              </span>
            </span>
          </label>
        );
      })}
      {editavel && <p className="pequeno" style={{ margin: 0 }}>Marque só o que foi feito de fato: a data entra no laudo e na ficha do equipamento.</p>}
    </Cartao>
  );
}

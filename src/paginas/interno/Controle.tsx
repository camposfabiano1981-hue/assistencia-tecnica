// Vencimentos (preventivas e exigências), instrumentos de medição e estoque de peças.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Timestamp, addDoc, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import { exigenciasDoTipo, menorVencimento, salvarVencimentos, situacao, type Situacao } from '../../dados/vencimentos';
import { movimentarEstoque } from '../../dados/estoque';
import type { Cliente, Equipamento, Instrumento, MovimentoEstoque, Peca, TipoEquipamento, Vencimento } from '../../tipos';
import { descreverEquipamento, fmtData, fmtDataHora, fmtMoeda, normalizar, type Tom } from '../../util/formato';
import { deInputData, diasAte, paraInputData, somarDias } from '../../util/datas';
import { abrirWhatsApp } from '../../util/whatsapp';
import { CampoNumero } from '../../componentes/Valores';
import { Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, LinhaLista, LinkBotao, Selecao, Selo, Vazio } from '../../componentes/ui';

const tomSituacao: Record<Situacao, Tom> = { vencido: 'perigo', proximo: 'alerta', 'em-dia': 'sucesso', 'sem-data': 'neutro' };

function prazoTexto(proximo: Timestamp | null | undefined): string {
  if (!proximo) return 'sem data';
  const d = diasAte(proximo.toDate());
  if (d < 0) return `venceu há ${-d} dia(s)`;
  if (d === 0) return 'vence hoje';
  return `vence em ${d} dia(s)`;
}

// ======================= Vencimentos na ficha do equipamento =======================

export function CartaoVencimentos({ equipamento }: { equipamento: Equipamento }) {
  const tipo = useDocumento<TipoEquipamento>(`tiposEquipamento/${equipamento.tipoId}`);
  const cliente = useDocumento<Cliente>(`clientes/${equipamento.clienteId}`);
  const [editando, setEditando] = useState<string | null>(null);
  const [data, setData] = useState('');
  const [erro, setErro] = useState('');
  if (tipo.carregando) return null;
  const exigencias = exigenciasDoTipo(tipo.dados);
  const mapa = equipamento.vencimentos ?? {};
  const codigos = [...new Set([...exigencias.map((e) => e.codigo), ...Object.keys(mapa)])];
  if (!codigos.length) return null;
  const zap = cliente.dados?.whatsapp || cliente.dados?.telefone;

  async function salvarData(codigo: string) {
    setErro('');
    const d = deInputData(data);
    const ex = exigencias.find((e) => e.codigo === codigo);
    const atual = mapa[codigo];
    const novo: Vencimento = {
      descricao: atual?.descricao ?? ex?.descricao ?? codigo,
      periodicidadeMeses: atual?.periodicidadeMeses ?? ex?.periodicidadeMeses ?? null,
      ultimo: atual?.ultimo ?? null,
      proximo: d ? Timestamp.fromDate(d) : null,
    };
    try {
      await salvarVencimentos(equipamento.id, { ...mapa, [codigo]: novo });
      setEditando(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Cartao titulo="Preventivas e exigências">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="lista">
        {codigos.map((codigo) => {
          const ex = exigencias.find((e) => e.codigo === codigo);
          const v = mapa[codigo];
          const s = situacao(v?.proximo);
          return (
            <div key={codigo} className="linha" style={{ flexWrap: 'wrap' }}>
              <div className="linha-texto">
                <div className="linha-titulo">{v?.descricao ?? ex?.descricao ?? codigo}</div>
                <div className="linha-detalhe">
                  {ex ? `a cada ${ex.periodicidadeMeses} meses` : 'fora do tipo atual'} · última {fmtData(v?.ultimo)} · próxima {fmtData(v?.proximo)}
                </div>
              </div>
              <div className="linha-lateral">
                <Selo tom={tomSituacao[s]}>{s === 'sem-data' ? 'Sem data' : prazoTexto(v?.proximo)}</Selo>
                <button
                  type="button"
                  className="botao botao-fantasma"
                  onClick={() => {
                    setEditando(codigo);
                    setData(paraInputData(v?.proximo?.toDate() ?? null));
                  }}
                >
                  Definir data
                </button>
              </div>
              {editando === codigo && (
                <div style={{ width: '100%', display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <Campo rotulo="Próximo vencimento" type="date" value={data} onChange={(e) => setData(e.target.value)} />
                  <Botao onClick={() => salvarData(codigo)}>Salvar</Botao>
                  <Botao variante="fantasma" onClick={() => setEditando(null)}>
                    Cancelar
                  </Botao>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="pequeno">
        As datas avançam sozinhas quando uma OS concluída marca a exigência como cumprida. Use "Definir data" para o histórico anterior ao
        sistema.
      </p>
      <div className="acoes">
        <LinkBotao para={`/interno/os/nova?equipamento=${equipamento.id}&tipo=preventiva`} variante="secundario" icone="chave">
          OS preventiva
        </LinkBotao>
        {zap && (
          <Botao
            variante="whatsapp"
            icone="whatsapp"
            onClick={() =>
              abrirWhatsApp(
                zap,
                `Olá! Lembrete da manutenção do equipamento ${descreverEquipamento(equipamento)}:\n${codigos
                  .map((c) => `• ${mapa[c]?.descricao ?? exigencias.find((e) => e.codigo === c)?.descricao}: ${fmtData(mapa[c]?.proximo)}`)
                  .join('\n')}\nPodemos agendar?`,
              )
            }
          >
            Lembrar o cliente
          </Botao>
        )}
      </div>
    </Cartao>
  );
}

// ======================= Página de vencimentos =======================

interface LinhaVenc {
  eq: Equipamento;
  codigo: string;
  v: Vencimento;
  dias: number;
}

export function Vencimentos() {
  const { perfil } = useSessao();
  const limite = Timestamp.fromDate(somarDias(new Date(), 60));
  const due = useConsulta<Equipamento>(
    () => query(collection(db, 'equipamentos'), where('proximoVencimento', '<=', limite), orderBy('proximoVencimento')),
    [],
  );
  const clientes = useConsulta<Cliente>(() => query(collection(db, 'clientes'), orderBy('nome')), []);
  const [semData, setSemData] = useState<{ eq: Equipamento; faltam: string[] }[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  // Corrige a "menor data" quando uma OS concluída offline avançou só uma das exigências.
  useEffect(() => {
    if (!perfil) return;
    for (const eq of due.itens) {
      const real = menorVencimento(eq.vencimentos);
      if ((real?.toMillis() ?? null) !== (eq.proximoVencimento?.toMillis() ?? null)) {
        void updateDoc(doc(db, 'equipamentos', eq.id), { proximoVencimento: real }).catch(() => undefined);
      }
    }
  }, [due.itens, perfil]);

  const linhas: LinhaVenc[] = [];
  for (const eq of due.itens) {
    if (eq.ativo === false) continue;
    for (const [codigo, v] of Object.entries(eq.vencimentos ?? {})) {
      if (!v?.proximo) continue;
      const dias = diasAte(v.proximo.toDate());
      if (dias <= 60) linhas.push({ eq, codigo, v, dias });
    }
  }
  linhas.sort((a, b) => a.dias - b.dias);
  const grupos: [string, LinhaVenc[]][] = [
    ['Vencidos', linhas.filter((l) => l.dias < 0)],
    ['Próximos 30 dias', linhas.filter((l) => l.dias >= 0 && l.dias <= 30)],
    ['De 31 a 60 dias', linhas.filter((l) => l.dias > 30)],
  ];
  const contato = (id: string) => {
    const c = clientes.itens.find((x) => x.id === id);
    return c?.whatsapp || c?.telefone;
  };

  async function buscarSemData() {
    setBuscando(true);
    try {
      const [eqs, tipos] = await Promise.all([getDocs(collection(db, 'equipamentos')), getDocs(collection(db, 'tiposEquipamento'))]);
      const porTipo = new Map(tipos.docs.map((d) => [d.id, exigenciasDoTipo(d.data() as TipoEquipamento)]));
      const lista = eqs.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Equipamento)
        .filter((e) => e.ativo !== false)
        .map((eq) => ({ eq, faltam: (porTipo.get(eq.tipoId) ?? []).filter((x) => !eq.vencimentos?.[x.codigo]?.proximo).map((x) => x.descricao) }))
        .filter((x) => x.faltam.length);
      setSemData(lista);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Vencimentos" subtitulo="Preventivas e exigências dos próximos 60 dias" voltar="/interno/mais" />
      {due.erro && <Aviso tom="erro">{mensagemErro(due.erro)}</Aviso>}
      {due.carregando ? (
        <Carregando />
      ) : !linhas.length ? (
        <Vazio icone="calendario" titulo="Nada vencendo nos próximos 60 dias">
          As datas aparecem aqui quando uma OS conclui uma preventiva ou exigência, ou quando você define a data na ficha do equipamento.
        </Vazio>
      ) : (
        grupos
          .filter(([, l]) => l.length)
          .map(([titulo, lista]) => (
            <div key={titulo}>
              <h2 className="secao-titulo">
                {titulo} ({lista.length})
              </h2>
              <div className="lista">
                {lista.map(({ eq, codigo, v, dias }) => {
                  const zap = contato(eq.clienteId);
                  return (
                    <div key={`${eq.id}-${codigo}`} className="linha" style={{ flexWrap: 'wrap' }}>
                      <div className="linha-texto">
                        <div className="linha-titulo">
                          <Link to={`/interno/equipamentos/${eq.id}`}>{descreverEquipamento(eq)}</Link>
                        </div>
                        <div className="linha-detalhe">
                          {eq.clienteNome} · {v.descricao} · {fmtData(v.proximo)}
                        </div>
                      </div>
                      <div className="linha-lateral">
                        <Selo tom={dias < 0 ? 'perigo' : dias <= 30 ? 'alerta' : 'info'}>{prazoTexto(v.proximo)}</Selo>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {zap && (
                            <button
                              type="button"
                              className="botao botao-fantasma"
                              onClick={() =>
                                abrirWhatsApp(zap, `Olá! A ${v.descricao.toLowerCase()} do equipamento ${descreverEquipamento(eq)} vence em ${fmtData(v.proximo)}. Podemos agendar?`)
                              }
                            >
                              Avisar
                            </button>
                          )}
                          <Link className="botao botao-fantasma" to={`/interno/os/nova?equipamento=${eq.id}&tipo=${codigo === 'preventiva' ? 'preventiva' : 'ensaio'}`}>
                            Criar OS
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
      )}
      <Cartao titulo="Equipamentos sem data definida" className="nao-imprimir">
        {semData === null ? (
          <>
            <p className="pequeno" style={{ marginTop: 0 }}>Confira quais equipamentos têm exigências no tipo mas ainda não têm data (histórico anterior ao sistema).</p>
            <Botao variante="secundario" carregando={buscando} onClick={buscarSemData}>
              Verificar
            </Botao>
          </>
        ) : !semData.length ? (
          <p className="pequeno" style={{ margin: 0 }}>Todos os equipamentos com exigências já têm data.</p>
        ) : (
          <div className="lista">
            {semData.map(({ eq, faltam }) => (
              <LinhaLista key={eq.id} para={`/interno/equipamentos/${eq.id}`} titulo={descreverEquipamento(eq)} detalhe={`${eq.clienteNome} · sem data: ${faltam.join(', ')}`} />
            ))}
          </div>
        )}
      </Cartao>
    </>
  );
}

// ======================= Instrumentos =======================

export function ListaInstrumentos() {
  const { itens, carregando, erro } = useConsulta<Instrumento>(() => query(collection(db, 'instrumentos'), orderBy('descricao')), []);
  return (
    <>
      <CabecalhoPagina
        titulo="Instrumentos"
        subtitulo="Analisadores e padrões com certificado de calibração"
        voltar="/interno/mais"
        acoes={<LinkBotao para="/interno/instrumentos/novo" icone="mais_circulo">Novo</LinkBotao>}
      />
      <Aviso tom="info">
        Na OS, o técnico escolhe os instrumentos usados e o laudo traz série, certificado e validade. Instrumento com certificado vencido
        não pode ser escolhido.
      </Aviso>
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {carregando ? (
        <Carregando />
      ) : !itens.length ? (
        <Vazio icone="lista" titulo="Nenhum instrumento cadastrado">Cadastre analisador de segurança elétrica, simuladores, termômetros, data loggers…</Vazio>
      ) : (
        <div className="lista">
          {itens.map((i) => {
            const s = situacao(i.validade);
            return (
              <LinhaLista
                key={i.id}
                para={`/interno/instrumentos/${i.id}`}
                titulo={i.descricao}
                detalhe={[i.fabricante, i.modelo, i.numeroSerie && `série ${i.numeroSerie}`, i.certificado && `cert. ${i.certificado}`].filter(Boolean).join(' · ')}
                lateral={
                  i.ativo === false ? (
                    <Selo>Inativo</Selo>
                  ) : (
                    <Selo tom={tomSituacao[s]}>{s === 'sem-data' ? 'Sem validade' : s === 'vencido' ? 'Certificado vencido' : `Válido até ${fmtData(i.validade)}`}</Selo>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </>
  );
}

const INST_VAZIO = { descricao: '', fabricante: '', modelo: '', numeroSerie: '', certificado: '', laboratorio: '', calibradoEm: '', validade: '', ativo: true };

export function InstrumentoEditar() {
  const { id = 'novo' } = useParams();
  const novo = id === 'novo';
  const navegar = useNavigate();
  const existente = useDocumento<Instrumento>(novo ? null : `instrumentos/${id}`);
  const [f, setF] = useState<typeof INST_VAZIO | null>(novo ? INST_VAZIO : null);
  const [erro, setErro] = useState('');
  if (!novo && !f && existente.dados) {
    const i = existente.dados;
    setF({
      descricao: i.descricao,
      fabricante: i.fabricante ?? '',
      modelo: i.modelo ?? '',
      numeroSerie: i.numeroSerie ?? '',
      certificado: i.certificado ?? '',
      laboratorio: i.laboratorio ?? '',
      calibradoEm: paraInputData(i.calibradoEm?.toDate() ?? null),
      validade: paraInputData(i.validade?.toDate() ?? null),
      ativo: i.ativo !== false,
    });
  }
  if (!f) return <Carregando />;
  const muda = (k: keyof typeof INST_VAZIO) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErro('');
    const cal = deInputData(f.calibradoEm);
    const val = deInputData(f.validade);
    const dados = {
      descricao: f.descricao.trim(),
      fabricante: f.fabricante.trim(),
      modelo: f.modelo.trim(),
      numeroSerie: f.numeroSerie.trim(),
      certificado: f.certificado.trim(),
      laboratorio: f.laboratorio.trim(),
      calibradoEm: cal ? Timestamp.fromDate(cal) : null,
      validade: val ? Timestamp.fromDate(val) : null,
      ativo: f.ativo,
    };
    try {
      if (novo) await addDoc(collection(db, 'instrumentos'), dados);
      else await setDoc(doc(db, 'instrumentos', id), dados);
      navegar('/interno/instrumentos', { replace: true });
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  return (
    <form onSubmit={salvar}>
      <CabecalhoPagina titulo={novo ? 'Novo instrumento' : f.descricao} voltar="/interno/instrumentos" />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <Campo rotulo="Descrição" required value={f.descricao} onChange={muda('descricao')} placeholder="Ex.: Analisador de segurança elétrica" />
        <div className="grade grade-2">
          <Campo rotulo="Fabricante" value={f.fabricante} onChange={muda('fabricante')} />
          <Campo rotulo="Modelo" value={f.modelo} onChange={muda('modelo')} />
          <Campo rotulo="Nº de série" value={f.numeroSerie} onChange={muda('numeroSerie')} />
          <Campo rotulo="Nº do certificado de calibração" value={f.certificado} onChange={muda('certificado')} />
          <Campo rotulo="Laboratório (RBC)" value={f.laboratorio} onChange={muda('laboratorio')} />
          <Campo rotulo="Calibrado em" type="date" value={f.calibradoEm} onChange={muda('calibradoEm')} />
          <Campo rotulo="Validade do certificado" type="date" value={f.validade} onChange={muda('validade')} />
        </div>
        <label className="marcador">
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
          <span>Em uso</span>
        </label>
      </Cartao>
      <Botao type="submit" bloco>
        Salvar instrumento
      </Botao>
    </form>
  );
}

// ======================= Estoque =======================

export function ListaEstoque() {
  const { itens, carregando, erro } = useConsulta<Peca>(() => query(collection(db, 'pecas'), orderBy('descricao')), []);
  const [busca, setBusca] = useState('');
  const termo = normalizar(busca);
  const lista = itens.filter((p) => normalizar(`${p.descricao} ${p.codigo ?? ''}`).includes(termo));
  const abaixo = itens.filter((p) => p.ativo !== false && p.quantidade <= p.minimo);
  const valor = itens.reduce((t, p) => t + Math.max(0, p.quantidade) * (p.custo || 0), 0);
  return (
    <>
      <CabecalhoPagina titulo="Estoque" voltar="/interno/mais" acoes={<LinkBotao para="/interno/estoque/nova" icone="mais_circulo">Nova peça</LinkBotao>} />
      <div className="resumo">
        <div className="resumo-item">
          <strong className="numero">{itens.length}</strong>
          <span>Peças cadastradas</span>
        </div>
        <div className={`resumo-item ${abaixo.length ? 'alerta' : ''}`}>
          <strong className="numero">{abaixo.length}</strong>
          <span>No mínimo ou abaixo</span>
        </div>
        <div className="resumo-item">
          <strong className="numero">{fmtMoeda(valor)}</strong>
          <span>Valor em estoque (custo)</span>
        </div>
      </div>
      <div className="busca">
        <input type="search" placeholder="Buscar por descrição ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {carregando ? (
        <Carregando />
      ) : !lista.length ? (
        <Vazio icone="caixa" titulo="Nenhuma peça">Cadastre as peças que você costuma usar: a OS dá baixa sozinha e o orçamento puxa o preço.</Vazio>
      ) : (
        <div className="lista">
          {lista.map((p) => (
            <LinhaLista
              key={p.id}
              para={`/interno/estoque/${p.id}`}
              titulo={p.descricao}
              detalhe={[p.codigo && `cód. ${p.codigo}`, `venda ${fmtMoeda(p.preco)}`].filter(Boolean).join(' · ')}
              lateral={
                <>
                  <strong className="numero">
                    {String(p.quantidade).replace('.', ',')} {p.unidade}
                  </strong>
                  {p.ativo !== false && p.quantidade <= p.minimo && <Selo tom="alerta">Repor</Selo>}
                </>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

export function PecaDetalhe() {
  const { id = 'nova' } = useParams();
  const nova = id === 'nova';
  const navegar = useNavigate();
  const { perfil } = useSessao();
  const existente = useDocumento<Peca>(nova ? null : `pecas/${id}`);
  const movimentos = useConsulta<MovimentoEstoque>(
    () => (nova ? null : query(collection(db, 'pecas', id, 'movimentos'), orderBy('em', 'desc'), limit(50))),
    [id],
  );
  const [f, setF] = useState<{ codigo: string; descricao: string; unidade: string; minimo: number; custo: number; preco: number; ncm: string; ativo: boolean; quantidadeInicial: number } | null>(
    nova ? { codigo: '', descricao: '', unidade: 'un', minimo: 1, custo: 0, preco: 0, ncm: '', ativo: true, quantidadeInicial: 0 } : null,
  );
  const [mov, setMov] = useState<{ tipo: 'entrada' | 'saida' | 'ajuste'; quantidade: number; obs: string }>({ tipo: 'entrada', quantidade: 1, obs: '' });
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);

  if (!nova && !f && existente.dados) {
    const p = existente.dados;
    setF({ codigo: p.codigo ?? '', descricao: p.descricao, unidade: p.unidade, minimo: p.minimo, custo: p.custo, preco: p.preco, ncm: p.ncm ?? '', ativo: p.ativo !== false, quantidadeInicial: 0 });
  }
  if (!f) return <Carregando />;
  const p = existente.dados;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setMsg(null);
    const dados = {
      codigo: f.codigo.trim(),
      descricao: f.descricao.trim(),
      unidade: f.unidade.trim() || 'un',
      minimo: f.minimo,
      custo: f.custo,
      preco: f.preco,
      ncm: f.ncm.trim(),
      ativo: f.ativo,
    };
    try {
      if (nova) {
        const ref = await addDoc(collection(db, 'pecas'), { ...dados, quantidade: 0, criadoEm: serverTimestamp() });
        if (f.quantidadeInicial > 0) await movimentarEstoque(ref.id, 'entrada', f.quantidadeInicial, perfil?.nome ?? 'Equipe', { obs: 'Saldo inicial' });
        navegar(`/interno/estoque/${ref.id}`, { replace: true });
      } else {
        await updateDoc(doc(db, 'pecas', id), dados);
        setMsg({ tom: 'sucesso', texto: 'Peça salva.' });
      }
    } catch (err) {
      setMsg({ tom: 'erro', texto: mensagemErro(err) });
    }
  }

  async function movimentar() {
    setMsg(null);
    if (mov.quantidade < 0 || (mov.tipo !== 'ajuste' && mov.quantidade === 0)) return setMsg({ tom: 'erro', texto: 'Informe a quantidade.' });
    try {
      await movimentarEstoque(id, mov.tipo, mov.quantidade, perfil?.nome ?? 'Equipe', { obs: mov.obs, novaQuantidade: mov.quantidade });
      setMov({ ...mov, quantidade: 1, obs: '' });
      setMsg({ tom: 'sucesso', texto: 'Movimento registrado.' });
    } catch (err) {
      setMsg({ tom: 'erro', texto: mensagemErro(err) });
    }
  }

  return (
    <>
      <CabecalhoPagina titulo={nova ? 'Nova peça' : f.descricao} subtitulo={p ? `Saldo: ${String(p.quantidade).replace('.', ',')} ${p.unidade}` : undefined} voltar="/interno/estoque" />
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <form onSubmit={salvar}>
        <Cartao>
          <Campo rotulo="Descrição" required value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
          <div className="grade grade-3">
            <Campo rotulo="Código" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
            <Campo rotulo="Unidade" value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })} placeholder="un, m, kit" />
            <Campo rotulo="NCM (para a NF-e)" value={f.ncm} onChange={(e) => setF({ ...f, ncm: e.target.value })} inputMode="numeric" />
          </div>
          <div className="grade grade-3">
            <div className="campo">
              <span className="campo-rotulo">Estoque mínimo</span>
              <CampoNumero rotulo="Estoque mínimo" casas={null} className="campo-valor" valor={f.minimo} aoMudar={(n) => setF({ ...f, minimo: n })} />
            </div>
            <div className="campo">
              <span className="campo-rotulo">Custo (R$)</span>
              <CampoNumero rotulo="Custo" className="campo-valor" valor={f.custo} aoMudar={(n) => setF({ ...f, custo: n })} />
            </div>
            <div className="campo">
              <span className="campo-rotulo">Preço de venda (R$)</span>
              <CampoNumero rotulo="Preço de venda" className="campo-valor" valor={f.preco} aoMudar={(n) => setF({ ...f, preco: n })} />
            </div>
          </div>
          {nova && (
            <div className="campo">
              <span className="campo-rotulo">Quantidade atual em estoque</span>
              <CampoNumero rotulo="Quantidade inicial" casas={null} className="campo-valor" valor={f.quantidadeInicial} aoMudar={(n) => setF({ ...f, quantidadeInicial: n })} />
            </div>
          )}
          <label className="marcador">
            <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
            <span>Peça ativa</span>
          </label>
          <Botao type="submit">Salvar peça</Botao>
        </Cartao>
      </form>
      {!nova && (
        <>
          <Cartao titulo="Entrada, saída ou ajuste">
            <div className="grade grade-3">
              <Selecao rotulo="Movimento" value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value as typeof mov.tipo })}>
                <option value="entrada">Entrada (compra)</option>
                <option value="saida">Saída</option>
                <option value="ajuste">Ajuste (contagem)</option>
              </Selecao>
              <div className="campo">
                <span className="campo-rotulo">{mov.tipo === 'ajuste' ? 'Saldo contado' : 'Quantidade'}</span>
                <CampoNumero rotulo="Quantidade do movimento" casas={null} className="campo-valor" valor={mov.quantidade} aoMudar={(n) => setMov({ ...mov, quantidade: n })} />
              </div>
              <Campo rotulo="Observação" value={mov.obs} onChange={(e) => setMov({ ...mov, obs: e.target.value })} placeholder="Ex.: NF 1234 do fornecedor" />
            </div>
            <Botao variante="secundario" onClick={movimentar}>
              Registrar
            </Botao>
          </Cartao>
          <Cartao titulo="Histórico de movimentos">
            {!movimentos.itens.length ? (
              <p className="pequeno" style={{ margin: 0 }}>Nenhum movimento ainda.</p>
            ) : (
              <ol className="tempo">
                {movimentos.itens.map((m) => (
                  <li key={m.id}>
                    <strong>
                      {m.tipo === 'entrada' ? '+' : m.tipo === 'saida' ? '−' : '='} {String(m.quantidade).replace('.', ',')} ·{' '}
                      {m.tipo === 'entrada' ? 'Entrada' : m.tipo === 'saida' ? 'Saída' : 'Ajuste de saldo'}
                    </strong>
                    {(m.obs || m.osId) && <div>{[m.obs, m.osId && !m.obs?.includes('OS') ? `OS ${m.osId}` : ''].filter(Boolean).join(' · ')}</div>}
                    <small>
                      {fmtDataHora(m.em)} · {m.por}
                    </small>
                  </li>
                ))}
              </ol>
            )}
          </Cartao>
        </>
      )}
    </>
  );
}

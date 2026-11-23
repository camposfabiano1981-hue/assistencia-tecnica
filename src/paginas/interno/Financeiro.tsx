// Financeiro interno: orçamentos e faturas.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import {
  EMISSOR_NACIONAL_NFSE,
  atualizarOrcamento,
  calcularTotais,
  cancelarFatura,
  cancelarOrcamento,
  criarFatura,
  criarOrcamento,
  desfazerPagamento,
  enviarOrcamento,
  novoIdItem,
  pixDaCobranca,
  registrarNotas,
  registrarPagamento,
  rotuloFormaPagamento,
  rotuloSituacaoFatura,
  rotuloStatusOrcamento,
  situacaoFatura,
  snapshotCliente,
  tomSituacaoFatura,
  tomStatusOrcamento,
  voltarParaRascunho,
  type DadosOrcamento,
} from '../../dados/financeiro';
import { csvFaturas } from '../../dados/exportar';
import type { Chamado, Cliente, Equipamento, Fatura, FormaPagamento, ItemValor, Orcamento, OrdemServico, Peca, StatusOrcamento } from '../../tipos';
import { descreverEquipamento, fmtData, fmtDataHora, fmtMoeda, numeroOS } from '../../util/formato';
import { deInputData, paraInputData, somarDias } from '../../util/datas';
import { baixarArquivo } from '../../util/csv';
import { abrirWhatsApp } from '../../util/whatsapp';
import { BotaoDocumento } from '../../componentes/BotaoDocumento';
import { CampoNumero, CartaoPix, EditorItens } from '../../componentes/Valores';
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, Info, LinhaLista, LinkBotao, Selecao, Selo, Vazio } from '../../componentes/ui';

const n5 = (n: number) => String(n).padStart(5, '0');

export function usePecasAtivas(): Peca[] {
  const { itens } = useConsulta<Peca>(() => query(collection(db, 'pecas'), orderBy('descricao')), []);
  return itens.filter((p) => p.ativo !== false);
}

// ======================= Lista =======================

const FILTROS_ORC: { valor: StatusOrcamento | 'ativos' | 'todos'; rotulo: string }[] = [
  { valor: 'ativos', rotulo: 'Em andamento' },
  { valor: 'rascunho', rotulo: 'Rascunhos' },
  { valor: 'enviado', rotulo: 'Aguardando' },
  { valor: 'aprovado', rotulo: 'Aprovados' },
  { valor: 'recusado', rotulo: 'Recusados' },
  { valor: 'todos', rotulo: 'Todos' },
];
const FILTROS_FAT = ['aberta', 'vencida', 'paga', 'cancelada', 'todas'] as const;

export function Financeiro() {
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') === 'faturas' ? 'faturas' : 'orcamentos';
  return (
    <>
      <CabecalhoPagina
        titulo="Financeiro"
        voltar="/interno/mais"
        acoes={
          aba === 'orcamentos' ? (
            <LinkBotao para="/interno/orcamentos/novo" icone="mais_circulo">Novo orçamento</LinkBotao>
          ) : (
            <LinkBotao para="/interno/faturas/nova" icone="mais_circulo">Nova fatura</LinkBotao>
          )
        }
      />
      <div className="filtros" role="tablist" aria-label="Seção">
        <button type="button" role="tab" aria-pressed={aba === 'orcamentos'} onClick={() => setParams({ aba: 'orcamentos' })}>
          Orçamentos
        </button>
        <button type="button" role="tab" aria-pressed={aba === 'faturas'} onClick={() => setParams({ aba: 'faturas' })}>
          Faturas
        </button>
      </div>
      {aba === 'orcamentos' ? <ListaOrcamentos /> : <ListaFaturas />}
    </>
  );
}

function ListaOrcamentos() {
  const [filtro, setFiltro] = useState<(typeof FILTROS_ORC)[number]['valor']>('ativos');
  const { itens, carregando, erro } = useConsulta<Orcamento>(() => query(collection(db, 'orcamentos'), orderBy('numero', 'desc'), limit(300)), []);
  const lista = itens.filter((o) =>
    filtro === 'todos' ? true : filtro === 'ativos' ? ['rascunho', 'enviado', 'aprovado'].includes(o.status) && !(o.status === 'aprovado' && o.faturaId) : o.status === filtro,
  );
  return (
    <>
      <div className="filtros" role="group" aria-label="Filtrar orçamentos">
        {FILTROS_ORC.map((f) => (
          <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
            {f.rotulo}
          </button>
        ))}
      </div>
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {carregando ? (
        <Carregando />
      ) : !lista.length ? (
        <Vazio icone="lista" titulo="Nenhum orçamento aqui">Crie orçamentos a partir de um chamado, de uma OS ou pelo botão "Novo orçamento".</Vazio>
      ) : (
        <div className="lista">
          {lista.map((o) => (
            <LinhaLista
              key={o.id}
              para={`/interno/orcamentos/${o.id}`}
              titulo={`Orç. ${n5(o.numero)} · ${o.cliente.nome}`}
              detalhe={`${o.equipamentoDescricao} · ${fmtMoeda(o.total)}`}
              lateral={
                <>
                  <Selo tom={tomStatusOrcamento[o.status]}>{rotuloStatusOrcamento[o.status]}</Selo>
                  {o.faturaId && <Selo tom="info">Faturado</Selo>}
                </>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

function ListaFaturas() {
  const [filtro, setFiltro] = useState<(typeof FILTROS_FAT)[number]>('aberta');
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const { itens, carregando, erro } = useConsulta<Fatura>(() => query(collection(db, 'faturas'), orderBy('numero', 'desc'), limit(500)), []);
  const comSituacao = itens.map((f) => ({ f, s: situacaoFatura(f) }));
  const lista = comSituacao.filter(({ s }) => (filtro === 'todas' ? true : filtro === 'aberta' ? s === 'aberta' || s === 'vencida' : s === filtro));
  const soma = (xs: { f: Fatura }[]) => xs.reduce((t, { f }) => t + f.total, 0);
  const aReceber = soma(comSituacao.filter(({ s }) => s === 'aberta' || s === 'vencida'));
  const vencido = soma(comSituacao.filter(({ s }) => s === 'vencida'));
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const recebidoMes = itens.filter((f) => f.status === 'paga' && (f.pagamento?.em?.toMillis() ?? 0) >= inicioMes.getTime()).reduce((t, f) => t + (f.pagamento?.valor ?? 0), 0);

  function planilha() {
    const [a, m] = mes.split('-').map(Number);
    const ini = new Date(a, m - 1, 1).getTime();
    const fim = new Date(a, m, 1).getTime();
    const doMes = itens.filter((f) => {
      const t = f.emitidaEm?.toMillis() ?? 0;
      return t >= ini && t < fim;
    });
    baixarArquivo(`faturas-${mes}.csv`, csvFaturas(doMes), 'text/csv;charset=utf-8');
  }

  return (
    <>
      <div className="resumo">
        <div className="resumo-item">
          <strong className="numero">{fmtMoeda(aReceber)}</strong>
          <span>A receber</span>
        </div>
        <div className={`resumo-item ${vencido ? 'alerta' : ''}`}>
          <strong className="numero">{fmtMoeda(vencido)}</strong>
          <span>Vencido</span>
        </div>
        <div className="resumo-item">
          <strong className="numero">{fmtMoeda(recebidoMes)}</strong>
          <span>Recebido no mês</span>
        </div>
      </div>
      <div className="filtros" role="group" aria-label="Filtrar faturas">
        {FILTROS_FAT.map((f) => (
          <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
            {f === 'todas' ? 'Todas' : f === 'aberta' ? 'A receber' : rotuloSituacaoFatura[f] + 's'}
          </button>
        ))}
      </div>
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {carregando ? (
        <Carregando />
      ) : !lista.length ? (
        <Vazio icone="lista" titulo="Nenhuma fatura aqui">Faturas nascem de um orçamento aprovado ou de uma OS concluída.</Vazio>
      ) : (
        <div className="lista">
          {lista.map(({ f, s }) => (
            <LinhaLista
              key={f.id}
              para={`/interno/faturas/${f.id}`}
              titulo={`Fatura ${n5(f.numero)} · ${f.cliente.nome}`}
              detalhe={`${f.descricao} · vence ${fmtData(f.vencimento)}${f.nfse ? ` · NFS-e ${f.nfse.numero}` : ''}`}
              lateral={
                <>
                  <strong className="numero">{fmtMoeda(f.total)}</strong>
                  <Selo tom={tomSituacaoFatura[s]}>{rotuloSituacaoFatura[s]}</Selo>
                </>
              }
            />
          ))}
        </div>
      )}
      <Cartao titulo="Planilha para o contador">
        <p className="pequeno" style={{ marginTop: 0 }}>
          Faturas emitidas no mês, com serviços e peças separados, situação, pagamento e números das notas. Abre no Excel.
        </p>
        <div className="acoes" style={{ alignItems: 'flex-end' }}>
          <Campo rotulo="Mês" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          <Botao variante="secundario" icone="lista" onClick={planilha}>
            Baixar planilha (CSV)
          </Botao>
        </div>
      </Cartao>
    </>
  );
}

// ======================= Orçamento: criar / editar =======================

interface FormOrc {
  clienteId: string;
  equipamentoId: string;
  equipamentoOutro: string;
  chamadoId: string | null;
  osId: string | null;
  itens: ItemValor[];
  desconto: number;
  validade: string;
  prazoExecucao: string;
  condicoesPagamento: string;
  garantia: string;
  observacoes: string;
}

export function OrcamentoEditar() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { perfil, empresa } = useSessao();
  const pecas = usePecasAtivas();
  const existente = useDocumento<Orcamento>(id ? `orcamentos/${id}` : null);
  const clientes = useConsulta<Cliente>(() => query(collection(db, 'clientes'), orderBy('nome')), []);
  const [f, setF] = useState<FormOrc | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const equipamentos = useConsulta<Equipamento>(
    () => (f?.clienteId ? query(collection(db, 'equipamentos'), where('clienteId', '==', f.clienteId)) : null),
    [f?.clienteId],
  );

  // Monta o formulário: de um orçamento existente, de um chamado, de uma OS ou em branco.
  useEffect(() => {
    if (f) return;
    if (id) {
      if (!existente.dados) return;
      const o = existente.dados;
      setF({
        clienteId: o.clienteId,
        equipamentoId: o.equipamentoId ?? (o.equipamentoDescricao ? 'outro' : ''),
        equipamentoOutro: o.equipamentoId ? '' : o.equipamentoDescricao,
        chamadoId: o.chamadoId,
        osId: o.osId,
        itens: o.itens,
        desconto: o.desconto,
        validade: paraInputData(o.validadeAte?.toDate()),
        prazoExecucao: o.prazoExecucao,
        condicoesPagamento: o.condicoesPagamento,
        garantia: o.garantia,
        observacoes: o.observacoes,
      });
      return;
    }
    if (!empresa) return;
    let ativo = true;
    (async () => {
      const base: FormOrc = {
        clienteId: params.get('cliente') ?? '',
        equipamentoId: params.get('equipamento') ?? '',
        equipamentoOutro: '',
        chamadoId: params.get('chamado'),
        osId: params.get('os'),
        itens: [{ id: novoIdItem(), tipo: 'servico', descricao: 'Mão de obra técnica', quantidade: 1, valorUnitario: 0 }],
        desconto: 0,
        validade: paraInputData(somarDias(new Date(), empresa.orcValidadeDias ?? 10)),
        prazoExecucao: 'Até 2 dias úteis após a aprovação',
        condicoesPagamento: empresa.orcCondicoes ?? 'Pix ou transferência em até 7 dias após a conclusão do serviço.',
        garantia: empresa.orcGarantia ?? '90 dias para o serviço executado; peças conforme garantia do fabricante.',
        observacoes: '',
      };
      if (base.chamadoId) {
        const s = await getDoc(doc(db, 'chamados', base.chamadoId));
        if (s.exists()) {
          const c = s.data() as Chamado;
          base.clienteId = c.clienteId;
          base.equipamentoId = c.equipamentoId ?? 'outro';
          if (!c.equipamentoId) base.equipamentoOutro = c.equipamentoDescricao.replace(/^Outro: /, '');
        }
      }
      if (base.osId) {
        const s = await getDoc(doc(db, 'os', base.osId));
        if (s.exists()) {
          const o = s.data() as OrdemServico;
          base.clienteId = o.clienteId;
          base.equipamentoId = o.equipamentoId ?? 'outro';
          if (!o.equipamentoId) base.equipamentoOutro = o.equipamento.tipoNome;
          base.chamadoId = base.chamadoId ?? o.chamadoId;
        }
      }
      if (ativo) setF(base);
    })().catch((e) => setErro(mensagemErro(e)));
    return () => {
      ativo = false;
    };
  }, [id, existente.dados, empresa, params, f]);

  if (!f || clientes.carregando) return <Carregando />;
  if (id && existente.dados && existente.dados.status !== 'rascunho') {
    return <Aviso tom="alerta">Só é possível editar orçamentos em rascunho. <Link to={`/interno/orcamentos/${id}`}>Voltar</Link></Aviso>;
  }
  const muda = (k: keyof FormOrc) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErro('');
    const cliente = clientes.itens.find((c) => c.id === f.clienteId);
    if (!cliente) return setErro('Escolha o cliente.');
    const eq = equipamentos.itens.find((x) => x.id === f.equipamentoId);
    const descricao = eq ? descreverEquipamento(eq) : f.equipamentoOutro.trim() || 'Não informado';
    if (!f.itens.some((i) => i.descricao.trim())) return setErro('Inclua pelo menos um item.');
    const dados: DadosOrcamento = {
      clienteId: cliente.id,
      cliente: snapshotCliente(cliente),
      equipamentoId: eq?.id ?? null,
      equipamentoDescricao: descricao,
      chamadoId: f.chamadoId,
      osId: f.osId,
      itens: f.itens,
      desconto: f.desconto,
      validadeAte: deInputData(f.validade),
      prazoExecucao: f.prazoExecucao,
      condicoesPagamento: f.condicoesPagamento,
      garantia: f.garantia,
      observacoes: f.observacoes,
    };
    setSalvando(true);
    try {
      if (id) {
        await atualizarOrcamento(id, dados);
        navegar(`/interno/orcamentos/${id}`, { replace: true });
      } else {
        if (!navigator.onLine) throw new Error('Criar o orçamento precisa de internet (para gerar o número).');
        const n = await criarOrcamento(dados, perfil?.nome ?? 'Equipe');
        navegar(`/interno/orcamentos/${n}`, { replace: true });
      }
    } catch (err) {
      setErro(mensagemErro(err));
      setSalvando(false);
    }
  }

  const t = calcularTotais(f.itens, f.desconto);
  return (
    <form onSubmit={salvar}>
      <CabecalhoPagina titulo={id ? `Editar orçamento ${n5(Number(id))}` : 'Novo orçamento'} voltar={true} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <Selecao rotulo="Cliente" value={f.clienteId} onChange={(e) => setF({ ...f, clienteId: e.target.value, equipamentoId: '' })} disabled={!!id}>
          <option value="">Escolha o cliente…</option>
          {clientes.itens.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </Selecao>
        <Selecao rotulo="Equipamento" value={f.equipamentoId} onChange={muda('equipamentoId')} disabled={!f.clienteId}>
          <option value="">Escolha…</option>
          {equipamentos.itens.map((x) => (
            <option key={x.id} value={x.id}>{descreverEquipamento(x)}</option>
          ))}
          <option value="outro">Outro / não cadastrado</option>
        </Selecao>
        {f.equipamentoId === 'outro' && <Campo rotulo="Qual equipamento?" value={f.equipamentoOutro} onChange={muda('equipamentoOutro')} />}
        {(f.chamadoId || f.osId) && (
          <p className="pequeno">
            Referente a {f.chamadoId ? `chamado nº ${f.chamadoId}` : ''}
            {f.chamadoId && f.osId ? ' e ' : ''}
            {f.osId ? `OS ${numeroOS(Number(f.osId))}` : ''}.
          </p>
        )}
      </Cartao>
      <Cartao titulo="Itens">
        <EditorItens itens={f.itens} desconto={f.desconto} pecas={pecas} aoMudar={(itens, desconto) => setF({ ...f, itens, desconto })} />
      </Cartao>
      <Cartao titulo="Condições">
        <div className="grade grade-2">
          <Campo rotulo="Válido até" type="date" value={f.validade} onChange={muda('validade')} />
          <Campo rotulo="Prazo de execução" value={f.prazoExecucao} onChange={muda('prazoExecucao')} />
        </div>
        <AreaTexto rotulo="Condições de pagamento" rows={2} value={f.condicoesPagamento} onChange={muda('condicoesPagamento')} />
        <AreaTexto rotulo="Garantia" rows={2} value={f.garantia} onChange={muda('garantia')} />
        <AreaTexto rotulo="Observações" rows={2} value={f.observacoes} onChange={muda('observacoes')} />
      </Cartao>
      <Botao type="submit" carregando={salvando} bloco>
        Salvar orçamento ({fmtMoeda(t.total)})
      </Botao>
    </form>
  );
}

// ======================= Orçamento: detalhe =======================

export function OrcamentoDetalhe() {
  const { id = '' } = useParams();
  const { perfil, empresa } = useSessao();
  const navegar = useNavigate();
  const { dados: o, carregando, erro } = useDocumento<Orcamento>(`orcamentos/${id}`);
  const cliente = useDocumento<Cliente>(o ? `clientes/${o.clienteId}` : null);
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (carregando) return <Carregando />;
  if (erro || !o) return <Vazio titulo="Orçamento não encontrado" />;
  const zap = cliente.dados?.whatsapp || cliente.dados?.telefone;
  const link = `${location.origin}/portal/orcamentos/${o.numero}`;
  const mensagem = `Olá! Seu orçamento nº ${o.numero} (${o.equipamentoDescricao}) no valor de ${fmtMoeda(o.total)} está disponível para aprovação no portal: ${link}`;

  async function acao(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    setOcupado(true);
    try {
      await fn();
      setMsg({ tom: 'sucesso', texto: ok });
    } catch (e) {
      setMsg({ tom: 'erro', texto: mensagemErro(e) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo={`Orçamento ${n5(o.numero)}`}
        subtitulo={<Link to={`/interno/clientes/${o.clienteId}`}>{o.cliente.nome}</Link>}
        voltar="/interno/financeiro"
        acoes={<Selo tom={tomStatusOrcamento[o.status]}>{rotuloStatusOrcamento[o.status]}</Selo>}
      />
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      {o.resposta && (
        <Aviso tom={o.resposta.status === 'aprovado' ? 'sucesso' : 'erro'}>
          <strong>{o.resposta.status === 'aprovado' ? 'Aprovado' : 'Recusado'}</strong> por {o.resposta.nome} em {fmtDataHora(o.resposta.em)} pelo portal.
          {o.resposta.motivo && <div>Motivo: {o.resposta.motivo}</div>}
        </Aviso>
      )}
      <Cartao>
        <dl className="infos">
          <Info rotulo="Equipamento">{o.equipamentoId ? <Link to={`/interno/equipamentos/${o.equipamentoId}`}>{o.equipamentoDescricao}</Link> : o.equipamentoDescricao}</Info>
          <Info rotulo="Chamado">{o.chamadoId ? <Link to={`/interno/chamados/${o.chamadoId}`}>nº {o.chamadoId}</Link> : '—'}</Info>
          <Info rotulo="Criado">{`${fmtDataHora(o.criadoEm)} por ${o.criadoPor}`}</Info>
          <Info rotulo="Válido até">{fmtData(o.validadeAte)}</Info>
          <Info rotulo="Enviado">{fmtDataHora(o.enviadoEm)}</Info>
          <Info rotulo="Fatura">{o.faturaId ? <Link to={`/interno/faturas/${o.faturaId}`}>nº {n5(Number(o.faturaId))}</Link> : '—'}</Info>
        </dl>
      </Cartao>
      <Cartao titulo="Itens">
        <EditorItens itens={o.itens} desconto={o.desconto} somenteLeitura />
      </Cartao>
      <Cartao titulo="Condições">
        <dl className="infos">
          <Info rotulo="Prazo de execução">{o.prazoExecucao}</Info>
          <Info rotulo="Pagamento">{o.condicoesPagamento}</Info>
          <Info rotulo="Garantia">{o.garantia}</Info>
          <Info rotulo="Observações">{o.observacoes}</Info>
        </dl>
      </Cartao>
      <div className="acoes-coluna">
        {o.status === 'rascunho' && (
          <>
            <Botao
              icone="check"
              carregando={ocupado}
              bloco
              onClick={() =>
                acao(() => enviarOrcamento(o, perfil?.nome ?? 'Equipe'), 'Orçamento enviado: ele já aparece no portal do cliente para aprovação.')
              }
            >
              Enviar ao cliente (portal)
            </Botao>
            <LinkBotao para={`/interno/orcamentos/${o.id}/editar`} variante="secundario" icone="editar" bloco>
              Editar
            </LinkBotao>
          </>
        )}
        {o.status === 'enviado' && zap && (
          <Botao variante="whatsapp" icone="whatsapp" bloco onClick={() => abrirWhatsApp(zap, mensagem)}>
            Avisar o cliente no WhatsApp
          </Botao>
        )}
        {o.status === 'aprovado' && !o.faturaId && (
          <LinkBotao para={`/interno/faturas/nova?orcamento=${o.id}`} icone="lista" bloco>
            Gerar fatura
          </LinkBotao>
        )}
        {o.status === 'aprovado' && o.chamadoId && (
          <LinkBotao para={`/interno/chamados/${o.chamadoId}`} variante="secundario" icone="chamados" bloco>
            Ir para o chamado (criar/abrir OS)
          </LinkBotao>
        )}
        <BotaoDocumento
          rotulo="PDF do orçamento"
          texto={`Orçamento nº ${o.numero} - ${o.equipamentoDescricao}`}
          bloco
          gerar={async () => {
            const { gerarOrcamentoPDF } = await import('../../util/documentos');
            return gerarOrcamentoPDF(o, empresa, link);
          }}
        />
        {(o.status === 'enviado' || o.status === 'recusado') && (
          <Botao variante="secundario" bloco carregando={ocupado} onClick={() => acao(() => voltarParaRascunho(o), 'Voltou para rascunho: edite e envie de novo.')}>
            Revisar (voltar para rascunho)
          </Botao>
        )}
        {['rascunho', 'enviado'].includes(o.status) && (
          <Botao
            variante="perigo"
            bloco
            onClick={() => {
              if (window.confirm('Cancelar este orçamento?')) void acao(() => cancelarOrcamento(o), 'Orçamento cancelado.');
            }}
          >
            Cancelar orçamento
          </Botao>
        )}
        {o.status === 'cancelado' && (
          <Botao variante="secundario" bloco onClick={() => navegar(`/interno/orcamentos/novo?cliente=${o.clienteId}${o.chamadoId ? `&chamado=${o.chamadoId}` : ''}`)}>
            Fazer novo orçamento
          </Botao>
        )}
      </div>
    </>
  );
}

// ======================= Fatura: nova =======================

export function FaturaNova() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const pecas = usePecasAtivas();
  const clientes = useConsulta<Cliente>(() => query(collection(db, 'clientes'), orderBy('nome')), []);
  const [f, setF] = useState<{
    clienteId: string;
    descricao: string;
    orcamentoId: string | null;
    osIds: string[];
    itens: ItemValor[];
    desconto: number;
    vencimento: string;
    observacoes: string;
  } | null>(null);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (f) return;
    let ativo = true;
    (async () => {
      const base = {
        clienteId: params.get('cliente') ?? '',
        descricao: '',
        orcamentoId: params.get('orcamento'),
        osIds: [] as string[],
        itens: [] as ItemValor[],
        desconto: 0,
        vencimento: paraInputData(somarDias(new Date(), 7)),
        observacoes: '',
      };
      if (base.orcamentoId) {
        const s = await getDoc(doc(db, 'orcamentos', base.orcamentoId));
        if (s.exists()) {
          const o = { id: s.id, ...s.data() } as Orcamento;
          if (o.faturaId) setAviso(`Este orçamento já tem a fatura nº ${o.faturaId}.`);
          base.clienteId = o.clienteId;
          base.descricao = `Orçamento nº ${o.numero} - ${o.equipamentoDescricao}`;
          base.itens = o.itens.map((i) => ({ ...i, id: novoIdItem() }));
          base.desconto = o.desconto;
          if (o.osId) base.osIds = [o.osId];
        }
      }
      const osParam = params.get('os');
      if (osParam) {
        const s = await getDoc(doc(db, 'os', osParam));
        if (s.exists()) {
          const o = { id: s.id, ...s.data() } as OrdemServico;
          base.clienteId = o.clienteId;
          base.osIds = [o.id];
          base.descricao = `OS ${numeroOS(o.numero)} - ${o.equipamento.tipoNome}`;
          const ja = await getDocs(query(collection(db, 'faturas'), where('osIds', 'array-contains', o.id)));
          if (!ja.empty) setAviso(`Esta OS já aparece na fatura nº ${ja.docs[0].id}.`);
          const precos = new Map((await getDocs(collection(db, 'pecas'))).docs.map((d) => [d.id, (d.data() as Peca).preco]));
          base.itens = [
            { id: novoIdItem(), tipo: 'servico', descricao: `Mão de obra técnica - OS ${numeroOS(o.numero)}`, quantidade: 1, valorUnitario: 0 },
            ...(o.pecas ?? []).map((p) => ({
              id: novoIdItem(),
              tipo: 'peca' as const,
              descricao: p.descricao,
              quantidade: p.quantidade,
              valorUnitario: (p.pecaId && precos.get(p.pecaId)) || 0,
              pecaId: p.pecaId ?? null,
            })),
          ];
        }
      }
      if (!base.itens.length) base.itens = [{ id: novoIdItem(), tipo: 'servico', descricao: '', quantidade: 1, valorUnitario: 0 }];
      if (ativo) setF(base);
    })().catch((e) => setErro(mensagemErro(e)));
    return () => {
      ativo = false;
    };
  }, [params, f]);

  if (!f || clientes.carregando) return <Carregando />;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErro('');
    const cliente = clientes.itens.find((c) => c.id === f.clienteId);
    const venc = deInputData(f.vencimento);
    if (!cliente) return setErro('Escolha o cliente.');
    if (!venc) return setErro('Informe o vencimento.');
    if (calcularTotais(f.itens, f.desconto).total <= 0) return setErro('O total precisa ser maior que zero.');
    if (!navigator.onLine) return setErro('Emitir a fatura precisa de internet (para gerar o número).');
    setSalvando(true);
    try {
      const n = await criarFatura({
        clienteId: cliente.id,
        cliente: snapshotCliente(cliente),
        descricao: f.descricao || 'Serviços de assistência técnica',
        orcamentoId: f.orcamentoId,
        osIds: f.osIds,
        itens: f.itens,
        desconto: f.desconto,
        vencimento: venc,
        observacoes: f.observacoes,
      });
      navegar(`/interno/faturas/${n}`, { replace: true });
    } catch (err) {
      setErro(mensagemErro(err));
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar}>
      <CabecalhoPagina titulo="Nova fatura" voltar={true} />
      {aviso && <Aviso tom="alerta">{aviso}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <Selecao rotulo="Cliente" value={f.clienteId} onChange={(e) => setF({ ...f, clienteId: e.target.value })} disabled={!!f.orcamentoId || !!f.osIds.length}>
          <option value="">Escolha o cliente…</option>
          {clientes.itens.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </Selecao>
        <Campo rotulo="Descrição" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: Manutenção corretiva da autoclave" />
        <Campo rotulo="Vencimento" type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
      </Cartao>
      <Cartao titulo="Itens">
        <EditorItens itens={f.itens} desconto={f.desconto} pecas={pecas} aoMudar={(itens, desconto) => setF({ ...f, itens, desconto })} />
      </Cartao>
      <Cartao>
        <AreaTexto rotulo="Observações (aparecem na fatura)" rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
      </Cartao>
      <Botao type="submit" carregando={salvando} bloco>
        Emitir fatura ({fmtMoeda(calcularTotais(f.itens, f.desconto).total)})
      </Botao>
    </form>
  );
}

// ======================= Fatura: detalhe =======================

export function FaturaDetalhe() {
  const { id = '' } = useParams();
  const { empresa } = useSessao();
  const { dados: fat, carregando, erro } = useDocumento<Fatura>(`faturas/${id}`);
  const cliente = useDocumento<Cliente>(fat ? `clientes/${fat.clienteId}` : null);
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);

  if (carregando) return <Carregando />;
  if (erro || !fat) return <Vazio titulo="Fatura não encontrada" />;
  const s = situacaoFatura(fat);
  const pix = fat.status === 'aberta' ? pixDaCobranca(empresa, fat.total, fat.pixTxid, `Fatura ${fat.numero}`) : null;
  const zap = cliente.dados?.whatsapp || cliente.dados?.telefone;

  async function acao(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try {
      await fn();
      setMsg({ tom: 'sucesso', texto: ok });
    } catch (e) {
      setMsg({ tom: 'erro', texto: mensagemErro(e) });
    }
  }

  const mensagem = [
    `Olá! Segue a fatura nº ${fat.numero} (${fat.descricao}), no valor de ${fmtMoeda(fat.total)}, com vencimento em ${fmtData(fat.vencimento)}.`,
    pix ? `\nPix copia e cola:\n${pix}` : '',
    `\nTambém está no portal: ${location.origin}/portal/faturas/${fat.numero}`,
  ].join('');

  return (
    <>
      <CabecalhoPagina
        titulo={`Fatura ${n5(fat.numero)}`}
        subtitulo={<Link to={`/interno/clientes/${fat.clienteId}`}>{fat.cliente.nome}</Link>}
        voltar="/interno/financeiro?aba=faturas"
        acoes={<Selo tom={tomSituacaoFatura[s]}>{rotuloSituacaoFatura[s]}</Selo>}
      />
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <Cartao>
        <div className="valor-destaque">{fmtMoeda(fat.total)}</div>
        <dl className="infos" style={{ marginTop: 10 }}>
          <Info rotulo="Descrição">{fat.descricao}</Info>
          <Info rotulo="Vencimento">{fmtData(fat.vencimento)}</Info>
          <Info rotulo="Emitida">{fmtDataHora(fat.emitidaEm)}</Info>
          <Info rotulo="Origem">
            {[
              fat.orcamentoId ? <Link key="o" to={`/interno/orcamentos/${fat.orcamentoId}`}>Orçamento nº {fat.orcamentoId}</Link> : null,
              ...(fat.osIds ?? []).map((x) => <Link key={x} to={`/interno/os/${x}`}> OS {numeroOS(Number(x))}</Link>),
            ]}
          </Info>
          {fat.pagamento && (
            <Info rotulo="Pagamento">{`${fmtData(fat.pagamento.em)} · ${rotuloFormaPagamento[fat.pagamento.forma]} · ${fmtMoeda(fat.pagamento.valor)}`}</Info>
          )}
          <Info rotulo="Observações">{fat.observacoes}</Info>
        </dl>
      </Cartao>
      <Cartao titulo="Itens">
        <EditorItens itens={fat.itens} desconto={fat.desconto} somenteLeitura />
      </Cartao>
      {fat.status === 'aberta' &&
        (pix ? (
          <CartaoPix payload={pix} valor={fat.total} titulo="Pix desta fatura" />
        ) : (
          <Aviso tom="info">
            Configure a chave Pix em <Link to="/interno/config">Configurações</Link> para a fatura sair com QR code e copia e cola.
          </Aviso>
        ))}
      <div className="acoes-coluna" style={{ marginBottom: 14 }}>
        {zap && fat.status !== 'cancelada' && (
          <Botao variante="whatsapp" icone="whatsapp" bloco onClick={() => abrirWhatsApp(zap, mensagem)}>
            Enviar cobrança no WhatsApp
          </Botao>
        )}
        <BotaoDocumento
          rotulo="PDF da fatura"
          texto={`Fatura nº ${fat.numero} - ${fat.descricao}`}
          bloco
          gerar={async () => {
            const { gerarFaturaPDF } = await import('../../util/documentos');
            return gerarFaturaPDF(fat, empresa, pix);
          }}
        />
      </div>
      {fat.status === 'aberta' && <RegistrarPagamento fat={fat} aoConcluir={(t) => setMsg({ tom: 'sucesso', texto: t })} />}
      {fat.status === 'paga' && (
        <Botao variante="secundario" bloco onClick={() => window.confirm('Desfazer o registro de pagamento?') && void acao(() => desfazerPagamento(fat), 'Pagamento desfeito.')}>
          Desfazer pagamento
        </Botao>
      )}
      {fat.status !== 'cancelada' && <NotasFiscais fat={fat} />}
      {fat.status === 'aberta' && (
        <Botao
          variante="perigo"
          bloco
          onClick={() => {
            const motivo = window.prompt('Motivo do cancelamento:');
            if (motivo?.trim()) void acao(() => cancelarFatura(fat, motivo), 'Fatura cancelada.');
          }}
        >
          Cancelar fatura
        </Botao>
      )}
    </>
  );
}

function RegistrarPagamento({ fat, aoConcluir }: { fat: Fatura; aoConcluir: (t: string) => void }) {
  const [em, setEm] = useState(paraInputData(new Date()));
  const [valor, setValor] = useState(fat.total);
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  return (
    <Cartao titulo="Registrar pagamento">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <p className="pequeno" style={{ marginTop: 0 }}>
        Confira no extrato do banco (o identificador {fat.pixTxid} aparece em muitos bancos) e registre aqui.
      </p>
      <div className="grade grade-3">
        <Campo rotulo="Data" type="date" value={em} onChange={(e) => setEm(e.target.value)} />
        <div className="campo">
          <span className="campo-rotulo">Valor recebido (R$)</span>
          <CampoNumero rotulo="Valor recebido" valor={valor} aoMudar={setValor} className="campo-valor" />
        </div>
        <Selecao rotulo="Forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
          {Object.entries(rotuloFormaPagamento).map(([v, r]) => (
            <option key={v} value={v}>{r}</option>
          ))}
        </Selecao>
      </div>
      <Campo rotulo="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
      <Botao
        icone="check"
        carregando={salvando}
        onClick={async () => {
          const d = deInputData(em);
          if (!d) return setErro('Informe a data.');
          setSalvando(true);
          try {
            await registrarPagamento(fat, { em: d, valor, forma, obs });
            aoConcluir('Pagamento registrado.');
          } catch (e) {
            setErro(mensagemErro(e));
          } finally {
            setSalvando(false);
          }
        }}
      >
        Marcar como paga
      </Botao>
    </Cartao>
  );
}

function NotasFiscais({ fat }: { fat: Fatura }) {
  const [nfse, setNfse] = useState(fat.nfse?.numero ?? '');
  const [dataNfse, setDataNfse] = useState(paraInputData(fat.nfse?.emitidaEm?.toDate() ?? null));
  const [chave, setChave] = useState(fat.nfse?.chave ?? '');
  const [nfe, setNfe] = useState(fat.nfe?.numero ?? '');
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);
  return (
    <Cartao titulo="Notas fiscais">
      <p className="pequeno" style={{ marginTop: 0 }}>
        Emita a NFS-e no{' '}
        <a href={EMISSOR_NACIONAL_NFSE} target="_blank" rel="noreferrer">
          Emissor Nacional
        </a>{' '}
        (serviços: {fmtMoeda(fat.totalServicos)}) e a NF-e das peças no seu emissor ({fmtMoeda(fat.totalPecas)}). Depois registre os números aqui.
      </p>
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <div className="grade grade-2">
        <Campo rotulo="Nº da NFS-e" value={nfse} onChange={(e) => setNfse(e.target.value)} inputMode="numeric" />
        <Campo rotulo="Data de emissão" type="date" value={dataNfse} onChange={(e) => setDataNfse(e.target.value)} />
      </div>
      <Campo rotulo="Chave de acesso da NFS-e (opcional)" value={chave} onChange={(e) => setChave(e.target.value)} />
      <Campo rotulo="Nº da NF-e das peças (se houver)" value={nfe} onChange={(e) => setNfe(e.target.value)} inputMode="numeric" />
      <Botao
        variante="secundario"
        onClick={async () => {
          setMsg(null);
          try {
            await registrarNotas(fat, {
              nfse: { numero: nfse, emitidaEm: deInputData(dataNfse), chave },
              nfe: { numero: nfe },
            });
            setMsg({ tom: 'sucesso', texto: 'Notas registradas.' });
          } catch (e) {
            setMsg({ tom: 'erro', texto: mensagemErro(e) });
          }
        }}
      >
        Salvar notas
      </Botao>
    </Cartao>
  );
}

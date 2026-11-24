// Portal do cliente: orçamentos para aprovar e faturas.
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import {
  pixDaCobranca,
  responderOrcamento,
  rotuloSituacaoFatura,
  rotuloStatusOrcamento,
  situacaoFatura,
  tomSituacaoFatura,
  tomStatusOrcamento,
} from '../../dados/financeiro';
import type { Fatura, Orcamento } from '../../tipos';
import { fmtData, fmtDataHora, fmtMoeda } from '../../util/formato';
import { abrirWhatsApp } from '../../util/whatsapp';
import { BotaoDocumento } from '../../componentes/BotaoDocumento';
import { BotaoVisualizar } from '../../componentes/Visualizador';
import { CartaoPix, EditorItens } from '../../componentes/Valores';
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Carregando, Cartao, Info, LinhaLista, Selo, Vazio } from '../../componentes/ui';

/** Orçamentos que o cliente pode ver (as regras exigem esse filtro). */
export function useOrcamentosCliente(clienteId: string) {
  return useConsulta<Orcamento>(
    () => (clienteId ? query(collection(db, 'orcamentos'), where('clienteId', '==', clienteId), where('status', 'in', ['enviado', 'aprovado', 'recusado'])) : null),
    [clienteId],
  );
}

export function FinanceiroCliente() {
  const { perfil } = useSessao();
  const clienteId = perfil?.clienteId ?? '';
  const orcamentos = useOrcamentosCliente(clienteId);
  const faturas = useConsulta<Fatura>(() => (clienteId ? query(collection(db, 'faturas'), where('clienteId', '==', clienteId)) : null), [clienteId]);

  if (orcamentos.carregando || faturas.carregando) return <Carregando />;
  const paraAprovar = orcamentos.itens.filter((o) => o.status === 'enviado').sort((a, b) => b.numero - a.numero);
  const respondidos = orcamentos.itens.filter((o) => o.status !== 'enviado').sort((a, b) => b.numero - a.numero);
  const fat = faturas.itens.filter((f) => f.status !== 'cancelada').map((f) => ({ f, s: situacaoFatura(f) }));
  const emAberto = fat.filter(({ s }) => s === 'aberta' || s === 'vencida').sort((a, b) => a.f.vencimento.toMillis() - b.f.vencimento.toMillis());
  const pagas = fat.filter(({ s }) => s === 'paga').sort((a, b) => b.f.numero - a.f.numero);

  return (
    <>
      <CabecalhoPagina titulo="Financeiro" subtitulo="Orçamentos e faturas" />
      {(orcamentos.erro || faturas.erro) && <Aviso tom="erro">{mensagemErro(orcamentos.erro ?? faturas.erro)}</Aviso>}

      <h2 className="secao-titulo">Orçamentos para aprovar ({paraAprovar.length})</h2>
      {paraAprovar.length ? (
        <div className="lista">
          {paraAprovar.map((o) => (
            <LinhaLista
              key={o.id}
              para={`/portal/orcamentos/${o.id}`}
              titulo={`Orçamento nº ${o.numero} · ${fmtMoeda(o.total)}`}
              detalhe={`${o.equipamentoDescricao} · válido até ${fmtData(o.validadeAte)}`}
              lateral={<Selo tom="alerta">Aprovar</Selo>}
            />
          ))}
        </div>
      ) : (
        <p className="pequeno">Nenhum orçamento esperando a sua aprovação.</p>
      )}

      <h2 className="secao-titulo">Faturas em aberto ({emAberto.length})</h2>
      {emAberto.length ? (
        <div className="lista">
          {emAberto.map(({ f, s }) => (
            <LinhaLista
              key={f.id}
              para={`/portal/faturas/${f.id}`}
              titulo={`Fatura nº ${f.numero} · ${fmtMoeda(f.total)}`}
              detalhe={`${f.descricao} · vence ${fmtData(f.vencimento)}`}
              lateral={<Selo tom={tomSituacaoFatura[s]}>{rotuloSituacaoFatura[s]}</Selo>}
            />
          ))}
        </div>
      ) : (
        <p className="pequeno">Nenhuma fatura em aberto.</p>
      )}

      {!!(respondidos.length || pagas.length) && <h2 className="secao-titulo">Histórico</h2>}
      <div className="lista">
        {pagas.map(({ f }) => (
          <LinhaLista
            key={`f${f.id}`}
            para={`/portal/faturas/${f.id}`}
            titulo={`Fatura nº ${f.numero} · ${fmtMoeda(f.total)}`}
            detalhe={`${f.descricao}${f.nfse ? ` · NFS-e ${f.nfse.numero}` : ''}`}
            lateral={<Selo tom="sucesso">Paga</Selo>}
          />
        ))}
        {respondidos.map((o) => (
          <LinhaLista
            key={`o${o.id}`}
            para={`/portal/orcamentos/${o.id}`}
            titulo={`Orçamento nº ${o.numero} · ${fmtMoeda(o.total)}`}
            detalhe={o.equipamentoDescricao}
            lateral={<Selo tom={tomStatusOrcamento[o.status]}>{rotuloStatusOrcamento[o.status]}</Selo>}
          />
        ))}
      </div>
    </>
  );
}

export function OrcamentoCliente() {
  const { id = '' } = useParams();
  const { perfil, empresa } = useSessao();
  const { dados: o, carregando, erro } = useDocumento<Orcamento>(`orcamentos/${id}`);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState('');

  if (carregando) return <Carregando />;
  if (erro || !o) return <Vazio titulo="Orçamento não encontrado" />;
  const vencido = !!o.validadeAte && o.validadeAte.toMillis() < Date.now();
  const podeResponder = o.status === 'enviado' && !vencido;

  async function responder(status: 'aprovado' | 'recusado') {
    if (!perfil || !o) return;
    if (status === 'aprovado' && !window.confirm(`Aprovar o orçamento nº ${o.numero} no valor de ${fmtMoeda(o.total)}?`)) return;
    setFalha('');
    setEnviando(true);
    try {
      await responderOrcamento(o, status, { uid: perfil.id, nome: perfil.nome }, motivo);
      setRecusando(false);
    } catch (e) {
      setFalha(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo={`Orçamento nº ${o.numero}`}
        subtitulo={o.equipamentoDescricao}
        voltar="/portal/financeiro"
        acoes={<Selo tom={tomStatusOrcamento[o.status]}>{rotuloStatusOrcamento[o.status]}</Selo>}
      />
      {falha && <Aviso tom="erro">{falha}</Aviso>}
      {o.resposta && (
        <Aviso tom={o.resposta.status === 'aprovado' ? 'sucesso' : 'alerta'}>
          {o.resposta.status === 'aprovado' ? 'Você aprovou' : 'Você recusou'} este orçamento em {fmtDataHora(o.resposta.em)} ({o.resposta.nome}).
          {o.resposta.status === 'aprovado' && ' A empresa já pode agendar o serviço.'}
          {empresa?.whatsapp && (
            <div className="acoes">
              <Botao
                variante="whatsapp"
                icone="whatsapp"
                onClick={() =>
                  abrirWhatsApp(
                    empresa.whatsapp,
                    `Olá! ${o.resposta?.status === 'aprovado' ? 'Aprovei' : 'Recusei'} o orçamento nº ${o.numero} no portal (${o.cliente.nome}).`,
                  )
                }
              >
                Avisar a empresa no WhatsApp
              </Botao>
            </div>
          )}
        </Aviso>
      )}
      {o.status === 'enviado' && vencido && <Aviso tom="alerta">A validade deste orçamento terminou em {fmtData(o.validadeAte)}. Peça uma atualização à empresa.</Aviso>}
      <Cartao titulo="Itens">
        <EditorItens itens={o.itens} desconto={o.desconto} somenteLeitura />
      </Cartao>
      <Cartao titulo="Condições">
        <dl className="infos">
          <Info rotulo="Válido até">{fmtData(o.validadeAte)}</Info>
          <Info rotulo="Prazo de execução">{o.prazoExecucao}</Info>
          <Info rotulo="Pagamento">{o.condicoesPagamento}</Info>
          <Info rotulo="Garantia">{o.garantia}</Info>
          <Info rotulo="Observações">{o.observacoes}</Info>
        </dl>
      </Cartao>
      {podeResponder &&
        (recusando ? (
          <Cartao titulo="Recusar orçamento">
            <AreaTexto rotulo="Motivo (opcional, ajuda a empresa a revisar)" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <div className="acoes">
              <Botao variante="perigo" carregando={enviando} onClick={() => responder('recusado')}>
                Confirmar recusa
              </Botao>
              <Botao variante="fantasma" onClick={() => setRecusando(false)}>
                Voltar
              </Botao>
            </div>
          </Cartao>
        ) : (
          <div className="acoes-coluna" style={{ marginBottom: 14 }}>
            <Botao icone="check" carregando={enviando} bloco onClick={() => responder('aprovado')}>
              Aprovar orçamento ({fmtMoeda(o.total)})
            </Botao>
            <Botao variante="secundario" bloco onClick={() => setRecusando(true)}>
              Recusar
            </Botao>
          </div>
        ))}
      <BotaoVisualizar
        rotulo="Visualizar orçamento"
        bloco
        gerar={async () => {
          const { gerarOrcamentoPDF } = await import('../../util/documentos');
          return { arquivo: await gerarOrcamentoPDF(o, empresa), texto: `Orçamento nº ${o.numero}` };
        }}
      />
      <BotaoDocumento
        rotulo="Baixar PDF do orçamento"
        texto={`Orçamento nº ${o.numero}`}
        bloco
        gerar={async () => {
          const { gerarOrcamentoPDF } = await import('../../util/documentos');
          return gerarOrcamentoPDF(o, empresa);
        }}
      />
      <p className="pequeno" style={{ textAlign: 'center' }}>
        <Link to="/portal/financeiro">Voltar ao financeiro</Link>
      </p>
    </>
  );
}

export function FaturaCliente() {
  const { id = '' } = useParams();
  const { empresa } = useSessao();
  const { dados: f, carregando, erro } = useDocumento<Fatura>(`faturas/${id}`);
  if (carregando) return <Carregando />;
  if (erro || !f) return <Vazio titulo="Fatura não encontrada" />;
  const s = situacaoFatura(f);
  const pix = f.status === 'aberta' ? pixDaCobranca(empresa, f.total, f.pixTxid, `Fatura ${f.numero}`) : null;

  return (
    <>
      <CabecalhoPagina
        titulo={`Fatura nº ${f.numero}`}
        subtitulo={f.descricao}
        voltar="/portal/financeiro"
        acoes={<Selo tom={tomSituacaoFatura[s]}>{rotuloSituacaoFatura[s]}</Selo>}
      />
      <Cartao>
        <div className="valor-destaque">{fmtMoeda(f.total)}</div>
        <dl className="infos" style={{ marginTop: 10 }}>
          <Info rotulo="Vencimento">{fmtData(f.vencimento)}</Info>
          <Info rotulo="Emitida em">{fmtData(f.emitidaEm)}</Info>
          {f.pagamento && <Info rotulo="Paga em">{fmtData(f.pagamento.em)}</Info>}
          {f.nfse && <Info rotulo="NFS-e">{`nº ${f.nfse.numero}${f.nfse.emitidaEm ? ` de ${fmtData(f.nfse.emitidaEm)}` : ''}`}</Info>}
          {f.nfse?.chave && <Info rotulo="Chave de acesso">{f.nfse.chave}</Info>}
        </dl>
      </Cartao>
      {pix && <CartaoPix payload={pix} valor={f.total} />}
      <Cartao titulo="Itens">
        <EditorItens itens={f.itens} desconto={f.desconto} somenteLeitura />
      </Cartao>
      <BotaoVisualizar
        rotulo="Visualizar fatura"
        bloco
        gerar={async () => {
          const { gerarFaturaPDF } = await import('../../util/documentos');
          return { arquivo: await gerarFaturaPDF(f, empresa, pix), texto: `Fatura nº ${f.numero}` };
        }}
      />
      <BotaoDocumento
        rotulo="Baixar PDF da fatura"
        texto={`Fatura nº ${f.numero}`}
        bloco
        gerar={async () => {
          const { gerarFaturaPDF } = await import('../../util/documentos');
          return gerarFaturaPDF(f, empresa, pix);
        }}
      />
    </>
  );
}

/** Aviso no início do portal quando há orçamento esperando aprovação. */
export function AvisoOrcamentosPendentes() {
  const { perfil } = useSessao();
  const { itens } = useOrcamentosCliente(perfil?.clienteId ?? '');
  const pendentes = itens.filter((o) => o.status === 'enviado' && !(o.validadeAte && o.validadeAte.toMillis() < Date.now()));
  if (!pendentes.length) return null;
  return (
    <Aviso tom="alerta">
      {pendentes.length === 1 ? 'Há 1 orçamento' : `Há ${pendentes.length} orçamentos`} esperando a sua aprovação.{' '}
      <Link to={pendentes.length === 1 ? `/portal/orcamentos/${pendentes[0].id}` : '/portal/financeiro'}>Ver agora</Link>
    </Aviso>
  );
}

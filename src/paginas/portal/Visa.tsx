// Pasta da Vigilância Sanitária do cliente: equipamentos, vencimentos, laudos e documentos do prestador.
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta } from '../../dados/hooks';
import { rotuloSituacao, situacao, type Situacao } from '../../dados/vencimentos';
import { situacaoDoEquipamento } from '../../dados/visa';
import type { Equipamento, OrdemServico } from '../../tipos';
import { descreverEquipamento, fmtData, numeroOS, rotuloTipoOS, type Tom } from '../../util/formato';
import { formatarCodigo } from '../../util/verificacao';
import { BotaoDossieVisa, BotaoVisualizarLaudo } from '../../componentes/Documentos';
import { Aviso, CabecalhoPagina, Carregando, Cartao, Selo, Vazio } from '../../componentes/ui';

const TOM: Record<Situacao, Tom> = { vencido: 'perigo', proximo: 'alerta', 'em-dia': 'sucesso', 'sem-data': 'neutro' };

export function PastaVisa() {
  const { perfil, empresa } = useSessao();
  const clienteId = perfil?.clienteId ?? '';
  const equipamentos = useConsulta<Equipamento>(() => query(collection(db, 'equipamentos'), where('clienteId', '==', clienteId)), [clienteId]);
  const laudos = useConsulta<OrdemServico>(
    () => query(collection(db, 'os'), where('clienteId', '==', clienteId), where('status', '==', 'concluida')),
    [clienteId],
  );
  if (equipamentos.carregando || laudos.carregando) return <Carregando />;

  const ativos = equipamentos.itens.filter((e) => e.ativo !== false).sort((a, b) => a.tipoNome.localeCompare(b.tipoNome, 'pt-BR'));
  const situacoes = ativos.map(situacaoDoEquipamento);
  const conta = (s: Situacao) => situacoes.filter((x) => x === s).length;
  const ultimoLaudo = (id: string) =>
    laudos.itens.filter((o) => o.equipamentoId === id).sort((a, b) => (b.fimEm?.toMillis() ?? 0) - (a.fimEm?.toMillis() ?? 0))[0];
  const documentos = empresa?.documentos ?? [];

  return (
    <>
      <CabecalhoPagina titulo="Pasta da VISA" subtitulo="Manutenção dos seus equipamentos, pronta para a fiscalização" voltar="/portal/equipamentos" />
      {(equipamentos.erro || laudos.erro) && <Aviso tom="erro">{mensagemErro(equipamentos.erro ?? laudos.erro)}</Aviso>}
      <Aviso tom="info">
        Mostre esta tela ao fiscal ou entregue o dossiê em PDF. Cada laudo tem um código para conferir a autenticidade na internet.
      </Aviso>
      <div className="acoes-coluna" style={{ marginBottom: 14 }}>
        <BotaoDossieVisa clienteId={clienteId} bloco />
      </div>
      <div className="resumo">
        <div className="resumo-item">
          <strong>{ativos.length}</strong>
          <span>Equipamentos</span>
        </div>
        <div className="resumo-item">
          <strong>{conta('em-dia')}</strong>
          <span>Em dia</span>
        </div>
        <div className={`resumo-item ${conta('proximo') ? 'alerta' : ''}`}>
          <strong>{conta('proximo')}</strong>
          <span>Vencem em 30 dias</span>
        </div>
        <div className={`resumo-item ${conta('vencido') ? 'alerta' : ''}`}>
          <strong>{conta('vencido')}</strong>
          <span>Vencidos</span>
        </div>
      </div>

      {!ativos.length ? (
        <Vazio icone="caixa" titulo="Nenhum equipamento cadastrado" />
      ) : (
        ativos.map((e, i) => {
          const venc = Object.entries(e.vencimentos ?? {}).sort(([, a], [, b]) => (a.proximo?.toMillis() ?? Infinity) - (b.proximo?.toMillis() ?? Infinity));
          const laudo = ultimoLaudo(e.id);
          return (
            <Cartao key={e.id} titulo={descreverEquipamento(e)} acoes={<Selo tom={TOM[situacoes[i]]}>{rotuloSituacao[situacoes[i]]}</Selo>}>
              {venc.length ? (
                <div className="lista">
                  {venc.map(([codigo, v]) => (
                    <div key={codigo} className="linha" style={{ padding: '10px 12px' }}>
                      <div className="linha-texto">
                        <div className="linha-titulo" style={{ fontWeight: 600 }}>{v.descricao}</div>
                        <div className="linha-detalhe">
                          Última {fmtData(v.ultimo)} · próxima {fmtData(v.proximo)}
                        </div>
                      </div>
                      <Selo tom={TOM[situacao(v.proximo)]}>{rotuloSituacao[situacao(v.proximo)]}</Selo>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pequeno" style={{ margin: 0 }}>Sem preventiva ou exigência com data registrada.</p>
              )}
              {laudo && (
                <div style={{ marginTop: 10 }}>
                  <p className="pequeno" style={{ margin: '0 0 6px' }}>
                    Último laudo: OS {numeroOS(laudo.numero)} · {rotuloTipoOS[laudo.tipo]} · {fmtData(laudo.fimEm)}
                    {laudo.codigoVerificacao && ` · código ${formatarCodigo(laudo.codigoVerificacao)}`}
                  </p>
                  <BotaoVisualizarLaudo os={laudo} rotulo="Visualizar o último laudo" />
                </div>
              )}
            </Cartao>
          );
        })
      )}

      <Cartao titulo="Prestador do serviço">
        <p style={{ marginTop: 0 }}>
          <strong>{empresa?.nome}</strong>
          {empresa?.documento && ` · CNPJ ${empresa.documento}`}
          {empresa?.rtNome && (
            <span className="pequeno" style={{ display: 'block' }}>
              Responsável técnico: {empresa.rtNome}
              {empresa.rtRegistro && ` · ${empresa.rtRegistro}`}
            </span>
          )}
        </p>
        {documentos.length ? (
          <div className="lista">
            {documentos.map((x) => (
              <div key={x.id} className="linha" style={{ padding: '10px 12px' }}>
                <div className="linha-texto">
                  <div className="linha-titulo" style={{ fontWeight: 600 }}>{x.nome}</div>
                  <div className="linha-detalhe">
                    {[x.numero && `nº ${x.numero}`, x.validade && `válido até ${fmtData(x.validade)}`].filter(Boolean).join(' · ') || 'Sem validade'}
                  </div>
                </div>
                {x.link && (
                  <a className="botao botao-secundario" href={x.link} target="_blank" rel="noreferrer">
                    <span>Abrir</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="pequeno" style={{ marginBottom: 0 }}>A empresa ainda não publicou documentos aqui.</p>
        )}
      </Cartao>
    </>
  );
}

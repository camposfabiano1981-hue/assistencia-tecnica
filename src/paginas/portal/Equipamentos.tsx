import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta } from '../../dados/hooks';
import type { Equipamento, OrdemServico } from '../../tipos';
import { descreverEquipamento, fmtData, numeroOS, rotuloTipoOS } from '../../util/formato';
import { BotaoLaudo } from '../../componentes/Laudo';
import { Aviso, CabecalhoPagina, Carregando, Cartao, LinkBotao, Vazio } from '../../componentes/ui';

export function MeusEquipamentos() {
  const { perfil } = useSessao();
  const clienteId = perfil?.clienteId ?? '';
  const equipamentos = useConsulta<Equipamento>(() => query(collection(db, 'equipamentos'), where('clienteId', '==', clienteId)), [clienteId]);
  const laudos = useConsulta<OrdemServico>(
    () => query(collection(db, 'os'), where('clienteId', '==', clienteId), where('status', '==', 'concluida')),
    [clienteId],
  );

  if (equipamentos.carregando) return <Carregando />;
  const porEquipamento = new Map<string, OrdemServico[]>();
  for (const o of laudos.itens) {
    const k = o.equipamentoId ?? '';
    porEquipamento.set(k, [...(porEquipamento.get(k) ?? []), o].sort((a, b) => b.numero - a.numero));
  }
  const ativos = equipamentos.itens.filter((e) => e.ativo !== false);
  const semEquipamento = porEquipamento.get('') ?? [];

  return (
    <>
      <CabecalhoPagina titulo="Meus equipamentos" subtitulo="Histórico de atendimentos e laudos" />
      {(equipamentos.erro || laudos.erro) && <Aviso tom="erro">{mensagemErro(equipamentos.erro ?? laudos.erro)}</Aviso>}
      {!ativos.length ? (
        <Vazio icone="caixa" titulo="Nenhum equipamento cadastrado">
          A empresa cadastra os seus equipamentos na primeira visita.
        </Vazio>
      ) : (
        ativos.map((e) => {
          const lista = porEquipamento.get(e.id) ?? [];
          return (
            <Cartao key={e.id} titulo={descreverEquipamento(e)}>
              <p className="pequeno" style={{ marginTop: 0 }}>
                Última visita: {fmtData(e.ultimaVisitaEm)}
                {e.patrimonio ? ` · patrimônio ${e.patrimonio}` : ''}
              </p>
              {lista.length ? (
                <div className="acoes-coluna">
                  {lista.slice(0, 5).map((o) => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <span className="pequeno">
                        OS {numeroOS(o.numero)} · {rotuloTipoOS[o.tipo]} · {fmtData(o.fimEm)}
                      </span>
                      <BotaoLaudo os={o} rotulo="Laudo" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pequeno">Nenhum laudo ainda.</p>
              )}
              <div className="acoes">
                <LinkBotao para={`/portal/novo?equipamento=${e.id}`} variante="secundario" icone="chamados">
                  Abrir chamado
                </LinkBotao>
              </div>
            </Cartao>
          );
        })
      )}
      {!!semEquipamento.length && (
        <Cartao titulo="Outros laudos">
          <div className="acoes-coluna">
            {semEquipamento.map((o) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span className="pequeno">
                  OS {numeroOS(o.numero)} · {o.equipamento.tipoNome} · {fmtData(o.fimEm)}
                </span>
                <BotaoLaudo os={o} rotulo="Laudo" />
              </div>
            ))}
          </div>
        </Cartao>
      )}
    </>
  );
}

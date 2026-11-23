import { useParams, useSearchParams } from 'react-router';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import type { Chamado } from '../../tipos';
import { fmtDataHora, fmtRelativo, rotuloStatusChamado, tomStatusChamado } from '../../util/formato';
import { abrirWhatsApp } from '../../util/whatsapp';
import { GaleriaFotos } from '../../componentes/Fotos';
import { BotaoLaudo } from '../../componentes/Laudo';
import { BotaoVisualizarChamado, BotaoVisualizarLaudo } from '../../componentes/Documentos';
import { Aviso, Botao, CabecalhoPagina, Carregando, Cartao, Info, LinhaLista, LinkBotao, Selo, Vazio } from '../../componentes/ui';
import { AvisoOrcamentosPendentes } from './Financeiro';

export function MeusChamados() {
  const { perfil } = useSessao();
  const clienteId = perfil?.clienteId ?? '';
  const { itens, carregando, erro } = useConsulta<Chamado>(() => query(collection(db, 'chamados'), where('clienteId', '==', clienteId)), [clienteId]);
  const lista = [...itens].sort((a, b) => b.numero - a.numero);
  const andamento = lista.filter((c) => c.status !== 'concluido' && c.status !== 'cancelado');
  const encerrados = lista.filter((c) => c.status === 'concluido' || c.status === 'cancelado');

  const linha = (c: Chamado) => (
    <LinhaLista
      key={c.id}
      para={`/portal/chamados/${c.id}`}
      titulo={`Chamado nº ${c.numero}`}
      detalhe={`${c.equipamentoDescricao} · ${fmtRelativo(c.abertoEm)}`}
      lateral={<Selo tom={tomStatusChamado[c.status]}>{rotuloStatusChamado[c.status]}</Selo>}
    />
  );

  return (
    <>
      <CabecalhoPagina titulo={`Olá, ${perfil?.nome?.split(' ')[0] ?? ''}`} subtitulo="Acompanhe os seus chamados" />
      <AvisoOrcamentosPendentes />
      <LinkBotao para="/portal/novo" icone="mais_circulo" bloco>
        Abrir novo chamado
      </LinkBotao>
      {erro && <Aviso tom="erro">{mensagemErro(erro)}</Aviso>}
      {carregando ? (
        <Carregando />
      ) : !lista.length ? (
        <div style={{ marginTop: 16 }}>
          <Vazio icone="chamados" titulo="Nenhum chamado ainda">
            Quando um equipamento precisar de assistência, abra um chamado aqui ou aponte a câmera para a etiqueta QR do equipamento.
          </Vazio>
        </div>
      ) : (
        <>
          <h2 className="secao-titulo">Em andamento ({andamento.length})</h2>
          {andamento.length ? <div className="lista">{andamento.map(linha)}</div> : <p className="pequeno">Nenhum chamado em andamento.</p>}
          {!!encerrados.length && (
            <>
              <h2 className="secao-titulo">Encerrados</h2>
              <div className="lista">{encerrados.slice(0, 20).map(linha)}</div>
            </>
          )}
        </>
      )}
    </>
  );
}

export function ChamadoCliente() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { empresa } = useSessao();
  const { dados: c, carregando, erro } = useDocumento<Chamado>(`chamados/${id}`);

  if (carregando) return <Carregando />;
  if (erro || !c) return <Vazio titulo="Chamado não encontrado" />;
  const recemAberto = params.get('novo') === '1';
  const historico = [...(c.historico ?? [])].sort((a, b) => b.em.toMillis() - a.em.toMillis());

  return (
    <>
      <CabecalhoPagina titulo={`Chamado nº ${c.numero}`} subtitulo={c.equipamentoDescricao} voltar="/portal" />
      {recemAberto && (
        <Aviso tom="sucesso">
          <strong>Chamado aberto!</strong> A empresa foi avisada e vai entrar em contato para agendar.
          {empresa?.whatsapp && (
            <div className="acoes">
              <Botao
                variante="whatsapp"
                icone="whatsapp"
                onClick={() =>
                  abrirWhatsApp(
                    empresa.whatsapp,
                    `Olá! Abri o chamado nº ${c.numero} no portal (${c.clienteNome}).\nEquipamento: ${c.equipamentoDescricao}\nParado: ${c.parado ? 'SIM' : 'não'}`,
                  )
                }
              >
                Avisar também pelo WhatsApp
              </Botao>
            </div>
          )}
        </Aviso>
      )}
      <Cartao titulo="Situação" acoes={<Selo tom={tomStatusChamado[c.status]}>{rotuloStatusChamado[c.status]}</Selo>}>
        <dl className="infos">
          <Info rotulo="Aberto em">{fmtDataHora(c.abertoEm)}</Info>
          <Info rotulo="Agendado para">{c.agendadoPara ? fmtDataHora(c.agendadoPara) : 'A definir'}</Info>
          <Info rotulo="Equipamento parado">{c.parado ? 'Sim' : 'Não'}</Info>
          <Info rotulo="Aberto por">{c.abertoPor?.nome}</Info>
        </dl>
        <div className="acoes-coluna">
          {c.status === 'concluido' && c.osId && (
            <>
              <BotaoVisualizarLaudo osId={c.osId} rotulo="Visualizar o laudo técnico" bloco />
              <BotaoLaudo osId={c.osId} rotulo="Baixar o laudo técnico (PDF)" bloco />
            </>
          )}
          <BotaoVisualizarChamado chamado={c} bloco />
        </div>
      </Cartao>
      <Cartao titulo="O que foi relatado">
        <p className="relato">{c.relato}</p>
        {c.contato && <p className="pequeno">Contato: {c.contato}</p>}
        {c.qtdFotos > 0 && (
          <div style={{ marginTop: 12 }}>
            <GaleriaFotos caminho={`chamados/${c.id}/fotos`} />
          </div>
        )}
      </Cartao>
      <Cartao titulo="Andamento">
        <ol className="tempo">
          {historico.map((h, i) => (
            <li key={i}>
              <strong>{rotuloStatusChamado[h.status]}</strong>
              {h.obs && <div>{h.obs}</div>}
              <small>
                {fmtDataHora(h.em)} · {h.por}
              </small>
            </li>
          ))}
        </ol>
      </Cartao>
      {empresa?.whatsapp && (
        <Botao variante="secundario" icone="whatsapp" bloco onClick={() => abrirWhatsApp(empresa.whatsapp, `Olá! Sobre o chamado nº ${c.numero} (${c.clienteNome}):`)}>
          Falar com a empresa sobre este chamado
        </Botao>
      )}
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta } from '../../dados/hooks';
import type { Chamado, OrdemServico } from '../../tipos';
import { fmtDataHora, fmtRelativo, numeroOS, rotuloStatusOS, rotuloTipoOS, tomStatusOS } from '../../util/formato';
import { alertasAtivos, prepararAlertas, tocarAlerta } from '../../util/alerta';
import { Aviso, Botao, CabecalhoPagina, Carregando, Cartao, LinhaLista, LinkBotao, Selo } from '../../componentes/ui';
import { QuadroAtencao } from '../../componentes/Atencao';

function AtivarAlertas() {
  const [ativo, setAtivo] = useState(alertasAtivos());
  if (ativo) return null;
  return (
    <Aviso tom="info">
      Ative os alertas para ouvir um som e receber notificação quando um cliente abrir chamado (com o app aberto).
      <div className="acoes">
        <Botao
          variante="secundario"
          icone="sino"
          onClick={() =>
            void prepararAlertas().then((p) => {
              tocarAlerta();
              setAtivo(p === 'granted');
            })
          }
        >
          Ativar alertas
        </Botao>
      </div>
    </Aviso>
  );
}

function rotuloDia(d: Date): string {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = new Date(d);
  dia.setHours(0, 0, 0, 0);
  const dif = Math.round((dia.getTime() - hoje.getTime()) / 86400000);
  if (dif < 0) return 'Atrasadas';
  if (dif === 0) return 'Hoje';
  if (dif === 1) return 'Amanhã';
  return dia.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

export function Painel() {
  const { perfil } = useSessao();
  const chamados = useConsulta<Chamado>(() => query(collection(db, 'chamados'), orderBy('numero', 'desc'), limit(100)), []);
  const ordens = useConsulta<OrdemServico>(() => query(collection(db, 'os'), where('status', 'in', ['aberta', 'em_execucao'])), []);

  const abertos = chamados.itens.filter((c) => c.status === 'aberto');
  const agendados = chamados.itens.filter((c) => c.status === 'agendado');
  const emAtendimento = chamados.itens.filter((c) => c.status === 'em_atendimento');
  const aguardando = chamados.itens.filter((c) => c.status === 'aguardando');

  const agenda = [...ordens.itens].sort(
    (a, b) => (a.agendadaPara?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (b.agendadaPara?.toMillis() ?? Number.MAX_SAFE_INTEGER),
  );
  const grupos = new Map<string, OrdemServico[]>();
  for (const o of agenda) {
    const chave = o.status === 'em_execucao' ? 'Em execução agora' : o.agendadaPara ? rotuloDia(o.agendadaPara.toDate()) : 'Sem data marcada';
    grupos.set(chave, [...(grupos.get(chave) ?? []), o]);
  }
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <CabecalhoPagina titulo={`Olá, ${perfil?.nome?.split(' ')[0] ?? ''}`} subtitulo={hoje} />
      <AtivarAlertas />
      {(chamados.erro || ordens.erro) && <Aviso tom="erro">{mensagemErro(chamados.erro ?? ordens.erro)}</Aviso>}
      <div className="resumo">
        <Link to="/interno/chamados?f=aberto" className={`resumo-item ${abertos.length ? 'alerta' : ''}`}>
          <strong>{abertos.length}</strong>
          <span>Novos chamados</span>
        </Link>
        <Link to="/interno/chamados?f=agendado" className="resumo-item">
          <strong>{agendados.length}</strong>
          <span>Agendados</span>
        </Link>
        <Link to="/interno/chamados?f=em_atendimento" className="resumo-item">
          <strong>{emAtendimento.length}</strong>
          <span>Em atendimento</span>
        </Link>
        <Link to="/interno/chamados?f=aguardando" className="resumo-item">
          <strong>{aguardando.length}</strong>
          <span>Aguardando peça</span>
        </Link>
      </div>
      <div className="acoes" style={{ marginTop: 0, marginBottom: 14 }}>
        <LinkBotao para="/interno/chamados/novo" variante="secundario" icone="chamados">Registrar chamado</LinkBotao>
        <LinkBotao para="/interno/os/nova" variante="secundario" icone="chave">Nova OS</LinkBotao>
      </div>

      <Cartao titulo="Novos chamados">
        {chamados.carregando ? (
          <Carregando />
        ) : !abertos.length ? (
          <p className="pequeno">Nenhum chamado esperando agendamento.</p>
        ) : (
          <div className="lista">
            {abertos.map((c) => (
              <LinhaLista
                key={c.id}
                para={`/interno/chamados/${c.id}`}
                titulo={`Nº ${c.numero} · ${c.clienteNome}`}
                detalhe={`${c.equipamentoDescricao} · ${fmtRelativo(c.abertoEm)}`}
                lateral={c.parado ? <Selo tom="perigo">Parado</Selo> : <Selo tom="alerta">Novo</Selo>}
              />
            ))}
          </div>
        )}
      </Cartao>

      <QuadroAtencao />

      <Cartao titulo="Agenda de atendimentos">
        {ordens.carregando ? (
          <Carregando />
        ) : !agenda.length ? (
          <p className="pequeno">Nenhuma OS em aberto.</p>
        ) : (
          [...grupos.entries()].map(([dia, lista]) => (
            <div key={dia}>
              <h3 className="secao-titulo" style={{ marginTop: 8 }}>{dia}</h3>
              <div className="lista">
                {lista.map((o) => (
                  <LinhaLista
                    key={o.id}
                    para={`/interno/os/${o.id}`}
                    titulo={`${o.agendadaPara ? fmtDataHora(o.agendadaPara).split(' ')[1] + ' · ' : ''}${o.cliente.nome}`}
                    detalhe={`OS ${numeroOS(o.numero)} · ${rotuloTipoOS[o.tipo]} · ${o.equipamento.tipoNome}`}
                    lateral={<Selo tom={tomStatusOS[o.status]}>{rotuloStatusOS[o.status]}</Selo>}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </Cartao>

      {!!aguardando.length && (
        <Cartao titulo="Aguardando peça ou aprovação">
          <div className="lista">
            {aguardando.map((c) => (
              <LinhaLista key={c.id} para={`/interno/chamados/${c.id}`} titulo={`Nº ${c.numero} · ${c.clienteNome}`} detalhe={c.equipamentoDescricao} />
            ))}
          </div>
        </Cartao>
      )}
    </>
  );
}

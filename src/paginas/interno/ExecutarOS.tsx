// Execução da OS no celular do técnico. Funciona sem internet: tudo é salvo no aparelho e sincroniza depois.
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSessao } from '../../sessao';
import { mensagemErro, useDocumento } from '../../dados/hooks';
import { adicionarFotoOS, concluirOS, iniciarOS, removerFotoOS, salvarOS } from '../../dados/operacoes';
import type { Cliente, OrdemServico, ResultadoItem } from '../../tipos';
import { fmtDataHora, numeroOS, rotuloStatusOS, rotuloTipoOS, tomStatusOS } from '../../util/formato';
import { arrayRemove, arrayUnion } from 'firebase/firestore';
import { avaliarMedicao, ordenados } from '../../util/medicao';
import { abrirWhatsApp } from '../../util/whatsapp';
import { PadAssinatura, type AssinaturaRef } from '../../componentes/Assinatura';
import { GaleriaFotos } from '../../componentes/Fotos';
import { Icone } from '../../componentes/Icone';
import { BotaoLaudo } from '../../componentes/Laudo';
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, IndicadorSincronia, Info, Selo, Vazio } from '../../componentes/ui';

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
        <Pecas os={os} editavel={editavel} />
        <TextoOS
          rotulo="Instrumentos utilizados"
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
          <BotaoLaudo os={os} rotulo="Pré-visualizar laudo (rascunho)" bloco />
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

function Pecas({ os, editavel }: { os: OrdemServico; editavel: boolean }) {
  const [descricao, setDescricao] = useState('');
  const [qtd, setQtd] = useState('1');
  const pecas = os.pecas ?? [];
  const incluir = () => {
    if (!descricao.trim()) return;
    const peca = { id: crypto.randomUUID().slice(0, 8), descricao: descricao.trim(), quantidade: Math.max(1, Number(qtd) || 1) };
    salvarOS(os.id, { pecas: arrayUnion(peca) });
    setDescricao('');
    setQtd('1');
  };
  return (
    <div className="campo">
      <span className="campo-rotulo">Peças substituídas</span>
      {!pecas.length && !editavel && <span className="pequeno">Nenhuma.</span>}
      {pecas.map((p, i) => (
        <div className="editor-linha" key={p.id ?? i}>
          <span style={{ flex: 1 }}>
            {p.quantidade} × {p.descricao}
          </span>
          {editavel && (
            <button type="button" className="icone-botao" aria-label="Remover peça" onClick={() => salvarOS(os.id, { pecas: arrayRemove(p) })}>
              <Icone nome="lixo" tamanho={18} />
            </button>
          )}
        </div>
      ))}
      {editavel && (
        <div className="editor-linha">
          <input placeholder="Peça (ex.: guarnição da porta)" value={descricao} onChange={(e) => setDescricao(e.target.value)} aria-label="Descrição da peça" />
          <input className="curto" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label="Quantidade" />
          <Botao type="button" variante="secundario" onClick={incluir}>
            Incluir
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
        <BotaoLaudo os={os} rotulo="Gerar laudo e enviar" bloco />
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

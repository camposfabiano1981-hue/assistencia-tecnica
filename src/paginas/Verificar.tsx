// Página pública de autenticidade: o QR do laudo abre /v/CODIGO. Sem login, só dados não sensíveis.
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useDocumento } from '../dados/hooks';
import type { ConfigPublica, Verificacao } from '../tipos';
import { fmtDataHora, numeroOS } from '../util/formato';
import { codigoValido, formatarCodigo, normalizarCodigo } from '../util/verificacao';
import { linkWhatsApp } from '../util/whatsapp';
import { Aviso, Botao, Campo, Carregando, Cartao, Info } from '../componentes/ui';
import { Icone } from '../componentes/Icone';

export function Verificar() {
  const { codigo = '' } = useParams();
  const navegar = useNavigate();
  const limpo = normalizarCodigo(codigo);
  const valido = codigoValido(limpo);
  const v = useDocumento<Verificacao>(valido ? `verificacoes/${limpo}` : null);
  const publico = useDocumento<ConfigPublica>('config/publico');
  const [digitado, setDigitado] = useState('');

  function conferir(e: FormEvent) {
    e.preventDefault();
    const c = normalizarCodigo(digitado);
    if (c) navegar(`/v/${c}`);
  }

  const equipamento = v.dados
    ? [v.dados.equipamento.tipoNome, v.dados.equipamento.fabricante, v.dados.equipamento.modelo, v.dados.equipamento.numeroSerie && `série ${v.dados.equipamento.numeroSerie}`]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="tela-cheia">
      <div className="caixa-entrada">
        <div className="marca-entrada">
          <img src="/pwa-192.png" alt="" />
          <h1>{publico.dados?.nome || 'Assistência Técnica'}</h1>
          <p>Conferência de autenticidade de laudo técnico</p>
        </div>

        {codigo &&
          (v.carregando ? (
            <Carregando texto="Conferindo…" />
          ) : v.dados ? (
            <Cartao>
              <Aviso tom="sucesso">
                <strong>Laudo autêntico.</strong> O código {formatarCodigo(limpo)} foi emitido pelo sistema de {v.dados.empresa.nome}.
              </Aviso>
              <dl className="infos">
                <Info rotulo="Laudo / OS">{`nº ${numeroOS(v.dados.osNumero)} · ${v.dados.tipoOS}`}</Info>
                <Info rotulo="Cliente">{v.dados.clienteNome}</Info>
                <Info rotulo="Equipamento">{equipamento}</Info>
                <Info rotulo="Concluído em">{fmtDataHora(v.dados.concluidaEm)}</Info>
                <Info rotulo="Técnico">{v.dados.tecnicoNome}</Info>
                <Info rotulo="Situação do equipamento">
                  {v.dados.liberado ? 'Liberado para uso' : v.dados.liberado === false ? 'Não liberado para uso' : '—'}
                </Info>
                <Info rotulo="Prestador do serviço">{[v.dados.empresa.nome, v.dados.empresa.documento].filter(Boolean).join(' · ')}</Info>
              </dl>
              <p className="pequeno" style={{ marginBottom: 0 }}>
                Compare estes dados com o laudo em mãos. Se algo estiver diferente, o documento pode ter sido alterado.
              </p>
            </Cartao>
          ) : (
            <Aviso tom="erro">
              <strong>Código não encontrado.</strong> Confira se digitou certo. Se estiver certo, este laudo pode não ser autêntico: fale com a
              empresa.
            </Aviso>
          ))}

        <Cartao titulo={codigo ? 'Conferir outro código' : 'Conferir um laudo'}>
          <form onSubmit={conferir}>
            <Campo
              rotulo="Código de verificação"
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              ajuda="Está no fim do laudo, ao lado do QR code."
            />
            <Botao type="submit" icone="check">
              Conferir
            </Botao>
          </form>
        </Cartao>

        {publico.dados?.whatsapp && (
          <a className="botao botao-whatsapp botao-bloco" href={linkWhatsApp(publico.dados.whatsapp, 'Olá! Quero confirmar um laudo técnico.')} target="_blank" rel="noreferrer">
            <Icone nome="whatsapp" tamanho={20} />
            <span>Falar com a empresa</span>
          </a>
        )}
      </div>
    </div>
  );
}

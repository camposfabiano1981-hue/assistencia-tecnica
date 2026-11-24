// Avaliação do atendimento: estrelas para exibir e o formulário do cliente no portal.
import { useState } from 'react';
import { useSessao } from '../sessao';
import { mensagemErro, useDocumento } from '../dados/hooks';
import { ROTULO_NOTA, avaliarAtendimento } from '../dados/avaliacoes';
import type { Avaliacao, OrdemServico } from '../tipos';
import { numeroOS } from '../util/formato';
import { AreaTexto, Aviso, Botao, Carregando, Cartao } from './ui';

/** Estrelas só para leitura (ex.: ★★★★☆). */
export function Estrelas({ nota, tamanho = '1.1rem' }: { nota: number; tamanho?: string }) {
  return (
    <span className="estrelas-leitura" style={{ fontSize: tamanho }} role="img" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= nota ? 'cheia' : 'vazia'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

/** Cartão do portal: o cliente avalia uma OS concluída (uma vez) ou vê a avaliação que já fez. */
export function AvaliarAtendimento({ osId, destaque }: { osId: string; destaque?: boolean }) {
  const { perfil } = useSessao();
  const os = useDocumento<OrdemServico>(`os/${osId}`);
  const feita = useDocumento<Avaliacao>(`avaliacoes/${osId}`);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  if (os.carregando || feita.carregando) return <Carregando />;
  if (!os.dados || os.dados.status !== 'concluida') return null;

  if (feita.dados) {
    return (
      <Cartao titulo="Sua avaliação">
        <p style={{ margin: 0 }}>
          <Estrelas nota={feita.dados.nota} tamanho="1.4rem" /> <strong>{ROTULO_NOTA[feita.dados.nota]}</strong>
        </p>
        {feita.dados.comentario && <p className="relato">{feita.dados.comentario}</p>}
        <p className="pequeno" style={{ marginBottom: 0 }}>
          Obrigado! A sua opinião ajuda a melhorar o atendimento.
        </p>
      </Cartao>
    );
  }

  async function enviar() {
    if (!perfil || !os.dados) return;
    if (!nota) return setErro('Escolha de 1 a 5 estrelas.');
    setErro('');
    setEnviando(true);
    try {
      await avaliarAtendimento(os.dados, nota, comentario, { uid: perfil.id, nome: perfil.nome });
    } catch (e) {
      setErro(mensagemErro(e));
      setEnviando(false);
    }
  }

  return (
    <Cartao titulo="Como foi o atendimento?" className={destaque ? 'cartao-destaque' : ''}>
      <p className="pequeno" style={{ marginTop: 0 }}>
        OS {numeroOS(os.dados.numero)} · técnico {os.dados.tecnicoNome}. Leva 10 segundos.
      </p>
      <div className="estrelas" role="radiogroup" aria-label="Nota do atendimento">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={nota === n}
            aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}: ${ROTULO_NOTA[n]}`}
            className={n <= nota ? 'cheia' : ''}
            onClick={() => setNota(n)}
          >
            ★
          </button>
        ))}
      </div>
      <p className="pequeno" style={{ minHeight: '1.2em' }} aria-live="polite">
        {nota ? ROTULO_NOTA[nota] : ''}
      </p>
      <AreaTexto rotulo="Comentário (opcional)" rows={3} maxLength={1000} value={comentario} onChange={(e) => setComentario(e.target.value)} />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Botao icone="check" carregando={enviando} onClick={() => void enviar()}>
        Enviar avaliação
      </Botao>
    </Cartao>
  );
}

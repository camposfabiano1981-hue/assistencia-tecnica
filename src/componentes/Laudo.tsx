// Botão que gera o laudo em PDF e abre o compartilhamento (WhatsApp) ou baixa o arquivo.
import { useState } from 'react';
import { useSessao } from '../sessao';
import { mensagemErro } from '../dados/hooks';
import { compartilharArquivo } from '../util/whatsapp';
import type { OrdemServico } from '../tipos';
import { documentoDoLaudo } from './Documentos';
import { Aviso, Botao } from './ui';

export function BotaoLaudo({ os, osId, rotulo = 'Laudo em PDF', bloco }: { os?: OrdemServico; osId?: string; rotulo?: string; bloco?: boolean }) {
  const { empresa } = useSessao();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState<{ arquivo: File; texto: string } | null>(null);

  async function gerar() {
    setErro('');
    setGerando(true);
    try {
      const { arquivo, texto } = await documentoDoLaudo(empresa, os, osId);
      const r = await compartilharArquivo(arquivo, texto);
      if (r === 'bloqueado') setPronto({ arquivo, texto });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {pronto ? (
        <Botao
          variante="whatsapp"
          icone="whatsapp"
          bloco={bloco}
          onClick={() => {
            void compartilharArquivo(pronto.arquivo, pronto.texto);
            setPronto(null);
          }}
        >
          Compartilhar laudo
        </Botao>
      ) : (
        <Botao variante="secundario" icone="pdf" carregando={gerando} onClick={gerar} bloco={bloco}>
          {gerando ? 'Gerando laudo…' : rotulo}
        </Botao>
      )}
    </>
  );
}

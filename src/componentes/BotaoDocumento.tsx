// Gera um PDF (orçamento, fatura…) e abre o compartilhamento do celular ou baixa o arquivo.
import { useState } from 'react';
import { mensagemErro } from '../dados/hooks';
import { compartilharArquivo } from '../util/whatsapp';
import { Aviso, Botao } from './ui';

export function BotaoDocumento({ gerar, texto, rotulo, bloco }: { gerar: () => Promise<File>; texto: string; rotulo: string; bloco?: boolean }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [pendente, setPendente] = useState<File | null>(null);

  async function clicar() {
    setErro('');
    setGerando(true);
    try {
      const arquivo = await gerar();
      if ((await compartilharArquivo(arquivo, texto)) === 'bloqueado') setPendente(arquivo);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {pendente ? (
        <Botao
          variante="whatsapp"
          icone="whatsapp"
          bloco={bloco}
          onClick={() => {
            void compartilharArquivo(pendente, texto);
            setPendente(null);
          }}
        >
          Compartilhar PDF
        </Botao>
      ) : (
        <Botao variante="secundario" icone="pdf" carregando={gerando} onClick={clicar} bloco={bloco}>
          {gerando ? 'Gerando…' : rotulo}
        </Botao>
      )}
    </>
  );
}

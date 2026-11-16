// Botão que gera o laudo em PDF e abre o compartilhamento (WhatsApp) ou baixa o arquivo.
import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useSessao } from '../sessao';
import { carregarFotos } from '../dados/operacoes';
import { mensagemErro } from '../dados/hooks';
import { compartilharArquivo } from '../util/whatsapp';
import { numeroOS } from '../util/formato';
import type { OrdemServico } from '../tipos';
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
      let alvo = os;
      if (!alvo && osId) {
        const s = await getDoc(doc(db, 'os', osId));
        if (!s.exists()) throw new Error('Laudo não encontrado.');
        alvo = { id: s.id, ...s.data() } as OrdemServico;
      }
      if (!alvo) return;
      const fotos = await carregarFotos(`os/${alvo.id}/fotos`);
      const { gerarLaudo } = await import('../util/laudo');
      const arquivo = await gerarLaudo(alvo, empresa, fotos);
      const texto = `Laudo técnico - OS nº ${numeroOS(alvo.numero)} - ${alvo.equipamento.tipoNome}`;
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

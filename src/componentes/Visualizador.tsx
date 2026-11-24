// Mostra um PDF na tela, com as páginas desenhadas pelo pdf.js, e oferece enviar, baixar ou imprimir.
// Necessário no celular: o Chrome do Android não exibe PDF dentro da página.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mensagemErro } from '../dados/hooks';
import { baixarArquivo } from '../util/csv';
import { compartilharArquivo } from '../util/whatsapp';
import { Icone } from './Icone';
import { Aviso, Botao } from './ui';

export interface Documento {
  arquivo: File;
  /** Texto que acompanha o arquivo ao enviar (WhatsApp, e-mail…). */
  texto: string;
}

async function desenhar(arquivo: File, caixa: HTMLElement, largura: number, cancelado: () => boolean) {
  // Carregado só quando alguém abre um documento (o pdf.js é grande).
  const [pdfjs, { default: urlWorker }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = urlWorker;
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });
  try {
    const pdf = await tarefa.promise;
    const nitidez = Math.min(window.devicePixelRatio || 1, 3);
    for (let n = 1; n <= pdf.numPages && !cancelado(); n++) {
      const pagina = await pdf.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: (largura / base.width) * nitidez });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${largura}px`;
      canvas.className = 'visualizador-pagina';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Página ${n} de ${pdf.numPages}`);
      caixa.appendChild(canvas);
      await pagina.render({ canvas, viewport }).promise;
    }
  } finally {
    void tarefa.destroy();
  }
}

function abrirParaImprimir(arquivo: File) {
  const url = URL.createObjectURL(arquivo);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function VisualizadorPDF({ arquivo, texto, aoFechar }: Documento & { aoFechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'abrindo' | 'pronto' | 'erro'>('abrindo');
  const [erro, setErro] = useState('');
  // No celular, "Enviar" abre WhatsApp, e-mail etc.; no computador sem compartilhamento, sobra "Imprimir".
  const podeEnviar = typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let cancelado = false;
    el.replaceChildren();
    setEstado('abrindo');
    const largura = Math.max(240, Math.min(el.clientWidth, 820));
    desenhar(arquivo, el, largura, () => cancelado)
      .then(() => {
        if (!cancelado) setEstado('pronto');
      })
      .catch((e) => {
        if (cancelado) return;
        setErro(mensagemErro(e));
        setEstado('erro');
      });
    return () => {
      cancelado = true;
      el.replaceChildren();
    };
  }, [arquivo]);

  // Fecha com Esc e trava a rolagem da página de trás.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = antes;
    };
  }, [aoFechar]);

  return createPortal(
    <div className="visualizador" role="dialog" aria-modal="true" aria-label={`Documento ${arquivo.name}`}>
      <header className="visualizador-topo">
        <span className="visualizador-nome">{arquivo.name}</span>
        <button type="button" className="icone-botao" aria-label="Fechar" onClick={aoFechar} autoFocus>
          <Icone nome="x" tamanho={22} />
        </button>
      </header>
      <div className="visualizador-corpo">
        {estado === 'abrindo' && (
          <p className="visualizador-status" role="status">
            Abrindo o documento…
          </p>
        )}
        {estado === 'erro' && <Aviso tom="erro">Não foi possível mostrar o documento ({erro}). Use Baixar para abrir no aparelho.</Aviso>}
        <div ref={caixa} className="visualizador-paginas" />
      </div>
      <footer className="visualizador-acoes">
        {podeEnviar && (
          <Botao variante="whatsapp" icone="whatsapp" onClick={() => void compartilharArquivo(arquivo, texto)}>
            Enviar
          </Botao>
        )}
        <Botao variante="secundario" icone="pdf" onClick={() => baixarArquivo(arquivo.name, arquivo, 'application/pdf')}>
          Baixar
        </Botao>
        {!podeEnviar && (
          <Botao variante="secundario" icone="impressora" onClick={() => abrirParaImprimir(arquivo)}>
            Imprimir
          </Botao>
        )}
      </footer>
    </div>,
    document.body,
  );
}

/** Botão "Visualizar": gera o documento e abre na tela. */
export function BotaoVisualizar({ gerar, rotulo, bloco }: { gerar: () => Promise<Documento>; rotulo: string; bloco?: boolean }) {
  const [gerando, setGerando] = useState(false);
  const [aberto, setAberto] = useState<Documento | null>(null);
  const [erro, setErro] = useState('');
  const fechar = useCallback(() => setAberto(null), []);

  async function abrir() {
    setErro('');
    setGerando(true);
    try {
      setAberto(await gerar());
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Botao variante="secundario" icone="olho" carregando={gerando} bloco={bloco} onClick={() => void abrir()}>
        {rotulo}
      </Botao>
      {aberto && <VisualizadorPDF arquivo={aberto.arquivo} texto={aberto.texto} aoFechar={fechar} />}
    </>
  );
}

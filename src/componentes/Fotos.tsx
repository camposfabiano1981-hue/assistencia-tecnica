// Seleção de fotos (câmera) com compressão, e galeria das fotos salvas.
import { useState } from 'react';
import { collection, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useConsulta } from '../dados/hooks';
import { comprimirImagem } from '../util/imagem';
import type { Foto } from '../tipos';
import { Icone } from './Icone';
import { Aviso, Carregando, useUrlImagem } from './ui';

function Miniatura({ bytes, aoRemover, rotulo }: { bytes: Uint8Array | Foto['imagem']; aoRemover?: () => void; rotulo?: string }) {
  const url = useUrlImagem(bytes instanceof Uint8Array ? null : bytes);
  const [urlLocal] = useState(() =>
    bytes instanceof Uint8Array ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' })) : null,
  );
  const src = urlLocal ?? url;
  return (
    <div className="foto">
      {src && (
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={rotulo ?? 'Foto'} />
        </a>
      )}
      {aoRemover && (
        <button type="button" onClick={aoRemover} aria-label="Remover foto">
          <Icone nome="x" tamanho={16} />
        </button>
      )}
    </div>
  );
}

/** Fotos ainda não enviadas (formulário do chamado). */
export function SeletorFotos({ fotos, aoMudar, max = 3 }: { fotos: Uint8Array[]; aoMudar: (f: Uint8Array[]) => void; max?: number }) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  async function escolher(lista: FileList | null) {
    if (!lista?.length) return;
    setErro('');
    setProcessando(true);
    try {
      const novas: Uint8Array[] = [];
      for (const arq of Array.from(lista).slice(0, max - fotos.length)) novas.push(await comprimirImagem(arq));
      aoMudar([...fotos, ...novas]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível usar a foto.');
    } finally {
      setProcessando(false);
    }
  }
  return (
    <div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <div className="fotos">
        {fotos.map((f, i) => (
          <Miniatura key={i} bytes={f} aoRemover={() => aoMudar(fotos.filter((_, j) => j !== i))} />
        ))}
        {fotos.length < max && (
          <label className="foto-adicionar">
            {processando ? <span className="giro" /> : <Icone nome="camera" tamanho={26} />}
            <span>{processando ? 'Processando' : 'Adicionar foto'}</span>
            <input type="file" accept="image/*" multiple onChange={(e) => { void escolher(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
    </div>
  );
}

/** Fotos já salvas em uma subcoleção (chamados/{n}/fotos ou os/{n}/fotos). */
export function GaleriaFotos({ caminho, aoRemover, aoAdicionar }: { caminho: string; aoRemover?: (id: string) => void; aoAdicionar?: (bytes: Uint8Array) => void }) {
  const { itens, carregando, erro } = useConsulta<Foto>(() => query(collection(db, caminho)), [caminho]);
  const [processando, setProcessando] = useState(false);
  const [falha, setFalha] = useState('');
  const ordenadas = [...itens].sort((a, b) => (a.criadoEm?.toMillis() ?? Date.now()) - (b.criadoEm?.toMillis() ?? Date.now()));

  async function escolher(lista: FileList | null) {
    if (!lista?.length || !aoAdicionar) return;
    setFalha('');
    setProcessando(true);
    try {
      for (const arq of Array.from(lista)) aoAdicionar(await comprimirImagem(arq));
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível usar a foto.');
    } finally {
      setProcessando(false);
    }
  }

  if (carregando) return <Carregando texto="Carregando fotos…" />;
  if (erro) return <Aviso tom="erro">Não foi possível carregar as fotos.</Aviso>;
  if (!ordenadas.length && !aoAdicionar) return <p className="pequeno">Sem fotos.</p>;
  return (
    <div>
      {falha && <Aviso tom="erro">{falha}</Aviso>}
      <div className="fotos">
        {ordenadas.map((f) => (
          <Miniatura key={f.id} bytes={f.imagem} aoRemover={aoRemover ? () => aoRemover(f.id) : undefined} />
        ))}
        {aoAdicionar && (
          <label className="foto-adicionar">
            {processando ? <span className="giro" /> : <Icone nome="camera" tamanho={26} />}
            <span>{processando ? 'Processando' : 'Tirar foto'}</span>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => { void escolher(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
    </div>
  );
}

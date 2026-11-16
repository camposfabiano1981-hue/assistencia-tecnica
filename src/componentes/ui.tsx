// Componentes visuais básicos.
import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Bytes } from 'firebase/firestore';
import { Icone } from './Icone';
import type { Tom } from '../util/formato';

type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma' | 'whatsapp';

export function Botao({
  variante = 'primario',
  carregando,
  icone,
  bloco,
  children,
  className = '',
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean; icone?: string; bloco?: boolean }) {
  return (
    <button
      {...resto}
      disabled={resto.disabled || carregando}
      className={`botao botao-${variante} ${bloco ? 'botao-bloco' : ''} ${className}`}
    >
      {carregando ? <span className="giro" aria-hidden="true" /> : icone ? <Icone nome={icone} tamanho={20} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function LinkBotao({ para, variante = 'primario', icone, bloco, children }: { para: string; variante?: Variante; icone?: string; bloco?: boolean; children: ReactNode }) {
  return (
    <Link to={para} className={`botao botao-${variante} ${bloco ? 'botao-bloco' : ''}`}>
      {icone && <Icone nome={icone} tamanho={20} />}
      <span>{children}</span>
    </Link>
  );
}

function Moldura({ id, rotulo, ajuda, children }: { id: string; rotulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <div className="campo">
      <label htmlFor={id} className="campo-rotulo">
        {rotulo}
      </label>
      {children}
      {ajuda && (
        <span id={`${id}-ajuda`} className="campo-ajuda">
          {ajuda}
        </span>
      )}
    </div>
  );
}

export function Campo({ rotulo, ajuda, id, ...resto }: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; ajuda?: string }) {
  const automatico = useId();
  const i = id ?? automatico;
  return (
    <Moldura id={i} rotulo={rotulo} ajuda={ajuda}>
      <input id={i} aria-describedby={ajuda ? `${i}-ajuda` : undefined} {...resto} />
    </Moldura>
  );
}

export function AreaTexto({ rotulo, ajuda, id, ...resto }: TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo: string; ajuda?: string }) {
  const automatico = useId();
  const i = id ?? automatico;
  return (
    <Moldura id={i} rotulo={rotulo} ajuda={ajuda}>
      <textarea id={i} rows={4} aria-describedby={ajuda ? `${i}-ajuda` : undefined} {...resto} />
    </Moldura>
  );
}

export function Selecao({ rotulo, ajuda, id, children, ...resto }: SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string; ajuda?: string }) {
  const automatico = useId();
  const i = id ?? automatico;
  return (
    <Moldura id={i} rotulo={rotulo} ajuda={ajuda}>
      <select id={i} aria-describedby={ajuda ? `${i}-ajuda` : undefined} {...resto}>
        {children}
      </select>
    </Moldura>
  );
}

export function Cartao({ titulo, acoes, children, className = '' }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`cartao ${className}`}>
      {(titulo || acoes) && (
        <header className="cartao-topo">
          {titulo && <h2>{titulo}</h2>}
          {acoes && <div className="cartao-acoes">{acoes}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Selo({ tom = 'neutro', children }: { tom?: Tom; children: ReactNode }) {
  return <span className={`selo selo-${tom}`}>{children}</span>;
}

export function Aviso({ tom = 'info', children }: { tom?: 'info' | 'sucesso' | 'erro' | 'alerta'; children: ReactNode }) {
  return (
    <div className={`aviso aviso-${tom}`} role={tom === 'erro' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="carregando" role="status">
      <span className="giro" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

export function TelaCarregando() {
  return (
    <div className="tela-cheia">
      <Carregando />
    </div>
  );
}

export function Vazio({ icone = 'lista', titulo, children }: { icone?: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="vazio">
      <Icone nome={icone} tamanho={36} />
      <strong>{titulo}</strong>
      {children && <div className="vazio-texto">{children}</div>}
    </div>
  );
}

export function CabecalhoPagina({ titulo, subtitulo, voltar, acoes }: { titulo: ReactNode; subtitulo?: ReactNode; voltar?: string | true; acoes?: ReactNode }) {
  const navegar = useNavigate();
  return (
    <div className="cabecalho">
      {voltar && (
        <button
          type="button"
          className="cabecalho-voltar"
          aria-label="Voltar"
          onClick={() => (voltar === true ? navegar(-1) : navegar(voltar))}
        >
          <Icone nome="voltar" />
        </button>
      )}
      <div className="cabecalho-texto">
        <h1>{titulo}</h1>
        {subtitulo && <p>{subtitulo}</p>}
      </div>
      {acoes && <div className="cabecalho-acoes">{acoes}</div>}
    </div>
  );
}

export function LinhaLista({ para, titulo, detalhe, lateral }: { para: string; titulo: ReactNode; detalhe?: ReactNode; lateral?: ReactNode }) {
  return (
    <Link to={para} className="linha">
      <div className="linha-texto">
        <div className="linha-titulo">{titulo}</div>
        {detalhe && <div className="linha-detalhe">{detalhe}</div>}
      </div>
      {lateral && <div className="linha-lateral">{lateral}</div>}
      <Icone nome="seta" tamanho={18} className="linha-seta" />
    </Link>
  );
}

export function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="info">
      <dt>{rotulo}</dt>
      <dd>{children || '—'}</dd>
    </div>
  );
}

/** URL temporária para exibir imagem guardada como Bytes no Firestore. */
export function useUrlImagem(bytes?: Bytes | null, tipo = 'image/jpeg'): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(new Blob([bytes.toUint8Array() as BlobPart], { type: tipo }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes, tipo]);
  return url;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function IndicadorSincronia({ pendente }: { pendente: boolean }) {
  const online = useOnline();
  if (!online) return <Selo tom="laranja">Sem internet · salvo no aparelho</Selo>;
  if (pendente) return <Selo tom="info">Sincronizando…</Selo>;
  return <Selo tom="sucesso">Sincronizado</Selo>;
}

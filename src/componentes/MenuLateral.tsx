// Menu vertical à esquerda: fixo no computador e em gaveta no celular.
// Cada grupo abre um submenu; só um grupo fica aberto por vez (o da página atual, ao navegar).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, matchPath, useLocation } from 'react-router';
import { Icone } from './Icone';
import type { Permissao } from '../acessos';

export interface ItemMenu {
  rotulo: string;
  para: string;
  icone?: string;
  /** Só fica marcado no caminho exato (ex.: Início). */
  fim?: boolean;
  /** Outros caminhos que também marcam este item (ex.: detalhe de um chamado). */
  tambem?: string[];
  destaque?: boolean;
  /** Nível de acesso exigido para aparecer no menu. */
  permissao?: Permissao;
}

export interface GrupoMenu {
  id: string;
  rotulo: string;
  icone: string;
  itens: ItemMenu[];
  permissao?: Permissao;
}

export type EntradaMenu = ItemMenu | GrupoMenu;

export const ehGrupo = (e: EntradaMenu): e is GrupoMenu => 'itens' in e;

export function itemAtivo(item: ItemMenu, caminho: string): boolean {
  if (matchPath({ path: item.para, end: !!item.fim }, caminho)) return true;
  return (item.tambem ?? []).some((p) => !!matchPath({ path: p, end: false }, caminho));
}

function Item({ item, caminho, aoNavegar }: { item: ItemMenu; caminho: string; aoNavegar: () => void }) {
  const ativo = itemAtivo(item, caminho);
  return (
    <NavLink
      to={item.para}
      end={item.fim}
      className={`menu-item${ativo ? ' active' : ''}${item.destaque ? ' menu-destaque' : ''}`}
      aria-current={ativo ? 'page' : undefined}
      onClick={aoNavegar}
    >
      {item.icone && <Icone nome={item.icone} tamanho={20} />}
      <span>{item.rotulo}</span>
    </NavLink>
  );
}

export function MenuLateral({
  entradas,
  cabeca,
  rodape,
  aberto,
  aoFechar,
}: {
  entradas: EntradaMenu[];
  cabeca: ReactNode;
  rodape: ReactNode;
  /** Gaveta aberta (só no celular; no computador o menu fica sempre à vista). */
  aberto: boolean;
  aoFechar: () => void;
}) {
  const { pathname } = useLocation();
  const grupoDaPagina = entradas.filter(ehGrupo).find((g) => g.itens.some((i) => itemAtivo(i, pathname)))?.id ?? null;
  const [grupoAberto, setGrupoAberto] = useState<string | null>(grupoDaPagina);
  const [ultimoGrupoDaPagina, setUltimoGrupoDaPagina] = useState(grupoDaPagina);
  if (ultimoGrupoDaPagina !== grupoDaPagina) {
    // Ao trocar de página por um link do conteúdo, o menu acompanha.
    setUltimoGrupoDaPagina(grupoDaPagina);
    setGrupoAberto(grupoDaPagina);
  }

  const fechar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    fechar.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aberto, aoFechar]);

  return (
    <aside id="menu-lateral" className="menu-lateral" data-aberto={aberto} aria-label="Menu">
      <div className="menu-cabeca">
        {cabeca}
        <button ref={fechar} type="button" className="menu-fechar" aria-label="Fechar menu" onClick={aoFechar}>
          <Icone nome="x" tamanho={22} />
        </button>
      </div>
      <nav className="menu-rolagem" aria-label="Menu principal">
        <ul className="menu-lista">
          {entradas.map((e) =>
            ehGrupo(e) ? (
              <li key={e.id}>
                <button
                  type="button"
                  className={`menu-item menu-grupo${grupoDaPagina === e.id ? ' menu-grupo-atual' : ''}`}
                  aria-expanded={grupoAberto === e.id}
                  aria-controls={`submenu-${e.id}`}
                  onClick={() => setGrupoAberto((g) => (g === e.id ? null : e.id))}
                >
                  <Icone nome={e.icone} tamanho={20} />
                  <span>{e.rotulo}</span>
                  <Icone nome="seta" tamanho={16} className="menu-grupo-seta" />
                </button>
                <ul id={`submenu-${e.id}`} className="menu-sub" hidden={grupoAberto !== e.id}>
                  {e.itens.map((i) => (
                    <li key={i.para}>
                      <Item item={i} caminho={pathname} aoNavegar={aoFechar} />
                    </li>
                  ))}
                </ul>
              </li>
            ) : (
              <li key={e.para}>
                <Item item={e} caminho={pathname} aoNavegar={aoFechar} />
              </li>
            ),
          )}
        </ul>
      </nav>
      <div className="menu-rodape">{rodape}</div>
    </aside>
  );
}

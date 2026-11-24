// Molduras das áreas interna (equipe) e do portal do cliente: menu lateral + conteúdo.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Icone } from './Icone';
import { MenuLateral, ehGrupo, type EntradaMenu } from './MenuLateral';
import { VigiaChamados } from './VigiaChamados';
import { Botao, LinkBotao, Selo, TelaCarregando, useOnline, useUrlImagem } from './ui';
import { useSessao } from '../sessao';
import { ROTULO_PAPEL, ehEquipe, pode, type Permissao } from '../acessos';
import type { Papel, Usuario } from '../tipos';

function useTelaLarga(): boolean {
  const consulta = '(min-width: 960px)';
  const [larga, setLarga] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(consulta).matches);
  useEffect(() => {
    const m = matchMedia(consulta);
    const mudar = () => setLarga(m.matches);
    mudar();
    m.addEventListener('change', mudar);
    return () => m.removeEventListener('change', mudar);
  }, []);
  return larga;
}

function Marca() {
  const { empresa } = useSessao();
  const logo = useUrlImagem(empresa?.logo, empresa?.logoTipo);
  const online = useOnline();
  return (
    <div className="marca">
      {logo ? <img src={logo} alt="" /> : <span className="marca-inicial" aria-hidden="true">{(empresa?.nome || 'A').slice(0, 1)}</span>}
      <span className="marca-nome">{empresa?.nome || 'Assistência Técnica'}</span>
      {!online && <Selo tom="laranja">Offline</Selo>}
    </div>
  );
}

function PessoaLogada() {
  const { perfil, sair } = useSessao();
  const iniciais = (perfil?.nome ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <>
      <span className="menu-avatar" aria-hidden="true">{iniciais}</span>
      <div className="menu-pessoa">
        <strong>{perfil?.nome}</strong>
        <span>{perfil ? ROTULO_PAPEL[perfil.papel] : ''}</span>
      </div>
      <button type="button" className="menu-sair" onClick={sair} aria-label="Sair" title="Sair">
        <Icone nome="sair" tamanho={20} />
      </button>
    </>
  );
}

/** Estrutura comum: menu lateral (gaveta no celular), barra do topo no celular e conteúdo. */
function Casca({ entradas, children }: { entradas: EntradaMenu[]; children: ReactNode }) {
  const larga = useTelaLarga();
  const [aberto, setAberto] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const [caminho, setCaminho] = useState(pathname);
  if (caminho !== pathname) {
    setCaminho(pathname);
    setAberto(false);
  }
  const gaveta = aberto && !larga;
  const fechar = useCallback(() => {
    setAberto(false);
    botaoMenu.current?.focus();
  }, []);

  useEffect(() => {
    if (!gaveta) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = antes;
    };
  }, [gaveta]);

  return (
    <div className="casca">
      <MenuLateral entradas={entradas} cabeca={<Marca />} rodape={<PessoaLogada />} aberto={gaveta} aoFechar={fechar} />
      {gaveta && <div className="menu-fundo" onClick={fechar} aria-hidden="true" />}
      <div className="area" inert={gaveta}>
        <header className="topo">
          <button
            ref={botaoMenu}
            type="button"
            className="topo-menu"
            aria-label="Abrir menu"
            aria-controls="menu-lateral"
            aria-expanded={gaveta}
            onClick={() => setAberto(true)}
          >
            <Icone nome="menu" tamanho={24} />
          </button>
          <Marca />
        </header>
        <main className="conteudo">{children}</main>
      </div>
    </div>
  );
}

/** Tira do menu o que o nível de acesso não permite (e os grupos que ficarem vazios). */
function filtrarMenu(entradas: EntradaMenu[], perfil: Usuario | null): EntradaMenu[] {
  const permitido = (i: EntradaMenu) => !i.permissao || pode(perfil, i.permissao);
  return entradas.flatMap((e): EntradaMenu[] => {
    if (!permitido(e)) return [];
    if (!ehGrupo(e)) return [e];
    const itens = e.itens.filter(permitido);
    return itens.length ? [{ ...e, itens }] : [];
  });
}

export const MENU_INTERNO: EntradaMenu[] = [
  { rotulo: 'Início', para: '/interno', icone: 'painel', fim: true },
  {
    id: 'atendimento',
    rotulo: 'Atendimento',
    icone: 'chamados',
    itens: [
      { rotulo: 'Chamados', para: '/interno/chamados' },
      { rotulo: 'Ordens de serviço', para: '/interno/os' },
      { rotulo: 'Vencimentos e preventivas', para: '/interno/vencimentos' },
      { rotulo: 'Etiquetas QR', para: '/interno/etiquetas' },
    ],
  },
  {
    id: 'financeiro',
    rotulo: 'Financeiro',
    icone: 'moeda',
    permissao: 'financeiro',
    itens: [
      { rotulo: 'Orçamentos', para: '/interno/orcamentos' },
      { rotulo: 'Faturas', para: '/interno/faturas' },
      { rotulo: 'Contratos', para: '/interno/contratos' },
    ],
  },
  {
    id: 'cadastros',
    rotulo: 'Cadastros',
    icone: 'lista',
    itens: [
      { rotulo: 'Clientes', para: '/interno/clientes' },
      { rotulo: 'Equipamentos', para: '/interno/equipamentos' },
      { rotulo: 'Serviços e preços', para: '/interno/servicos' },
      { rotulo: 'Peças e estoque', para: '/interno/estoque' },
      { rotulo: 'Instrumentos', para: '/interno/instrumentos' },
      { rotulo: 'Tipos e checklists', para: '/interno/tipos' },
    ],
  },
  {
    id: 'relatorios',
    rotulo: 'Relatórios',
    icone: 'grafico',
    itens: [
      { rotulo: 'Indicadores', para: '/interno/indicadores' },
      { rotulo: 'Planilhas e backup', para: '/interno/backup', permissao: 'planilhas' },
    ],
  },
  {
    id: 'administracao',
    rotulo: 'Administração',
    icone: 'config',
    itens: [
      { rotulo: 'Configurações', para: '/interno/config', permissao: 'configuracoes' },
      { rotulo: 'Equipe e acessos', para: '/interno/equipe', permissao: 'equipe' },
    ],
  },
];

const MENU_PORTAL: EntradaMenu[] = [
  { rotulo: 'Meus chamados', para: '/portal', icone: 'chamados', fim: true, tambem: ['/portal/chamados', '/portal/avaliar'] },
  { rotulo: 'Abrir chamado', para: '/portal/novo', icone: 'mais_circulo', destaque: true },
  { rotulo: 'Meus equipamentos', para: '/portal/equipamentos', icone: 'caixa' },
  { rotulo: 'Pasta da VISA', para: '/portal/visa', icone: 'pdf' },
  { rotulo: 'Financeiro', para: '/portal/financeiro', icone: 'moeda', tambem: ['/portal/orcamentos', '/portal/faturas'] },
  { rotulo: 'Minha conta', para: '/portal/conta', icone: 'usuario' },
];

export function LayoutInterno() {
  const { perfil } = useSessao();
  return (
    <Casca entradas={filtrarMenu(MENU_INTERNO, perfil)}>
      <VigiaChamados />
      <Outlet />
    </Casca>
  );
}

export function LayoutPortal() {
  return (
    <Casca entradas={MENU_PORTAL}>
      <Outlet />
    </Casca>
  );
}

/** Protege rotas por papel; manda cada perfil para a sua área. */
export function ExigePapel({ papeis }: { papeis: Papel[] }) {
  const { usuario, perfil, carregando } = useSessao();
  const local = useLocation();
  if (carregando) return <TelaCarregando />;
  if (!usuario) return <Navigate to={`/login?volta=${encodeURIComponent(local.pathname + local.search)}`} replace />;
  if (!perfil || !perfil.ativo) return <AcessoPendente />;
  if (!papeis.includes(perfil.papel)) return <Navigate to={areaDoPerfil(perfil)} replace />;
  return <Outlet />;
}

/** Protege uma área dentro do app pelo nível de acesso (ex.: financeiro). */
export function ExigePermissao({ permissao }: { permissao: Permissao }) {
  const { perfil } = useSessao();
  if (pode(perfil, permissao)) return <Outlet />;
  return <SemAcesso />;
}

function SemAcesso() {
  const { perfil } = useSessao();
  return (
    <div className="cartao sem-acesso" role="alert">
      <Icone nome="olho" tamanho={28} />
      <h1>Área fora do seu nível de acesso</h1>
      <p>
        Você entrou como <strong>{perfil ? ROTULO_PAPEL[perfil.papel] : '—'}</strong>. Se precisar desta área, peça a um gestor
        para mudar o seu nível em Administração → Equipe e acessos.
      </p>
      <LinkBotao para="/interno" variante="secundario" icone="painel">
        Ir para o início
      </LinkBotao>
    </div>
  );
}

export function AcessoPendente() {
  const { usuario, sair } = useSessao();
  return (
    <div className="tela-cheia">
      <div className="caixa-entrada cartao">
        <h1 style={{ fontSize: '1.2rem', marginBottom: 8 }}>Acesso ainda não liberado</h1>
        <p>
          A conta <strong>{usuario?.email}</strong> existe, mas ainda não foi vinculada a um cadastro. Peça à
          empresa para liberar o seu acesso.
        </p>
        <Botao variante="secundario" icone="sair" onClick={sair} bloco>
          Sair
        </Botao>
      </div>
    </div>
  );
}

function areaDoPerfil(perfil: Usuario): string {
  return ehEquipe(perfil) ? '/interno' : '/portal';
}

/** Rota raiz: decide para onde ir. */
export function Inicio() {
  const { usuario, perfil, carregando } = useSessao();
  if (carregando) return <TelaCarregando />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (!perfil || !perfil.ativo) return <AcessoPendente />;
  return <Navigate to={areaDoPerfil(perfil)} replace />;
}

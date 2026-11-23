// Molduras das áreas interna (gestor/técnico) e do portal do cliente.
import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { Icone } from './Icone';
import { VigiaChamados } from './VigiaChamados';
import { Botao, Selo, TelaCarregando, useOnline, useUrlImagem } from './ui';
import { useSessao } from '../sessao';
import type { Papel } from '../tipos';

function Topo() {
  const { empresa, perfil } = useSessao();
  const logo = useUrlImagem(empresa?.logo, empresa?.logoTipo);
  const online = useOnline();
  return (
    <header className="topo">
      <div className="topo-marca">
        {logo && <img src={logo} alt="" />}
        <span>{empresa?.nome || 'Assistência Técnica'}</span>
      </div>
      <div className="topo-lado">
        {!online && <Selo tom="laranja">Offline</Selo>}
        <span className="pequeno" style={{ color: '#d6ecf3' }}>{perfil?.nome?.split(' ')[0]}</span>
      </div>
    </header>
  );
}

interface Aba {
  para: string;
  rotulo: string;
  icone: string;
  fim?: boolean;
  destaque?: boolean;
}

function Abas({ abas }: { abas: Aba[] }) {
  return (
    <nav className="abas" aria-label="Navegação principal">
      {abas.map((a) => (
        <NavLink key={a.para} to={a.para} end={a.fim} className={a.destaque ? 'aba-destaque' : undefined}>
          <Icone nome={a.icone} />
          <span>{a.rotulo}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function LayoutInterno() {
  return (
    <div className="casca">
      <Topo />
      <Abas
        abas={[
          { para: '/interno', rotulo: 'Painel', icone: 'painel', fim: true },
          { para: '/interno/chamados', rotulo: 'Chamados', icone: 'chamados' },
          { para: '/interno/os', rotulo: 'OS', icone: 'chave' },
          { para: '/interno/clientes', rotulo: 'Clientes', icone: 'pessoas' },
          { para: '/interno/mais', rotulo: 'Mais', icone: 'mais' },
        ]}
      />
      <main className="conteudo">
        <VigiaChamados />
        <Outlet />
      </main>
    </div>
  );
}

export function LayoutPortal() {
  return (
    <div className="casca">
      <Topo />
      <Abas
        abas={[
          { para: '/portal', rotulo: 'Chamados', icone: 'chamados', fim: true },
          { para: '/portal/novo', rotulo: 'Abrir chamado', icone: 'mais_circulo', destaque: true },
          { para: '/portal/equipamentos', rotulo: 'Equipamentos', icone: 'caixa' },
          { para: '/portal/financeiro', rotulo: 'Financeiro', icone: 'moeda' },
          { para: '/portal/conta', rotulo: 'Conta', icone: 'usuario' },
        ]}
      />
      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}

/** Protege rotas por papel; manda cada perfil para a sua área. */
export function ExigePapel({ papeis }: { papeis: Papel[] }) {
  const { usuario, perfil, carregando } = useSessao();
  const local = useLocation();
  if (carregando) return <TelaCarregando />;
  if (!usuario) return <Navigate to={`/login?volta=${encodeURIComponent(local.pathname + local.search)}`} replace />;
  if (!perfil || !perfil.ativo) return <AcessoPendente />;
  if (!papeis.includes(perfil.papel)) return <Navigate to={perfil.papel === 'cliente' ? '/portal' : '/interno'} replace />;
  return <Outlet />;
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

/** Rota raiz: decide para onde ir. */
export function Inicio() {
  const { usuario, perfil, carregando } = useSessao();
  if (carregando) return <TelaCarregando />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (!perfil || !perfil.ativo) return <AcessoPendente />;
  return <Navigate to={perfil.papel === 'cliente' ? '/portal' : '/interno'} replace />;
}

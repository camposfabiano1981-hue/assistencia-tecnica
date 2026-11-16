import { useSessao } from '../../sessao';
import { Icone } from '../../componentes/Icone';
import { Botao, CabecalhoPagina, Cartao, LinhaLista } from '../../componentes/ui';

export function Mais() {
  const { perfil, sair } = useSessao();
  return (
    <>
      <CabecalhoPagina titulo="Mais" subtitulo={`${perfil?.nome} · ${perfil?.papel === 'gestor' ? 'Gestor' : 'Técnico'}`} />
      <div className="lista">
        <LinhaLista para="/interno/equipamentos" titulo={<><Icone nome="caixa" tamanho={18} /> Equipamentos</>} detalhe="Todos os equipamentos atendidos" />
        <LinhaLista para="/interno/tipos" titulo={<><Icone nome="lista" tamanho={18} /> Tipos e checklists</>} detalhe="Itens de verificação e medições por tipo" />
        <LinhaLista para="/interno/etiquetas" titulo={<><Icone nome="qr" tamanho={18} /> Etiquetas QR</>} detalhe="Imprimir etiquetas para colar nos equipamentos" />
        <LinhaLista para="/interno/config" titulo={<><Icone nome="config" tamanho={18} /> Configurações</>} detalhe="Empresa, logo, aviso por e-mail e equipe" />
      </div>
      <Cartao titulo="Instalar no celular" className="nao-imprimir">
        <p className="pequeno" style={{ marginTop: 0 }}>
          No Chrome do Android, toque nos três pontinhos e em <strong>Instalar app</strong> (ou "Adicionar à tela inicial"). O app
          abre sem a barra do navegador e funciona sem internet nas OS já baixadas.
        </p>
      </Cartao>
      <Botao variante="perigo" icone="sair" onClick={sair} bloco>
        Sair
      </Botao>
    </>
  );
}

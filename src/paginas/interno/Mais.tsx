import { useSessao } from '../../sessao';
import { Icone } from '../../componentes/Icone';
import { Botao, CabecalhoPagina, Cartao, LinhaLista } from '../../componentes/ui';

export function Mais() {
  const { perfil, sair } = useSessao();
  return (
    <>
      <CabecalhoPagina titulo="Mais" subtitulo={`${perfil?.nome} · ${perfil?.papel === 'gestor' ? 'Gestor' : 'Técnico'}`} />
      <div className="lista">
        <LinhaLista para="/interno/financeiro" titulo={<><Icone nome="moeda" tamanho={18} /> Financeiro</>} detalhe="Orçamentos, faturas, Pix e planilha para o contador" />
        <LinhaLista para="/interno/contratos" titulo={<><Icone nome="lista" tamanho={18} /> Contratos</>} detalhe="Manutenção mensal, faturas do mês e prazo de atendimento" />
        <LinhaLista para="/interno/vencimentos" titulo={<><Icone nome="calendario" tamanho={18} /> Vencimentos</>} detalhe="Preventivas, ensaios e exigências dos próximos 60 dias" />
        <LinhaLista para="/interno/indicadores" titulo={<><Icone nome="grafico" tamanho={18} /> Indicadores</>} detalhe="Atendimentos, tempos e faturamento do período" />
        <LinhaLista para="/interno/equipamentos" titulo={<><Icone nome="caixa" tamanho={18} /> Equipamentos</>} detalhe="Todos os equipamentos atendidos" />
        <LinhaLista para="/interno/servicos" titulo={<><Icone nome="chave" tamanho={18} /> Serviços e preços</>} detalhe="Tabela de serviços para orçamento, fatura e OS" />
        <LinhaLista para="/interno/estoque" titulo={<><Icone nome="caixa" tamanho={18} /> Estoque</>} detalhe="Peças, saldo mínimo e movimentos" />
        <LinhaLista para="/interno/instrumentos" titulo={<><Icone nome="lista" tamanho={18} /> Instrumentos</>} detalhe="Analisadores e certificados de calibração" />
        <LinhaLista para="/interno/tipos" titulo={<><Icone nome="lista" tamanho={18} /> Tipos e checklists</>} detalhe="Itens de verificação e medições por tipo" />
        <LinhaLista para="/interno/etiquetas" titulo={<><Icone nome="qr" tamanho={18} /> Etiquetas QR</>} detalhe="Imprimir etiquetas para colar nos equipamentos" />
        <LinhaLista para="/interno/config" titulo={<><Icone nome="config" tamanho={18} /> Configurações</>} detalhe="Empresa, logo, Pix, aviso por e-mail e equipe" />
        <LinhaLista para="/interno/backup" titulo={<><Icone nome="nuvem" tamanho={18} /> Backup e exportação</>} detalhe="Cópia de segurança e planilhas" />
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

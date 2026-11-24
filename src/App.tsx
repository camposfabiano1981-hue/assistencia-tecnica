import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ProvedorSessao } from './sessao';
import { ExigePapel, ExigePermissao, Inicio, LayoutInterno, LayoutPortal } from './componentes/Layouts';
import { Login } from './paginas/Login';
import { Instalar } from './paginas/Instalar';
import { QrEquipamento } from './paginas/Qr';
import { Verificar } from './paginas/Verificar';
import { MeusChamados, ChamadoCliente } from './paginas/portal/Chamados';
import { NovoChamadoPortal } from './paginas/portal/NovoChamado';
import { MeusEquipamentos } from './paginas/portal/Equipamentos';
import { ContaCliente } from './paginas/portal/Conta';
import { FinanceiroCliente, OrcamentoCliente, FaturaCliente } from './paginas/portal/Financeiro';
import { AvaliarOS } from './paginas/portal/Avaliar';
import { PastaVisa } from './paginas/portal/Visa';
import { Financeiro, FinanceiroAntigo, OrcamentoEditar, OrcamentoDetalhe, FaturaNova, FaturaDetalhe } from './paginas/interno/Financeiro';
import { Vencimentos, ListaInstrumentos, InstrumentoEditar, ListaEstoque, PecaDetalhe } from './paginas/interno/Controle';
import { Painel } from './paginas/interno/Painel';
import { ListaChamados, ChamadoInterno, NovoChamadoInterno } from './paginas/interno/Chamados';
import { ListaOS, NovaOS } from './paginas/interno/OS';
import { ExecutarOS } from './paginas/interno/ExecutarOS';
import { ListaClientes, ClienteEditar, ClienteDetalhe } from './paginas/interno/Clientes';
import { ListaEquipamentos, EquipamentoEditar, EquipamentoDetalhe } from './paginas/interno/Equipamentos';
import { ListaTipos, TipoEditar } from './paginas/interno/Tipos';
import { Etiquetas } from './paginas/interno/Etiquetas';
import { Configuracoes } from './paginas/interno/Configuracoes';
import { Indicadores } from './paginas/interno/Indicadores';
import { Backup } from './paginas/interno/Backup';
import { ListaServicos, ServicoEditar } from './paginas/interno/Servicos';
import { ListaContratos, ContratoEditar, ContratoDetalhe } from './paginas/interno/Contratos';
import { EquipeAcessos } from './paginas/interno/Equipe';

export function App() {
  return (
    <ProvedorSessao>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/instalar" element={<Instalar />} />
          <Route path="/q/:id" element={<QrEquipamento />} />
          <Route path="/v" element={<Verificar />} />
          <Route path="/v/:codigo" element={<Verificar />} />

          <Route element={<ExigePapel papeis={['cliente']} />}>
            <Route path="/portal" element={<LayoutPortal />}>
              <Route index element={<MeusChamados />} />
              <Route path="novo" element={<NovoChamadoPortal />} />
              <Route path="chamados/:id" element={<ChamadoCliente />} />
              <Route path="equipamentos" element={<MeusEquipamentos />} />
              <Route path="conta" element={<ContaCliente />} />
              <Route path="financeiro" element={<FinanceiroCliente />} />
              <Route path="orcamentos/:id" element={<OrcamentoCliente />} />
              <Route path="faturas/:id" element={<FaturaCliente />} />
              <Route path="avaliar/:osId" element={<AvaliarOS />} />
              <Route path="visa" element={<PastaVisa />} />
            </Route>
          </Route>

          <Route element={<ExigePapel papeis={['gestor', 'administrativo', 'tecnico']} />}>
            <Route path="/interno" element={<LayoutInterno />}>
              <Route index element={<Painel />} />
              <Route path="chamados" element={<ListaChamados />} />
              <Route path="chamados/novo" element={<NovoChamadoInterno />} />
              <Route path="chamados/:id" element={<ChamadoInterno />} />
              <Route path="os" element={<ListaOS />} />
              <Route path="os/nova" element={<NovaOS />} />
              <Route path="os/:id" element={<ExecutarOS />} />
              <Route path="clientes" element={<ListaClientes />} />
              <Route path="clientes/novo" element={<ClienteEditar />} />
              <Route path="clientes/:id" element={<ClienteDetalhe />} />
              <Route path="clientes/:id/editar" element={<ClienteEditar />} />
              <Route path="equipamentos" element={<ListaEquipamentos />} />
              <Route path="equipamentos/novo" element={<EquipamentoEditar />} />
              <Route path="equipamentos/:id" element={<EquipamentoDetalhe />} />
              <Route path="equipamentos/:id/editar" element={<EquipamentoEditar />} />
              <Route path="tipos" element={<ListaTipos />} />
              <Route path="tipos/:id" element={<TipoEditar />} />
              <Route path="etiquetas" element={<Etiquetas />} />
              <Route path="mais" element={<Navigate to="/interno" replace />} />
              <Route element={<ExigePermissao permissao="configuracoes" />}>
                <Route path="config" element={<Configuracoes />} />
              </Route>
              <Route element={<ExigePermissao permissao="equipe" />}>
                <Route path="equipe" element={<EquipeAcessos />} />
              </Route>
              <Route element={<ExigePermissao permissao="financeiro" />}>
                <Route path="financeiro" element={<FinanceiroAntigo />} />
                <Route path="orcamentos" element={<Financeiro aba="orcamentos" />} />
                <Route path="orcamentos/novo" element={<OrcamentoEditar />} />
                <Route path="orcamentos/:id" element={<OrcamentoDetalhe />} />
                <Route path="orcamentos/:id/editar" element={<OrcamentoEditar />} />
                <Route path="faturas" element={<Financeiro aba="faturas" />} />
                <Route path="faturas/nova" element={<FaturaNova />} />
                <Route path="faturas/:id" element={<FaturaDetalhe />} />
                <Route path="contratos" element={<ListaContratos />} />
                <Route path="contratos/novo" element={<ContratoEditar />} />
                <Route path="contratos/:id" element={<ContratoDetalhe />} />
                <Route path="contratos/:id/editar" element={<ContratoEditar />} />
              </Route>
              <Route path="vencimentos" element={<Vencimentos />} />
              <Route path="instrumentos" element={<ListaInstrumentos />} />
              <Route path="instrumentos/:id" element={<InstrumentoEditar />} />
              <Route path="estoque" element={<ListaEstoque />} />
              <Route path="estoque/:id" element={<PecaDetalhe />} />
              <Route path="indicadores" element={<Indicadores />} />
              <Route element={<ExigePermissao permissao="planilhas" />}>
                <Route path="backup" element={<Backup />} />
              </Route>
              <Route path="servicos" element={<ListaServicos />} />
              <Route path="servicos/:id" element={<ServicoEditar />} />
            </Route>
          </Route>

          <Route path="*" element={<Inicio />} />
        </Routes>
      </BrowserRouter>
    </ProvedorSessao>
  );
}

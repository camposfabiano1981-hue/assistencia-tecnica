import { useSessao } from '../../sessao';
import { useDocumento } from '../../dados/hooks';
import type { Cliente } from '../../tipos';
import { fmtTelefone } from '../../util/formato';
import { abrirWhatsApp } from '../../util/whatsapp';
import { Botao, CabecalhoPagina, Cartao, Info } from '../../componentes/ui';

export function ContaCliente() {
  const { perfil, empresa, sair } = useSessao();
  const cliente = useDocumento<Cliente>(perfil?.clienteId ? `clientes/${perfil.clienteId}` : null);
  return (
    <>
      <CabecalhoPagina titulo="Minha conta" />
      <Cartao>
        <dl className="infos">
          <Info rotulo="Nome">{perfil?.nome}</Info>
          <Info rotulo="E-mail">{perfil?.email}</Info>
          <Info rotulo="Cliente">{cliente.dados?.nome}</Info>
        </dl>
      </Cartao>
      <Cartao titulo={empresa?.nome ?? 'Empresa'}>
        <dl className="infos">
          <Info rotulo="WhatsApp">{fmtTelefone(empresa?.whatsapp)}</Info>
          <Info rotulo="Telefone">{fmtTelefone(empresa?.telefone)}</Info>
          <Info rotulo="E-mail">{empresa?.email}</Info>
        </dl>
        {empresa?.whatsapp && (
          <div className="acoes">
            <Botao variante="whatsapp" icone="whatsapp" onClick={() => abrirWhatsApp(empresa.whatsapp, 'Olá!')}>
              Falar no WhatsApp
            </Botao>
          </div>
        )}
      </Cartao>
      <Cartao titulo="Dica">
        <p className="pequeno" style={{ marginTop: 0 }}>
          No celular, toque nos três pontinhos do navegador e em <strong>Adicionar à tela inicial</strong>: o portal vira um app e você
          abre chamados em segundos. Também dá para apontar a câmera para a etiqueta QR colada no equipamento.
        </p>
      </Cartao>
      <Botao variante="perigo" icone="sair" onClick={sair} bloco>
        Sair
      </Botao>
    </>
  );
}

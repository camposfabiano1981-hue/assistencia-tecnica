// Destino do QR code colado no equipamento.
// Cliente logado: formulário de chamado com o equipamento já escolhido. Equipe: ficha do equipamento.
// Sem login: entrar no portal ou chamar no WhatsApp (sem expor dados do equipamento).
import { Navigate, useParams } from 'react-router';
import { useSessao } from '../sessao';
import { useDocumento } from '../dados/hooks';
import type { ConfigPublica } from '../tipos';
import { linkWhatsApp } from '../util/whatsapp';
import { Cartao, LinkBotao, TelaCarregando } from '../componentes/ui';
import { Icone } from '../componentes/Icone';

export function QrEquipamento() {
  const { id = '' } = useParams();
  const { perfil, carregando } = useSessao();
  const publico = useDocumento<ConfigPublica>('config/publico');

  if (carregando) return <TelaCarregando />;
  if (perfil?.ativo && perfil.papel === 'cliente') return <Navigate to={`/portal/novo?equipamento=${id}`} replace />;
  if (perfil?.ativo) return <Navigate to={`/interno/equipamentos/${id}`} replace />;

  return (
    <div className="tela-cheia">
      <div className="caixa-entrada">
        <div className="marca-entrada">
          <img src="/pwa-192.png" alt="" />
          <h1>{publico.dados?.nome || 'Assistência Técnica'}</h1>
          <p>Assistência técnica deste equipamento</p>
        </div>
        <Cartao>
          <p style={{ marginTop: 0 }}>Para abrir um chamado e acompanhar o atendimento, entre no portal do cliente.</p>
          <div className="acoes-coluna">
            <LinkBotao para={`/login?volta=${encodeURIComponent(`/q/${id}`)}`} bloco icone="usuario">
              Entrar e abrir chamado
            </LinkBotao>
            {publico.dados?.whatsapp && (
              <a
                className="botao botao-whatsapp botao-bloco"
                href={linkWhatsApp(publico.dados.whatsapp, `Olá! Preciso de assistência técnica no equipamento de código ${id}.`)}
                target="_blank"
                rel="noreferrer"
              >
                <Icone nome="whatsapp" tamanho={20} />
                <span>Chamar no WhatsApp</span>
              </a>
            )}
          </div>
        </Cartao>
      </div>
    </div>
  );
}

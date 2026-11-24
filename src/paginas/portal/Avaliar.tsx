// Link enviado pelo WhatsApp depois do atendimento: /portal/avaliar/OS
import { Link, useParams } from 'react-router';
import { CabecalhoPagina } from '../../componentes/ui';
import { AvaliarAtendimento } from '../../componentes/Avaliacao';

export function AvaliarOS() {
  const { osId = '' } = useParams();
  return (
    <>
      <CabecalhoPagina titulo="Avaliar o atendimento" voltar="/portal" />
      <AvaliarAtendimento osId={osId} destaque />
      <p className="pequeno" style={{ textAlign: 'center' }}>
        <Link to="/portal/equipamentos">Ver os laudos dos seus equipamentos</Link>
      </p>
    </>
  );
}

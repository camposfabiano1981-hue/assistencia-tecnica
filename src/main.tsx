import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { iniciarFirebase } from './firebase';
import './estilos.css';

const raiz = createRoot(document.getElementById('root')!);

registerSW({ immediate: true });

iniciarFirebase()
  .then(async () => {
    const { App } = await import('./App');
    raiz.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((erro: unknown) => {
    raiz.render(
      <div className="tela-cheia">
        <div className="caixa-entrada cartao">
          <h1 style={{ fontSize: '1.2rem', marginBottom: 8 }}>Não foi possível abrir o sistema</h1>
          <p>{erro instanceof Error ? erro.message : String(erro)}</p>
          <button className="botao botao-primario botao-bloco" onClick={() => location.reload()}>
            Tentar de novo
          </button>
        </div>
      </div>,
    );
  });

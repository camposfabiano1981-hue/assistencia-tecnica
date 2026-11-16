// Assinatura na tela do celular.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';

export interface AssinaturaRef {
  vazia: () => boolean;
  png: () => Promise<Uint8Array>;
  limpar: () => void;
}

export const PadAssinatura = forwardRef<AssinaturaRef>(function PadAssinatura(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [vazia, setVazia] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const pad = new SignaturePad(canvas, { penColor: '#0b2a3a', minWidth: 0.8, maxWidth: 2.6, backgroundColor: 'rgba(255,255,255,0)' });
    padRef.current = pad;
    pad.addEventListener('endStroke', () => setVazia(pad.isEmpty()));
    const ajustar = () => {
      const dados = pad.toData();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
      if (dados.length) pad.fromData(dados);
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => {
      window.removeEventListener('resize', ajustar);
      pad.off();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    vazia: () => padRef.current?.isEmpty() ?? true,
    limpar: () => {
      padRef.current?.clear();
      setVazia(true);
    },
    png: async () => {
      const url = padRef.current!.toDataURL('image/png');
      const resp = await fetch(url);
      return new Uint8Array(await resp.arrayBuffer());
    },
  }));

  return (
    <div>
      <canvas ref={canvasRef} className="assinatura" aria-label="Área para assinatura" />
      <div className="assinatura-rodape">
        <span>{vazia ? 'Assine com o dedo no quadro acima' : 'Assinatura registrada'}</span>
        <button
          type="button"
          className="botao botao-fantasma"
          onClick={() => {
            padRef.current?.clear();
            setVazia(true);
          }}
        >
          Limpar
        </button>
      </div>
    </div>
  );
});

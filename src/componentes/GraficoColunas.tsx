// Gráfico de colunas de uma série (SVG puro): colunas finas com ponta arredondada, grade discreta,
// valor só na última coluna, dica ao tocar/passar o mouse e tabela para quem prefere números.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface PontoColuna {
  rotulo: string; // ex.: "nov/26"
  rotuloLongo: string; // ex.: "novembro de 2026"
  valor: number;
}

const COR = '#0f6f9f'; // azul-petróleo da marca, mais saturado (validado: faixa de luminosidade, croma e contraste)

/**
 * Topo do eixo Y num número redondo. Para contagens (valores inteiros), o topo é par, para que a marca
 * do meio também seja inteira (nada de "3" no lugar de 2,5).
 */
export function maximoRedondo(n: number, inteiro = false): number {
  if (n <= 0) return inteiro ? 2 : 1;
  const potencia = 10 ** Math.floor(Math.log10(n));
  const passos = inteiro && potencia === 1 ? [2, 4, 6, 8, 10] : [1, 2, 2.5, 5, 10];
  for (const m of passos) {
    const topo = m * potencia;
    if (topo >= n && (!inteiro || topo % 2 === 0)) return topo;
  }
  return 10 * potencia;
}

function useLargura<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(240, Math.floor(e.contentRect.width))));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, largura];
}

export function GraficoColunas({
  titulo,
  subtitulo,
  dados,
  formatar,
  formatarEixo = formatar,
  unidade,
}: {
  titulo: string;
  subtitulo?: string;
  dados: PontoColuna[];
  formatar: (n: number) => string;
  formatarEixo?: (n: number) => string;
  unidade: string;
}) {
  const [caixa, largura] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);
  const dicaRef = useRef<HTMLDivElement>(null);
  const [larguraDica, setLarguraDica] = useState(160);
  // Mede a dica antes de pintar, para mantê-la inteira dentro do gráfico (no celular, perto da borda).
  useLayoutEffect(() => {
    if (dicaRef.current) setLarguraDica(dicaRef.current.offsetWidth);
  }, [ativo]);
  const altura = 200;
  const m = { esq: 52, dir: 10, topo: 24, base: 26 };
  const lp = largura - m.esq - m.dir;
  const ap = altura - m.topo - m.base;
  const max = maximoRedondo(
    Math.max(...dados.map((d) => d.valor), 0),
    dados.every((d) => Number.isInteger(d.valor)),
  );
  const marcas = [0, max / 2, max];
  const faixa = lp / Math.max(1, dados.length);
  const larguraBarra = Math.min(24, faixa * 0.6);
  const pulo = faixa < 34 ? 2 : 1; // rótulos do eixo X em meses alternados quando aperta
  const y = (v: number) => m.topo + ap - (v / max) * ap;

  const coluna = (i: number, v: number) => {
    const x = m.esq + i * faixa + (faixa - larguraBarra) / 2;
    const topo = y(v);
    const h = m.topo + ap - topo;
    if (h <= 0) return '';
    const r = Math.min(4, h, larguraBarra / 2);
    const base = m.topo + ap;
    return `M${x},${base} L${x},${topo + r} A${r},${r} 0 0 1 ${x + r},${topo} L${x + larguraBarra - r},${topo} A${r},${r} 0 0 1 ${x + larguraBarra},${topo + r} L${x + larguraBarra},${base} Z`;
  };

  const ultimo = dados.length - 1;
  const dica = ativo != null ? dados[ativo] : null;
  const metadeDica = larguraDica / 2 + 4;
  const xDica = ativo != null ? Math.min(Math.max(m.esq + ativo * faixa + faixa / 2, metadeDica), largura - metadeDica) : 0;

  return (
    <figure className="grafico">
      <figcaption>
        <strong>{titulo}</strong>
        {subtitulo && <span>{subtitulo}</span>}
      </figcaption>
      <div ref={caixa} className="grafico-area">
        <svg width={largura} height={altura} role="img" aria-label={`${titulo}: ${dados.map((d) => `${d.rotuloLongo} ${formatar(d.valor)}`).join('; ')}`}>
          {marcas.map((t) => (
            <g key={t}>
              <line x1={m.esq} x2={largura - m.dir} y1={y(t)} y2={y(t)} stroke="#e3e8ec" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={m.esq - 8} y={y(t)} dy="0.32em" textAnchor="end" className="grafico-eixo">
                {formatarEixo(t)}
              </text>
            </g>
          ))}
          {dados.map((d, i) => (
            <path key={d.rotulo} d={coluna(i, d.valor)} fill={COR} className={ativo === i ? 'coluna coluna-ativa' : 'coluna'} />
          ))}
          {/* Valor só na coluna mais recente (o restante vai na dica e na tabela). */}
          {dados.length > 0 && dados[ultimo].valor > 0 && (
            <text x={m.esq + ultimo * faixa + faixa / 2} y={y(dados[ultimo].valor) - 6} textAnchor="middle" className="grafico-valor">
              {formatar(dados[ultimo].valor)}
            </text>
          )}
          {dados.map((d, i) =>
            i % pulo === (ultimo % pulo) ? (
              <text key={`x${d.rotulo}`} x={m.esq + i * faixa + faixa / 2} y={altura - 8} textAnchor="middle" className="grafico-eixo">
                {d.rotulo}
              </text>
            ) : null,
          )}
          {/* Área de toque: a faixa inteira de cada mês, maior que a coluna. */}
          {dados.map((d, i) => (
            <rect
              key={`h${d.rotulo}`}
              x={m.esq + i * faixa}
              y={m.topo}
              width={faixa}
              height={ap}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${d.rotuloLongo}: ${formatar(d.valor)} ${unidade}`}
              // Mouse: passa por cima. Toque: o dedo não "passa por cima", então cada toque abre/fecha a dica.
              onPointerEnter={(e) => e.pointerType !== 'touch' && setAtivo(i)}
              onPointerMove={(e) => e.pointerType !== 'touch' && setAtivo(i)}
              onPointerLeave={(e) => e.pointerType !== 'touch' && setAtivo(null)}
              onPointerDown={(e) => e.pointerType === 'touch' && setAtivo((a) => (a === i ? null : i))}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo(null)}
              style={{ outline: 'none', cursor: 'default' }}
            />
          ))}
        </svg>
        {dica && (
          <div ref={dicaRef} className="grafico-dica" style={{ left: xDica }} role="status">
            <strong>{formatar(dica.valor)}</strong>
            <span>
              <i style={{ background: COR }} aria-hidden="true" /> {unidade} · {dica.rotuloLongo}
            </span>
          </div>
        )}
      </div>
      <details className="grafico-tabela">
        <summary>Ver tabela</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col" className="direita">
                {unidade}
              </th>
            </tr>
          </thead>
          <tbody>
            {dados.map((d) => (
              <tr key={d.rotulo}>
                <td>{d.rotuloLongo}</td>
                <td className="direita numero">{formatar(d.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

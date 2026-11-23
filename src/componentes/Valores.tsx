// Campos de valor, editor de itens (serviço × peça) e cartão de Pix.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { ItemValor, Peca, ServicoCatalogo } from '../tipos';
import { calcularTotais, novoIdItem } from '../dados/financeiro';
import { fmtMoeda, lerMoeda } from '../util/formato';
import { Icone } from './Icone';
import { QrCode } from './QrCode';
import { Botao, Cartao, Selo } from './ui';

const fmtNumero = (n: number, casas: number | null) =>
  casas == null ? String(n).replace('.', ',') : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Número digitado no padrão brasileiro (vírgula decimal); formata ao sair do campo. */
export function CampoNumero({
  valor,
  aoMudar,
  rotulo,
  casas = 2,
  desabilitado,
  className,
}: {
  valor: number;
  aoMudar: (n: number) => void;
  rotulo: string;
  casas?: number | null;
  desabilitado?: boolean;
  className?: string;
}) {
  const [texto, setTexto] = useState(fmtNumero(valor, casas));
  const foco = useRef(false);
  useEffect(() => {
    if (!foco.current) setTexto(fmtNumero(valor, casas));
  }, [valor, casas]);
  return (
    <input
      className={className}
      aria-label={rotulo}
      inputMode="decimal"
      value={texto}
      disabled={desabilitado}
      onFocus={(e) => {
        foco.current = true;
        e.target.select();
      }}
      onChange={(e) => {
        setTexto(e.target.value);
        aoMudar(lerMoeda(e.target.value));
      }}
      onBlur={() => {
        foco.current = false;
        setTexto(fmtNumero(valor, casas));
      }}
    />
  );
}

export function EditorItens({
  itens,
  desconto,
  aoMudar,
  pecas = [],
  servicos,
  somenteLeitura,
}: {
  itens: ItemValor[];
  desconto: number;
  aoMudar?: (itens: ItemValor[], desconto: number) => void;
  pecas?: Peca[];
  /** Catálogo de serviços (tabela de preços); sem ele, só serviço avulso. */
  servicos?: ServicoCatalogo[];
  somenteLeitura?: boolean;
}) {
  const t = calcularTotais(itens, desconto);
  const mudar = (novos: ItemValor[], d = desconto) => aoMudar?.(novos, d);
  const campo = (i: number, k: keyof ItemValor, v: unknown) => mudar(itens.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const novo = (tipo: ItemValor['tipo']) => mudar([...itens, { id: novoIdItem(), tipo, descricao: '', quantidade: 1, valorUnitario: 0 }]);
  const doEstoque = (id: string) => {
    const p = pecas.find((x) => x.id === id);
    if (p) mudar([...itens, { id: novoIdItem(), tipo: 'peca', descricao: p.descricao, quantidade: 1, valorUnitario: p.preco, pecaId: p.id, codigo: p.codigo, unidade: p.unidade }]);
  };
  const doCatalogo = (id: string) => {
    const s = servicos?.find((x) => x.id === id);
    if (s) mudar([...itens, { id: novoIdItem(), tipo: 'servico', descricao: s.descricao, quantidade: 1, valorUnitario: s.preco, servicoId: s.id, codigo: s.codigo, unidade: s.unidade }]);
  };

  return (
    <div>
      {!itens.length && <p className="pequeno">Nenhum item ainda.</p>}
      {itens.map((it, i) => (
        <div className="item-valor" key={it.id}>
          <div className="item-valor-topo">
            <Selo tom={it.tipo === 'servico' ? 'info' : 'roxo'}>{it.tipo === 'servico' ? 'Serviço' : 'Peça'}</Selo>
            {it.codigo && <span className="pequeno">cód. {it.codigo}</span>}
            {!somenteLeitura && (
              <button type="button" className="icone-botao" aria-label="Remover item" onClick={() => mudar(itens.filter((_, j) => j !== i))}>
                <Icone nome="lixo" tamanho={18} />
              </button>
            )}
          </div>
          {somenteLeitura ? (
            <div className="item-valor-desc">{it.descricao}</div>
          ) : (
            <input
              className="item-valor-desc"
              aria-label="Descrição do item"
              placeholder={it.tipo === 'servico' ? 'Ex.: mão de obra, deslocamento, ensaio' : 'Ex.: guarnição da porta 21 L'}
              value={it.descricao}
              onChange={(e) => campo(i, 'descricao', e.target.value)}
            />
          )}
          <div className="item-valor-numeros">
            <label>
              <span>Qtd.{it.unidade ? ` (${it.unidade})` : ''}</span>
              <CampoNumero rotulo="Quantidade" casas={null} valor={it.quantidade} desabilitado={somenteLeitura} aoMudar={(n) => campo(i, 'quantidade', n)} />
            </label>
            <label>
              <span>Valor unit. (R$)</span>
              <CampoNumero rotulo="Valor unitário" valor={it.valorUnitario} desabilitado={somenteLeitura} aoMudar={(n) => campo(i, 'valorUnitario', n)} />
            </label>
            <div className="item-valor-sub">
              <span>Subtotal</span>
              <strong>{fmtMoeda(it.quantidade * it.valorUnitario)}</strong>
            </div>
          </div>
        </div>
      ))}
      {!somenteLeitura && (
        <div className="acoes">
          {!!servicos?.length && (
            <select
              aria-label="Adicionar serviço cadastrado"
              className="seletor-acao"
              value=""
              onChange={(e) => {
                doCatalogo(e.target.value);
                e.target.value = '';
              }}
            >
              <option value="">+ Serviço cadastrado…</option>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.descricao} — {fmtMoeda(s.preco)}/{s.unidade}
                </option>
              ))}
            </select>
          )}
          <Botao type="button" variante="secundario" icone="mais_circulo" onClick={() => novo('servico')}>
            Serviço avulso
          </Botao>
          <Botao type="button" variante="secundario" icone="mais_circulo" onClick={() => novo('peca')}>
            Peça avulsa
          </Botao>
          {!!pecas.length && (
            <select
              aria-label="Adicionar peça do estoque"
              className="seletor-acao"
              value=""
              onChange={(e) => {
                doEstoque(e.target.value);
                e.target.value = '';
              }}
            >
              <option value="">+ Peça do estoque…</option>
              {pecas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.descricao} — {fmtMoeda(p.preco)} ({p.quantidade} {p.unidade})
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {!somenteLeitura && servicos && !servicos.length && (
        <p className="pequeno" style={{ marginTop: 0 }}>
          Dica: cadastre os serviços que você cobra em <Link to="/interno/servicos">Serviços e preços</Link> para escolher daqui com o preço.
        </p>
      )}
      <dl className="totais">
        <div>
          <dt>Serviços</dt>
          <dd>{fmtMoeda(t.totalServicos)}</dd>
        </div>
        <div>
          <dt>Peças</dt>
          <dd>{fmtMoeda(t.totalPecas)}</dd>
        </div>
        <div>
          <dt>Desconto</dt>
          <dd>
            {somenteLeitura ? (
              fmtMoeda(t.desconto)
            ) : (
              <CampoNumero rotulo="Desconto" className="campo-desconto" valor={desconto} aoMudar={(n) => mudar(itens, n)} />
            )}
          </dd>
        </div>
        <div className="totais-final">
          <dt>Total</dt>
          <dd>{fmtMoeda(t.total)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function CartaoPix({ payload, valor, titulo = 'Pagar com Pix' }: { payload: string; valor: number; titulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      area.current?.select();
      document.execCommand('copy');
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  }
  return (
    <Cartao titulo={titulo}>
      <div className="pix">
        <div className="pix-qr">
          <QrCode texto={payload} tamanho={190} alt="QR code do Pix" />
        </div>
        <div className="pix-texto">
          <p style={{ marginTop: 0 }}>
            Valor: <strong>{fmtMoeda(valor)}</strong>
          </p>
          <p className="pequeno">No app do banco: Pix → ler QR code, ou Pix copia e cola com o código abaixo.</p>
          <textarea ref={area} readOnly value={payload} rows={3} className="pix-codigo" aria-label="Código Pix copia e cola" />
          <Botao type="button" icone={copiado ? 'check' : undefined} onClick={copiar} bloco>
            {copiado ? 'Código copiado!' : 'Copiar código Pix'}
          </Botao>
        </div>
      </div>
    </Cartao>
  );
}

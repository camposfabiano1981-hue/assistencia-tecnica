// Etiquetas QR para colar nos equipamentos (papel adesivo A4, 3 colunas).
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { collection, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { useConsulta, useDocumento } from '../../dados/hooks';
import type { Cliente, Empresa, Equipamento } from '../../tipos';
import { descreverEquipamento, fmtTelefone } from '../../util/formato';
import { QrCode, urlEquipamento } from '../../componentes/QrCode';
import { Botao, CabecalhoPagina, Cartao, Selecao, Vazio } from '../../componentes/ui';

function Etiqueta({ e, empresa }: { e: Equipamento; empresa: Empresa | null }) {
  return (
    <div className="etiqueta">
      <QrCode texto={urlEquipamento(e.id)} tamanho={96} alt={`QR ${e.tipoNome}`} />
      <div className="etiqueta-texto">
        <div className="etiqueta-chamada">Precisa de assistência? Aponte a câmera.</div>
        <strong>{e.tipoNome}</strong>
        <div>{[e.fabricante, e.modelo].filter(Boolean).join(' ')}</div>
        {e.numeroSerie && <div>Série: {e.numeroSerie}</div>}
        <div style={{ marginTop: 4 }}>
          {empresa?.nome}
          {empresa?.whatsapp ? ` · ${fmtTelefone(empresa.whatsapp)}` : ''}
        </div>
      </div>
    </div>
  );
}

export function Etiquetas() {
  const [params] = useSearchParams();
  const { empresa } = useSessao();
  const so = params.get('equipamento');
  const [clienteId, setClienteId] = useState(params.get('cliente') ?? '');
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const clientes = useConsulta<Cliente>(() => query(collection(db, 'clientes'), orderBy('nome')), []);
  const unico = useDocumento<Equipamento>(so ? `equipamentos/${so}` : null);
  const equipamentos = useConsulta<Equipamento>(
    () => (clienteId && !so ? query(collection(db, 'equipamentos'), where('clienteId', '==', clienteId)) : null),
    [clienteId, so],
  );
  const lista = so ? (unico.dados ? [unico.dados] : []) : equipamentos.itens.filter((e) => e.ativo !== false);
  const imprimir = lista.filter((e) => !desmarcados.has(e.id));

  return (
    <>
      <CabecalhoPagina
        titulo="Etiquetas QR"
        subtitulo="Imprima em papel adesivo A4 e cole em cada equipamento"
        voltar={true}
        acoes={
          <Botao icone="impressora" disabled={!imprimir.length} onClick={() => window.print()}>
            Imprimir
          </Botao>
        }
      />
      {!so && (
        <div className="nao-imprimir">
          <Cartao>
            <Selecao rotulo="Cliente" value={clienteId} onChange={(e) => { setClienteId(e.target.value); setDesmarcados(new Set()); }}>
              <option value="">Escolha o cliente…</option>
              {clientes.itens.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Selecao>
            {lista.map((e) => (
              <label key={e.id} className="marcador">
                <input
                  type="checkbox"
                  checked={!desmarcados.has(e.id)}
                  onChange={(ev) => {
                    const s = new Set(desmarcados);
                    if (ev.target.checked) s.delete(e.id);
                    else s.add(e.id);
                    setDesmarcados(s);
                  }}
                />
                <span>{descreverEquipamento(e)}</span>
              </label>
            ))}
          </Cartao>
        </div>
      )}
      {!imprimir.length ? (
        <div className="nao-imprimir">
          <Vazio icone="qr" titulo="Nenhuma etiqueta para imprimir">Escolha um cliente com equipamentos cadastrados.</Vazio>
        </div>
      ) : (
        <div className="etiquetas">
          {imprimir.map((e) => (
            <Etiqueta key={e.id} e={e} empresa={empresa} />
          ))}
        </div>
      )}
    </>
  );
}

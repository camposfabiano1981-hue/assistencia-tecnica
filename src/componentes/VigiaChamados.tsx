// Fica escutando chamados novos em qualquer tela interna e toca o alerta.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useConsulta } from '../dados/hooks';
import type { Chamado } from '../tipos';
import { notificar, tocarAlerta } from '../util/alerta';
import { Aviso } from './ui';

const CHAVE_VISTO = 'ultimo-chamado-visto';

export function VigiaChamados() {
  const { itens, carregando } = useConsulta<Chamado>(() => query(collection(db, 'chamados'), orderBy('numero', 'desc'), limit(20)), []);
  const iniciado = useRef(false);
  const [novo, setNovo] = useState<Chamado | null>(null);

  useEffect(() => {
    if (carregando) return;
    const maior = itens.reduce((m, c) => Math.max(m, c.numero), 0);
    const visto = Number(localStorage.getItem(CHAVE_VISTO) ?? 0);
    if (!iniciado.current) {
      iniciado.current = true;
      if (!visto) {
        localStorage.setItem(CHAVE_VISTO, String(maior));
        return;
      }
    }
    const novos = itens.filter((c) => c.numero > visto && c.status === 'aberto');
    if (novos.length) {
      const c = novos[0];
      setNovo(c);
      tocarAlerta();
      void notificar(`Novo chamado nº ${c.numero}${c.parado ? ' · PARADO' : ''}`, `${c.clienteNome}: ${c.equipamentoDescricao}`, `/interno/chamados/${c.id}`);
      document.title = `(${novos.length}) Novo chamado`;
    }
    if (maior > visto) localStorage.setItem(CHAVE_VISTO, String(maior));
  }, [itens, carregando]);

  if (!novo) return null;
  return (
    <div className="nao-imprimir">
      <Aviso tom="alerta">
        <strong>Novo chamado nº {novo.numero}</strong>
        {novo.parado ? ' · equipamento PARADO' : ''} — {novo.clienteNome}: {novo.equipamentoDescricao}.{' '}
        <Link
          to={`/interno/chamados/${novo.id}`}
          onClick={() => {
            setNovo(null);
            document.title = 'Assistência Técnica';
          }}
        >
          Abrir
        </Link>
      </Aviso>
    </div>
  );
}

// Quadro "Atenção" do painel: o que precisa de ação fora dos chamados.
import { Link } from 'react-router';
import { Timestamp, collection, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useConsulta } from '../dados/hooks';
import { situacaoFatura } from '../dados/financeiro';
import type { Equipamento, Fatura, Instrumento, Orcamento, Peca } from '../tipos';
import { diasAte, somarDias } from '../util/datas';
import { fmtMoeda } from '../util/formato';
import { Icone } from './Icone';
import { Cartao } from './ui';

export function QuadroAtencao() {
  const orc = useConsulta<Orcamento>(() => query(collection(db, 'orcamentos'), where('status', 'in', ['enviado', 'aprovado'])), []);
  const fat = useConsulta<Fatura>(() => query(collection(db, 'faturas'), where('status', '==', 'aberta')), []);
  const venc = useConsulta<Equipamento>(
    () => query(collection(db, 'equipamentos'), where('proximoVencimento', '<=', Timestamp.fromDate(somarDias(new Date(), 30)))),
    [],
  );
  const inst = useConsulta<Instrumento>(() => query(collection(db, 'instrumentos')), []);
  const pecas = useConsulta<Peca>(() => query(collection(db, 'pecas')), []);

  const aguardando = orc.itens.filter((o) => o.status === 'enviado').length;
  const aprovadosSemFatura = orc.itens.filter((o) => o.status === 'aprovado' && !o.faturaId).length;
  const vencidas = fat.itens.filter((f) => situacaoFatura(f) === 'vencida');
  const equipamentos = venc.itens.filter((e) => e.ativo !== false).length;
  const certificados = inst.itens.filter((i) => i.ativo !== false && i.validade && diasAte(i.validade.toDate()) <= 30).length;
  const repor = pecas.itens.filter((p) => p.ativo !== false && p.quantidade <= p.minimo).length;

  const itens = [
    { n: aprovadosSemFatura, texto: 'orçamento(s) aprovado(s) para executar/faturar', para: '/interno/financeiro?aba=orcamentos', icone: 'moeda', forte: true },
    { n: aguardando, texto: 'orçamento(s) aguardando o cliente', para: '/interno/financeiro?aba=orcamentos', icone: 'relogio' },
    { n: vencidas.length, texto: `fatura(s) vencida(s) · ${fmtMoeda(vencidas.reduce((t, f) => t + f.total, 0))}`, para: '/interno/financeiro?aba=faturas', icone: 'moeda', forte: true },
    { n: equipamentos, texto: 'equipamento(s) com preventiva/exigência vencendo em 30 dias', para: '/interno/vencimentos', icone: 'calendario' },
    { n: certificados, texto: 'instrumento(s) com certificado vencendo ou vencido', para: '/interno/instrumentos', icone: 'lista' },
    { n: repor, texto: 'peça(s) no estoque mínimo', para: '/interno/estoque', icone: 'caixa' },
  ].filter((i) => i.n > 0);

  if (!itens.length) return null;
  return (
    <Cartao titulo="Atenção">
      <div className="lista">
        {itens.map((i) => (
          <Link key={i.texto} to={i.para} className="linha">
            <Icone nome={i.icone} tamanho={20} />
            <div className="linha-texto">
              <div className="linha-titulo" style={{ fontWeight: i.forte ? 750 : 600 }}>
                {i.n} {i.texto}
              </div>
            </div>
            <Icone nome="seta" tamanho={18} className="linha-seta" />
          </Link>
        ))}
      </div>
    </Cartao>
  );
}

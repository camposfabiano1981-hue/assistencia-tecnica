// Documentos para visualizar na tela: laudo (OS) e comprovante do chamado.
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useSessao } from '../sessao';
import { carregarFotos } from '../dados/operacoes';
import type { Chamado, Cliente, Empresa, OrdemServico } from '../tipos';
import { numeroOS } from '../util/formato';
import { BotaoVisualizar, type Documento } from './Visualizador';

/** Gera o laudo (OS) em PDF, com as fotos. Aceita a OS já carregada ou só o número. */
export async function documentoDoLaudo(empresa: Empresa | null, os?: OrdemServico, osId?: string): Promise<Documento> {
  let alvo = os;
  if (!alvo && osId) {
    const s = await getDoc(doc(db, 'os', osId));
    if (!s.exists()) throw new Error('Laudo não encontrado.');
    alvo = { id: s.id, ...s.data() } as OrdemServico;
  }
  if (!alvo) throw new Error('Laudo não encontrado.');
  const fotos = await carregarFotos(`os/${alvo.id}/fotos`);
  const { gerarLaudo } = await import('../util/laudo');
  const arquivo = await gerarLaudo(alvo, empresa, fotos);
  return { arquivo, texto: `Laudo técnico - OS nº ${numeroOS(alvo.numero)} - ${alvo.equipamento.tipoNome}` };
}

/** Comprovante do chamado em PDF (com os dados do cliente e as fotos enviadas). */
export async function documentoDoChamado(c: Chamado, empresa: Empresa | null): Promise<Documento> {
  const [cliente, fotos] = await Promise.all([
    getDoc(doc(db, 'clientes', c.clienteId))
      .then((s) => (s.exists() ? ({ id: s.id, ...s.data() } as Cliente) : null))
      .catch(() => null),
    c.qtdFotos > 0 ? carregarFotos(`chamados/${c.id}/fotos`) : Promise.resolve([]),
  ]);
  const { gerarChamadoPDF } = await import('../util/documentos');
  return { arquivo: gerarChamadoPDF(c, empresa, cliente, fotos), texto: `Chamado nº ${c.numero} - ${c.equipamentoDescricao}` };
}

export function BotaoVisualizarLaudo({ os, osId, rotulo = 'Visualizar laudo', bloco }: { os?: OrdemServico; osId?: string; rotulo?: string; bloco?: boolean }) {
  const { empresa } = useSessao();
  return <BotaoVisualizar rotulo={rotulo} bloco={bloco} gerar={() => documentoDoLaudo(empresa, os, osId)} />;
}

export function BotaoVisualizarChamado({ chamado, bloco }: { chamado: Chamado; bloco?: boolean }) {
  const { empresa } = useSessao();
  return <BotaoVisualizar rotulo="Visualizar chamado" bloco={bloco} gerar={() => documentoDoChamado(chamado, empresa)} />;
}

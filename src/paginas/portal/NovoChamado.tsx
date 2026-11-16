import { useNavigate, useSearchParams } from 'react-router';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import { avisarNovoChamado, criarChamado } from '../../dados/operacoes';
import type { Cliente, Equipamento } from '../../tipos';
import { FormChamado, type DadosFormChamado } from '../../componentes/FormChamado';
import { Aviso, CabecalhoPagina, Carregando } from '../../componentes/ui';

export function NovoChamadoPortal() {
  const { perfil, empresa } = useSessao();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const clienteId = perfil?.clienteId ?? '';
  const cliente = useDocumento<Cliente>(clienteId ? `clientes/${clienteId}` : null);
  const equipamentos = useConsulta<Equipamento>(() => query(collection(db, 'equipamentos'), where('clienteId', '==', clienteId)), [clienteId]);

  if (cliente.carregando || equipamentos.carregando) return <Carregando />;
  if (!cliente.dados) return <Aviso tom="erro">Cadastro do cliente não encontrado. Fale com a empresa.</Aviso>;
  const c = cliente.dados;

  async function enviar(d: DadosFormChamado) {
    try {
      const numero = await criarChamado(
        {
          cliente: { id: c.id, nome: c.nome },
          equipamento: d.equipamento,
          descricaoOutro: d.descricaoOutro,
          relato: d.relato,
          parado: d.parado,
          origem: 'portal',
          autor: { uid: perfil!.id, nome: perfil!.nome },
          contato: d.contato,
        },
        d.fotos,
      );
      avisarNovoChamado(empresa, {
        numero,
        cliente: c.nome,
        equipamento: d.equipamento ? `${d.equipamento.tipoNome} ${d.equipamento.modelo ?? ''}`.trim() : `Outro: ${d.descricaoOutro}`,
        parado: d.parado,
        relato: d.relato,
      });
      navegar(`/portal/chamados/${numero}?novo=1`, { replace: true });
    } catch (e) {
      throw new Error(mensagemErro(e));
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Abrir chamado" subtitulo={c.nome} />
      <FormChamado
        equipamentos={equipamentos.itens.filter((e) => e.ativo !== false)}
        equipamentoInicial={params.get('equipamento')}
        aoEnviar={enviar}
      />
    </>
  );
}

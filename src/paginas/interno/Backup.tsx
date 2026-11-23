// Backup e exportação: cópia de segurança completa (JSON) e planilhas CSV para Excel.
import { useState } from 'react';
import { Timestamp, collection, getDocsFromServer, query, where, type DocumentData, type Query } from 'firebase/firestore';
import { db } from '../../firebase';
import { mensagemErro } from '../../dados/hooks';
import { gerarBackup, marcarBackup, ultimoBackup, type ResultadoBackup } from '../../dados/backup';
import { csvClientes, csvEquipamentos, csvEstoque, csvFaturas, csvInstrumentos, csvOS } from '../../dados/exportar';
import type { Cliente, Equipamento, Fatura, Instrumento, OrdemServico, Peca } from '../../tipos';
import { baixarArquivo } from '../../util/csv';
import { Aviso, Botao, CabecalhoPagina, Cartao, Selecao, useOnline } from '../../componentes/ui';

function tamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function mensagem(e: unknown): string {
  return (e as { code?: string })?.code === 'unavailable'
    ? 'Sem conexão com o servidor. A exportação precisa de internet para ler todos os dados.'
    : mensagemErro(e);
}

function CopiaCompleta() {
  const online = useOnline();
  const [fotos, setFotos] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoBackup | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState(ultimoBackup);
  const dias = ultimo ? Math.floor((Date.now() - ultimo.getTime()) / 86400000) : null;

  async function baixar() {
    setErro(null);
    setResultado(null);
    setProgresso('Preparando…');
    try {
      const r = await gerarBackup({ incluirFotos: fotos, aoProgredir: (etapa, n) => setProgresso(`Lendo ${etapa}… ${n} documento(s)`) });
      baixarArquivo(r.nome, r.blob, 'application/json');
      marcarBackup();
      setUltimo(new Date());
      setResultado(r);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setProgresso(null);
    }
  }

  return (
    <Cartao titulo="Cópia de segurança completa">
      <p className="pequeno" style={{ marginTop: 0 }}>
        Baixa um arquivo <strong>.json</strong> com todos os dados: clientes, equipamentos, chamados, OS com assinaturas, orçamentos,
        faturas, estoque, instrumentos, equipe e configurações. Guarde no Google Drive ou no computador, de preferência uma vez por mês.
      </p>
      <p className="pequeno">
        {ultimo
          ? `Última cópia baixada neste aparelho: ${ultimo.toLocaleDateString('pt-BR')} (${dias === 0 ? 'hoje' : `há ${dias} dia(s)`}).`
          : 'Nenhuma cópia baixada neste aparelho ainda.'}
      </p>
      <label className="marcador">
        <input type="checkbox" checked={fotos} onChange={(e) => setFotos(e.target.checked)} />
        <span>
          Incluir as fotos dos chamados e das OS
          <span className="pequeno" style={{ display: 'block' }}>O arquivo fica bem maior (cerca de 200 KB por foto).</span>
        </span>
      </label>
      {!online && <Aviso tom="alerta">Sem internet: conecte-se para gerar a cópia com os dados do servidor.</Aviso>}
      <Botao icone="nuvem" onClick={() => void baixar()} carregando={!!progresso} disabled={!online}>
        Baixar cópia de segurança
      </Botao>
      {progresso && (
        <p className="pequeno" role="status">
          {progresso}
        </p>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {resultado && (
        <Aviso tom="sucesso">
          Cópia gerada: {resultado.documentos} documentos · {tamanho(resultado.blob.size)}. O arquivo <strong>{resultado.nome}</strong> foi
          para a pasta de downloads.
        </Aviso>
      )}
      <p className="pequeno" style={{ marginBottom: 0 }}>
        Para restaurar (por exemplo, depois de apagar algo por engano), use a ferramenta <code>ferramentas/restaurar</code> do
        repositório, explicada no README.
      </p>
    </Cartao>
  );
}

const ANO = new Date().getFullYear();

function Planilhas() {
  const online = useOnline();
  const [ano, setAno] = useState(String(ANO));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const periodo = (campo: string) =>
    ano === 'todos'
      ? []
      : [
          where(campo, '>=', Timestamp.fromDate(new Date(Number(ano), 0, 1))),
          where(campo, '<', Timestamp.fromDate(new Date(Number(ano) + 1, 0, 1))),
        ];
  const sufixo = ano === 'todos' ? 'tudo' : ano;

  async function baixar<T>(chave: string, nome: string, consulta: Query<DocumentData>, gerar: (lista: T[]) => string) {
    setErro(null);
    setOcupado(chave);
    try {
      const snap = await getDocsFromServer(consulta);
      baixarArquivo(nome, gerar(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)), 'text/csv;charset=utf-8');
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setOcupado(null);
    }
  }

  const planilhas = [
    {
      chave: 'faturas',
      titulo: 'Faturas',
      detalhe: 'Valores, pagamento, NFS-e e NF-e · pela data de emissão',
      baixar: () => baixar<Fatura>('faturas', `faturas-${sufixo}.csv`, query(collection(db, 'faturas'), ...periodo('emitidaEm')), csvFaturas),
    },
    {
      chave: 'os',
      titulo: 'Ordens de serviço',
      detalhe: 'Técnico, datas, exigências atendidas, instrumentos e peças · pela data de abertura',
      baixar: () => baixar<OrdemServico>('os', `ordens-de-servico-${sufixo}.csv`, query(collection(db, 'os'), ...periodo('criadaEm')), csvOS),
    },
    {
      chave: 'equipamentos',
      titulo: 'Equipamentos e vencimentos',
      detalhe: 'Cadastro completo com preventivas e exigências',
      baixar: () => baixar<Equipamento>('equipamentos', 'equipamentos.csv', query(collection(db, 'equipamentos')), csvEquipamentos),
    },
    {
      chave: 'clientes',
      titulo: 'Clientes',
      detalhe: 'Contatos, documentos e endereços',
      baixar: () => baixar<Cliente>('clientes', 'clientes.csv', query(collection(db, 'clientes')), csvClientes),
    },
    {
      chave: 'estoque',
      titulo: 'Estoque',
      detalhe: 'Saldo, mínimo, custo, preço e valor em estoque',
      baixar: () => baixar<Peca>('estoque', 'estoque.csv', query(collection(db, 'pecas')), csvEstoque),
    },
    {
      chave: 'instrumentos',
      titulo: 'Instrumentos',
      detalhe: 'Certificados de calibração e validade',
      baixar: () => baixar<Instrumento>('instrumentos', 'instrumentos.csv', query(collection(db, 'instrumentos')), csvInstrumentos),
    },
  ];

  return (
    <Cartao titulo="Planilhas para Excel ou Google Planilhas">
      <p className="pequeno" style={{ marginTop: 0 }}>
        Arquivos <strong>.csv</strong> no padrão brasileiro (ponto e vírgula e vírgula decimal). A planilha mensal para o contador também
        fica em Financeiro → Faturas.
      </p>
      <Selecao rotulo="Período das faturas e OS" value={ano} onChange={(e) => setAno(e.target.value)}>
        {[ANO, ANO - 1, ANO - 2].map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
        <option value="todos">Todo o período</option>
      </Selecao>
      <div className="lista">
        {planilhas.map((p) => (
          <div key={p.chave} className="linha">
            <div className="linha-texto">
              <div className="linha-titulo">{p.titulo}</div>
              <div className="linha-detalhe">{p.detalhe}</div>
            </div>
            <Botao
              variante="secundario"
              icone="lista"
              carregando={ocupado === p.chave}
              disabled={!!ocupado || !online}
              onClick={() => void p.baixar()}
              aria-label={`Baixar planilha: ${p.titulo}`}
            >
              Baixar
            </Botao>
          </div>
        ))}
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </Cartao>
  );
}

export function Backup() {
  return (
    <>
      <CabecalhoPagina titulo="Backup e exportação" voltar="/interno/mais" />
      <CopiaCompleta />
      <Planilhas />
    </>
  );
}

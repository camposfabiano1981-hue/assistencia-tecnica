// Cópia de segurança completa em JSON: cada documento pelo seu caminho, com datas e imagens preservadas.
// Formato: { formato, versao, geradoEm, projeto, incluiFotos, totais, documentos: { "chamados/12": {...} } }
// Datas viram {"$data": ISO} e imagens {"$bytes": base64}, para a restauração devolver os tipos originais
// (ferramentas/restaurar).
import {
  Bytes,
  DocumentReference,
  GeoPoint,
  Timestamp,
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';

export const FORMATO_BACKUP = 'assistencia-tecnica/backup';
const CHAVE_ULTIMO = 'backup:ultimo';

/** Valor do Firestore -> JSON sem perda de tipo. */
export function serializar(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Timestamp) return { $data: v.toDate().toISOString() };
  if (v instanceof Bytes) return { $bytes: v.toBase64() };
  if (v instanceof DocumentReference) return { $ref: v.path };
  if (v instanceof GeoPoint) return { $geo: { lat: v.latitude, lng: v.longitude } };
  if (Array.isArray(v)) return v.map(serializar);
  if (typeof v === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) saida[k] = serializar(x);
    return saida;
  }
  return v;
}

/** "chamados/12/fotos/f1" -> "chamados/fotos" (para os totais por coleção). */
export function grupoDoCaminho(caminho: string): string {
  return caminho
    .split('/')
    .filter((_, i) => i % 2 === 0)
    .join('/');
}

// Documentos com caminho fixo (as regras liberam um a um, não a coleção inteira).
const AVULSOS = [
  'config/instalacao',
  'config/publico',
  'config/empresa',
  'contadores/chamados',
  'contadores/os',
  'contadores/orcamentos',
  'contadores/faturas',
  'contadores/contratos',
];
const COLECOES = [
  'usuarios', 'clientes', 'tiposEquipamento', 'equipamentos', 'chamados', 'os', 'orcamentos', 'faturas', 'instrumentos', 'pecas', 'servicos',
  'contratos', 'avaliacoes', 'verificacoes',
];
const NOMES: Record<string, string> = {
  usuarios: 'equipe e acessos',
  clientes: 'clientes',
  tiposEquipamento: 'tipos de equipamento',
  equipamentos: 'equipamentos',
  chamados: 'chamados',
  os: 'ordens de serviço',
  orcamentos: 'orçamentos',
  faturas: 'faturas',
  instrumentos: 'instrumentos',
  pecas: 'estoque',
  servicos: 'tabela de serviços',
  contratos: 'contratos',
  avaliacoes: 'avaliações',
  verificacoes: 'códigos de autenticidade',
};

async function emLotes<T>(lista: T[], tamanho: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < lista.length; i += tamanho) await Promise.all(lista.slice(i, i + tamanho).map(fn));
}

export interface ResultadoBackup {
  blob: Blob;
  nome: string;
  documentos: number;
  totais: Record<string, number>;
}

/** Lê tudo do servidor (não do cache do aparelho, que pode estar incompleto) e monta o arquivo. */
export async function gerarBackup({
  incluirFotos,
  aoProgredir,
}: {
  incluirFotos: boolean;
  aoProgredir?: (etapa: string, documentos: number) => void;
}): Promise<ResultadoBackup> {
  const partes: string[] = [];
  const totais: Record<string, number> = {};
  let n = 0;
  const adicionar = (caminho: string, dados: DocumentData) => {
    partes.push(`${n ? ',' : ''}\n${JSON.stringify(caminho)}:${JSON.stringify(serializar(dados))}`);
    n++;
    const grupo = grupoDoCaminho(caminho);
    totais[grupo] = (totais[grupo] ?? 0) + 1;
  };

  aoProgredir?.('configurações', n);
  await Promise.all(
    AVULSOS.map(async (caminho) => {
      const s = await getDocFromServer(doc(db, caminho));
      if (s.exists()) adicionar(caminho, s.data());
    }),
  );

  const comFotos: string[] = [];
  const pecas: string[] = [];
  for (const nome of COLECOES) {
    aoProgredir?.(NOMES[nome] ?? nome, n);
    const snap = await getDocsFromServer(collection(db, nome));
    for (const d of snap.docs) {
      const dados = d.data();
      adicionar(`${nome}/${d.id}`, dados);
      if (nome === 'pecas') pecas.push(d.id);
      if (incluirFotos && (nome === 'chamados' || nome === 'os') && Number(dados.qtdFotos) > 0) comFotos.push(`${nome}/${d.id}`);
    }
  }

  aoProgredir?.('movimentos do estoque', n);
  await emLotes(pecas, 8, async (id) => {
    const snap = await getDocsFromServer(collection(db, 'pecas', id, 'movimentos'));
    for (const d of snap.docs) adicionar(`pecas/${id}/movimentos/${d.id}`, d.data());
  });

  if (incluirFotos) {
    aoProgredir?.('fotos', n);
    await emLotes(comFotos, 6, async (caminho) => {
      const snap = await getDocsFromServer(collection(db, caminho, 'fotos'));
      for (const d of snap.docs) adicionar(`${caminho}/fotos/${d.id}`, d.data());
      aoProgredir?.('fotos', n);
    });
  }

  const agora = new Date();
  const cabecalho = {
    formato: FORMATO_BACKUP,
    versao: 1,
    geradoEm: agora.toISOString(),
    projeto: db.app.options.projectId ?? null,
    incluiFotos: incluirFotos,
    totais,
  };
  // O cabeçalho vai na frente; os documentos entram como pedaços (sem montar uma string gigante).
  const blob = new Blob([JSON.stringify(cabecalho).slice(0, -1), ',"documentos":{', ...partes, '\n}}\n'], { type: 'application/json' });
  const dia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  return { blob, nome: `backup-assistencia-${dia}${incluirFotos ? '-com-fotos' : ''}.json`, documentos: n, totais };
}

/** Data da última cópia baixada neste aparelho (lembrete; não é um registro oficial). */
export function ultimoBackup(): Date | null {
  try {
    const v = localStorage.getItem(CHAVE_ULTIMO);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

export function marcarBackup(quando = new Date()): void {
  try {
    localStorage.setItem(CHAVE_ULTIMO, quando.toISOString());
  } catch {
    // Navegador sem armazenamento local: o lembrete apenas não aparece.
  }
}

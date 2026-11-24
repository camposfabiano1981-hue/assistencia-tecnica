// Tipos de equipamento: checklist e medições usados em cada OS.
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { addDoc, collection, doc, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { EXIGENCIAS_SUGERIDAS } from '../../dados/tiposPadrao';
import { codigoDe } from '../../dados/vencimentos';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta, useDocumento } from '../../dados/hooks';
import type { CategoriaEquipamento, Exigencia, ItemChecklistModelo, MedicaoModelo, TipoEquipamento } from '../../tipos';
import { rotuloCategoria } from '../../util/formato';
import { Icone } from '../../componentes/Icone';
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, LinhaLista, LinkBotao, Selecao, Selo } from '../../componentes/ui';

export function ListaTipos() {
  const { perfil } = useSessao();
  const { itens, carregando } = useConsulta<TipoEquipamento>(() => query(collection(db, 'tiposEquipamento'), orderBy('nome')), []);
  const [aplicando, setAplicando] = useState(false);
  const [aplicado, setAplicado] = useState('');
  const faltando = itens
    .map((t) => ({ t, novas: (EXIGENCIAS_SUGERIDAS[t.id] ?? []).filter((s) => !(t.exigencias ?? []).some((e) => e.codigo === s.codigo)) }))
    .filter((x) => x.novas.length);
  async function aplicarSugestoes() {
    setAplicando(true);
    try {
      for (const { t, novas } of faltando) await updateDoc(doc(db, 'tiposEquipamento', t.id), { exigencias: [...(t.exigencias ?? []), ...novas] });
      setAplicado(`Exigências incluídas em ${faltando.length} tipo(s).`);
    } finally {
      setAplicando(false);
    }
  }
  return (
    <>
      <CabecalhoPagina
        titulo="Tipos de equipamento"
        subtitulo="Checklists e medições de cada tipo"
        acoes={<LinkBotao para="/interno/tipos/novo" icone="mais_circulo">Novo</LinkBotao>}
      />
      <Aviso tom="info">
        Os modelos iniciais são um ponto de partida. Ajuste itens e limites conforme os manuais dos fabricantes e a sua prática.
      </Aviso>
      {aplicado && <Aviso tom="sucesso">{aplicado}</Aviso>}
      {perfil?.papel === 'gestor' && !!faltando.length && (
        <Aviso tom="alerta">
          Há exigências periódicas sugeridas para {faltando.length} tipo(s) (ensaio de segurança elétrica, qualificação térmica, testes de raio-X).
          <div className="acoes">
            <Botao variante="secundario" carregando={aplicando} onClick={aplicarSugestoes}>
              Incluir sugestões
            </Botao>
          </div>
        </Aviso>
      )}
      {carregando ? (
        <Carregando />
      ) : (
        <div className="lista">
          {itens.map((t) => (
            <LinhaLista
              key={t.id}
              para={`/interno/tipos/${t.id}`}
              titulo={t.nome}
              detalhe={`${t.checklist?.length ?? 0} itens · ${t.medicoes?.length ?? 0} medições${t.periodicidadeMeses ? ` · preventiva a cada ${t.periodicidadeMeses} meses` : ''}`}
              lateral={<Selo tom="info">{rotuloCategoria[t.categoria]}</Selo>}
            />
          ))}
        </div>
      )}
    </>
  );
}

const novoId = () => Math.random().toString(36).slice(2, 9);
const numeroOuNulo = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export function TipoEditar() {
  const { id = 'novo' } = useParams();
  const navegar = useNavigate();
  const { perfil } = useSessao();
  const novo = id === 'novo';
  const existente = useDocumento<TipoEquipamento>(novo ? null : `tiposEquipamento/${id}`);
  const [f, setF] = useState<Omit<TipoEquipamento, 'id'> | null>(
    novo ? { nome: '', categoria: 'odontologico', checklist: [], medicoes: [], periodicidadeMeses: 6, exigeEnsaioSeguranca: false, observacoes: '', exigencias: [] } : null,
  );
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const gestor = perfil?.papel === 'gestor';

  if (!novo && !f && existente.dados) {
    const { id: _ignora, ...resto } = existente.dados;
    void _ignora;
    setF({ observacoes: '', exigeEnsaioSeguranca: false, periodicidadeMeses: null, ...resto, checklist: resto.checklist ?? [], medicoes: resto.medicoes ?? [], exigencias: resto.exigencias ?? [] });
  }
  if (!f) return <Carregando />;

  const setItem = (i: number, texto: string) => setF({ ...f, checklist: f.checklist.map((it, j) => (j === i ? { ...it, texto } : it)) });
  const mover = (i: number, d: -1 | 1) => {
    const lista = [...f.checklist];
    const alvo = i + d;
    if (alvo < 0 || alvo >= lista.length) return;
    [lista[i], lista[alvo]] = [lista[alvo], lista[i]];
    setF({ ...f, checklist: lista });
  };
  const setMed = (i: number, campo: keyof MedicaoModelo, valor: string) =>
    setF({
      ...f,
      medicoes: f.medicoes.map((m, j) => (j === i ? { ...m, [campo]: campo === 'min' || campo === 'max' ? numeroOuNulo(valor) : valor } : m)),
    });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErro('');
    setSalvando(true);
    const dados = {
      ...f,
      nome: f.nome.trim(),
      checklist: f.checklist.filter((i) => i.texto.trim()).map<ItemChecklistModelo>((i) => ({ id: i.id, texto: i.texto.trim() })),
      medicoes: f.medicoes
        .filter((m) => m.nome.trim())
        .map<MedicaoModelo>((m) => ({ id: m.id, nome: m.nome.trim(), unidade: m.unidade.trim(), min: m.min ?? null, max: m.max ?? null })),
      exigencias: (f.exigencias ?? [])
        .filter((x) => x.descricao.trim() && x.periodicidadeMeses > 0)
        .reduce<Exigencia[]>((lista, x) => {
          let codigo = x.codigo || codigoDe(x.descricao);
          if (codigo === 'preventiva' || lista.some((y) => y.codigo === codigo)) codigo = `${codigo}-${lista.length + 1}`;
          return [...lista, { codigo, descricao: x.descricao.trim(), periodicidadeMeses: Math.round(x.periodicidadeMeses) }];
        }, []),
    };
    try {
      if (novo) await addDoc(collection(db, 'tiposEquipamento'), dados);
      else await setDoc(doc(db, 'tiposEquipamento', id), dados);
      navegar('/interno/tipos', { replace: true });
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar}>
      <CabecalhoPagina titulo={novo ? 'Novo tipo de equipamento' : f.nome} voltar="/interno/tipos" />
      {!gestor && <Aviso tom="alerta">Somente o gestor altera os tipos de equipamento.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Cartao>
        <Campo rotulo="Nome" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <div className="grade grade-2">
          <Selecao rotulo="Categoria" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value as CategoriaEquipamento })}>
            {Object.entries(rotuloCategoria).map(([v, r]) => (
              <option key={v} value={v}>{r}</option>
            ))}
          </Selecao>
          <Campo
            rotulo="Preventiva a cada (meses)"
            type="number"
            min={0}
            value={f.periodicidadeMeses ?? ''}
            onChange={(e) => setF({ ...f, periodicidadeMeses: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
        <label className="marcador">
          <input type="checkbox" checked={!!f.exigeEnsaioSeguranca} onChange={(e) => setF({ ...f, exigeEnsaioSeguranca: e.target.checked })} />
          <span>Equipamento eletromédico: registrar ensaio de segurança elétrica (ABNT NBR IEC 62353)</span>
        </label>
        <AreaTexto rotulo="Observações (normas, cuidados)" rows={2} value={f.observacoes ?? ''} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
      </Cartao>

      <Cartao titulo={`Checklist (${f.checklist.length})`}>
        {f.checklist.map((it, i) => (
          <div className="editor-linha" key={it.id}>
            <input value={it.texto} onChange={(e) => setItem(i, e.target.value)} aria-label={`Item ${i + 1}`} />
            <button type="button" className="icone-botao" style={{ color: 'var(--texto-suave)' }} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
            <button type="button" className="icone-botao" onClick={() => setF({ ...f, checklist: f.checklist.filter((_, j) => j !== i) })} aria-label="Remover item">
              <Icone nome="lixo" tamanho={18} />
            </button>
          </div>
        ))}
        <Botao type="button" variante="secundario" icone="mais_circulo" onClick={() => setF({ ...f, checklist: [...f.checklist, { id: novoId(), texto: '' }] })}>
          Adicionar item
        </Botao>
      </Cartao>

      <Cartao titulo={`Medições (${f.medicoes.length})`}>
        <p className="pequeno">Deixe mínimo ou máximo em branco quando não houver limite. O laudo marca aprovado/reprovado automaticamente.</p>
        {f.medicoes.map((m, i) => (
          <div className="editor-linha" key={m.id}>
            <input value={m.nome} onChange={(e) => setMed(i, 'nome', e.target.value)} placeholder="Grandeza" aria-label="Grandeza" />
            <input className="curto" value={m.unidade} onChange={(e) => setMed(i, 'unidade', e.target.value)} placeholder="Unid." aria-label="Unidade" />
            <input className="curto" inputMode="decimal" value={m.min ?? ''} onChange={(e) => setMed(i, 'min', e.target.value)} placeholder="Mín." aria-label="Mínimo" />
            <input className="curto" inputMode="decimal" value={m.max ?? ''} onChange={(e) => setMed(i, 'max', e.target.value)} placeholder="Máx." aria-label="Máximo" />
            <button type="button" className="icone-botao" onClick={() => setF({ ...f, medicoes: f.medicoes.filter((_, j) => j !== i) })} aria-label="Remover medição">
              <Icone nome="lixo" tamanho={18} />
            </button>
          </div>
        ))}
        <Botao
          type="button"
          variante="secundario"
          icone="mais_circulo"
          onClick={() => setF({ ...f, medicoes: [...f.medicoes, { id: novoId(), nome: '', unidade: '', min: null, max: null }] })}
        >
          Adicionar medição
        </Botao>
      </Cartao>
      <Cartao titulo={`Exigências periódicas (${(f.exigencias ?? []).length})`}>
        <p className="pequeno" style={{ marginTop: 0 }}>
          A preventiva usa o campo "Preventiva a cada (meses)". Aqui entram as outras: ensaio de segurança elétrica, qualificação térmica,
          testes de raio-X, inspeção NR-13… Quando uma OS cumpre a exigência, o próximo vencimento do equipamento é calculado sozinho.
        </p>
        {(f.exigencias ?? []).map((ex, i) => (
          <div className="editor-linha" key={`${ex.codigo}-${i}`}>
            <input
              value={ex.descricao}
              placeholder="Ex.: Ensaio de segurança elétrica (NBR IEC 62353)"
              aria-label="Exigência"
              onChange={(e) => setF({ ...f, exigencias: (f.exigencias ?? []).map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)) })}
            />
            <input
              className="curto"
              inputMode="numeric"
              aria-label="Periodicidade em meses"
              value={ex.periodicidadeMeses || ''}
              onChange={(e) => setF({ ...f, exigencias: (f.exigencias ?? []).map((x, j) => (j === i ? { ...x, periodicidadeMeses: Number(e.target.value.replace(/\D/g, '')) } : x)) })}
            />
            <span className="pequeno">meses</span>
            <button type="button" className="icone-botao" aria-label="Remover exigência" onClick={() => setF({ ...f, exigencias: (f.exigencias ?? []).filter((_, j) => j !== i) })}>
              <Icone nome="lixo" tamanho={18} />
            </button>
          </div>
        ))}
        <Botao
          type="button"
          variante="secundario"
          icone="mais_circulo"
          onClick={() => setF({ ...f, exigencias: [...(f.exigencias ?? []), { codigo: '', descricao: '', periodicidadeMeses: 12 }] })}
        >
          Adicionar exigência
        </Botao>
      </Cartao>
      <Botao type="submit" carregando={salvando} disabled={!gestor} bloco>
        Salvar tipo
      </Botao>
    </form>
  );
}

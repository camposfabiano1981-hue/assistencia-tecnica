import { useEffect, useState, type FormEvent } from 'react';
import { Bytes, Timestamp, collection, doc, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta } from '../../dados/hooks';
import { avisarNovoChamado, criarAcesso, definirAtivo, reenviarConvite } from '../../dados/operacoes';
import { prepararLogo } from '../../util/imagem';
import { soDigitos } from '../../util/formato';
import type { AmbienteFiscal, ConfigFiscal, DocumentoEmpresa, Empresa, Usuario } from '../../tipos';
import { CONFIG_FISCAL_PADRAO, lerExtras, testarPonte } from '../../dados/fiscal';
import { buscarCep } from '../../util/cep';
import { deInputData, paraInputData } from '../../util/datas';
import { Icone } from '../../componentes/Icone';
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, Selecao, Selo, useUrlImagem } from '../../componentes/ui';
import { CartaoPix } from '../../componentes/Valores';
import { pixDaCobranca } from '../../dados/financeiro';
import type { TipoChavePix } from '../../util/pix';

type FormEmpresa = {
  nome: string; documento: string; telefone: string; whatsapp: string; email: string; endereco: string; cidade: string;
  rtNome: string; rtRegistro: string; rodapeLaudo: string; avisoUrl: string; avisoToken: string;
};
const VAZIO: FormEmpresa = {
  nome: '', documento: '', telefone: '', whatsapp: '', email: '', endereco: '', cidade: '',
  rtNome: '', rtRegistro: '', rodapeLaudo: '', avisoUrl: '', avisoToken: '',
};

export function Configuracoes() {
  const { perfil, empresa } = useSessao();
  if (perfil?.papel !== 'gestor') {
    return (
      <>
        <CabecalhoPagina titulo="Configurações" voltar="/interno/mais" />
        <Aviso tom="alerta">Somente o gestor altera as configurações.</Aviso>
      </>
    );
  }
  if (!empresa) return <Carregando />;
  return (
    <>
      <CabecalhoPagina titulo="Configurações" voltar="/interno/mais" />
      <DadosEmpresa empresa={empresa} />
      <PixEOrcamento empresa={empresa} />
      <DocumentosEmpresa empresa={empresa} />
      <NotasFiscaisConfig empresa={empresa} />
      <AvisoEmail empresa={empresa} />
      <Equipe />
    </>
  );
}

function DadosEmpresa({ empresa }: { empresa: Empresa }) {
  const [f, setF] = useState<FormEmpresa>({ ...VAZIO, ...(Object.fromEntries(Object.entries(empresa).filter(([k]) => k in VAZIO)) as Partial<FormEmpresa>) });
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const logo = useUrlImagem(empresa.logo, empresa.logoTipo);
  const muda = (k: keyof FormEmpresa) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSalvando(true);
    try {
      const dados = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])) as FormEmpresa;
      dados.whatsapp = soDigitos(dados.whatsapp);
      const lote = writeBatch(db);
      const { avisoUrl: _a, avisoToken: _t, ...semAviso } = dados;
      void _a;
      void _t;
      lote.set(doc(db, 'config', 'empresa'), semAviso, { merge: true });
      lote.set(doc(db, 'config', 'publico'), { nome: dados.nome, whatsapp: dados.whatsapp });
      await lote.commit();
      setMsg({ tom: 'sucesso', texto: 'Dados da empresa salvos.' });
    } catch (err) {
      setMsg({ tom: 'erro', texto: mensagemErro(err) });
    } finally {
      setSalvando(false);
    }
  }

  async function trocarLogo(arquivo?: File) {
    if (!arquivo) return;
    try {
      const { bytes, tipo } = await prepararLogo(arquivo);
      await setDoc(doc(db, 'config', 'empresa'), { logo: Bytes.fromUint8Array(bytes), logoTipo: tipo }, { merge: true });
    } catch (err) {
      setMsg({ tom: 'erro', texto: mensagemErro(err) });
    }
  }

  return (
    <form onSubmit={salvar}>
      <Cartao titulo="Empresa (aparece no app e no laudo)">
        {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          {logo ? (
            <img src={logo} alt="Logo" style={{ width: 72, height: 72, objectFit: 'contain', border: '1px solid var(--borda)', borderRadius: 10 }} />
          ) : (
            <div className="pequeno" style={{ width: 72, height: 72, display: 'grid', placeItems: 'center', border: '1px dashed var(--borda)', borderRadius: 10 }}>
              Sem logo
            </div>
          )}
          <label className="botao botao-secundario">
            <span>{logo ? 'Trocar logo' : 'Enviar logo'}</span>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void trocarLogo(e.target.files?.[0])} />
          </label>
          {logo && (
            <Botao type="button" variante="fantasma" onClick={() => void setDoc(doc(db, 'config', 'empresa'), { logo: null, logoTipo: '' }, { merge: true })}>
              Remover
            </Botao>
          )}
        </div>
        <Campo rotulo="Nome da empresa" required value={f.nome} onChange={muda('nome')} />
        <div className="grade grade-2">
          <Campo rotulo="CNPJ" value={f.documento} onChange={muda('documento')} />
          <Campo rotulo="WhatsApp" inputMode="tel" value={f.whatsapp} onChange={muda('whatsapp')} ajuda="Recebe os avisos e aparece no QR." />
          <Campo rotulo="Telefone" inputMode="tel" value={f.telefone} onChange={muda('telefone')} />
          <Campo rotulo="E-mail" type="email" value={f.email} onChange={muda('email')} />
          <Campo rotulo="Endereço" value={f.endereco} onChange={muda('endereco')} />
          <Campo rotulo="Cidade / UF" value={f.cidade} onChange={muda('cidade')} />
          <Campo rotulo="Responsável técnico" value={f.rtNome} onChange={muda('rtNome')} />
          <Campo rotulo="Registro do RT (CFT/CREA)" value={f.rtRegistro} onChange={muda('rtRegistro')} placeholder="Ex.: CFT nº 0000000" />
        </div>
        <AreaTexto rotulo="Texto de rodapé do laudo" rows={2} value={f.rodapeLaudo} onChange={muda('rodapeLaudo')} placeholder="Ex.: Garantia de 90 dias para o serviço executado." />
        <Botao type="submit" carregando={salvando}>Salvar dados da empresa</Botao>
      </Cartao>
    </form>
  );
}

function AvisoEmail({ empresa }: { empresa: Empresa }) {
  const [url, setUrl] = useState(empresa.avisoUrl ?? '');
  const [token, setToken] = useState(empresa.avisoToken ?? '');
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso' | 'info'; texto: string } | null>(null);
  useEffect(() => {
    setUrl(empresa.avisoUrl ?? '');
    setToken(empresa.avisoToken ?? '');
  }, [empresa.avisoUrl, empresa.avisoToken]);

  async function salvar() {
    setMsg(null);
    try {
      await setDoc(doc(db, 'config', 'empresa'), { avisoUrl: url.trim(), avisoToken: token.trim() }, { merge: true });
      setMsg({ tom: 'sucesso', texto: 'Aviso por e-mail salvo.' });
    } catch (err) {
      setMsg({ tom: 'erro', texto: mensagemErro(err) });
    }
  }

  return (
    <Cartao titulo="Aviso de novo chamado por e-mail">
      <p className="pequeno">
        Grátis, pelo Google Apps Script da sua conta Google. Cada chamado aberto no portal manda um e-mail, que chega como
        notificação do Gmail no celular. O passo a passo está no arquivo <code>apps-script/LEIA-ME.md</code> do projeto.
      </p>
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <Campo rotulo="Endereço do script (URL do app da Web)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
      <Campo
        rotulo="Código de segurança"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        ajuda="O mesmo código colado nas propriedades do script. Impede que outras pessoas disparem e-mails."
      />
      <div className="acoes">
        <Botao type="button" variante="secundario" onClick={() => setToken(crypto.randomUUID().replace(/-/g, '').slice(0, 20))}>
          Gerar código
        </Botao>
        <Botao type="button" onClick={salvar}>Salvar</Botao>
        <Botao
          type="button"
          variante="secundario"
          disabled={!empresa.avisoUrl}
          onClick={() => {
            avisarNovoChamado(empresa, { numero: 0, cliente: 'TESTE', equipamento: 'Teste do aviso', parado: false, relato: 'Se este e-mail chegou, o aviso está funcionando.' });
            setMsg({ tom: 'info', texto: 'E-mail de teste disparado. Confira a caixa de entrada em alguns segundos.' });
          }}
        >
          Enviar teste
        </Botao>
      </div>
    </Cartao>
  );
}

function Equipe() {
  const { perfil } = useSessao();
  const equipe = useConsulta<Usuario>(() => query(collection(db, 'usuarios'), where('papel', 'in', ['gestor', 'tecnico'])), []);
  const [f, setF] = useState({ nome: '', email: '', registro: '', telefone: '' });
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setEnviando(true);
    try {
      await criarAcesso({ nome: f.nome, email: f.email, papel: 'tecnico', registroProfissional: f.registro, telefone: f.telefone });
      setMsg({ tom: 'sucesso', texto: `Técnico cadastrado. ${f.email} vai receber o e-mail para criar a senha.` });
      setF({ nome: '', email: '', registro: '', telefone: '' });
    } catch (err) {
      setMsg({ tom: 'erro', texto: mensagemErro(err) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao titulo="Equipe">
      {equipe.carregando ? (
        <Carregando />
      ) : (
        <div className="lista" style={{ marginBottom: 14 }}>
          {equipe.itens.map((u) => (
            <div key={u.id} className="linha">
              <div className="linha-texto">
                <div className="linha-titulo">{u.nome}</div>
                <div className="linha-detalhe">{[u.email, u.registroProfissional].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="linha-lateral">
                <Selo tom={u.papel === 'gestor' ? 'roxo' : 'info'}>{u.papel === 'gestor' ? 'Gestor' : 'Técnico'}</Selo>
                {u.id !== perfil?.id && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="botao botao-fantasma" onClick={() => void reenviarConvite(u.email).then(() => setMsg({ tom: 'sucesso', texto: `E-mail reenviado para ${u.email}.` }))}>
                      Reenviar e-mail
                    </button>
                    <button type="button" className="botao botao-fantasma" onClick={() => void definirAtivo(u, !u.ativo)}>
                      {u.ativo ? 'Bloquear' : 'Liberar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <form onSubmit={adicionar}>
        <div className="grade grade-2">
          <Campo rotulo="Nome do técnico" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <Campo rotulo="E-mail" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Campo rotulo="Registro (CFT/CREA)" value={f.registro} onChange={(e) => setF({ ...f, registro: e.target.value })} />
          <Campo rotulo="Celular" inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} />
        </div>
        <Botao type="submit" variante="secundario" icone="usuario" carregando={enviando}>
          Adicionar técnico
        </Botao>
      </form>
      <p className="pequeno" style={{ marginTop: 12 }}>
        Seu registro profissional aparece no laudo: preencha em "Registro do RT" acima se você mesmo atende.
      </p>
    </Cartao>
  );
}

const TIPOS_CHAVE: { valor: TipoChavePix; rotulo: string; exemplo: string }[] = [
  { valor: 'cnpj', rotulo: 'CNPJ', exemplo: '12.345.678/0001-90' },
  { valor: 'cpf', rotulo: 'CPF', exemplo: '123.456.789-09' },
  { valor: 'telefone', rotulo: 'Celular', exemplo: '(67) 99999-1234' },
  { valor: 'email', rotulo: 'E-mail', exemplo: 'financeiro@empresa.com' },
  { valor: 'aleatoria', rotulo: 'Chave aleatória', exemplo: '123e4567-e89b-12d3-a456-426614174000' },
];

function PixEOrcamento({ empresa }: { empresa: Empresa }) {
  const [f, setF] = useState({
    pixTipo: (empresa.pixTipo ?? 'cnpj') as TipoChavePix,
    pixChave: empresa.pixChave ?? '',
    pixNome: empresa.pixNome ?? empresa.nome ?? '',
    pixCidade: empresa.pixCidade ?? (empresa.cidade ?? '').split(/[-/]/)[0].trim(),
    orcValidadeDias: String(empresa.orcValidadeDias ?? 10),
    orcCondicoes: empresa.orcCondicoes ?? 'Pix ou transferência em até 7 dias após a conclusão do serviço.',
    orcGarantia: empresa.orcGarantia ?? '90 dias para o serviço executado; peças conforme garantia do fabricante.',
  });
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [teste, setTeste] = useState(false);
  const exemplo = TIPOS_CHAVE.find((t) => t.valor === f.pixTipo)?.exemplo;
  const pixTeste = teste
    ? pixDaCobranca({ ...empresa, pixTipo: f.pixTipo, pixChave: f.pixChave, pixNome: f.pixNome, pixCidade: f.pixCidade }, 1, 'TESTE')
    : null;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await setDoc(
        doc(db, 'config', 'empresa'),
        {
          pixTipo: f.pixTipo,
          pixChave: f.pixChave.trim(),
          pixNome: f.pixNome.trim(),
          pixCidade: f.pixCidade.trim(),
          orcValidadeDias: Math.max(1, Number(f.orcValidadeDias) || 10),
          orcCondicoes: f.orcCondicoes.trim(),
          orcGarantia: f.orcGarantia.trim(),
        },
        { merge: true },
      );
      setMsg({ tom: 'sucesso', texto: 'Pix e textos do orçamento salvos.' });
    } catch (err) {
      setMsg({ tom: 'erro', texto: mensagemErro(err) });
    }
  }

  return (
    <form onSubmit={salvar}>
      <Cartao titulo="Pix e orçamento">
        <p className="pequeno" style={{ marginTop: 0 }}>
          A fatura sai com QR code e Pix copia e cola gerados no próprio app, sem custo e sem integração com banco. A baixa é feita por você,
          conferindo o extrato.
        </p>
        {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
        <div className="grade grade-2">
          <Selecao rotulo="Tipo da chave Pix" value={f.pixTipo} onChange={(e) => setF({ ...f, pixTipo: e.target.value as TipoChavePix })}>
            {TIPOS_CHAVE.map((t) => (
              <option key={t.valor} value={t.valor}>{t.rotulo}</option>
            ))}
          </Selecao>
          <Campo rotulo="Chave Pix" value={f.pixChave} onChange={(e) => setF({ ...f, pixChave: e.target.value })} placeholder={exemplo} />
          <Campo rotulo="Nome do recebedor" value={f.pixNome} maxLength={25} onChange={(e) => setF({ ...f, pixNome: e.target.value })} ajuda="Até 25 letras, como aparece no banco." />
          <Campo rotulo="Cidade do recebedor" value={f.pixCidade} maxLength={15} onChange={(e) => setF({ ...f, pixCidade: e.target.value })} ajuda="Até 15 letras." />
        </div>
        <div className="grade grade-3">
          <Campo rotulo="Validade do orçamento (dias)" type="number" min={1} value={f.orcValidadeDias} onChange={(e) => setF({ ...f, orcValidadeDias: e.target.value })} />
        </div>
        <AreaTexto rotulo="Condições de pagamento (padrão)" rows={2} value={f.orcCondicoes} onChange={(e) => setF({ ...f, orcCondicoes: e.target.value })} />
        <AreaTexto rotulo="Garantia (padrão)" rows={2} value={f.orcGarantia} onChange={(e) => setF({ ...f, orcGarantia: e.target.value })} />
        <div className="acoes">
          <Botao type="submit">Salvar</Botao>
          <Botao type="button" variante="secundario" disabled={!f.pixChave.trim()} onClick={() => setTeste(!teste)}>
            {teste ? 'Fechar teste' : 'Testar Pix (R$ 1,00)'}
          </Botao>
        </div>
        {teste &&
          (pixTeste ? (
            <div style={{ marginTop: 14 }}>
              <Aviso tom="info">Leia o QR no app do seu banco e confira se aparecem o seu nome e a sua chave. Não precisa concluir o pagamento.</Aviso>
              <CartaoPix payload={pixTeste} valor={1} titulo="Pix de teste" />
            </div>
          ) : (
            <Aviso tom="erro">Confira chave, nome e cidade do recebedor.</Aviso>
          ))}
      </Cartao>
    </form>
  );
}

type LinhaDocumento = { id: string; nome: string; numero: string; validade: string; link: string };

/** Documentos que aparecem na Pasta da VISA dos clientes (o arquivo fica num link, ex.: Google Drive). */
function DocumentosEmpresa({ empresa }: { empresa: Empresa }) {
  const [linhas, setLinhas] = useState<LinhaDocumento[]>(() =>
    (empresa.documentos ?? []).map((d) => ({
      id: d.id,
      nome: d.nome,
      numero: d.numero ?? '',
      validade: paraInputData(d.validade?.toDate() ?? null),
      link: d.link ?? '',
    })),
  );
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso'; texto: string } | null>(null);
  const muda = (i: number, k: keyof LinhaDocumento, v: string) => setLinhas(linhas.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function salvar() {
    setMsg(null);
    const validas = linhas.filter((l) => l.nome.trim());
    if (validas.some((l) => l.link.trim() && !/^https:\/\//i.test(l.link.trim()))) {
      return setMsg({ tom: 'erro', texto: 'O link precisa começar com https:// (ex.: link de compartilhamento do Google Drive).' });
    }
    const documentos: DocumentoEmpresa[] = validas.map((l) => {
      const validade = deInputData(l.validade);
      return {
        id: l.id,
        nome: l.nome.trim().slice(0, 120),
        ...(l.numero.trim() ? { numero: l.numero.trim().slice(0, 60) } : {}),
        validade: validade ? Timestamp.fromDate(validade) : null,
        ...(l.link.trim() ? { link: l.link.trim() } : {}),
      };
    });
    try {
      await setDoc(doc(db, 'config', 'empresa'), { documentos }, { merge: true });
      setLinhas(validas);
      setMsg({ tom: 'sucesso', texto: 'Documentos salvos. Eles já aparecem na Pasta da VISA dos clientes.' });
    } catch (e) {
      setMsg({ tom: 'erro', texto: mensagemErro(e) });
    }
  }

  return (
    <Cartao titulo="Documentos para a Pasta da VISA">
      <p className="pequeno" style={{ marginTop: 0 }}>
        Aparecem para os clientes no portal e no dossiê em PDF. Ex.: cartão CNPJ, alvará de funcionamento, registro do responsável técnico
        (CFT/CREA). Guarde o arquivo no Google Drive e cole aqui o link de compartilhamento.
      </p>
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      {linhas.map((l, i) => (
        <div key={l.id} className="item-valor">
          <div className="item-valor-topo">
            <span className="pequeno">Documento {i + 1}</span>
            <button type="button" className="icone-botao" aria-label="Remover documento" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}>
              <Icone nome="lixo" tamanho={18} />
            </button>
          </div>
          <div className="grade grade-2">
            <Campo rotulo="Nome do documento" value={l.nome} onChange={(e) => muda(i, 'nome', e.target.value)} placeholder="Ex.: Alvará de funcionamento" />
            <Campo rotulo="Número" value={l.numero} onChange={(e) => muda(i, 'numero', e.target.value)} />
            <Campo rotulo="Validade" type="date" value={l.validade} onChange={(e) => muda(i, 'validade', e.target.value)} />
            <Campo rotulo="Link do arquivo" type="url" value={l.link} onChange={(e) => muda(i, 'link', e.target.value)} placeholder="https://drive.google.com/…" />
          </div>
        </div>
      ))}
      <div className="acoes">
        <Botao
          type="button"
          variante="secundario"
          icone="mais_circulo"
          onClick={() => setLinhas([...linhas, { id: crypto.randomUUID().slice(0, 8), nome: '', numero: '', validade: '', link: '' }])}
        >
          Documento
        </Botao>
        <Botao type="button" onClick={() => void salvar()}>
          Salvar documentos
        </Botao>
      </div>
    </Cartao>
  );
}

/** Emissão automática de NFS-e e NF-e pela Focus NFe (com a ponte no Google Apps Script). */
function NotasFiscaisConfig({ empresa }: { empresa: Empresa }) {
  const [f, setF] = useState<ConfigFiscal>(() => ({
    ...CONFIG_FISCAL_PADRAO,
    cnpj: soDigitos(empresa.documento),
    ...empresa.fiscal,
    nfse: { ...CONFIG_FISCAL_PADRAO.nfse, ...empresa.fiscal?.nfse },
    nfe: { ...CONFIG_FISCAL_PADRAO.nfe, ...empresa.fiscal?.nfe },
  }));
  const [cep, setCep] = useState('');
  const [msg, setMsg] = useState<{ tom: 'erro' | 'sucesso' | 'info'; texto: string } | null>(null);
  const [testando, setTestando] = useState(false);
  const nfse = (k: keyof ConfigFiscal['nfse'], v: string) => setF({ ...f, nfse: { ...f.nfse, [k]: v } });
  const nfe = (k: keyof ConfigFiscal['nfe'], v: string) => setF({ ...f, nfe: { ...f.nfe, [k]: v } });

  async function porCep() {
    try {
      const e = await buscarCep(cep);
      if (!e) return setMsg({ tom: 'erro', texto: 'CEP não encontrado.' });
      setF({ ...f, codigoMunicipio: e.codigoMunicipio, uf: e.uf });
      setMsg({ tom: 'info', texto: `${e.municipio} - ${e.uf}: código IBGE ${e.codigoMunicipio}.` });
    } catch (e) {
      setMsg({ tom: 'erro', texto: mensagemErro(e) });
    }
  }

  async function salvar() {
    setMsg(null);
    const limpa: ConfigFiscal = {
      ...f,
      urlPonte: f.urlPonte.trim(),
      cnpj: soDigitos(f.cnpj),
      inscricaoMunicipal: f.inscricaoMunicipal?.trim(),
      inscricaoEstadual: f.inscricaoEstadual?.trim(),
      codigoMunicipio: soDigitos(f.codigoMunicipio),
      uf: f.uf.trim().toUpperCase(),
    };
    if (limpa.ativo) {
      if (limpa.cnpj.length !== 14) return setMsg({ tom: 'erro', texto: 'Informe o CNPJ da empresa (14 dígitos).' });
      if (limpa.codigoMunicipio.length !== 7) return setMsg({ tom: 'erro', texto: 'Informe o código IBGE do município (7 dígitos): use o CEP.' });
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(limpa.urlPonte)) {
        return setMsg({ tom: 'erro', texto: 'O endereço da ponte é a URL do app da Web do Apps Script (https://script.google.com/…/exec).' });
      }
    }
    try {
      lerExtras(limpa.nfse.extras);
      lerExtras(limpa.nfe.extras);
    } catch (e) {
      return setMsg({ tom: 'erro', texto: (e as Error).message });
    }
    try {
      await setDoc(doc(db, 'config', 'empresa'), { fiscal: limpa }, { merge: true });
      setF(limpa);
      setMsg({ tom: 'sucesso', texto: limpa.ativo ? 'Notas fiscais salvas. As faturas já mostram os botões de emissão.' : 'Notas fiscais salvas (emissão desligada).' });
    } catch (e) {
      setMsg({ tom: 'erro', texto: mensagemErro(e) });
    }
  }

  async function testar() {
    setMsg(null);
    setTestando(true);
    try {
      const r = await testarPonte(f.urlPonte.trim());
      setMsg({
        tom: r.ok ? 'sucesso' : 'erro',
        texto: r.ok
          ? `A ponte respondeu (versão ${r.versao}, projeto ${r.projeto ?? 'não definido'}). Token de homologação: ${r.homologacao ? 'configurado' : 'FALTA'}. Token de produção: ${
              r.producao ? 'configurado' : 'ainda não'
            }.`
          : 'A ponte respondeu com erro.',
      });
    } catch (e) {
      setMsg({ tom: 'erro', texto: `A ponte não respondeu: ${mensagemErro(e)}. Confira a URL e se a implantação está como "Qualquer pessoa".` });
    } finally {
      setTestando(false);
    }
  }

  return (
    <Cartao titulo="Notas fiscais (Focus NFe)">
      <p className="pequeno" style={{ marginTop: 0 }}>
        A fatura emite a NFS-e dos serviços e a NF-e das peças com um toque. O token da Focus NFe fica na ponte do Google Apps Script, nunca
        no app. Passo a passo em <code>apps-script/notas-fiscais/LEIA-ME.md</code>.
      </p>
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <label className="marcador">
        <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
        <span>Emitir notas pelo app</span>
      </label>
      <div className="grade grade-2">
        <Selecao rotulo="Ambiente" value={f.ambiente} onChange={(e) => setF({ ...f, ambiente: e.target.value as AmbienteFiscal })}>
          <option value="homologacao">Homologação (testes, sem valor fiscal)</option>
          <option value="producao">Produção (notas válidas)</option>
        </Selecao>
        <Campo rotulo="Endereço da ponte" type="url" value={f.urlPonte} onChange={(e) => setF({ ...f, urlPonte: e.target.value })} placeholder="https://script.google.com/macros/s/…/exec" />
        <Campo rotulo="CNPJ da empresa" inputMode="numeric" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} />
        <Selecao rotulo="Regime tributário" value={f.opcaoSimples} onChange={(e) => setF({ ...f, opcaoSimples: e.target.value as ConfigFiscal['opcaoSimples'] })}>
          <option value="3">Simples Nacional (ME/EPP)</option>
          <option value="2">MEI</option>
          <option value="1">Não optante pelo Simples</option>
        </Selecao>
        <Campo rotulo="Inscrição municipal" value={f.inscricaoMunicipal ?? ''} onChange={(e) => setF({ ...f, inscricaoMunicipal: e.target.value })} />
        <Campo rotulo="Inscrição estadual" value={f.inscricaoEstadual ?? ''} onChange={(e) => setF({ ...f, inscricaoEstadual: e.target.value })} ajuda="Necessária para a NF-e das peças." />
        <div className="campo">
          <span className="campo-rotulo">CEP da empresa (preenche o município)</span>
          <div className="editor-linha">
            <input aria-label="CEP da empresa" inputMode="numeric" value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" />
            <Botao type="button" variante="secundario" onClick={() => void porCep()}>
              Buscar
            </Botao>
          </div>
        </div>
        <div className="grade grade-2" style={{ gap: 10 }}>
          <Campo rotulo="Código IBGE do município" inputMode="numeric" value={f.codigoMunicipio} onChange={(e) => setF({ ...f, codigoMunicipio: e.target.value })} />
          <Campo rotulo="UF" maxLength={2} value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value })} />
        </div>
      </div>

      <h3 className="secao-titulo">NFS-e (serviços)</h3>
      <div className="grade grade-2">
        <Campo
          rotulo="Código de tributação nacional"
          value={f.nfse.codigoTributacaoNacional}
          onChange={(e) => nfse('codigoTributacaoNacional', e.target.value)}
          ajuda="6 dígitos, ex.: 140101 (item 14.01 da LC 116). Confirme com o contador."
        />
        <Campo
          rotulo="Código de tributação municipal"
          value={f.nfse.codigoTributacaoMunicipal ?? ''}
          onChange={(e) => nfse('codigoTributacaoMunicipal', e.target.value)}
          ajuda="Só se a prefeitura exigir."
        />
        <Selecao rotulo="Tributação do ISS" value={f.nfse.tributacaoIss} onChange={(e) => nfse('tributacaoIss', e.target.value)}>
          <option value="1">1 · Operação tributável</option>
          <option value="2">2 · Imunidade</option>
          <option value="3">3 · Exportação de serviço</option>
          <option value="4">4 · Não incidência</option>
        </Selecao>
        <Selecao rotulo="Retenção do ISS" value={f.nfse.retencaoIss} onChange={(e) => nfse('retencaoIss', e.target.value)}>
          <option value="1">1 · Não retido</option>
          <option value="2">2 · Retido pelo tomador</option>
          <option value="3">3 · Retido pelo intermediário</option>
        </Selecao>
      </div>
      <AreaTexto rotulo="Texto complementar da NFS-e (opcional)" rows={2} value={f.nfse.descricaoComplementar ?? ''} onChange={(e) => nfse('descricaoComplementar', e.target.value)} />

      <h3 className="secao-titulo">NF-e (peças)</h3>
      <div className="grade grade-3">
        <Campo rotulo="Natureza da operação" value={f.nfe.naturezaOperacao} onChange={(e) => nfe('naturezaOperacao', e.target.value)} />
        <Campo rotulo="CFOP dentro do estado" inputMode="numeric" value={f.nfe.cfopInterno} onChange={(e) => nfe('cfopInterno', e.target.value)} />
        <Campo rotulo="CFOP para outro estado" inputMode="numeric" value={f.nfe.cfopInterestadual} onChange={(e) => nfe('cfopInterestadual', e.target.value)} />
        <Campo rotulo="CSOSN / CST do ICMS" inputMode="numeric" value={f.nfe.csosn} onChange={(e) => nfe('csosn', e.target.value)} />
        <Campo rotulo="Origem da mercadoria" inputMode="numeric" value={f.nfe.origem} onChange={(e) => nfe('origem', e.target.value)} ajuda="0 = nacional" />
        <Campo rotulo="Forma de pagamento" inputMode="numeric" value={f.nfe.formaPagamento} onChange={(e) => nfe('formaPagamento', e.target.value)} ajuda="17 Pix, 15 boleto, 99 outros" />
        <Campo rotulo="CST do PIS" inputMode="numeric" value={f.nfe.pisCst} onChange={(e) => nfe('pisCst', e.target.value)} />
        <Campo rotulo="CST da COFINS" inputMode="numeric" value={f.nfe.cofinsCst} onChange={(e) => nfe('cofinsCst', e.target.value)} />
        <Selecao rotulo="Consumidor final" value={f.nfe.consumidorFinal} onChange={(e) => nfe('consumidorFinal', e.target.value)}>
          <option value="1">Sim (clínica usa a peça)</option>
          <option value="0">Não (revenda)</option>
        </Selecao>
      </div>
      <details className="grafico-tabela">
        <summary>Campos extras (avançado)</summary>
        <p className="pequeno">
          Objeto JSON acrescentado ao pedido enviado à Focus NFe, para um campo que o seu município ou o suporte da Focus pedir. Ex.:{' '}
          <code>{'{"regime_especial_tributacao": "0"}'}</code>
        </p>
        <AreaTexto rotulo="Extras da NFS-e" rows={2} value={f.nfse.extras ?? ''} onChange={(e) => nfse('extras', e.target.value)} />
        <AreaTexto rotulo="Extras da NF-e" rows={2} value={f.nfe.extras ?? ''} onChange={(e) => nfe('extras', e.target.value)} />
      </details>
      <p className="pequeno">
        Estes padrões são um ponto de partida: confira cada código com o contador e faça as primeiras notas em <strong>homologação</strong>.
      </p>
      <div className="acoes">
        <Botao type="button" onClick={() => void salvar()}>
          Salvar notas fiscais
        </Botao>
        <Botao type="button" variante="secundario" carregando={testando} disabled={!f.urlPonte.trim()} onClick={() => void testar()}>
          Testar ponte
        </Botao>
      </div>
    </Cartao>
  );
}

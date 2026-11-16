import { useEffect, useState, type FormEvent } from 'react';
import { Bytes, collection, doc, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta } from '../../dados/hooks';
import { avisarNovoChamado, criarAcesso, definirAtivo, reenviarConvite } from '../../dados/operacoes';
import { prepararLogo } from '../../util/imagem';
import { soDigitos } from '../../util/formato';
import type { Empresa, Usuario } from '../../tipos';
import { AreaTexto, Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, Selo, useUrlImagem } from '../../componentes/ui';

type FormEmpresa = Required<Omit<Empresa, 'logo' | 'logoTipo'>>;
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

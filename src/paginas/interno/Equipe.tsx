// Equipe e níveis de acesso: quem entra no app e o que cada pessoa pode ver e fazer.
import { useState, type FormEvent } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useSessao } from '../../sessao';
import { mensagemErro, useConsulta } from '../../dados/hooks';
import { criarAcesso, definirAtivo, mudarPapel, reenviarConvite } from '../../dados/operacoes';
import { PAPEIS_EQUIPE, RESUMO_PAPEL, ROTULO_PAPEL, TOM_PAPEL, type PapelEquipe } from '../../acessos';
import type { Usuario } from '../../tipos';
import { Aviso, Botao, CabecalhoPagina, Campo, Carregando, Cartao, Selecao, Selo } from '../../componentes/ui';

type Mensagem = { tom: 'erro' | 'sucesso'; texto: string } | null;

const ORDEM: Record<string, number> = { gestor: 0, administrativo: 1, tecnico: 2 };

export function EquipeAcessos() {
  const [msg, setMsg] = useState<Mensagem>(null);
  return (
    <>
      <CabecalhoPagina titulo="Equipe e acessos" subtitulo="Todos entram pela mesma tela de login; cada um vê só o que o seu nível permite" />
      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      <Pessoas aoAvisar={setMsg} />
      <NovaPessoa aoAvisar={setMsg} />
      <NiveisDeAcesso />
    </>
  );
}

function Pessoas({ aoAvisar }: { aoAvisar: (m: Mensagem) => void }) {
  const { perfil } = useSessao();
  const equipe = useConsulta<Usuario>(() => query(collection(db, 'usuarios'), where('papel', 'in', PAPEIS_EQUIPE)), []);
  const pessoas = [...equipe.itens].sort(
    (a, b) => Number(!a.ativo) - Number(!b.ativo) || (ORDEM[a.papel] ?? 9) - (ORDEM[b.papel] ?? 9) || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
  const gestoresAtivos = pessoas.filter((u) => u.papel === 'gestor' && u.ativo).length;

  async function trocarNivel(u: Usuario, papel: PapelEquipe) {
    if (papel === u.papel) return;
    if (papel === 'gestor' && !window.confirm(`Dar acesso de gestor a ${u.nome}? O gestor muda as configurações, a equipe e os níveis de acesso.`)) return;
    aoAvisar(null);
    try {
      await mudarPapel(u, papel);
      aoAvisar({ tom: 'sucesso', texto: `${u.nome} agora tem o nível ${ROTULO_PAPEL[papel]}. Vale no próximo acesso dessa pessoa (ou na hora, se ela estiver com o app aberto).` });
    } catch (e) {
      aoAvisar({ tom: 'erro', texto: mensagemErro(e) });
    }
  }

  async function bloquearOuLiberar(u: Usuario) {
    if (u.ativo && !window.confirm(`Bloquear o acesso de ${u.nome}? A pessoa deixa de entrar no app até ser liberada de novo.`)) return;
    aoAvisar(null);
    try {
      await definirAtivo(u, !u.ativo);
      aoAvisar({ tom: 'sucesso', texto: u.ativo ? `Acesso de ${u.nome} bloqueado.` : `Acesso de ${u.nome} liberado.` });
    } catch (e) {
      aoAvisar({ tom: 'erro', texto: mensagemErro(e) });
    }
  }

  return (
    <Cartao titulo={`Pessoas da equipe${pessoas.length ? ` (${pessoas.length})` : ''}`}>
      {equipe.erro && <Aviso tom="erro">{mensagemErro(equipe.erro)}</Aviso>}
      {equipe.carregando ? (
        <Carregando />
      ) : (
        <div className="lista">
          {pessoas.map((u) => {
            const eu = u.id === perfil?.id;
            return (
              <div key={u.id} className={`linha pessoa${u.ativo ? '' : ' pessoa-bloqueada'}`}>
                <div className="linha-texto">
                  <div className="linha-titulo">
                    {u.nome} {eu && <span className="pequeno">(você)</span>}
                  </div>
                  <div className="linha-detalhe">{[u.email, u.registroProfissional, u.telefone].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="pessoa-acoes">
                  {eu ? (
                    <Selo tom={TOM_PAPEL[u.papel]}>{ROTULO_PAPEL[u.papel]}</Selo>
                  ) : (
                    <>
                      {!u.ativo && <Selo tom="neutro">Bloqueado</Selo>}
                      <select
                        className="seletor-compacto"
                        aria-label={`Nível de acesso de ${u.nome}`}
                        value={u.papel}
                        onChange={(e) => void trocarNivel(u, e.target.value as PapelEquipe)}
                      >
                        {PAPEIS_EQUIPE.map((p) => (
                          <option key={p} value={p}>
                            {ROTULO_PAPEL[p]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="botao botao-fantasma"
                        onClick={() =>
                          void reenviarConvite(u.email)
                            .then(() => aoAvisar({ tom: 'sucesso', texto: `E-mail para criar a senha reenviado para ${u.email}.` }))
                            .catch((e) => aoAvisar({ tom: 'erro', texto: mensagemErro(e) }))
                        }
                      >
                        Reenviar e-mail
                      </button>
                      <button type="button" className="botao botao-fantasma" onClick={() => void bloquearOuLiberar(u)}>
                        {u.ativo ? 'Bloquear' : 'Liberar'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="pequeno" style={{ marginBottom: 0 }}>
        Pode haver mais de um gestor. Ninguém muda o próprio nível nem bloqueia a si mesmo: isso garante que sempre sobra um gestor
        {gestoresAtivos > 1 ? ` (hoje são ${gestoresAtivos})` : ''}.
      </p>
    </Cartao>
  );
}

function NovaPessoa({ aoAvisar }: { aoAvisar: (m: Mensagem) => void }) {
  const [f, setF] = useState<{ nome: string; email: string; papel: PapelEquipe; registro: string; telefone: string }>({
    nome: '',
    email: '',
    papel: 'tecnico',
    registro: '',
    telefone: '',
  });
  const [enviando, setEnviando] = useState(false);

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    if (f.papel === 'gestor' && !window.confirm(`Cadastrar ${f.nome || f.email} como gestor? O gestor muda as configurações, a equipe e os níveis de acesso.`)) return;
    aoAvisar(null);
    setEnviando(true);
    try {
      await criarAcesso({
        nome: f.nome,
        email: f.email,
        papel: f.papel,
        registroProfissional: f.papel === 'administrativo' ? undefined : f.registro,
        telefone: f.telefone,
      });
      aoAvisar({ tom: 'sucesso', texto: `${f.nome} entrou na equipe como ${ROTULO_PAPEL[f.papel]}. ${f.email} vai receber o e-mail para criar a senha.` });
      setF({ nome: '', email: '', papel: f.papel, registro: '', telefone: '' });
    } catch (err) {
      aoAvisar({ tom: 'erro', texto: mensagemErro(err) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao titulo="Adicionar pessoa à equipe">
      <form onSubmit={adicionar}>
        <div className="grade grade-2">
          <Campo rotulo="Nome" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <Campo rotulo="E-mail" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Selecao
            rotulo="Nível de acesso"
            value={f.papel}
            onChange={(e) => setF({ ...f, papel: e.target.value as PapelEquipe })}
            ajuda={RESUMO_PAPEL[f.papel].pode.slice(0, 3).join(' · ')}
          >
            {PAPEIS_EQUIPE.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PAPEL[p]}
              </option>
            ))}
          </Selecao>
          <Campo rotulo="Celular" inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} />
          {f.papel !== 'administrativo' && (
            <Campo
              rotulo="Registro profissional (CFT/CREA)"
              value={f.registro}
              onChange={(e) => setF({ ...f, registro: e.target.value })}
              ajuda="Aparece no laudo das OS que a pessoa assinar como técnico."
            />
          )}
        </div>
        <Botao type="submit" variante="secundario" icone="usuario" carregando={enviando}>
          Adicionar à equipe
        </Botao>
      </form>
      <p className="pequeno" style={{ marginBottom: 0 }}>
        Clientes não entram por aqui: o acesso ao portal é dado na página de cada cliente.
      </p>
    </Cartao>
  );
}

function NiveisDeAcesso() {
  return (
    <Cartao titulo="O que cada nível pode fazer">
      <div className="niveis">
        {PAPEIS_EQUIPE.map((p) => (
          <section key={p} className="nivel" aria-labelledby={`nivel-${p}`}>
            <h3 id={`nivel-${p}`}>
              <Selo tom={TOM_PAPEL[p]}>{ROTULO_PAPEL[p]}</Selo>
            </h3>
            <ul className="nivel-pode">
              {RESUMO_PAPEL[p].pode.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <ul className="nivel-nao">
              {RESUMO_PAPEL[p].naoPode.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="nivel" aria-labelledby="nivel-cliente">
          <h3 id="nivel-cliente">
            <Selo tom={TOM_PAPEL.cliente}>{ROTULO_PAPEL.cliente}</Selo>
          </h3>
          <ul className="nivel-pode">
            <li>Abrir e acompanhar chamados</li>
            <li>Equipamentos, laudos e Pasta da VISA</li>
            <li>Aprovar orçamentos e ver faturas</li>
          </ul>
          <ul className="nivel-nao">
            <li>Dados de outros clientes</li>
          </ul>
        </section>
      </div>
    </Cartao>
  );
}

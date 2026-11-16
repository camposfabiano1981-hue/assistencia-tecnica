import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useSessao } from '../sessao';
import { mensagemErro, useDocumento } from '../dados/hooks';
import { Aviso, Botao, Campo, TelaCarregando } from '../componentes/ui';
import type { ConfigPublica } from '../tipos';

export function Login() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const volta = params.get('volta') || '/';
  const { usuario, perfil, carregando } = useSessao();
  const instalacao = useDocumento<{ id: string }>('config/instalacao');
  const publico = useDocumento<ConfigPublica>('config/publico');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (carregando) return <TelaCarregando />;
  if (usuario && perfil?.ativo) return <Navigate to={volta} replace />;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setInfo('');
    setEnviando(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
      navegar(volta, { replace: true });
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function esqueci() {
    setErro('');
    setInfo('');
    if (!email.trim()) {
      setErro('Digite o seu e-mail no campo acima e toque de novo em "Esqueci a senha".');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim(), { url: `${location.origin}/login` });
      setInfo('Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.');
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  const naoInstalado = !instalacao.carregando && !instalacao.dados && !instalacao.erro;

  return (
    <div className="tela-cheia">
      <div className="caixa-entrada">
        <div className="marca-entrada">
          <img src="/pwa-192.png" alt="" />
          <h1>{publico.dados?.nome || 'Assistência Técnica'}</h1>
          <p>Chamados, ordens de serviço e laudos</p>
        </div>
        <form className="cartao" onSubmit={entrar}>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          {info && <Aviso tom="sucesso">{info}</Aviso>}
          <Campo rotulo="E-mail" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Campo rotulo="Senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          <Botao type="submit" carregando={enviando} bloco>
            Entrar
          </Botao>
          <Botao type="button" variante="fantasma" onClick={esqueci} bloco>
            Esqueci a senha
          </Botao>
        </form>
        {naoInstalado && (
          <Aviso tom="info">
            Primeiro acesso ao sistema? <Link to="/instalar">Configure a empresa e crie a conta do gestor</Link>.
          </Aviso>
        )}
      </div>
    </div>
  );
}

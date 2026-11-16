// Primeiro acesso: cria a conta do gestor, os dados da empresa e os modelos de checklist.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { mensagemErro, useDocumento } from '../dados/hooks';
import { TIPOS_PADRAO } from '../dados/tiposPadrao';
import { soDigitos } from '../util/formato';
import { Aviso, Botao, Campo, Cartao, TelaCarregando } from '../componentes/ui';

export function Instalar() {
  const navegar = useNavigate();
  const instalacao = useDocumento<{ id: string }>('config/instalacao');
  const [f, setF] = useState({ empresa: '', whatsapp: '', nome: '', email: '', senha: '', confirma: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const muda = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  if (instalacao.carregando) return <TelaCarregando />;
  if (instalacao.dados) {
    return (
      <div className="tela-cheia">
        <div className="caixa-entrada cartao">
          <h1 style={{ fontSize: '1.2rem', marginBottom: 8 }}>Sistema já configurado</h1>
          <p>A instalação já foi feita. Entre com a sua conta.</p>
          <Link to="/login" className="botao botao-primario botao-bloco">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  async function instalar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (f.senha.length < 8) return setErro('Use uma senha com pelo menos 8 caracteres.');
    if (f.senha !== f.confirma) return setErro('As senhas não conferem.');
    setEnviando(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, f.email.trim(), f.senha);
      await updateProfile(cred.user, { displayName: f.nome.trim() });
      const uid = cred.user.uid;
      const whatsapp = soDigitos(f.whatsapp);
      const lote = writeBatch(db);
      lote.set(doc(db, 'usuarios', uid), {
        nome: f.nome.trim(),
        email: f.email.trim().toLowerCase(),
        papel: 'gestor',
        ativo: true,
        criadoEm: serverTimestamp(),
      });
      lote.set(doc(db, 'config', 'instalacao'), { em: serverTimestamp(), por: uid });
      lote.set(doc(db, 'config', 'empresa'), { nome: f.empresa.trim(), whatsapp });
      lote.set(doc(db, 'config', 'publico'), { nome: f.empresa.trim(), whatsapp });
      await lote.commit();

      const modelos = writeBatch(db);
      for (const { id, ...tipo } of TIPOS_PADRAO) modelos.set(doc(db, 'tiposEquipamento', id), tipo);
      await modelos.commit();
      navegar('/interno', { replace: true });
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-cheia">
      <form className="caixa-entrada" onSubmit={instalar}>
        <div className="marca-entrada">
          <img src="/pwa-192.png" alt="" />
          <h1>Configurar o sistema</h1>
          <p>Faça isso uma única vez. Quem preencher vira o gestor.</p>
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Cartao titulo="Empresa">
          <Campo rotulo="Nome da empresa" required value={f.empresa} onChange={muda('empresa')} />
          <Campo
            rotulo="WhatsApp da empresa"
            inputMode="tel"
            placeholder="(67) 99999-9999"
            value={f.whatsapp}
            onChange={muda('whatsapp')}
            ajuda="Recebe os avisos dos clientes e aparece na etiqueta QR."
          />
        </Cartao>
        <Cartao titulo="Sua conta de gestor">
          <Campo rotulo="Seu nome" required autoComplete="name" value={f.nome} onChange={muda('nome')} />
          <Campo rotulo="E-mail" type="email" required autoComplete="email" value={f.email} onChange={muda('email')} />
          <Campo rotulo="Senha" type="password" required autoComplete="new-password" value={f.senha} onChange={muda('senha')} ajuda="Mínimo de 8 caracteres." />
          <Campo rotulo="Confirme a senha" type="password" required autoComplete="new-password" value={f.confirma} onChange={muda('confirma')} />
        </Cartao>
        <Botao type="submit" carregando={enviando} bloco>
          Concluir configuração
        </Botao>
      </form>
    </div>
  );
}

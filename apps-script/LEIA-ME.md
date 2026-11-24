# Aviso de novo chamado por e-mail (grátis)

Quando um cliente abre chamado no portal, o app chama este script, que envia um e-mail pela sua
conta Google. O e-mail chega como notificação do Gmail no celular do técnico, mesmo com o app fechado.
Limite da conta Google gratuita: 100 destinatários por dia.

## Passo a passo (10 minutos, uma vez)

1. Entre em <https://script.google.com> com a conta Google que vai **enviar** os avisos e clique em
   **Novo projeto**. Dê o nome "Aviso de chamados".
2. Apague o conteúdo do editor, cole todo o arquivo `Codigo.gs` e salve (ícone de disquete).
3. No app, vá em **Administração → Configurações → Aviso de novo chamado por e-mail** e toque em
   **Gerar código**. Copie o código (ainda não salve).
4. No script, clique na engrenagem (**Configurações do projeto**) → **Propriedades do script** →
   **Adicionar propriedade de script** e crie três:
   - `EMAIL_DESTINO` = o e-mail que recebe os avisos (pode ser o mesmo da conta)
   - `TOKEN` = o código copiado no passo 3
   - `APP_URL` = o endereço do sistema, por exemplo `https://seu-projeto.web.app`
5. Volte ao editor, escolha a função **testar** no menu de cima e clique em **Executar**. O Google vai
   pedir autorização: escolha a sua conta → **Avançado** → **Acessar Aviso de chamados (não seguro)** →
   **Permitir**. ("Não seguro" aparece porque o script é seu e não foi publicado na loja do Google.)
   Confira se chegou o e-mail "Teste do aviso de chamados".
6. Clique em **Implantar → Nova implantação** → engrenagem → **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   Clique em **Implantar** e copie a **URL do app da Web** (termina em `/exec`).
7. No app, cole a URL no campo **Endereço do script**, confira o **Código de segurança** e toque em
   **Salvar**. Depois toque em **Enviar teste**.
8. No celular do técnico, deixe as notificações do Gmail ligadas para essa caixa de entrada.

## Se mudar o código do script

Use **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão**. Assim a URL continua
a mesma e não é preciso mexer no app.

## Segurança

- O script só envia e-mail quando o pedido traz o código de segurança certo.
- O link do e-mail é montado pelo próprio script a partir de `APP_URL`; o navegador não consegue
  colocar um endereço falso.
- No máximo 40 avisos por hora, para evitar abuso.

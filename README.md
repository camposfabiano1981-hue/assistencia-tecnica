# Assistência Técnica: chamados, OS e laudos

Plataforma web para assistência técnica de equipamentos odontológicos e hospitalares. Ela se instala
no celular como um app. Roda **sem custo** no plano gratuito (Spark) do Firebase: sem servidor, sem
cartão de crédito.

## O que a Fase 1 faz

| Para quem | O que faz |
|---|---|
| **Cliente (portal)** | Abre chamado escolhendo o equipamento ou lendo o QR colado nele, com até 3 fotos. Acompanha o andamento, vê os equipamentos e baixa os laudos em PDF. |
| **Aviso à empresa** | Envia e-mail automático a cada chamado novo (Google Apps Script, grátis), toca alerta sonoro no painel aberto e oferece ao cliente um botão para avisar pelo WhatsApp. |
| **Escritório** | Mostra os chamados em tempo real. Permite agendar, criar a OS e mandar mensagens de WhatsApp prontas (recebemos, agendado, a caminho, concluído). |
| **Técnico (celular, funciona offline)** | Faz check-in com GPS e preenche checklist por tipo de equipamento, medições com limites (aprovado/reprovado), fotos e peças. Colhe a assinatura do cliente na tela e gera o laudo em PDF no próprio aparelho para enviar pelo WhatsApp. |
| **Cadastros** | Clientes e seus acessos ao portal, equipamentos, tipos com checklists iniciais (autoclave, cadeira, compressor, raio-X, monitor, desfibrilador…), equipe e etiquetas QR para imprimir. |

A OS assinada fica **somente leitura**. O laudo traz uma cópia dos dados do cliente e do equipamento
no momento do atendimento, então não muda se o cadastro for alterado depois.

## Publicar pela primeira vez

### 1. Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com> → **Criar projeto** (o Google Analytics não é necessário).
   Anote o **ID do projeto** (ex.: `assistencia-1a2b3`).
2. **Firestore Database** → **Criar banco de dados** → edição **Standard** → local
   **`southamerica-east1` (São Paulo)** → modo de produção. ⚠️ O local não pode ser trocado depois.
3. **Authentication** → **Vamos começar** → **E-mail/senha** → ativar → salvar.
   Em **Templates**, mude o idioma dos e-mails para **Português (Brasil)**.
4. **Hosting** → **Vamos começar** (só avançar; a publicação é feita pelo GitHub).

O projeto fica no plano **Spark (gratuito)**. Não é preciso cadastrar cartão.

### 2. Conta de serviço (credencial que o GitHub usa para publicar)

1. Em <https://console.cloud.google.com>, escolha o projeto → **IAM e administrador → Contas de serviço**
   → **Criar conta de serviço** → nome `github-publicacao` → **Criar e continuar**.
2. Papéis: **Administrador do Firebase** e **Consumidor do Service Usage** → **Concluir**.
3. Abra a conta criada → **Chaves → Adicionar chave → Criar nova chave → JSON**. O arquivo baixado é
   uma **senha**: não envie por e-mail nem cole em conversa. Ele vai só para o GitHub (passo 3).

### 3. Configurar o repositório no GitHub

No repositório: **Settings → Secrets and variables → Actions**.

- Aba **Secrets** → **New repository secret**: nome `FIREBASE_SERVICE_ACCOUNT`, valor = todo o
  conteúdo do arquivo JSON.
- Aba **Variables** → **New repository variable**: nome `FIREBASE_PROJECT_ID`, valor = ID do projeto.

A partir daí, cada alteração aprovada na branch `main` passa por três etapas automáticas:
1. testa as regras de segurança;
2. compila o app;
3. publica o site, as regras e os índices em `https://SEU-PROJETO.web.app`.

Cada *Pull Request* ganha um **link de prévia** (válido por 7 dias) para testar no celular antes. A
prévia usa o mesmo banco de dados do sistema oficial.

### 4. Primeiro acesso

Abra `https://SEU-PROJETO.web.app` → **Configure a empresa e crie a conta do gestor**. Quem fizer esse
passo vira o gestor; depois disso a instalação trava. Em seguida:

1. **Mais → Configurações**: dados da empresa, logo, responsável técnico (aparecem no laudo).
2. **Clientes → Novo** → cadastre o cliente → **Dar acesso ao portal**. A pessoa recebe um e-mail para
   criar a senha.
3. Cadastre os equipamentos e imprima as **etiquetas QR** (papel adesivo A4).
4. Revise os **tipos e checklists**. São um ponto de partida: ajuste itens e limites conforme os
   manuais e a sua prática.

### 5. Aviso de chamado por e-mail

Siga [`apps-script/LEIA-ME.md`](apps-script/LEIA-ME.md) (10 minutos).

### 6. Instalar no celular (Android)

No Chrome, abra o endereço → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").

## Plano gratuito: limites e como o app cabe neles

| Recurso (Spark) | Limite | Uso esperado com 3–4 atendimentos/dia |
|---|---|---|
| Firestore: leituras | 50 mil/dia | poucos milhares |
| Firestore: gravações | 20 mil/dia | algumas centenas |
| Firestore: armazenamento | 1 GiB | ~40 MB/mês (fotos ~100 KB cada): cerca de 2 anos |
| Hosting | 10 GB armazenados, 360 MB/dia | o app tem ~1,5 MB e fica em cache no aparelho |
| Authentication | contas ilimitadas (e-mail/senha) | — |

Se uma cota diária acabar, o serviço para até a renovação (de madrugada) e **nada é cobrado**. Não
estão no plano gratuito: Cloud Storage (desde 03/02/2026), Cloud Functions e envio de SMS. Por isso as
fotos ficam no Firestore e não há servidor. Para automatizar mais (WhatsApp automático, NFS-e via API,
backup automático), veja a Fase 4.

## Desenvolvimento

Requisitos: Node 22 e Java 21 (para o emulador).

```bash
npm install
npm run emuladores        # Auth + Firestore locais (porta 9099 e 8080)
npm run dev               # app em http://localhost:5173 usando os emuladores
npm run test:regras       # 15 testes das regras de segurança
npm run build             # compilação de produção
```

Com os emuladores e o `dev` rodando, o teste ponta a ponta percorre o fluxo inteiro: instalação,
cliente, chamado pelo celular, OS assinada e laudo baixado pelo cliente. Ele grava capturas de tela
em `capturas/`:

```bash
NODE_PATH=$(npm root -g) node scripts/e2e.cjs
```

## Estrutura

```
firestore.rules            regras de segurança (única barreira: não há servidor)
tests/regras.test.ts       testes das regras no emulador
src/firebase.ts            inicialização (produção lê /__/firebase/init.json; dev usa emulador)
src/sessao.tsx             usuário logado, papel e dados da empresa
src/dados/operacoes.ts     criar chamado/OS (numeração sequencial), concluir, acessos
src/util/laudo.ts          laudo PDF (jsPDF), carregado só quando usado
src/util/imagem.ts         compressão de fotos no aparelho
src/paginas/portal/        portal do cliente
src/paginas/interno/       painel, chamados, OS, cadastros, configurações
apps-script/               aviso por e-mail (Google Apps Script)
.github/workflows/         publicação automática e prévias
```

## Segurança e LGPD

- **Acesso por papel.** Gestor, técnico e cliente. O cliente só enxerga o próprio cadastro, os
  próprios equipamentos e chamados, e apenas as OS **concluídas** dele.
- **Conta sem perfil não vê nada.** Uma conta criada fora do sistema não tem perfil liberado pelo
  gestor e por isso não acessa nenhum dado.
- **Numeração protegida.** Chamados e OS são sequenciais, e as regras impedem pular ou forjar números.
- **Registro preservado.** A OS concluída não pode ser alterada nem apagada.
- **Saída apaga a cópia local.** Ao sair, o app apaga os dados guardados no aparelho, o que importa em
  computador compartilhado.
- **Dados em São Paulo.** O banco fica em `southamerica-east1`.
- **Atenção às fotos.** Equipamentos como monitores e ultrassom podem exibir dados de pacientes na tela.
  Evite fotografar telas com informação de paciente.

## Próximas fases

- **Fase 2:** orçamento aprovado pelo cliente no portal, Pix (copia e cola), faturas com registro da
  NFS-e, preventivas e calendário regulatório (ensaio NBR IEC 62353, qualificação térmica anual,
  testes de raio-X), instrumentos com validade do certificado, estoque, indicadores e backup.
- **Fase 3:** Pasta da VISA no portal, contratos, avaliação do atendimento e QR de autenticidade no laudo.
- **Fase 4** (plano Blaze, quando a receita justificar): WhatsApp automático, lembretes agendados,
  NFS-e pela API nacional, fotos no Cloud Storage e backup automático.

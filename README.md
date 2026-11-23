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

## O que a Fase 2 acrescenta

| Recurso | O que faz |
|---|---|
| **Orçamentos** | Monta serviços e peças (com o preço do estoque), validade, prazo, condições e garantia padrão. O cliente aprova ou recusa no portal, e fica registrado quem respondeu e quando. O PDF sai pronto para o WhatsApp. |
| **Faturas e Pix** | A fatura nasce do orçamento aprovado ou da OS, com QR code e Pix copia e cola gerados no próprio app, sem banco e sem tarifa. Você confere o extrato e marca como paga. |
| **Notas fiscais** | Serviço e peça ficam separados (NFS-e × NF-e). Você emite a NFS-e no Emissor Nacional e registra número, data e chave na fatura; o cliente vê no portal. |
| **Planilha do contador** | CSV mensal com serviços, peças, situação, pagamento e números das notas. Abre direto no Excel. |
| **Preventivas e exigências** | Cada tipo tem a periodicidade da preventiva e as exigências periódicas (qualificação térmica da autoclave, testes de constância do raio-X, ensaio NBR IEC 62353). A OS marca o que cumpriu e a próxima data se ajusta sozinha. A tela **Vencimentos** lista o que vence em 60 dias e manda lembrete pelo WhatsApp. |
| **Instrumentos** | Analisadores e termômetros com certificado RBC e validade. Na OS o técnico marca os que usou (o de certificado vencido fica bloqueado) e o laudo lista série, certificado e validade. |
| **Estoque** | Peças com mínimo, custo e preço. A OS concluída dá baixa sozinha, e o histórico de movimentos não pode ser alterado nem apagado. |
| **Indicadores** | Chamados, OS, tempo até o atendimento, tempo de reparo, resolução na 1ª visita, equipamentos em dia, faturado, recebido e em aberto, em 3, 6 ou 12 meses. |
| **Backup** | Cópia completa em JSON (com assinaturas e, se quiser, fotos) e planilhas de OS, equipamentos, clientes, estoque e instrumentos. O painel lembra o gestor todo mês. |
| **Serviços e preços** | Tabela de serviços com preço e unidade (hora, visita, km…). Orçamento, fatura e OS aceitam serviços e peças cadastrados ou avulsos, e a fatura feita a partir da OS já vem com os preços. |
| **Visualizar documentos** | OS (laudo), chamado, orçamento e fatura abrem na tela, inclusive no celular, antes de enviar, baixar ou imprimir. |

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

## Começar a usar a Fase 2

1. **Mais → Configurações → Pix e orçamento**: tipo e chave Pix, nome (até 25 letras) e cidade (até
   15) do recebedor, e os textos padrão do orçamento. Toque em **Testar Pix (R$ 1,00)** e leia o QR no
   app do seu banco: devem aparecer o seu nome e a sua chave. Não precisa concluir o pagamento.
2. **Mais → Tipos e checklists**: confira em cada tipo a periodicidade da preventiva e as exigências
   periódicas. O botão **Incluir sugestões** traz as mais comuns; ajuste ao que a vigilância sanitária
   local cobra.
3. **Mais → Serviços e preços**: toque em **Incluir serviços sugeridos** e defina o preço de cada um,
   ou cadastre os seus. Serviço com valor diferente a cada vez continua podendo entrar como avulso.
4. **Mais → Instrumentos**: cadastre os instrumentos com número do certificado e validade.
5. **Mais → Estoque**: cadastre as peças que você costuma usar, com o saldo inicial.
6. Para equipamentos atendidos antes do sistema, lance o próximo vencimento em **Definir data**, na
   ficha do equipamento. **Vencimentos → Verificar** mostra quem ainda está sem data.

## Notas fiscais e contador

O app **não emite** nota fiscal: sem servidor, não há como assinar a nota com certificado digital.
O caminho é este:

1. Emita a NFS-e do serviço no [Emissor Nacional](https://www.nfse.gov.br/EmissorNacional)
   (lista da LC 116: 14.01 manutenção, 14.02 assistência técnica). O padrão nacional passou a ser
   exigido pela LC 214/2025; para empresas do Simples, a Resolução CGSN 189/2026 fixa 01/09/2026.
   Confirme com o seu contador as regras do seu município.
2. Peças vendidas saem em NF-e, no seu emissor. A fatura já separa serviço e peça, o que também ajuda
   no Simples (serviço no Anexo III, revenda de mercadoria no Anexo I).
3. Na fatura, registre o número, a data e a chave da NFS-e e o número da NF-e. O cliente vê no portal.
4. No fim do mês: **Financeiro → Faturas → Planilha para o contador**.

## Backup e restauração

O plano gratuito não faz backup automático do banco, então a cópia é manual:
**Mais → Backup e exportação → Baixar cópia de segurança**. O arquivo `.json` traz todos os dados,
inclusive as assinaturas. Marque **Incluir as fotos** quando quiser a cópia completa (fica maior).
Guarde fora do celular, em pasta com senha: o arquivo tem dados pessoais de clientes (LGPD).

Para restaurar (por exemplo, depois de apagar algo por engano), use um computador com Node 22:

```bash
cd ferramentas/restaurar
npm install
node restaurar.mjs ~/Downloads/backup-assistencia-AAAA-MM-DD.json --projeto SEU-PROJETO --chave ~/chave.json
```

Na primeira vez ele só mostra o resumo do que seria gravado. Repita com `--gravar` para gravar: ele
pede que você digite o ID do projeto para confirmar. Os documentos do arquivo substituem os de mesmo
caminho e os demais ficam como estão. Com `--somente clientes,equipamentos`, restaura só essas
coleções.

A chave é a de uma conta de serviço do projeto (passo 2 da publicação). Crie uma chave nova só para a
restauração e **apague o arquivo e a chave no console logo depois**. As contas de acesso (e-mail e
senha) ficam no Firebase Authentication e não entram no arquivo; para levá-las a outro projeto, use
`firebase auth:export` e `firebase auth:import`.

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
npm run test:unidade      # Pix (BR Code), planilhas, datas e formato do backup
npm run test:regras       # testes das regras de segurança
npm run build             # compilação de produção
```

Com os emuladores e o `dev` rodando, `npm run e2e` apaga os dados dos emuladores e percorre as duas
fases. Na Fase 1: instalação, cliente, chamado pelo celular, OS assinada e laudo. Na Fase 2: Pix,
orçamento aprovado no portal, OS com instrumento, peça do estoque e exigências, fatura paga com NFS-e,
vencimentos, indicadores, backup e restauração em outro projeto do emulador. As capturas de tela ficam
em `capturas/`. Requer o Playwright instalado globalmente e `npm install` em `ferramentas/restaurar`.

## Estrutura

```
firestore.rules            regras de segurança (única barreira: não há servidor)
tests/regras.test.ts       testes das regras no emulador
src/firebase.ts            inicialização (produção lê /__/firebase/init.json; dev usa emulador)
src/sessao.tsx             usuário logado, papel e dados da empresa
src/dados/operacoes.ts     criar chamado/OS (numeração sequencial), concluir, acessos
src/dados/financeiro.ts    orçamentos, faturas, pagamentos e notas
src/dados/vencimentos.ts   preventivas e exigências periódicas
src/dados/estoque.ts       movimentos de estoque
src/dados/backup.ts        cópia de segurança (JSON)
src/dados/exportar.ts      planilhas CSV
src/util/pix.ts            Pix copia e cola (BR Code com CRC16)
src/util/laudo.ts          laudo PDF (jsPDF), carregado só quando usado
src/util/documentos.ts     PDFs de orçamento e fatura
src/util/imagem.ts         compressão de fotos no aparelho
src/paginas/portal/        portal do cliente
src/paginas/interno/       painel, chamados, OS, cadastros, configurações
apps-script/               aviso por e-mail (Google Apps Script)
ferramentas/restaurar/     restauração do backup (firebase-admin)
scripts/                   testes ponta a ponta e geração de ícones
.github/workflows/         publicação automática e prévias
```

## Segurança e LGPD

- **Acesso por papel.** Gestor, técnico e cliente. O cliente só enxerga o próprio cadastro, os
  próprios equipamentos e chamados, e apenas as OS **concluídas** dele.
- **Conta sem perfil não vê nada.** Uma conta criada fora do sistema não tem perfil liberado pelo
  gestor e por isso não acessa nenhum dado.
- **Numeração protegida.** Chamados e OS são sequenciais, e as regras impedem pular ou forjar números.
- **Registro preservado.** A OS concluída não pode ser alterada nem apagada.
- **Orçamento só se responde.** O cliente aprova ou recusa um orçamento enviado e dentro da validade;
  as regras impedem que ele mude valores, itens ou condições. Quem respondeu e quando fica registrado.
- **Financeiro separado.** O cliente só vê as próprias faturas. Estoque e instrumentos são só da
  equipe, e o histórico de movimentos do estoque não se altera nem se apaga.
- **Saída apaga a cópia local.** Ao sair, o app apaga os dados guardados no aparelho, o que importa em
  computador compartilhado.
- **Dados em São Paulo.** O banco fica em `southamerica-east1`.
- **Atenção às fotos.** Equipamentos como monitores e ultrassom podem exibir dados de pacientes na tela.
  Evite fotografar telas com informação de paciente.

## Próximas fases

- **Fase 3:** Pasta da VISA no portal, contratos, avaliação do atendimento e QR de autenticidade no laudo.
- **Fase 4** (plano Blaze, quando a receita justificar): WhatsApp automático, lembretes agendados,
  NFS-e pela API nacional, fotos no Cloud Storage e backup automático.

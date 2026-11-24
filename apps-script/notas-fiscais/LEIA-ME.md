# Ponte das notas fiscais (NFS-e e NF-e pela Focus NFe)

A fatura do app emite a **NFS-e dos serviços** (padrão nacional) e a **NF-e das peças** com um toque.
Quem fala com a Focus NFe é esta ponte, um script gratuito na sua conta Google. Ela guarda o token da
Focus em segredo: o app e os celulares nunca o veem.

Custos:
- o Firebase continua no plano gratuito;
- o Google Apps Script é gratuito;
- você paga só a Focus NFe (plano e notas excedentes).

## Antes de começar

1. **Certificado digital e-CNPJ A1** (arquivo `.pfx` e senha), comprado numa autoridade certificadora.
   O A3 (token ou cartão) não serve para emissão automática.
2. **Conta na Focus NFe** (há teste grátis). No painel da Focus:
   - cadastre a empresa (CNPJ, endereço, inscrição municipal e estadual);
   - envie o certificado A1;
   - habilite a **NFS-e Nacional** e a **NF-e** em homologação.
3. Anote os **tokens** de homologação e de produção. Eles são senhas: não envie por e-mail nem cole em
   conversa. Eles vão só nas Propriedades do script (passo 4).

## Passo a passo (uma vez, cerca de 15 minutos)

1. Entre em <https://script.google.com> com a **mesma conta Google dona do projeto do Firebase**.
   Clique em **Novo projeto** e dê o nome "Ponte das notas fiscais".
2. Apague o conteúdo do editor, cole todo o arquivo `Ponte.gs` e salve.
3. Ative o arquivo de manifesto e substitua o conteúdo dele:
   1. Na engrenagem (**Configurações do projeto**), marque **Mostrar arquivo de manifesto
      "appsscript.json" no editor**.
   2. Volte ao editor e abra `appsscript.json`.
   3. Troque o conteúdo pelo arquivo `appsscript.json` desta pasta e salve.
4. Em **Configurações do projeto → Propriedades do script**, crie:
   - `FIREBASE_PROJETO` = ID do projeto (ex.: `assist-tec`)
   - `FOCUS_TOKEN_HOMOLOGACAO` = token de homologação da Focus
   - `FOCUS_TOKEN_PRODUCAO` = token de produção. Crie só depois dos testes (passo 10).
5. No editor, escolha a função **instalar** e clique em **Executar**.
   - O Google pede autorização: escolha a conta → **Avançado** → **Acessar (não seguro)** → **Permitir**.
     "Não seguro" aparece porque o script é seu e não está publicado.
   - O registro deve mostrar **"Ponte pronta"**.
   - Se aparecer erro 403 ou `SERVICE_DISABLED` do Firestore, ligue o script ao projeto do Firebase e
     rode **instalar** de novo:
     1. No Firebase, abra **Configurações do projeto** e copie o **Número do projeto**.
     2. No script, vá em **Configurações do projeto → Projeto do Google Cloud → Alterar projeto** e cole
        esse número.
6. Clique em **Implantar → Nova implantação** → engrenagem → **App da Web**:
   - **Executar como:** Eu
   - **Quem pode acessar:** Qualquer pessoa

   Clique em **Implantar** e copie a **URL do app da Web** (termina em `/exec`).
7. No app, abra **Mais → Configurações → Notas fiscais (Focus NFe)** e faça:
   1. Cole a URL em **Endereço da ponte**.
   2. Preencha o CNPJ e as inscrições. Use o **CEP da empresa** para obter o código do município.
   3. Confira com o contador os códigos fiscais (código de tributação nacional, CSOSN, CFOP, PIS e COFINS).
   4. Marque **Emitir notas pelo app**, escolha o ambiente **Homologação** e toque em **Salvar notas
      fiscais**.
   5. Toque em **Testar ponte**. A mensagem deve dizer "Token de homologação: configurado".
8. Complete os cadastros:
   - **Clientes:** bloco **Endereço para notas fiscais** (digite o CEP e toque em **Buscar**).
   - **Estoque:** o **NCM** de cada peça.
9. **Teste:** numa fatura, toque em **Emitir NFS-e**.
   - Em segundos aparece **Autorizada**, com o PDF de homologação (sem valor fiscal).
   - Faça o mesmo com a NF-e das peças.
   - Confira os PDFs e os XML com o contador.
10. **Produção:**
    1. Crie a propriedade `FOCUS_TOKEN_PRODUCAO` na ponte.
    2. No app, mude o ambiente para **Produção** e salve.

    A partir daí, as notas autorizadas entram na fatura e na planilha do contador, e o cliente vê o PDF
    no portal.

## Como funciona e por que é seguro

1. O app grava o **pedido de emissão** na fatura e avisa a ponte. Só a equipe logada consegue gravar
   pedidos (regras do Firestore).
2. A ponte lê o pedido, envia à Focus com o token e grava o resultado na fatura: número, chave, PDF, XML
   ou o motivo da recusa.

Proteções:
- **A URL pública não emite nota sozinha.** Qualquer pessoa pode chamá-la, mas a ponte só processa
  pedidos que já estão gravados na fatura.
- **O que ficou pendente é concluído.** A cada 5 minutos a ponte conclui o que não terminou, por exemplo
  se a internet caiu no meio.
- **Homologação não vira número oficial.** Nesse ambiente as notas são testes: não aparecem para o
  cliente nem na planilha do contador.
- **Acesso ao banco pela sua conta.** A ponte acessa o Firestore com a sua conta Google. Se você trocar a
  senha ou revogar o acesso, rode **instalar** de novo.

## Atualizar a ponte

Quando este arquivo `Ponte.gs` mudar no repositório:
1. Cole a versão nova no editor e salve.
2. Vá em **Implantar → Gerenciar implantações** → lápis → **Versão: nova versão** → **Implantar**.

A URL continua a mesma.

## Limites gratuitos do Google Apps Script

São 20 mil chamadas externas por dia e 90 minutos de gatilhos por dia, muito acima de 3 ou 4
atendimentos diários.

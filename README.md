# Mural Digital ALFA

Painel pra rodar 24h numa TV box, com barra de indicadores (dólar, euro,
soja, boi gordo, clima) e o canal Jovem Pan News ao vivo, com legenda
que liga/desliga por um botão discreto no canto da tela.

Este guia assume **zero conhecimento de programação**. Vai levar uns 20-30
minutos na primeira vez.

---

## Parte 1 — Colocar a página no ar (GitHub Pages, gratuito)

1. Crie uma conta em **https://github.com** (se ainda não tiver).
2. No canto superior direito, clique no **+** → **New repository**.
   - Nome: `mural-alfa` (ou o que preferir)
   - Marque como **Public**
   - Clique em **Create repository**
3. Na página do repositório recém-criado, clique em **uploading an existing file**
   (ou "Add file" → "Upload files").
4. Arraste **todos os arquivos e pastas** desta entrega (`index.html`,
   `style.css`, `script.js`, a pasta `assets`, a pasta `data`, a pasta
   `scripts` e a pasta `.github`) pra dentro da janela de upload.
   - Atenção: o GitHub às vezes esconde a pasta `.github` no arrastar-e-soltar.
     Se isso acontecer, crie o arquivo manualmente: "Add file" → "Create new
     file" → digite o caminho completo `.github/workflows/update-commodities.yml`
     e cole o conteúdo desse arquivo.
5. Clique em **Commit changes**.
6. Vá em **Settings** (no menu do repositório) → **Pages** (menu lateral).
   - Em "Source", selecione **Deploy from a branch**
   - Branch: **main**, pasta: **/ (root)**
   - Clique em **Save**
7. Espere ~1 minuto e atualize a página. Vai aparecer um link tipo:
   `https://SEU-USUARIO.github.io/mural-alfa/`
   **Essa é a URL que você vai abrir na TV box.**

---

## Parte 2 — Ativar a atualização automática de soja/boi gordo

O arquivo `.github/workflows/update-commodities.yml` já está configurado
pra rodar sozinho de hora em hora. Só precisa confirmar que está ativo:

1. No repositório, clique na aba **Actions**.
2. Se aparecer um aviso pra habilitar workflows, clique em **I understand
   my workflows, go ahead and enable them**.
3. Clique em **Atualizar cotações CEPEA** → **Run workflow** → **Run workflow**
   (botão verde), pra rodar uma vez manualmente e conferir se funciona.
4. Espere ~30 segundos e recarregue a página. Se aparecer uma bolinha verde,
   funcionou. Se aparecer um X vermelho, clique em cima pra ver o log de erro
   e me manda que a gente ajusta.

**Importante:** eu escrevi o scraper com base na estrutura atual do site da
CEPEA (`cepea.org.br`), mas não consegui testar ele rodando de ponta a ponta
por uma restrição de rede do meu ambiente. Ou seja: **teste o passo 3 acima
antes de considerar isso pronto.** Se der erro, me manda o log que eu ajusto
o script — é normal precisar de um ajuste fino na primeira vez com scraping.

---

## Parte 3 — Configurar a TV box

1. Na TV box, abra a **Play Store** e instale o app **Fully Kiosk Browser**
   (gratuito, tem anúncio ocasional na versão free — se incomodar, a versão
   paga é barata e remove).
2. Abra o Fully Kiosk Browser. Na primeira tela, em "Start URL", cole a URL
   do Parte 1 (`https://SEU-USUARIO.github.io/mural-alfa/`).
3. Nas configurações do Fully Kiosk (ícone de engrenagem):
   - **Web Content Settings** → habilite "Enable JavaScript" e "Enable DOM Storage"
   - **Device Management** → habilite "Start on Boot" (liga sozinho se a
     energia cair) e "Keep Screen On"
   - **Motion Detection / Screensaver** → desligue tudo isso, você quer a
     tela sempre ativa
   - Saia do modo de configuração (geralmente é um toque em sequência no
     canto da tela, ou senha padrão `1234`) pra entrar no modo kiosk de verdade.
4. Pronto — a box agora abre direto no mural, em tela cheia, sem barra de
   navegador, sempre que ligar.

O botão de legenda (**CC**, cantinho inferior direito do vídeo) é discreto
de propósito — some quase por completo até você passar o mouse ou clicar.
Um clique liga a legenda em português (se o canal tiver disponível), outro
clique desliga.

---

## Como atualizar coisas depois

- **Trocar a logo:** substitua `assets/logo.png` pelo novo arquivo (mesmo nome)
  e faça upload de novo pelo GitHub.
- **Trocar o canal de notícias:** abra `script.js`, ache a linha
  `youtubeChannelId: "UCP391YRAjSOdM_bwievgaZA"` e troque pelo ID do canal
  desejado.
- **Trocar a cidade do clima:** mesma ideia, na seção `weather` do `script.js`.
- Qualquer alteração: edite o arquivo direto no GitHub (ícone de lápis) e
  clique em "Commit changes" — a página atualiza sozinha em alguns segundos,
  e a box vai puxar a versão nova na próxima recarga diária (5h da manhã,
  configurado no próprio `script.js`) ou se você recarregar manualmente.

---

## Limitações conhecidas

- O scraper da CEPEA não foi validado ao vivo (ver Parte 2) — provável que
  funcione de primeira, mas reserve 10 min pra conferir.
- A legenda depende do canal ter legenda ao vivo habilitada do lado dele;
  isso está fora do nosso controle.
- Câmbio e clima usam APIs públicas gratuitas sem necessidade de cadastro
  ou chave — não deve dar problema, mas todo serviço gratuito pode mudar
  de política no futuro.

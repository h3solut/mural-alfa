# CONTEXT.md — Mural Digital ALFA

Documento de conhecimento acumulado do projeto. Objetivo: qualquer
conversa nova (com Claude ou não) consegue se situar rápido aqui, sem
precisar redescobrir os mesmos problemas que já resolvemos.

**Repositório:** https://github.com/h3solut/mural-alfa
**Site ao vivo:** https://h3solut.github.io/mural-alfa/
**Contexto:** TV box (Android) rodando o Fully Kiosk Browser em tela
cheia, no escritório da ALFA Assessoria Contábil (Jataí-GO).

---

## Arquitetura geral

Site estático (HTML/CSS/JS puro, sem build step) hospedado no GitHub
Pages. Dados "vivos" vêm de duas formas:

1. **Direto do navegador** (client-side fetch): dólar/euro, Bitcoin,
   clima — APIs públicas que aceitam CORS de qualquer origem.
2. **Via robôs do GitHub Actions**: soja/milho/boi gordo, vídeo ao vivo
   do YouTube, notícias RSS, ações B3+EUA — cada um roda em intervalo
   fixo, escreve um `.json` em `data/`, e o navegador lê esse arquivo
   estático. Usado sempre que a fonte de dados exige scraping, chave de
   API sensível, ou bloqueia requisições vindas de navegador/CORS.

**Atenção ao agendamento:** o `schedule` (cron) do GitHub Actions é
"melhor esforço" — em repositório público ele atrasa e pula execuções
com frequência (ver "Vídeo ao vivo parado" abaixo). Os robôs cujo dado
muda pouco (commodities, notícias, ações) toleram isso. O do vídeo ao
vivo não tolera, então ele é disparado por um serviço externo
(cron-job.org), com o cron do GitHub só como reserva.

## Estrutura de arquivos
index.html — estrutura da página (sidebar + vídeo + tickers)
style.css — todo o visual
script.js — toda a lógica (fetch dos dados, player, tickers)
assets/logo.png — logo da ALFA
data/
commodities.json — soja, milho, boi gordo (via scrape_cepea.py)
youtube-live.json — vídeo ao vivo atual: videoId, ao_vivo, falhas_seguidas, atualizado_em (via fetch_live_video.py)
news.json — manchetes RSS (via fetch_news.py)
stocks.json — cotações B3 + EUA (via fetch_stocks.py)
scripts/
scrape_cepea.py — soja/milho/boi gordo via noticiasagricolas.com.br
fetch_live_video.py — descobre o vídeo ao vivo do canal via yt-dlp
fetch_news.py — agrega RSS (G1, CNN Brasil, Folha)
fetch_stocks.py — cotações via brapi.dev (B3) e Twelve Data (EUA)
.github/workflows/
update-commodities.yml — roda scrape_cepea.py de hora em hora
update-youtube-live.yml — roda fetch_live_video.py; disparado a cada 5 min pelo cron-job.org (reserva: cron do GitHub a cada 15 min)
update-news.yml — roda fetch_news.py a cada 20 min
update-stocks.yml — roda fetch_stocks.py a cada 30 min

## Layout

Sidebar fixa à esquerda (logo + indicadores empilhados + relógio) +
área principal à direita (vídeo no topo, faixa de ações, faixa de
notícias, nessa ordem de cima pra baixo).

## Indicador de "última atualização" (Dólar, Euro, Bitcoin, Soja, Milho, Boi Gordo)

Adicionado em 25/08/2026, depois de um print do mural mostrar Dólar e
Euro travados em "--" enquanto os outros indicadores (inclusive
Bitcoin, também busca client-side) funcionavam normalmente. Investigado
na hora: a URL usada em `atualizarCambio()` bate exatamente com a
documentação oficial da AwesomeAPI, sem sinal de mudança de formato —
mais provável foi instabilidade pontual do lado deles (serviço grátis,
sem SLA). Não deu pra confirmar ao vivo qual foi a causa exata.

Em vez de deixar o indicador "sumir" (mostrar "--") quando uma busca
falha, os 6 indicadores acima agora mantêm o último valor válido na
tela e mostram, discretamente embaixo do valor, há quanto tempo esse
dado é o mais recente: "agora" / "há Xmin" / "há Xh". Se passar do
tempo considerado normal sem uma atualização nova, esse texto fica
âmbar como aviso sutil (sem esconder o valor).

Implementação em `script.js`:
- `ultimaAtualizacao` — objeto `id do indicador → Date` do último valor
  válido recebido.
- `LIMITE_ALERTA_MIN` — limite em minutos por indicador antes de virar
  âmbar: 5 pra Dólar/Euro/Bitcoin (atualizam a cada 1 min), 120 pra
  Soja/Milho/Boi Gordo (o `commodities.json` só muda de hora em hora
  via GitHub Action).
- `preencherIndicador()` já grava o timestamp toda vez que recebe um
  valor válido (não precisou mudar nada nas funções de busca em si).
- `atualizarTextoHorario()` formata o texto e aplica/remove a classe
  `.stale`.
- Um `setInterval` de 30s só recalcula os textos "há Xmin" de tudo,
  sem depender de nenhuma busca nova — é só o relógio andando.

Markup: `<span class="updated-at"></span>` dentro de cada `.indicator`
correspondente, em `index.html`. Estilo em `.indicator .updated-at` /
`.indicator .updated-at.stale`, no `style.css`.

Testado localmente (servidor estático + Playwright, simulando sucesso
e um cenário de atraso forçado) antes de subir — layout não quebrou e
o aviso âmbar aparece corretamente.

## Causa raiz do "--" em Dólar/Euro: cota da AwesomeAPI estourada (resolvido em 25/08/2026)

Depois do indicador acima entrar no ar, ficou claro que Dólar/Euro não
tinham sucesso **nenhuma vez** desde o carregamento da página (span de
horário ficava em branco, nem "agora" nem âmbar) — não era mais um
blip pontual. Hugo abriu a URL da API direto no navegador
(`economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL`) e confirmou:

```json
{"status":"429","code":"QuotaExceeded","message":"Quota exceeded. To continue using the service, please see https://docs.awesomeapi.com.br/aviso-sobre-limites"}
```

Chamadas sem chave de API caem numa cota compartilhada não-autenticada
que estourava com facilidade. Solução: criar conta gratuita em
awesomeapi.com.br e usar a API key (100 mil requisições/mês, bem acima
do necessário) via parâmetro `?token=` na URL.

**Decisão de arquitetura tomada:** a chave foi colocada direto em
`CONFIG.awesomeApiToken` no `script.js` (client-side, visível no
repositório público) em vez de virar mais um robô do GitHub Actions
com a chave em Secret (o padrão usado pra soja/milho/boi/ações).
Trade-off consciente: mais simples de implementar e mantém a
atualização a cada 1 min (em vez de virar arquivo estático atualizado
de tempos em tempos), mas a chave fica exposta — qualquer um que veja
o repo pode usá-la. Como é uma chave gratuita, sem acesso a nada além
de consulta de cotação, e sem opção de restringir por domínio (a
AwesomeAPI não oferece isso), o risco foi considerado baixo: se vazar
e for abusada, é só gerar uma chave nova no painel da AwesomeAPI e
substituir o valor em `CONFIG.awesomeApiToken`.

## Vídeo ao vivo parado + disparador externo (resolvido em 05/10/2026)

**Sintoma:** o mural passou a mostrar a vinheta de abertura do "Jornal da
Manhã 1ª edição" às 10h36, ou seja, a gravação da live das 5h
reexibida do começo (o YouTube faz isso com uma live já encerrada). O
`youtube-live.json` estava com `atualizado_em` de 05h50 (4h45 antes).

**Investigação:**
- O script `fetch_live_video.py` mantinha o ID anterior sem avisar
  quando não achava nenhuma live — então uma live encerrada ficava na
  tela indefinidamente.
- Rodando o workflow manualmente (execução #830), o robô achou a live
  atual (`[ok] video ao vivo: ...`): **a detecção funcionava**.
- A execução anterior (#829) tinha sido 4h antes, e o workflow tinha só
  ~829 execuções desde meados de agosto (um cron de 5 min teria feito
  mais de 10 mil). Causa raiz: **o agendamento nativo do GitHub Actions
  atrasa/pula execuções** — ficou ~4h sem disparar.
- Uma ideia descartada: esconder o vídeo quando o `atualizado_em` ficasse
  velho. Com um cron falho isso daria alarme falso mesmo com a live
  normal no ar. Por isso o estado é **explícito** no JSON (`ao_vivo`),
  não inferido pela idade do arquivo.

**Solução (três partes):**

1. **Disparador externo (cron-job.org).** Um job "mural alfa_upd live
   video" chama a API do GitHub a cada 5 min:
   `POST https://api.github.com/repos/h3solut/mural-alfa/actions/workflows/update-youtube-live.yml/dispatches`
   com corpo `{"ref":"main"}` e os headers `Accept: application/vnd.github+json`,
   `Authorization: Bearer <token>`, `Content-Type: application/json`,
   `User-Agent: cron-job.org`. Resposta esperada: **HTTP 204**. O
   "Save responses in job history" e o aviso de falha ficam ligados no
   cron-job.org pra notar se parar.
   - O token é um *fine-grained personal access token* do GitHub
     (`mural-alfa-disparador`), restrito ao repositório `mural-alfa`,
     permissão **Actions: Read and write**, validade de 1 ano
     (**expira em 05/10/2027 — renovar antes disso**; se vencer, o
     cron-job.org passa a receber 401 e o mural volta a ficar parado).
     O token fica **só** no cron-job.org, nunca no código. Se vazar:
     revogar em GitHub → Settings → Developer settings → Fine-grained
     tokens, gerar outro com as mesmas configurações e trocar o header
     `Authorization` no cron-job.org. (Já foi trocado uma vez em
     05/10/2026, depois de aparecer num print da aba "Raw request" —
     **nunca compartilhar print dessa aba**.)
   - O `schedule` nativo do workflow continua, a cada 15 min, só como
     reserva. Uma trava `concurrency` (`youtube-live`) impede duas
     execuções simultâneas, e o commit usa `git pull --rebase` antes do
     `git push`.

2. **Estado explícito no robô (`fetch_live_video.py`).** O JSON agora tem
   `videoId`, `ao_vivo`, `falhas_seguidas` e `atualizado_em`. Se não
   achar nenhuma live, conta uma falha; na **segunda seguida** grava
   `ao_vivo: false` (o ID antigo é mantido no arquivo). Achou live →
   `ao_vivo: true` e zera as falhas. O arquivo **só é reescrito quando
   algo muda** (antes gravava `atualizado_em` a cada execução, o que
   geraria uns 288 commits por dia com o disparador de 5 min). Erro do
   yt-dlp (bloqueio, rede) **não** conta como "sem live": o script sai com
   erro (X vermelho no Actions) e não mexe no arquivo.

3. **Página (`script.js`).** `obterEstadoAoVivo()` lê o estado inteiro.
   Com `ao_vivo: false`, a página remove o player e mostra "Aguardando a
   próxima transmissão…"; quando a live volta (mesmo ID ou outro), o
   player é remontado. JSON sem o campo `ao_vivo` (formato antigo) conta
   como ao vivo. Se não der pra ler o JSON no meio da execução, a página
   **mantém o que está na tela** (antes ela trocava o vídeo pelo ID de
   reserva `youtubeVideoIdFallback` por causa de uma falha de rede
   momentânea); o ID de reserva só vale na primeira carga.

**Latência esperada** pra trocar de programa: até 5 min (disparador) +
1-2 min (cache do GitHub Pages) + até 5 min (a página confere o JSON a
cada 5 min), ou seja, uns 10 min no pior caso.

**Testado antes de subir:** lógica do robô com yt-dlp simulado (live
achada, 1ª/2ª/3ª falha, live volta, ID novo, formato antigo, erro do
yt-dlp) e a página no Playwright (ao vivo, sem transmissão, volta, ID
novo, erro de rede, formato antigo, 1ª carga sem JSON). Não foi possível
testar o yt-dlp real daqui (sem acesso ao YouTube); a detecção real foi
validada pela execução manual #830.

## Chaves de API necessárias (GitHub Secrets)

Configuradas em Settings → Secrets and variables → Actions:
- `BRAPI_TOKEN` — gerado em https://brapi.dev (grátis, conta pessoal do Hugo)
- `TWELVEDATA_KEY` — gerado em https://twelvedata.com (grátis, conta pessoal do Hugo)

Outras credenciais (fora dos GitHub Secrets):
- **Token do disparador** (GitHub fine-grained PAT) — guardado só no
  cron-job.org, expira em 05/10/2027. Ver seção "Vídeo ao vivo parado".
- **Chave da AwesomeAPI** — fica no `script.js` (`CONFIG.awesomeApiToken`),
  pública de propósito. Ver seção sobre a cota estourada.

---

## Lições aprendidas (NÃO repetir esses erros)

### 1. CEPEA bloqueia requisições de servidores de nuvem (403)
O site oficial `cepea.org.br` bloqueia IPs de datacenter (GitHub
Actions incluso), mesmo com headers de navegador completos. Solução:
usar o **Notícias Agrícolas** (`noticiasagricolas.com.br`), que
republica os mesmos indicadores CEPEA/ESALQ sem essa blindagem.

### 2. YouTube: canal usa 1 vídeo por dia/programa, não um ID fixo
Não existe "o vídeo ao vivo permanente" de um canal de notícias — cada
programa é um vídeo novo. Tentamos várias abordagens até a que
funciona de verdade:
- ❌ `/embed/live_stream?channel=ID` — erro 153, endpoint instável.
- ❌ Regex manual no HTML de `/@handle/live` — pega vídeos de
  recomendação por engano, ou pré-estreias agendadas ("Ao vivo em X
  minutos") confundidas com transmissão real.
- ✅ **yt-dlp** (`pip install yt-dlp`) com `extract_flat=True` na aba
  `/@handle/streams`, filtrando por `live_status == "is_live"`. É a
  abordagem robusta porque a biblioteca é mantida ativamente contra as
  mudanças do YouTube — não tentar reinventar isso na mão de novo.

### 3. Legenda do YouTube via postMessage precisa de 2 comandos
Pra ligar a legenda embutida via API do player, é preciso mandar
`loadModule` ANTES do `setOption` (com um pequeno delay entre os dois,
~300ms) — só `setOption` sozinho é ignorado silenciosamente.

### 4. brapi.dev: pegadinhas de autenticação e formato de resposta
- Autenticação correta: **header** `Authorization: Bearer TOKEN` (não
  o parâmetro `?token=` — dá 400 mesmo estando "certo" na aparência).
- Endpoint certo: `/api/v2/stocks/quote?symbols=X`.
- **Uma chamada por símbolo**, não em lote — lote com vários símbolos
  juntos (incluindo o índice `^BVSP`) dava 400 mesmo com auth correta.
- **Os dados vêm dentro de `item["data"]`**, não soltos na raiz do
  item (`item["data"]["regularMarketPrice"]`, não
  `item["regularMarketPrice"]`) — esse foi o bug mais demorado de achar,
  porque a chamada "funcionava" (200 OK) mas voltava sempre vazia sem
  erro nenhum.

### 5. GitHub Pages tem delay de cache (~1-2 min)
Depois de um commit ou de um robô rodar, o site pode continuar servindo
a versão antiga por 1-2 minutos. Antes de investigar "bug", sempre
tentar `Ctrl+Shift+R` (recarrega ignorando cache) depois de esperar um
pouco.

### 6. Nomes de classe CSS colidindo silenciosamente
Uma classe `.ticker` já existia (estilo da faixa de notícias, com
`overflow: hidden` e altura fixa). Um `<span class="ticker">` criado
depois pra outra coisa (símbolo de ação) herdou esse estilo sem querer
e ficou praticamente invisível — sem nenhum erro no console. Lição:
prefixar nomes de classe por contexto (`stock-symbol`, não `ticker`)
pra evitar colisão.

### 7. Upload manual pelo GitHub (sem git local)
Hugo sobe arquivos direto pela interface web do GitHub (drag-and-drop),
sem usar git no terminal. Duas pegadinhas recorrentes:
- Arrastar a **pasta inteira** em vez do **conteúdo de dentro dela**
  cria um nível de subpasta a mais sem querer.
- Pastas que começam com ponto (`.github`) costumam ser ignoradas no
  arrastar-e-soltar — precisam ser criadas manualmente via "Add file →
  Create new file", colando o caminho completo no nome.

### 8. yt-dlp: listar metadados funciona de nuvem, resolver URL de reprodução não
`extract_flat=True` (usado em `fetch_live_video.py` só pra listar
vídeos/status) é tolerado pelo YouTube de IPs de datacenter (GitHub
Actions incluso). Já pedir a URL de reprodução real de um vídeo
(resolução completa de formato) é bloqueado por bot-detection
("Sign in to confirm you're not a bot") em IPs de datacenter — só
funciona de IP residencial (testado com sucesso rodando local, do PC
de casa do Hugo).

### 9. URLs de vídeo do googlevideo.com só tocam em páginas do youtube.com
Mesmo resolvendo a URL do manifesto HLS com sucesso (de IP
residencial), tentar reproduzi-la direto numa tag `<video>` num site
de terceiros dá **403 Forbidden** (aparece como erro de CORS no
console, mas a causa raiz é checagem de Origin/Referer do lado do
Google — a URL só é aceita quando a requisição parece vir do próprio
youtube.com). Não tem contorno simples client-side: só dá pra tocar
esse tipo de URL de um domínio próprio usando um servidor proxy que
busca o vídeo com um header `Referer` forjado e reenvia pro navegador
com CORS liberado — infraestrutura real (proxy rodando 24/7, reescrita
de playlist HLS), não um ajuste de config. Ver investigação abaixo.

### 10. O cron (`schedule`) do GitHub Actions não é confiável pra dado que precisa de frescor
Em repositório público o GitHub trata o agendamento como "melhor
esforço": mesmo com `*/5 * * * *`, o workflow do vídeo ao vivo ficou ~4h
sem rodar e acumulou só ~829 execuções em semanas. Não adianta
"consertar" o script quando o sintoma é esse — primeiro olhar a lista
de execuções do workflow (Actions) e conferir **quando foi a última**.
Pra qualquer robô que precise rodar de fato a cada poucos minutos, usar
disparo externo via `workflow_dispatch` (ver seção "Vídeo ao vivo parado
+ disparador externo"). Também: pra testar um robô na hora, o botão
"Run workflow" (Actions) dispara uma execução manual e mostra o log.
(Logs só aparecem logado no GitHub — logado fora, a página mostra "Sign
in to view logs".)

### 11. Não "manter o último valor" em silêncio quando a fonte some
O comportamento antigo do `fetch_live_video.py` (manter o ID anterior
se não achar live) escondia o problema: o mural seguia mostrando uma
live encerrada, reexibida do começo pelo YouTube, sem nenhum aviso. Pra
dado que "expira" (como uma transmissão ao vivo), gravar um estado
explícito (`ao_vivo: false`) e deixar a página reagir a ele.

---

## Investigação: travamento de vídeo na Mi TV Stick (ENCERRADA em 13/08/2026)

**Sintoma confirmado:** só o vídeo trava/fica recarregando sem
acumular buffer confiável na Mi TV Stick; o resto da página (relógio,
indicadores, tickers) roda liso o tempo todo — inclusive durante o
travamento do vídeo. Rodando num computador normal, tudo funciona
perfeitamente, inclusive o vídeo.

**Dispositivo testado:** Xiaomi Mi TV Stick, modelo MiTV-AESP0, Android
9 (TV, SDK 28), WebView `com.google.android.webview` 138.0.7204.179,
tela 1920x1080, rodando Fully Kiosk Browser.

**O que foi tentado, em ordem, e o resultado de cada um:**

1. **Forçar qualidade baixa no player oficial do YouTube**
   (`teste-video/`, via `YT.Player.setPlaybackQuality('small')`) — sem
   efeito. Suspeita: o YouTube ignora esse comando em transmissões ao
   vivo (API antiga, pouco mantida pelo Google).
2. **Reduzir o tamanho de exibição do vídeo** (CSS, `--video-scale`)
   — sem efeito. Faz sentido em retrospecto: reduzir o tamanho na tela
   não reduz o trabalho de *decodificar* o vídeo, só o de exibi-lo.
3. **Vídeo mudo por padrão** — sem efeito.
4. **Trocar "Video Player Engine" do Fully Kiosk** (Auto → Android
   Media Player) — sem efeito. Suspeita: esse seletor só afeta uma tag
   `<video>` nativa carregada pela própria página do Fully Kiosk; o
   player do YouTube roda dentro de um iframe cross-origin
   (youtube.com), fora do alcance dessa configuração.
5. **Hardware Acceleration do Fully Kiosk** — já estava ligada desde o
   início; não era a causa.
6. **Sinal de Wi-Fi** — descartado; roteador perto, só uma porta de
   madeira no meio, sinal bom. Também não bateria com o sintoma (só o
   vídeo trava, não a página toda).
7. **Bypass total do player do YouTube via HLS nativo**
   (`teste-video-hls/`, `<video>` + `hls.js`, sem nenhum JS/iframe do
   youtube.com) — tecnicamente a abordagem mais correta (elimina o
   peso da aplicação web do YouTube: anúncios, Polymer, analytics), e
   também teria permitido forçar a qualidade mínima de verdade (ao
   escolher a variante do manifesto HLS diretamente, em vez de pedir
   educadamente pro YouTube). Esbarrou em dois bloqueios técnicos
   reais do lado do Google, documentados nas lições 8 e 9 acima:
   bot-detection ao resolver a URL de IP de nuvem (contornável com IP
   residencial) e bloqueio de Referer/Origin ao tocar a URL fora do
   youtube.com (só contornável com um servidor proxy).

**Conclusão:** esgotamos os ajustes de configuração e as duas
arquiteturas de player possíveis (iframe oficial e HLS nativo) sem
resolver. Decidido **não construir o servidor proxy de vídeo** — seria
infraestrutura desproporcional ao problema (proxy rodando 24/7
reencaminhando vídeo ao vivo continuamente, não só um JSON leve a cada
5 min). A causa mais provável que sobra é a própria Mi TV Stick não
ter poder de decodificação de vídeo suficiente para rodar dentro de um
WebView, independente de ajuste de software — isso já era um risco
conhecido, anotado no backlog deste documento antes mesmo dessa
investigação começar.

**Próximo passo recomendado:** testar em hardware mais forte (ver
backlog). Se resolver, a causa fica confirmada como hardware, sem
precisar de mais nenhuma mudança de código.

**O que fica no repositório:** `teste-video/` e `teste-video-hls/`
continuam publicados (não foram removidos), como referência caso
quisermos retomar alguma dessas linhas de investigação no futuro — mas
nenhuma das duas foi adotada como versão principal. O Action
`update-teste-video-hls.yml` foi **desativado manualmente** (Actions →
"..." → Disable workflow) pra não ficar rodando/falhando a cada 5 min
à toa — reativar só se essa linha de investigação for retomada.

**Atualização (13/08/2026):** mesmo não tendo resolvido o travamento,
o "vídeo mudo por padrão" foi adotado na versão principal (raiz) por
motivo à parte da investigação — evita som indesejado até alguém optar
por ligar. Botão `🔇`/`🔊` ao lado do botão de legenda (`#audio-toggle`
em `index.html`/`style.css`, funções `toggleAudio`/`atualizarBotaoAudio`
em `script.js`, comando `mute`/`unMute` via postMessage). É a única
mudança dos testes que migrou pra raiz — tamanho de vídeo e qualidade
forçada continuam só nas pastas de teste.

## Backlog conhecido (não implementado ainda)

- **Bitcoin: erro 429 (Too Many Requests) na CoinGecko** — o intervalo
  de atualização do Bitcoin está atrelado ao mesmo intervalo do câmbio
  (1 min), que é frequente demais pro limite gratuito da CoinGecko.
  Precisa de intervalo próprio, mais espaçado.
- **favicon.ico 404** — cosmético, sem impacto funcional.
- **Multi-canal (grid 2x2 de vídeos)** — ideia futura, todos mudos por
  padrão. Avaliar se o hardware da TV box aguenta antes de construir
  (testar com 2 canais simultâneos primeiro).
- **Login YouTube Premium na box** (pra remover anúncios) — depende de
  configurar o Fully Kiosk pra não limpar cookies ao reiniciar.
- **Testar em hardware mais forte** — Mi TV Stick e Mi Box testadas.
  Prioridade alta: depois da investigação de travamento de vídeo (ver
  seção acima), essa é a hipótese que sobrou sem testar. Avaliar Tanix
  TX9S ou Ugoos AM6B+.

## Preferências do Hugo pra esse projeto

- Sempre alinhar (layout, escopo, fontes de dado) ANTES de codar.
- Prefere reportar bugs com prints de tela + logs do GitHub Actions.
- Edita os arquivos direto pela interface web do GitHub (sem git local).
- Revisão da lista de ações (B3/EUA) é manual, ~1x por mês.

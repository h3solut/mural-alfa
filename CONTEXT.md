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

## Estrutura de arquivos
index.html — estrutura da página (sidebar + vídeo + tickers)
style.css — todo o visual
script.js — toda a lógica (fetch dos dados, player, tickers)
assets/logo.png — logo da ALFA
data/
commodities.json — soja, milho, boi gordo (via scrape_cepea.py)
youtube-live.json — ID do vídeo ao vivo atual (via fetch_live_video.py)
news.json — manchetes RSS (via fetch_news.py)
stocks.json — cotações B3 + EUA (via fetch_stocks.py)
scripts/
scrape_cepea.py — soja/milho/boi gordo via noticiasagricolas.com.br
fetch_live_video.py — descobre o vídeo ao vivo do canal via yt-dlp
fetch_news.py — agrega RSS (G1, CNN Brasil, Folha)
fetch_stocks.py — cotações via brapi.dev (B3) e Twelve Data (EUA)
.github/workflows/
update-commodities.yml — roda scrape_cepea.py de hora em hora
update-youtube-live.yml — roda fetch_live_video.py a cada 5 min
update-news.yml — roda fetch_news.py a cada 20 min
update-stocks.yml — roda fetch_stocks.py a cada 30 min

## Layout

Sidebar fixa à esquerda (logo + indicadores empilhados + relógio) +
área principal à direita (vídeo no topo, faixa de ações, faixa de
notícias, nessa ordem de cima pra baixo).

## Chaves de API necessárias (GitHub Secrets)

Configuradas em Settings → Secrets and variables → Actions:
- `BRAPI_TOKEN` — gerado em https://brapi.dev (grátis, conta pessoal do Hugo)
- `TWELVEDATA_KEY` — gerado em https://twelvedata.com (grátis, conta pessoal do Hugo)

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

---

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
- **Testar em hardware mais forte** — Mi TV Stick e Mi Box testadas;
  avaliar Tanix TX9S ou Ugoos AM6B+ se a atual não aguentar bem.

## Preferências do Hugo pra esse projeto

- Sempre alinhar (layout, escopo, fontes de dado) ANTES de codar.
- Prefere reportar bugs com prints de tela + logs do GitHub Actions.
- Edita os arquivos direto pela interface web do GitHub (sem git local).
- Revisão da lista de ações (B3/EUA) é manual, ~1x por mês.

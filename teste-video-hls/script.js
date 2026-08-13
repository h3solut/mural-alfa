/* ===================================================================
   MURAL DIGITAL ALFA — script.js (VERSÃO DE TESTE 2: HLS nativo)

   Diferença central vs. ../script.js e ../teste-video/script.js: em vez
   de embutir o player oficial do YouTube (que carrega a aplicação web
   inteira do YouTube dentro do iframe — JS pesado, anúncios, Polymer,
   analytics), aqui a gente resolve a URL do stream HLS puro do vídeo
   ao vivo (via yt-dlp, rodando no GitHub Action) e toca com uma tag
   <video> nativa + hls.js. A página nunca carrega nada do youtube.com
   — só o vídeo cru. Objetivo: eliminar o peso da aplicação web do
   YouTube como possível causa dos travamentos na Mi TV Stick.

   Trade-off assumido nesta versão: sem legenda automática (o truque de
   postMessage pra legenda só existe no player oficial do YouTube). Se
   este teste resolver o travamento e vocês decidirem adotar, dá pra
   avaliar legenda via WebVTT depois.

   Tudo o resto (câmbio, clima, commodities, ticker, ações, recarga
   diária) é idêntico ao script.js original. Os fetch de dados
   compartilhados apontam pra "../data/...", e o fetch específico do
   vídeo aponta pra "data/youtube-live-hls.json" (local desta pasta,
   mantido pelo workflow update-teste-video-hls.yml a cada 5 min).
   =================================================================== */

const CONFIG = {
  // Coordenadas usadas na previsão do tempo (Jataí-GO)
  weather: { lat: -17.8825, lon: -51.7139, nome: "Jataí-GO" },

  // Intervalos de atualização (em milissegundos)
  refresh: {
    cambio: 60 * 1000,          // 1 min
    clima: 15 * 60 * 1000,      // 15 min
    commodities: 30 * 60 * 1000,// 30 min (o arquivo em si só muda a cada hora)
    videoHls: 5 * 60 * 1000,    // 5 min (o arquivo em si só muda a cada 5 min)
    news: 10 * 60 * 1000,       // 10 min (o arquivo em si só muda a cada 20 min)
    stocks: 15 * 60 * 1000      // 15 min (o arquivo em si só muda a cada 30 min)
  },

  // Se true, trava o hls.js na variante de menor bitrate disponível no
  // stream (equivalente ao "small"/240p que tentávamos forçar no player
  // do YouTube, só que aqui é garantido, porque somos nós que
  // escolhemos a variante, não um parâmetro que o YouTube pode ignorar).
  forcarQualidadeMinima: true
};

/* ---------- Relógio ---------- */
function tickClock() {
  const el = document.getElementById("clock");
  const now = new Date();
  el.textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
setInterval(tickClock, 1000);
tickClock();

/* ---------- Bitcoin (CoinGecko, sem chave de API) ---------- */
async function atualizarBitcoin() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true"
    );
    const data = await res.json();
    const preco = data.bitcoin.usd;
    const variacao = data.bitcoin.usd_24h_change;
    const precoFormatado = preco.toLocaleString("en-US", { maximumFractionDigits: 0 });
    preencherIndicador("ind-btc", `$ ${precoFormatado}`, variacao);
  } catch (e) {
    console.error("Erro ao buscar Bitcoin:", e);
  }
}

/* ---------- Dólar / Euro (AwesomeAPI) ---------- */
async function atualizarCambio() {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL");
    const data = await res.json();
    preencherIndicador("ind-usd", `R$ ${Number(data.USDBRL.bid).toFixed(2)}`, Number(data.USDBRL.pctChange));
    preencherIndicador("ind-eur", `R$ ${Number(data.EURBRL.bid).toFixed(2)}`, Number(data.EURBRL.pctChange));
  } catch (e) {
    console.error("Erro ao buscar câmbio:", e);
  }
}

/* ---------- Clima (Open-Meteo, sem chave de API) ---------- */
const WMO_DESCRICOES = {
  0: "Céu limpo", 1: "Poucas nuvens", 2: "Parc. nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina", 51: "Garoa", 53: "Garoa", 55: "Garoa",
  61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte", 71: "Neve fraca",
  73: "Neve", 75: "Neve forte", 80: "Pancadas", 81: "Pancadas",
  82: "Pancadas fortes", 95: "Tempestade", 96: "Tempestade c/ granizo",
  99: "Tempestade c/ granizo"
};

const WMO_ICONES = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️", 51: "🌦️", 53: "🌦️", 55: "🌦️",
  61: "🌧️", 63: "🌧️", 65: "🌧️", 71: "🌨️", 73: "🌨️", 75: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "🌧️", 95: "⛈️", 96: "⛈️", 99: "⛈️"
};

async function atualizarClima() {
  try {
    const { lat, lon, nome } = CONFIG.weather;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code` +
      `&daily=uv_index_max&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();

    const t = Math.round(data.current.temperature_2m);
    const codigo = data.current.weather_code;
    const desc = WMO_DESCRICOES[codigo] || "";
    const icone = WMO_ICONES[codigo] || "🌡️";

    const valorEl = document.querySelector("#ind-clima .value");
    valorEl.innerHTML = `<span class="weather-icon">${icone}</span> ${t}°C`;
    valorEl.title = desc;
    document.querySelector("#ind-clima .label").textContent = nome;

    const umidade = Math.round(data.current.relative_humidity_2m);
    const uv = data.daily?.uv_index_max?.[0];
    const uvTexto = typeof uv === "number" ? uv.toFixed(1) : "--";
    document.querySelector("#ind-umidade .value").textContent = `${umidade}% / UV ${uvTexto}`;
  } catch (e) {
    console.error("Erro ao buscar clima:", e);
  }
}

/* ---------- Soja / Boi Gordo (arquivo estático atualizado via GitHub Action) ---------- */
async function atualizarCommodities() {
  try {
    // "?t=" evita cache antigo do navegador/kiosk
    const res = await fetch(`../data/commodities.json?t=${Date.now()}`);
    const data = await res.json();

    if (data.soja && data.soja.valor !== "--") {
      preencherIndicador("ind-soja", `${data.soja.valor}`, data.soja.variacao);
    }
    if (data.milho && data.milho.valor !== "--") {
      preencherIndicador("ind-milho", `${data.milho.valor}`, data.milho.variacao);
    }
    if (data.boi_gordo && data.boi_gordo.valor !== "--") {
      preencherIndicador("ind-boi", `${data.boi_gordo.valor}`, data.boi_gordo.variacao);
    }
  } catch (e) {
    console.error("Erro ao buscar commodities:", e);
  }
}

/* ---------- Helper visual (seta pra cima/baixo conforme variação) ---------- */
function preencherIndicador(id, texto, variacao) {
  const el = document.querySelector(`#${id} .value`);
  el.textContent = texto;
  el.classList.remove("up", "down");
  if (typeof variacao === "number" && !isNaN(variacao)) {
    el.classList.add(variacao >= 0 ? "up" : "down");
  }
}

/* ---------- Faixa de ações (B3 + EUA, arquivo estático via GitHub Action) ---------- */
function formatarAcao(item, moeda) {
  const seta = item.variacao >= 0 ? "▲" : "▼";
  const classeVar = item.variacao >= 0 ? "var-up" : "var-down";
  const precoFormatado = Number(item.preco).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const variacaoFormatada = Math.abs(Number(item.variacao)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<span class="stock-item"><span class="stock-symbol">${item.simbolo}</span> ${moeda} ${precoFormatado} <span class="${classeVar}">${seta} ${variacaoFormatada}%</span></span>`;
}

async function atualizarAcoes() {
  try {
    const res = await fetch(`../data/stocks.json?t=${Date.now()}`);
    const data = await res.json();
    const br = data.br || [];
    const eua = data.eua || [];
    if (br.length === 0 && eua.length === 0) return;

    const partes = [];
    if (br.length) {
      partes.push(`<span class="stock-group-tag br">B3</span>`);
      partes.push(...br.map(item => formatarAcao(item, "R$")));
    }
    if (eua.length) {
      partes.push(`<span class="stock-group-tag us">EUA</span>`);
      partes.push(...eua.map(item => formatarAcao(item, "US$")));
    }

    const track = document.getElementById("stocks-track");
    track.innerHTML = partes.join("") + partes.join("");

    const largura = track.scrollWidth / 2;
    const duracaoSegundos = Math.max(30, largura / 70);
    track.style.animationDuration = `${duracaoSegundos}s`;
  } catch (e) {
    console.error("Erro ao buscar ações:", e);
  }
}

/* ---------- Faixa de notícias (ticker RSS agregado via GitHub Action) ---------- */
async function atualizarTicker() {
  try {
    const res = await fetch(`../data/news.json?t=${Date.now()}`);
    const data = await res.json();
    const itens = data.itens || [];
    if (itens.length === 0) return;

    const track = document.getElementById("ticker-track");
    const textoItens = itens.map(i => `<span class="ticker-item">${escapeHTML(i.titulo)} <span style="opacity:.5">— ${escapeHTML(i.fonte)}</span></span>`);
    track.innerHTML = textoItens.join("") + textoItens.join("");

    const largura = track.scrollWidth / 2;
    const duracaoSegundos = Math.max(40, largura / 60);
    track.style.animationDuration = `${duracaoSegundos}s`;
  } catch (e) {
    console.error("Erro ao buscar notícias:", e);
  }
}

function escapeHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

/* ---------- Player HLS nativo (vídeo ao vivo, sem player do YouTube) ----------
   data/youtube-live-hls.json (local desta pasta) contém { videoId,
   hlsUrl, atualizado_em }, escrito pelo GitHub Action a cada 5 min. A
   URL do stream expira depois de um tempo, por isso o refetch
   periódico + comparação: se a URL mudou (vídeo novo OU só renovação
   de assinatura), recarrega a fonte do hls.js. */
let hls = null;
let hlsUrlAtual = null;
let audioLigado = false; // vídeo começa mudo por padrão (menos processamento)

async function obterDadosHls() {
  try {
    const res = await fetch(`data/youtube-live-hls.json?t=${Date.now()}`);
    return await res.json();
  } catch (e) {
    console.error("Erro ao buscar dados do HLS:", e);
    return null;
  }
}

function forcarQualidadeMinima(hlsInstance) {
  if (!CONFIG.forcarQualidadeMinima) return;
  if (!hlsInstance.levels || !hlsInstance.levels.length) return;
  let menorIndice = 0;
  let menorBitrate = Infinity;
  hlsInstance.levels.forEach((nivel, indice) => {
    if (nivel.bitrate < menorBitrate) {
      menorBitrate = nivel.bitrate;
      menorIndice = indice;
    }
  });
  hlsInstance.currentLevel = menorIndice;
}

function montarPlayer(hlsUrl) {
  hlsUrlAtual = hlsUrl;
  const video = document.getElementById("video-nativo");

  if (hls) {
    hls.destroy();
    hls = null;
  }

  if (window.Hls && window.Hls.isSupported()) {
    hls = new Hls({
      // buffers curtos: prioriza ficar perto da borda "ao vivo" em vez
      // de acumular buffer longo (que não faz sentido pra live 24/7)
      liveSyncDurationCount: 3,
      maxBufferLength: 20
    });
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      forcarQualidadeMinima(hls);
      video.muted = true;
      audioLigado = false;
      atualizarBotaoAudio();
      video.play().catch(() => {});
      esconderEspera();
    });

    hls.on(Hls.Events.ERROR, (_evento, dados) => {
      console.error("Erro no hls.js:", dados);
      if (dados.fatal) {
        mostrarEspera();
        // URL pode ter expirado ou o stream caiu; busca uma nova na
        // próxima checagem em vez de insistir na mesma URL quebrada.
        hlsUrlAtual = null;
        setTimeout(checarTrocaDeVideo, 5000);
      }
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    // Suporte nativo a HLS (ex: Safari) — sem hls.js
    video.src = hlsUrl;
    video.muted = true;
    audioLigado = false;
    atualizarBotaoAudio();
    video.play().catch(() => {});
    esconderEspera();
  } else {
    console.error("Este navegador não suporta HLS nem via hls.js nem nativamente.");
  }
}

function mostrarEspera() {
  let overlay = document.getElementById("espera-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "espera-overlay";
    overlay.className = "espera-overlay";
    overlay.innerHTML = "<span>Aguardando a próxima transmissão…</span>";
    document.querySelector(".video-wrap").appendChild(overlay);
  }
  overlay.style.display = "flex";
}

function esconderEspera() {
  const overlay = document.getElementById("espera-overlay");
  if (overlay) overlay.style.display = "none";
}

async function checarTrocaDeVideo() {
  const dados = await obterDadosHls();
  if (!dados || !dados.hlsUrl) {
    mostrarEspera();
    return;
  }
  if (dados.hlsUrl !== hlsUrlAtual) {
    montarPlayer(dados.hlsUrl);
  }
}

/* ---------- Botão de áudio (vídeo começa mudo por padrão) ---------- */
function atualizarBotaoAudio() {
  const btn = document.getElementById("audio-toggle");
  if (!btn) return;
  btn.textContent = audioLigado ? "🔊" : "🔇";
  btn.classList.toggle("active", audioLigado);
}

function toggleAudio() {
  const video = document.getElementById("video-nativo");
  audioLigado = !audioLigado;
  video.muted = !audioLigado;
  atualizarBotaoAudio();
}

document.getElementById("audio-toggle").addEventListener("click", toggleAudio);

/* ---------- Inicialização ---------- */
checarTrocaDeVideo();
atualizarCambio();
atualizarBitcoin();
atualizarClima();
atualizarCommodities();
atualizarTicker();
atualizarAcoes();

setInterval(atualizarCambio, CONFIG.refresh.cambio);
setInterval(atualizarBitcoin, CONFIG.refresh.cambio);
setInterval(atualizarClima, CONFIG.refresh.clima);
setInterval(atualizarCommodities, CONFIG.refresh.commodities);
setInterval(checarTrocaDeVideo, CONFIG.refresh.videoHls);
setInterval(atualizarTicker, CONFIG.refresh.news);
setInterval(atualizarAcoes, CONFIG.refresh.stocks);

/* Recarrega a página inteira uma vez por dia (às 5h) pra evitar
   qualquer vazamento de memória do navegador em execução 24/7 */
(function agendarRecargaDiaria() {
  const agora = new Date();
  const proxima = new Date(agora);
  proxima.setHours(5, 0, 0, 0);
  if (proxima <= agora) proxima.setDate(proxima.getDate() + 1);
  setTimeout(() => location.reload(), proxima - agora);
})();

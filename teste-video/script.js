/* ===================================================================
   MURAL DIGITAL ALFA — script.js (VERSÃO DE TESTE: qualidade de vídeo forçada)

   Cópia de ../script.js com UMA diferença: o player do YouTube usa o
   wrapper oficial (YT.Player) em vez de iframe cru + postMessage, o que
   permite chamar player.setPlaybackQuality('small') e forçar resolução
   baixa — objetivo: reduzir a carga de decodificação na TV box e testar
   se isso diminui os travamentos.

   Tudo o resto (câmbio, clima, commodities, ticker, ações, legenda,
   recarga diária) é idêntico ao script.js original. Os fetch de dados
   apontam pra "../data/..." porque este arquivo vive uma pasta abaixo
   (teste-video/) do restante do site.
   =================================================================== */

const CONFIG = {
  // Fallback caso o robô ainda não tenha rodado ou dê erro pontual.
  // O ID de verdade é buscado dinamicamente em data/youtube-live.json.
  youtubeVideoIdFallback: "1GelCtns9Pg",

  // Coordenadas usadas na previsão do tempo (Jataí-GO)
  weather: { lat: -17.8825, lon: -51.7139, nome: "Jataí-GO" },

  // Intervalos de atualização (em milissegundos)
  refresh: {
    cambio: 60 * 1000,          // 1 min
    clima: 15 * 60 * 1000,      // 15 min
    commodities: 30 * 60 * 1000,// 30 min (o arquivo em si só muda a cada hora)
    youtubeLive: 5 * 60 * 1000, // 5 min (o arquivo em si só muda a cada 5 min)
    news: 10 * 60 * 1000,       // 10 min (o arquivo em si só muda a cada 20 min)
    stocks: 15 * 60 * 1000      // 15 min (o arquivo em si só muda a cada 30 min)
  },

  // Qualidade forçada do player: 'small' (~240p), 'medium' (~360p),
  // 'large' (~480p), 'hd720', 'hd1080'. Comece com 'small' e suba se
  // a imagem ficar ruim demais pra TV/distância de visualização.
  qualidadeForcada: "small"
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
    // Duplica a lista uma vez pra permitir o loop contínuo (a animação
    // desloca 50% da largura, que corresponde exatamente a uma cópia).
    const textoItens = itens.map(i => `<span class="ticker-item">${escapeHTML(i.titulo)} <span style="opacity:.5">— ${escapeHTML(i.fonte)}</span></span>`);
    track.innerHTML = textoItens.join("") + textoItens.join("");

    // Ajusta a duração da animação proporcionalmente ao tamanho do texto,
    // pra manter uma velocidade de leitura mais ou menos constante
    // independente de quantas notícias vierem.
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

/* ---------- Player do YouTube (vídeo ao vivo, atualizado automaticamente) + legenda ----------
   O ID do vídeo vem de data/youtube-live.json, atualizado a cada 15 min por
   um GitHub Action que descobre qual é a transmissão ao vivo atual do canal.

   DIFERENÇA vs. script.js original: aqui usamos o wrapper oficial YT.Player
   (em vez de iframe cru + postMessage manual) porque é o único jeito
   suportado de chamar setPlaybackQuality() e forçar resolução baixa.
   Criamos o player UMA vez (new YT.Player só pode ser chamado uma vez
   por elemento) e trocamos de vídeo depois com player.loadVideoById(). */
let player = null;
let videoIdAtual = null;
let legendaLigada = false;
let audioLigado = false; // vídeo começa mudo por padrão (menos processamento)
let idPendente = null; // guarda o ID buscado enquanto a API do YT ainda não carregou

async function obterVideoIdAoVivo() {
  try {
    const res = await fetch(`../data/youtube-live.json?t=${Date.now()}`);
    const data = await res.json();
    if (data.videoId) return data.videoId;
  } catch (e) {
    console.error("Erro ao buscar video ao vivo:", e);
  }
  return CONFIG.youtubeVideoIdFallback;
}

// Chamado automaticamente pelo script https://www.youtube.com/iframe_api
// assim que a API termina de carregar (nome de função exigido pelo YouTube).
function onYouTubeIframeAPIReady() {
  if (idPendente) {
    criarPlayer(idPendente);
    idPendente = null;
  }
}

function criarPlayer(videoId) {
  videoIdAtual = videoId;
  player = new YT.Player("yt-player", {
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      mute: 1,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      cc_load_policy: 0,
      origin: location.origin
    },
    events: {
      onReady: (e) => {
        e.target.setPlaybackQuality(CONFIG.qualidadeForcada);
        e.target.mute();
        audioLigado = false;
        atualizarBotaoAudio();
        esconderEspera();
      },
      onStateChange: (e) => {
        // Reforça a qualidade baixa toda vez que o vídeo começa a tocar,
        // porque o YouTube às vezes reajusta pra "auto" sozinho.
        if (e.data === YT.PlayerState.PLAYING) {
          e.target.setPlaybackQuality(CONFIG.qualidadeForcada);
        }
        if (e.data === YT.PlayerState.ENDED) {
          mostrarEspera();
          checarTrocaDeVideo();
          const tentativas = setInterval(async () => {
            const overlay = document.getElementById("espera-overlay");
            if (!overlay || overlay.style.display === "none") {
              clearInterval(tentativas);
              return;
            }
            await checarTrocaDeVideo();
          }, 20 * 1000);
        }
      }
    }
  });
  legendaLigada = false;
  document.getElementById("cc-toggle").classList.remove("active");
}

function montarPlayer(videoId) {
  if (!player) {
    // API do YouTube ainda não carregou — guarda o ID e espera
    // onYouTubeIframeAPIReady criar o player.
    idPendente = videoId;
    return;
  }
  videoIdAtual = videoId;
  player.loadVideoById(videoId);
  player.setPlaybackQuality(CONFIG.qualidadeForcada);
  player.mute(); // cada vídeo novo volta a começar mudo, por padrão
  audioLigado = false;
  atualizarBotaoAudio();
  legendaLigada = false;
  document.getElementById("cc-toggle").classList.remove("active");
  esconderEspera();
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
  const novoId = await obterVideoIdAoVivo();
  if (novoId && novoId !== videoIdAtual) {
    montarPlayer(novoId);
  }
}

function toggleLegenda() {
  if (!player) return;
  legendaLigada = !legendaLigada;
  if (legendaLigada) {
    // O player precisa carregar o módulo de legendas antes de conseguir
    // ativá-las — sem isso, o comando setOption é ignorado silenciosamente.
    player.loadModule("captions");
    setTimeout(() => {
      // liga a legenda em português; se o canal não tiver PT disponível,
      // o YouTube cai automaticamente na legenda padrão da transmissão
      player.setOption("captions", "track", { languageCode: "pt" });
    }, 300);
  } else {
    player.setOption("captions", "track", {});
    player.unloadModule("captions");
  }
  document.getElementById("cc-toggle").classList.toggle("active", legendaLigada);
}

document.getElementById("cc-toggle").addEventListener("click", toggleLegenda);

/* ---------- Botão de áudio (vídeo começa mudo por padrão) ---------- */
function atualizarBotaoAudio() {
  const btn = document.getElementById("audio-toggle");
  if (!btn) return;
  btn.textContent = audioLigado ? "🔊" : "🔇";
  btn.classList.toggle("active", audioLigado);
}

function toggleAudio() {
  if (!player) return;
  audioLigado = !audioLigado;
  if (audioLigado) {
    player.unMute();
  } else {
    player.mute();
  }
  atualizarBotaoAudio();
}

document.getElementById("audio-toggle").addEventListener("click", toggleAudio);

/* ---------- Inicialização ---------- */
obterVideoIdAoVivo().then((id) => {
  if (window.YT && window.YT.Player) {
    criarPlayer(id);
  } else {
    idPendente = id; // API ainda carregando; onYouTubeIframeAPIReady assume
  }
});
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
setInterval(checarTrocaDeVideo, CONFIG.refresh.youtubeLive);
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

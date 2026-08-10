/* ===================================================================
   MURAL DIGITAL ALFA — script.js
   Ajuste os valores em CONFIG conforme a necessidade.
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
    youtubeLive: 5 * 60 * 1000  // 5 min (o arquivo em si só muda a cada 15 min)
  }
};

/* ---------- Relógio ---------- */
function tickClock() {
  const el = document.getElementById("clock");
  const now = new Date();
  el.textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
setInterval(tickClock, 1000);
tickClock();

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
  61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte", 80: "Pancadas",
  81: "Pancadas", 82: "Pancadas fortes", 95: "Tempestade"
};

async function atualizarClima() {
  try {
    const { lat, lon, nome } = CONFIG.weather;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const res = await fetch(url);
    const data = await res.json();
    const t = Math.round(data.current_weather.temperature);
    const desc = WMO_DESCRICOES[data.current_weather.weathercode] || "";
    const el = document.querySelector("#ind-clima .value");
    el.textContent = `${t}°C`;
    el.title = desc;
    document.querySelector("#ind-clima .label").textContent = nome;
  } catch (e) {
    console.error("Erro ao buscar clima:", e);
  }
}

/* ---------- Soja / Boi Gordo (arquivo estático atualizado via GitHub Action) ---------- */
async function atualizarCommodities() {
  try {
    // "?t=" evita cache antigo do navegador/kiosk
    const res = await fetch(`data/commodities.json?t=${Date.now()}`);
    const data = await res.json();

    if (data.soja && data.soja.valor !== "--") {
      preencherIndicador("ind-soja", `${data.soja.valor}`, data.soja.variacao);
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

/* ---------- Player do YouTube (vídeo ao vivo, atualizado automaticamente) + legenda ----------
   O ID do vídeo vem de data/youtube-live.json, atualizado a cada 15 min por
   um GitHub Action que descobre qual é a transmissão ao vivo atual do canal.
   Isso evita ter que trocar o ID manualmente sempre que o canal encerra um
   vídeo e começa outro (o que acontece diariamente). O controle de legenda
   é feito via postMessage pra Player API do YouTube (funciona mesmo sem o
   wrapper oficial YT.Player, desde que o iframe tenha enablejsapi=1). */
let legendaLigada = false;
let videoIdAtual = null;

async function obterVideoIdAoVivo() {
  try {
    const res = await fetch(`data/youtube-live.json?t=${Date.now()}`);
    const data = await res.json();
    if (data.videoId) return data.videoId;
  } catch (e) {
    console.error("Erro ao buscar video ao vivo:", e);
  }
  return CONFIG.youtubeVideoIdFallback;
}

function montarPlayer(videoId) {
  videoIdAtual = videoId;
  const wrap = document.getElementById("yt-player");
  wrap.innerHTML = ""; // remove iframe anterior, se houver
  const iframe = document.createElement("iframe");
  iframe.id = "yt-iframe";
  iframe.src =
    `https://www.youtube.com/embed/${videoId}` +
    `?autoplay=1&mute=0&controls=0&modestbranding=1&rel=0&playsinline=1` +
    `&enablejsapi=1&cc_load_policy=0&origin=${encodeURIComponent(location.origin)}`;
  iframe.allow = "autoplay; encrypted-media";
  iframe.frameBorder = "0";
  wrap.appendChild(iframe);
  legendaLigada = false;
  document.getElementById("cc-toggle").classList.remove("active");
}

async function checarTrocaDeVideo() {
  const novoId = await obterVideoIdAoVivo();
  if (novoId && novoId !== videoIdAtual) {
    montarPlayer(novoId);
  }
}

function enviarComandoYT(func, args = []) {
  const iframe = document.getElementById("yt-iframe");
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*");
}

function toggleLegenda() {
  legendaLigada = !legendaLigada;
  if (legendaLigada) {
    // liga a legenda em português; se o canal não tiver PT disponível,
    // o YouTube cai automaticamente na legenda padrão da transmissão
    enviarComandoYT("setOption", ["captions", "track", { languageCode: "pt" }]);
  } else {
    enviarComandoYT("setOption", ["captions", "track", {}]);
  }
  document.getElementById("cc-toggle").classList.toggle("active", legendaLigada);
}

document.getElementById("cc-toggle").addEventListener("click", toggleLegenda);

/* ---------- Inicialização ---------- */
obterVideoIdAoVivo().then(montarPlayer);
atualizarCambio();
atualizarClima();
atualizarCommodities();

setInterval(atualizarCambio, CONFIG.refresh.cambio);
setInterval(atualizarClima, CONFIG.refresh.clima);
setInterval(atualizarCommodities, CONFIG.refresh.commodities);
setInterval(checarTrocaDeVideo, CONFIG.refresh.youtubeLive);

/* Recarrega a página inteira uma vez por dia (às 5h) pra evitar
   qualquer vazamento de memória do navegador em execução 24/7 */
(function agendarRecargaDiaria() {
  const agora = new Date();
  const proxima = new Date(agora);
  proxima.setHours(5, 0, 0, 0);
  if (proxima <= agora) proxima.setDate(proxima.getDate() + 1);
  setTimeout(() => location.reload(), proxima - agora);
})();

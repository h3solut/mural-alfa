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
    youtubeLive: 5 * 60 * 1000  // 5 min (o arquivo em si só muda a cada 5 min)
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
    const res = await fetch(`data/commodities.json?t=${Date.now()}`);
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

/* ---------- Player do YouTube (vídeo ao vivo, atualizado automaticamente) + legenda ----------
   O ID do vídeo vem de data/youtube-live.json, atualizado a cada 5 min por
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

/* Escuta mensagens do player do YouTube pra saber quando o vídeo termina
   (evento onStateChange, estado 0 = ENDED) e reage na hora, em vez de
   esperar até 5 minutos pelo próximo ciclo automático de checagem. */
window.addEventListener("message", (event) => {
  if (typeof event.data !== "string") return;
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }
  if (msg.event === "onStateChange" && msg.info === 0) {
    mostrarEspera();
    checarTrocaDeVideo();
    // continua tentando de 20 em 20s enquanto estiver na tela de espera
    const tentativas = setInterval(async () => {
      const overlay = document.getElementById("espera-overlay");
      if (!overlay || overlay.style.display === "none") {
        clearInterval(tentativas);
        return;
      }
      await checarTrocaDeVideo();
    }, 20 * 1000);
  }
});

function enviarComandoYT(func, args = []) {
  const iframe = document.getElementById("yt-iframe");
  if (!iframe || !iframe.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*");
}

function toggleLegenda() {
  legendaLigada = !legendaLigada;
  if (legendaLigada) {
    // O player precisa carregar o módulo de legendas antes de conseguir
    // ativá-las — sem isso, o comando setOption é ignorado silenciosamente.
    enviarComandoYT("loadModule", ["captions"]);
    // pequena espera pro player processar o loadModule antes do setOption
    setTimeout(() => {
      // liga a legenda em português; se o canal não tiver PT disponível,
      // o YouTube cai automaticamente na legenda padrão da transmissão
      enviarComandoYT("setOption", ["captions", "track", { languageCode: "pt" }]);
    }, 300);
  } else {
    enviarComandoYT("setOption", ["captions", "track", {}]);
    enviarComandoYT("unloadModule", ["captions"]);
  }
  document.getElementById("cc-toggle").classList.toggle("active", legendaLigada);
}

document.getElementById("cc-toggle").addEventListener("click", toggleLegenda);

/* ---------- Inicialização ---------- */
obterVideoIdAoVivo().then(montarPlayer);
atualizarCambio();
atualizarBitcoin();
atualizarClima();
atualizarCommodities();

setInterval(atualizarCambio, CONFIG.refresh.cambio);
setInterval(atualizarBitcoin, CONFIG.refresh.cambio);
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

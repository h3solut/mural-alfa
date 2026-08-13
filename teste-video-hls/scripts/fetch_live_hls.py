#!/usr/bin/env python3
"""
Resolve a URL do stream HLS (m3u8) do vídeo ao vivo atual, pra tocar
com um <video> nativo (hls.js) em vez do player embutido do YouTube.

Por quê: o player oficial do YouTube (mesmo embutido via iframe) carrega
a aplicação web inteira do YouTube dentro do iframe -- JS pesado,
anúncios, Polymer, analytics -- que sobrecarrega hardware fraco tipo o
Mi TV Stick, mesmo com Hardware Acceleration ligada no WebView.
Extraindo o link HLS puro com yt-dlp e tocando com <video>+hls.js, a
página nunca carrega nada do youtube.com de fato, só o vídeo cru.

Lê o videoId de data/youtube-live.json (mantido pelo pipeline
principal, atualizado a cada 5 min) -- não refaz a descoberta do vídeo
ao vivo, só resolve a URL do stream pra esse ID.

Rodado automaticamente pelo GitHub Action em
.github/workflows/update-teste-video-hls.yml (a cada 5 min, porque a
URL do stream expira depois de algumas horas e precisa ser renovada).

Rodar manualmente (a partir da raiz do repo):
    python3 teste-video-hls/scripts/fetch_live_hls.py
"""

import json
from pathlib import Path
from datetime import datetime, timezone

import yt_dlp

SCRIPT_DIR = Path(__file__).resolve().parent          # teste-video-hls/scripts
TESTE_DIR = SCRIPT_DIR.parent                          # teste-video-hls
REPO_ROOT = TESTE_DIR.parent                           # raiz do repo (github_main)

VIDEO_ID_PATH = REPO_ROOT / "data" / "youtube-live.json"
OUTPUT_PATH = TESTE_DIR / "data" / "youtube-live-hls.json"


def obter_video_id_atual():
    if not VIDEO_ID_PATH.exists():
        return None
    dados = json.loads(VIDEO_ID_PATH.read_text(encoding="utf-8"))
    return dados.get("videoId")


def resolver_url_hls(video_id):
    """
    Usa yt-dlp pra resolver a URL do manifesto HLS (m3u8) do stream ao
    vivo. Pra uma live do YouTube em andamento, o formato "best" já
    entrega o master playlist HLS -- é ele que o hls.js consome no
    navegador (o master playlist lista as variantes de qualidade, então
    dá pra trocar de resolução do lado do cliente sem rebuscar nada).
    """
    opcoes = {
        "format": "best",
        "quiet": True,
        "no_warnings": True,
    }
    url_video = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(opcoes) as ydl:
        info = ydl.extract_info(url_video, download=False)
    return info.get("url")


def main():
    video_id = obter_video_id_atual()
    if not video_id:
        print("[info] nenhum videoId encontrado em data/youtube-live.json ainda.")
        return

    try:
        stream_url = resolver_url_hls(video_id)
    except Exception as e:
        print(f"[erro] falha ao resolver HLS pra videoId={video_id}: {e}")
        return

    if not stream_url:
        print(f"[erro] yt-dlp não retornou URL pra videoId={video_id}")
        return

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(
            {
                "videoId": video_id,
                "hlsUrl": stream_url,
                "atualizado_em": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[ok] HLS resolvido pra videoId={video_id}")


if __name__ == "__main__":
    main()

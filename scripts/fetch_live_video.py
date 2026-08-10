#!/usr/bin/env python3
"""
Descobre o ID do vídeo que está ao vivo AGORA no canal configurado e
atualiza data/youtube-live.json. Rodado automaticamente pelo GitHub Action
em .github/workflows/update-youtube-live.yml (a cada 15 min).

Como funciona: usamos a aba "Streams" do canal
(youtube.com/@handle/streams), que é onde o YouTube separa transmissões
ao vivo de vídeos normais e de pré-estreias agendadas — diferente da
página /live, que às vezes mistura os dois e nos fez pegar uma
pré-estreia por engano. Extraímos o bloco de dados "ytInitialData" que
vem embutido no HTML da página (sem precisar executar JavaScript) e
procuramos o primeiro vídeo com o selo "AO VIVO".

Rodar manualmente:
    python3 scripts/fetch_live_video.py
"""

import json
import re
from pathlib import Path
from datetime import datetime, timezone

import requests

CANAL_HANDLE = "jovempannews"  # sem o @
STREAMS_URL = f"https://www.youtube.com/@{CANAL_HANDLE}/streams"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "youtube-live.json"


def extrair_yt_initial_data(html: str):
    """Pega o bloco JSON 'ytInitialData' embutido no HTML da página."""
    m = re.search(r"var ytInitialData\s*=\s*(\{.*?\});</script>", html, re.DOTALL)
    if not m:
        # Formato alternativo, usado em algumas versões da página
        m = re.search(r'ytInitialData"\]\s*=\s*(\{.*?\});', html, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def achar_primeiro_video_ao_vivo(node):
    """
    Percorre recursivamente o JSON da página procurando o primeiro
    'videoRenderer' que tenha o selo de 'AO VIVO' (thumbnailOverlayTimeStatusRenderer
    com style LIVE). Retorna o videoId ou None.
    """
    if isinstance(node, dict):
        if "videoRenderer" in node:
            vr = node["videoRenderer"]
            overlays = vr.get("thumbnailOverlays", [])
            for overlay in overlays:
                status = overlay.get("thumbnailOverlayTimeStatusRenderer")
                if status and status.get("style") == "LIVE":
                    video_id = vr.get("videoId")
                    if video_id:
                        return video_id
        for value in node.values():
            achado = achar_primeiro_video_ao_vivo(value)
            if achado:
                return achado
    elif isinstance(node, list):
        for item in node:
            achado = achar_primeiro_video_ao_vivo(item)
            if achado:
                return achado
    return None


def main():
    resp = requests.get(STREAMS_URL, headers=HEADERS, timeout=20)
    resp.raise_for_status()

    dados = extrair_yt_initial_data(resp.text)
    video_id = achar_primeiro_video_ao_vivo(dados) if dados else None

    if DATA_PATH.exists():
        atual = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    else:
        atual = {}

    if video_id:
        atual["videoId"] = video_id
        atual["atualizado_em"] = datetime.now(timezone.utc).isoformat()
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(atual, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[ok] video ao vivo: {video_id}")
    else:
        # Não sobrescreve o ID anterior se não achou nada agora. Situação
        # normal quando o canal está momentaneamente sem transmissão ativa.
        print("[info] nenhuma transmissão com selo AO VIVO encontrada agora. Mantendo o valor anterior.")


if __name__ == "__main__":
    main()

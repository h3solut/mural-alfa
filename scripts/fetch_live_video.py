#!/usr/bin/env python3
"""
Descobre o ID do vídeo que está ao vivo AGORA no canal configurado e
atualiza data/youtube-live.json. Rodado automaticamente pelo GitHub Action
em .github/workflows/update-youtube-live.yml (a cada 15 min).

Como funciona: a página https://www.youtube.com/@handle/live redireciona
(ou já entrega no HTML) uma tag <link rel="canonical" href="...watch?v=ID">
apontando pro vídeo ao vivo atual — não precisamos executar JavaScript
pra pegar isso, só ler o HTML puro.

Rodar manualmente:
    python3 scripts/fetch_live_video.py
"""

import json
import re
import sys
from pathlib import Path

import requests

CANAL_HANDLE = "jovempannews"  # sem o @
LIVE_URL = f"https://www.youtube.com/@{CANAL_HANDLE}/live"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
}

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "youtube-live.json"

VIDEO_ID_RE = re.compile(r"[A-Za-z0-9_-]{11}")


def extrair_video_id(html: str, final_url: str):
    # 1) Se o redirecionamento já levou pra uma URL /watch?v=..., usa ela
    m = re.search(r"[?&]v=([A-Za-z0-9_-]{11})", final_url)
    if m:
        return m.group(1)

    # 2) Tag <link rel="canonical" href="https://www.youtube.com/watch?v=ID">
    m = re.search(
        r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})"',
        html,
    )
    if m:
        return m.group(1)

    # 3) Fallback: primeiro "videoId":"ID" no JSON embutido na página
    m = re.search(r'"videoId":"([A-Za-z0-9_-]{11})"', html)
    if m:
        return m.group(1)

    return None


def main():
    resp = requests.get(LIVE_URL, headers=HEADERS, timeout=20, allow_redirects=True)
    resp.raise_for_status()

    video_id = extrair_video_id(resp.text, resp.url)

    if DATA_PATH.exists():
        atual = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    else:
        atual = {}

    if video_id:
        from datetime import datetime, timezone
        atual["videoId"] = video_id
        atual["atualizado_em"] = datetime.now(timezone.utc).isoformat()
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(atual, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[ok] video ao vivo: {video_id}")
    else:
        # Não sobrescreve o ID anterior se não achou nada agora
        # (evita derrubar o mural por uma falha pontual do canal estar offline)
        print("[erro] não encontrei um videoId na página. Mantendo o valor anterior.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

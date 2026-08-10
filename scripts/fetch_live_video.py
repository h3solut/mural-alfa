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
    # Verificação crítica: só aceitamos o vídeo se ele estiver REALMENTE ao
    # vivo agora. Quando não há transmissão ativa no momento, a página do
    # canal às vezes destaca uma pré-estreia agendada ("Ao vivo em X
    # minutos") em vez de uma live de verdade — sem essa checagem, o mural
    # ficaria preso numa contagem regressiva.
    if '"isLiveNow":true' not in html:
        return None

    # 1) Se o redirecionamento já levou pra uma URL /watch?v=..., usa ela
    m = re.search(r"[?&]v=([A-Za-z0-9_-]{11})", final_url)
    if m:
        return m.group(1)

    # 2) "videoDetails":{"videoId":"ID" — é o campo que identifica o vídeo
    #    PRINCIPAL que está carregado na página (não recomendações/sugestões)
    m = re.search(r'"videoDetails":\{"videoId":"([A-Za-z0-9_-]{11})"', html)
    if m:
        return m.group(1)

    # 3) Tag <link rel="canonical" href="...watch?v=ID">, aceitando qualquer
    #    ordem de atributos dentro da tag
    m = re.search(
        r'<link[^>]+rel="canonical"[^>]+href="[^"]*watch\?v=([A-Za-z0-9_-]{11})',
        html,
    )
    if m:
        return m.group(1)

    # 4) Último recurso: primeiro "videoId":"ID" solto no HTML. Menos
    #    confiável (pode pegar vídeo de recomendação), só usado se nada
    #    acima funcionou.
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

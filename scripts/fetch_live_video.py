#!/usr/bin/env python3
"""
Descobre o ID do vídeo que está ao vivo AGORA no canal configurado e
atualiza data/youtube-live.json. Rodado automaticamente pelo GitHub Action
em .github/workflows/update-youtube-live.yml (a cada 15 min).

Como funciona: usa a biblioteca yt-dlp (mantida ativamente pela
comunidade, especializada em lidar com as mudanças constantes da
estrutura interna do YouTube) pra listar a aba "Streams" do canal e
identificar qual vídeo está com status "ao vivo" agora. Isso é bem mais
confiável do que tentar interpretar o HTML/JSON da página na mão — essa
abordagem manual já falhou algumas vezes porque o YouTube muda esses
detalhes sem aviso.

Rodar manualmente:
    python3 scripts/fetch_live_video.py
"""

import json
from pathlib import Path
from datetime import datetime, timezone

import yt_dlp

CANAL_HANDLE = "jovempannews"  # sem o @
STREAMS_URL = f"https://www.youtube.com/@{CANAL_HANDLE}/streams"

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "youtube-live.json"


def achar_video_ao_vivo():
    """
    Usa extract_flat pra listar rapidamente os vídeos da aba Streams
    (sem baixar cada um por completo) e retorna o ID do primeiro que
    estiver com live_status == 'is_live'.
    """
    opcoes = {
        "extract_flat": True,
        "quiet": True,
        "no_warnings": True,
        "playlistend": 15,  # não precisa varrer o canal inteiro
    }
    with yt_dlp.YoutubeDL(opcoes) as ydl:
        info = ydl.extract_info(STREAMS_URL, download=False)

    entradas = info.get("entries", []) if info else []
    debug_info = []
    for entrada in entradas:
        if not entrada:
            continue
        status = entrada.get("live_status")
        debug_info.append({
            "videoId": entrada.get("id"),
            "titulo": entrada.get("title"),
            "live_status": status,
        })
        if status == "is_live":
            return entrada.get("id"), debug_info

    return None, debug_info


def main():
    video_id, debug_info = achar_video_ao_vivo()

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
        print(f"[debug] {len(debug_info)} vídeo(s) verificados, nenhum com live_status == 'is_live':")
        for item in debug_info[:10]:
            print(f"  - videoId={item['videoId']} live_status={item['live_status']} titulo={item['titulo']!r}")
        # Não sobrescreve o ID anterior se não achou nada agora. Situação
        # normal quando o canal está momentaneamente sem transmissão ativa.
        print("[info] mantendo o valor anterior.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Descobre o ID do vídeo que está ao vivo AGORA no canal configurado e
atualiza data/youtube-live.json. Rodado automaticamente pelo GitHub Action
em .github/workflows/update-youtube-live.yml (disparado a cada 5 min pelo
cron-job.org; o agendamento nativo do GitHub fica só como reserva).

Como funciona: usa a biblioteca yt-dlp (mantida ativamente pela
comunidade, especializada em lidar com as mudanças constantes da
estrutura interna do YouTube) pra listar a aba "Streams" do canal e
identificar qual vídeo está com status "ao vivo" agora. Isso é bem mais
confiável do que tentar interpretar o HTML/JSON da página na mão — essa
abordagem manual já falhou algumas vezes porque o YouTube muda esses
detalhes sem aviso.

Formato do data/youtube-live.json:
    {
      "videoId": "...",          # último vídeo ao vivo encontrado
      "ao_vivo": true,           # false = canal sem transmissão no ar agora
      "falhas_seguidas": 0,      # quantas checagens seguidas não acharam live (máx. 2)
      "atualizado_em": "..."     # quando o estado acima mudou pela última vez
    }

O arquivo só é reescrito quando algum desses campos muda (evita um commit
a cada execução). "ao_vivo" só vira false depois de FALHAS_PARA_OFFLINE
checagens seguidas sem achar nenhuma transmissão, pra uma falha pontual do
YouTube não derrubar o vídeo da tela.

Rodar manualmente:
    python3 scripts/fetch_live_video.py
"""

import json
import sys
from collections import Counter
from pathlib import Path
from datetime import datetime, timezone

import yt_dlp

CANAL_HANDLE = "jovempannews"  # sem o @
STREAMS_URL = f"https://www.youtube.com/@{CANAL_HANDLE}/streams"

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "youtube-live.json"

# Quantas checagens seguidas sem achar live antes de marcar "ao_vivo": false.
FALHAS_PARA_OFFLINE = 2

# Quantas entradas da aba Streams ler. ATENÇÃO: a aba lista PRIMEIRO os
# programas agendados ("Em breve" — o canal agenda uns 3 dias à frente,
# ~20 entradas, e isso pode crescer) e só DEPOIS as transmissões ao vivo e as
# passadas. Com um limite pequeno (era 15) as lives ficavam fora da leitura e
# o robô concluía "sem transmissão" mesmo com o canal no ar (mural preso em
# "Aguardando" de 23/11 a 25/11/2026). Se o log avisar que a lista atingiu o
# limite sem achar live, aumente este valor.
MAX_ENTRADAS = 100


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
        "playlistend": MAX_ENTRADAS,
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


def calcular_novo_estado(atual, video_id, agora_iso):
    """
    Recebe o conteúdo atual do JSON (dict, pode estar vazio ou no formato
    antigo, só com videoId/atualizado_em) e o resultado da checagem
    (video_id ou None). Retorna (novo_estado, mudou).
    "mudou" é True só se videoId, ao_vivo ou falhas_seguidas forem
    diferentes do que já estava gravado.
    """
    if video_id:
        id_final = video_id
        ao_vivo = True
        falhas = 0
    else:
        id_final = atual.get("videoId")  # mantém o último ID conhecido
        # Formato antigo (sem "ao_vivo") conta como "ao vivo" até provar o contrário.
        ao_vivo = atual.get("ao_vivo", True)
        falhas = min(int(atual.get("falhas_seguidas", 0)) + 1, FALHAS_PARA_OFFLINE)
        if falhas >= FALHAS_PARA_OFFLINE:
            ao_vivo = False

    estado = {"videoId": id_final, "ao_vivo": ao_vivo, "falhas_seguidas": falhas}
    anterior = {
        "videoId": atual.get("videoId"),
        "ao_vivo": atual.get("ao_vivo"),
        "falhas_seguidas": atual.get("falhas_seguidas"),
    }

    if estado == anterior:
        return atual, False

    novo = dict(estado)
    novo["atualizado_em"] = agora_iso
    return novo, True


def main():
    try:
        video_id, debug_info = achar_video_ao_vivo()
    except Exception as e:  # yt-dlp bloqueado, YouTube fora do ar, rede etc.
        # Erro NÃO conta como "sem transmissão": não mexe no arquivo, só avisa.
        print(f"[erro] não foi possível consultar o YouTube: {e}")
        sys.exit(1)

    atual = json.loads(DATA_PATH.read_text(encoding="utf-8")) if DATA_PATH.exists() else {}
    agora_iso = datetime.now(timezone.utc).isoformat()
    novo, mudou = calcular_novo_estado(atual, video_id, agora_iso)

    if video_id:
        # A posição ajuda a notar cedo se as lives estão chegando perto do limite de leitura.
        print(f"[ok] video ao vivo: {video_id} (posição {len(debug_info)} na lista da aba Streams)")
    else:
        contagem = Counter(item["live_status"] for item in debug_info)
        resumo = ", ".join(f"{status}={n}" for status, n in contagem.most_common())
        print(f"[debug] {len(debug_info)} vídeo(s) verificados ({resumo}), nenhum com live_status == 'is_live':")
        for item in debug_info[:10]:
            print(f"  - videoId={item['videoId']} live_status={item['live_status']} titulo={item['titulo']!r}")
        if len(debug_info) >= MAX_ENTRADAS:
            print(
                f"[aviso] a lista atingiu o limite de {MAX_ENTRADAS} entradas sem achar nenhuma live — "
                "pode haver live além do limite. Aumente MAX_ENTRADAS em scripts/fetch_live_video.py."
            )

    if mudou:
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(json.dumps(novo, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[info] arquivo atualizado: ao_vivo={novo['ao_vivo']} falhas_seguidas={novo['falhas_seguidas']}")
    else:
        print("[info] nada mudou, arquivo mantido.")


if __name__ == "__main__":
    main()

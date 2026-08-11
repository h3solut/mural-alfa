#!/usr/bin/env python3
"""
Busca as manchetes mais recentes de várias fontes RSS, mistura por data de
publicação e salva em data/news.json. Rodado automaticamente pelo GitHub
Action em .github/workflows/update-news.yml.

Usa a biblioteca feedparser (lida bem com as pequenas variações de formato
entre RSS 2.0/Atom de fontes diferentes, em vez de a gente escrever um
parser de XML na mão).

Rodar manualmente:
    python3 scripts/fetch_news.py
"""

import json
from pathlib import Path
from datetime import datetime, timezone
from time import mktime

import feedparser

FONTES = {
    "G1": "https://g1.globo.com/rss/g1/",
    "CNN Brasil": "https://www.cnnbrasil.com.br/feed/",
    "Folha": "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml",
}

MAX_POR_FONTE = 8
MAX_TOTAL = 20

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "news.json"


def buscar_fonte(nome: str, url: str):
    itens = []
    feed = feedparser.parse(url)
    for entrada in feed.entries[:MAX_POR_FONTE]:
        titulo = entrada.get("title", "").strip()
        if not titulo:
            continue

        data_pub = None
        if entrada.get("published_parsed"):
            data_pub = datetime.fromtimestamp(mktime(entrada["published_parsed"]), tz=timezone.utc)
        elif entrada.get("updated_parsed"):
            data_pub = datetime.fromtimestamp(mktime(entrada["updated_parsed"]), tz=timezone.utc)

        itens.append({
            "titulo": titulo,
            "fonte": nome,
            "data": data_pub.isoformat() if data_pub else None,
            "_ordenacao": data_pub or datetime.min.replace(tzinfo=timezone.utc),
        })
    return itens


def main():
    todos = []
    erros = []

    for nome, url in FONTES.items():
        try:
            itens = buscar_fonte(nome, url)
            todos.extend(itens)
            print(f"[ok] {nome}: {len(itens)} manchete(s)")
        except Exception as e:
            erros.append(f"{nome}: {e}")
            print(f"[erro] {nome}: {e}")

    # Ordena por data de publicação, mais recente primeiro, e mistura as fontes
    todos.sort(key=lambda x: x["_ordenacao"], reverse=True)
    todos = todos[:MAX_TOTAL]
    for item in todos:
        item.pop("_ordenacao")

    if not todos:
        print("Nenhuma manchete encontrada em nenhuma fonte — mantendo arquivo anterior.")
        return

    saida = {
        "itens": todos,
        "atualizado_em": datetime.now(timezone.utc).isoformat(),
    }

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[ok] {len(todos)} manchetes salvas no total")

    if erros:
        print("Concluído com erros parciais:", "; ".join(erros))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Busca cotações de ações da B3 (via brapi.dev) e dos EUA (via Twelve Data)
e salva em data/stocks.json. Rodado automaticamente pelo GitHub Action em
.github/workflows/update-stocks.yml.

PRECISA de duas chaves de API gratuitas, passadas como variáveis de
ambiente (configuradas como "Secrets" no GitHub, nunca direto no código):

  BRAPI_TOKEN       -> gerar em https://brapi.dev  (grátis, sem cartão)
  TWELVEDATA_KEY    -> gerar em https://twelvedata.com  (grátis, sem cartão)

Rodar manualmente (definindo as variáveis antes):
    BRAPI_TOKEN=xxx TWELVEDATA_KEY=yyy python3 scripts/fetch_stocks.py
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

import requests

# Lista fixa — revisão manual mensal, sem robô de "descoberta" de ranking.
ACOES_BR = ["PETR4", "VALE3", "ITUB4", "BBDC4", "ABEV3", "B3SA3"]
INDICE_BR = "^BVSP"
ACOES_EUA = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA"]

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "stocks.json"


def _consultar_brapi_v2(ticker: str, token: str):
    url = "https://brapi.dev/api/v2/stocks/quote"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, params={"symbols": ticker}, headers=headers, timeout=20)
    resp.raise_for_status()
    return resp.json().get("results", [])


def buscar_br(token: str):
    resultados = []

    # Uma chamada por símbolo — a conta gratuita parece não aceitar lote
    # de vários símbolos numa chamada só (dava erro 400 mesmo com a
    # autenticação correta), mas símbolo único funciona normalmente.
    for ticker in ACOES_BR + [INDICE_BR]:
        try:
            for item in _consultar_brapi_v2(ticker, token):
                simbolo = item.get("symbol") or item.get("stock")
                preco = item.get("regularMarketPrice")
                variacao = item.get("regularMarketChangePercent")
                if preco is None:
                    continue
                nome = "IBOVESPA" if ticker == INDICE_BR else (simbolo or ticker)
                resultados.append({"simbolo": nome, "preco": preco, "variacao": variacao})
        except Exception as e:
            print(f"[erro] B3 ({ticker}): {e}")

    return resultados
def buscar_eua(apikey: str):
    url = "https://api.twelvedata.com/quote"
    params = {"symbol": ",".join(ACOES_EUA), "apikey": apikey}
    resp = requests.get(url, params=params, timeout=20)
    resp.raise_for_status()
    data = resp.json()

    # A Twelve Data retorna um dict único quando só tem 1 símbolo, ou um
    # dict-de-dicts (chave = símbolo) quando tem vários.
    if "symbol" in data:
        bruto = {data["symbol"]: data}
    else:
        bruto = data

    resultados = []
    for simbolo, item in bruto.items():
        if not isinstance(item, dict) or "close" not in item:
            continue
        try:
            preco = float(item["close"])
            variacao = float(item.get("percent_change", 0))
        except (TypeError, ValueError):
            continue
        resultados.append({"simbolo": simbolo, "preco": preco, "variacao": variacao})
    return resultados


def main():
    brapi_token = os.environ.get("BRAPI_TOKEN")
    twelvedata_key = os.environ.get("TWELVEDATA_KEY")

    if not brapi_token or not twelvedata_key:
        print("[erro] Faltam as variáveis de ambiente BRAPI_TOKEN e/ou TWELVEDATA_KEY.")
        sys.exit(1)

    if DATA_PATH.exists():
        atual = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    else:
        atual = {"br": [], "eua": []}

    erros = []

    try:
        br = buscar_br(brapi_token)
        if br:
            atual["br"] = br
            print(f"[ok] B3: {len(br)} ativo(s)")
        else:
            print("[erro] B3: resposta vazia, mantendo valores anteriores")
    except Exception as e:
        erros.append(f"B3: {e}")
        print(f"[erro] B3: {e}")

    try:
        eua = buscar_eua(twelvedata_key)
        if eua:
            atual["eua"] = eua
            print(f"[ok] EUA: {len(eua)} ativo(s)")
        else:
            print("[erro] EUA: resposta vazia, mantendo valores anteriores")
    except Exception as e:
        erros.append(f"EUA: {e}")
        print(f"[erro] EUA: {e}")

    atual["atualizado_em"] = datetime.now(timezone.utc).isoformat()
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(atual, ensure_ascii=False, indent=2), encoding="utf-8")

    if erros:
        print("Concluído com erros parciais:", "; ".join(erros))


if __name__ == "__main__":
    main()

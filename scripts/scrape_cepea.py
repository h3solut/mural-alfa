#!/usr/bin/env python3
"""
Atualiza data/commodities.json com os indicadores mais recentes de
Soja (Paranaguá) e Boi Gordo da CEPEA/ESALQ.

Rodado automaticamente pelo GitHub Action em .github/workflows/update-commodities.yml
(uma vez por hora). Pode também ser rodado manualmente:

    python3 scripts/scrape_cepea.py

Importante: a CEPEA não tem API oficial pública, então isto é um scraper
de HTML. Se a CEPEA mudar o layout do site, este script pode parar de
achar a tabela certa — ver a função `extrair_indicador` abaixo, que é o
único ponto que provavelmente vai precisar de ajuste no futuro.
"""

import json
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URLS = {
    "soja": "https://cepea.org.br/br/indicador/soja.aspx",
    "boi_gordo": "https://cepea.org.br/br/indicador/boi-gordo.aspx",
}

UNIDADES = {
    "soja": "R$/saca",
    "boi_gordo": "R$/@",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
}

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "commodities.json"


def extrair_indicador(html: str):
    """
    Acha a primeira tabela da página cujo cabeçalho contenha 'Valor R$'
    (é assim que a CEPEA nomeia a coluna de preço em todos os indicadores)
    e retorna a linha mais recente (primeira linha de dados).
    """
    soup = BeautifulSoup(html, "html.parser")

    for table in soup.find_all("table"):
        header_text = table.get_text(" ", strip=True).lower()
        if "valor r$" not in header_text:
            continue

        rows = table.find_all("tr")
        for row in rows:
            cols = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
            if len(cols) < 2:
                continue
            # A primeira linha de dados começa com uma data dd/mm/aaaa
            if re.match(r"^\d{2}/\d{2}/\d{4}$", cols[0]):
                data, valor = cols[0], cols[1]
                var_dia = cols[2] if len(cols) > 2 else None
                return {
                    "data_referencia": data,
                    "valor": valor,
                    "variacao_dia_texto": var_dia,
                }
    return None


def variacao_para_numero(texto):
    """'-0,47%' -> -0.47  |  '0,05%' -> 0.05  |  None se não der pra converter"""
    if not texto:
        return None
    try:
        limpo = texto.replace("%", "").replace(",", ".").strip()
        return float(limpo)
    except ValueError:
        return None


def buscar(produto: str):
    resp = requests.get(URLS[produto], headers=HEADERS, timeout=20)
    resp.raise_for_status()
    achado = extrair_indicador(resp.text)
    if not achado:
        raise RuntimeError(
            f"Não encontrei a tabela de indicador para '{produto}'. "
            "O layout da CEPEA pode ter mudado — ver extrair_indicador()."
        )
    return {
        "valor": f"R$ {achado['valor']}",
        "unidade": UNIDADES[produto],
        "variacao": variacao_para_numero(achado["variacao_dia_texto"]),
        "data_referencia": achado["data_referencia"],
    }


def main():
    if DATA_PATH.exists():
        atual = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    else:
        atual = {}

    erros = []
    for produto in URLS:
        try:
            atual[produto] = buscar(produto)
            print(f"[ok] {produto}: {atual[produto]}")
        except Exception as e:
            erros.append(f"{produto}: {e}")
            print(f"[erro] {produto}: {e}", file=sys.stderr)
            # Mantém o valor anterior no JSON em vez de sobrescrever com erro

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(atual, ensure_ascii=False, indent=2), encoding="utf-8")

    if erros:
        # Não derruba o workflow por um produto só ter falhado,
        # mas deixa registrado no log do GitHub Action.
        print("Concluído com erros parciais:", "; ".join(erros), file=sys.stderr)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Atualiza data/commodities.json com os indicadores mais recentes de
Soja (CEPEA/ESALQ - Paraná) e Boi Gordo (CEPEA/ESALQ) da CEPEA/ESALQ.

Rodado automaticamente pelo GitHub Action em
.github/workflows/update-commodities.yml (uma vez por hora).

Importante: o site oficial da CEPEA (cepea.org.br) bloqueia requisições
vindas de servidores de nuvem como o GitHub Actions (erro 403). Por isso
buscamos os mesmos dados numa fonte que os republica: o Notícias
Agrícolas, portal de notícias do agronegócio que cita a CEPEA/ESALQ como
fonte em suas páginas de cotação.

Rodar manualmente:
    python3 scripts/scrape_cepea.py
"""

import json
import re
import sys
from pathlib import Path

import requests

URLS = {
    "soja": "https://www.noticiasagricolas.com.br/cotacoes/soja/indicador-cepea-esalq-soja-parana",
    "milho": "https://www.noticiasagricolas.com.br/cotacoes/milho/indicador-cepea-esalq-milho",
    "boi_gordo": "https://www.noticiasagricolas.com.br/cotacoes/boi-gordo/boi-gordo-indicador-esalq-bmf",
}

UNIDADES = {
    "soja": "R$/saca",
    "milho": "R$/saca",
    "boi_gordo": "R$/@",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "commodities.json"

# Ex: <td>07/08/2026</td> ... <td>137,33</td> ... <td>-0,12</td>
# A tabela mais recente é sempre a primeira que aparece na página, então
# procuramos a primeira linha cuja primeira célula seja uma data.
LINHA_RE = re.compile(
    r"(\d{2}/\d{2}/\d{4})\s*</t[dh]>\s*"
    r"<t[dh][^>]*>\s*([\d.,]+)\s*</t[dh]>\s*"
    r"<t[dh][^>]*>\s*([+\-]?[\d.,]+)\s*</t[dh]>",
    re.IGNORECASE,
)


def extrair_indicador(html: str):
    m = LINHA_RE.search(html)
    if not m:
        return None
    data_ref, valor, variacao = m.groups()
    return {
        "data_referencia": data_ref,
        "valor": valor,
        "variacao_texto": variacao,
    }


def variacao_para_numero(texto):
    """'-0,47' -> -0.47  |  '0,05' -> 0.05  |  None se não der pra converter"""
    if not texto:
        return None
    try:
        return float(texto.replace(",", "."))
    except ValueError:
        return None


def buscar(produto: str):
    resp = requests.get(URLS[produto], headers=HEADERS, timeout=20)
    resp.raise_for_status()
    achado = extrair_indicador(resp.text)
    if not achado:
        raise RuntimeError(
            f"Não encontrei a tabela de indicador para '{produto}'. "
            "O layout do Notícias Agrícolas pode ter mudado — ver extrair_indicador()."
        )
    return {
        "valor": f"R$ {achado['valor']}",
        "unidade": UNIDADES[produto],
        "variacao": variacao_para_numero(achado["variacao_texto"]),
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
        print("Concluído com erros parciais:", "; ".join(erros), file=sys.stderr)


if __name__ == "__main__":
    main()

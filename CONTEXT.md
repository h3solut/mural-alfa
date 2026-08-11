# CONTEXT.md — Mural Digital ALFA

Documento de conhecimento acumulado do projeto. Objetivo: qualquer
conversa nova (com Claude ou não) consegue se situar rápido aqui, sem
precisar redescobrir os mesmos problemas que já resolvemos.

**Repositório:** https://github.com/h3solut/mural-alfa
**Site ao vivo:** https://h3solut.github.io/mural-alfa/
**Contexto:** TV box (Android) rodando o Fully Kiosk Browser em tela
cheia, no escritório da ALFA Assessoria Contábil (Jataí-GO).

---

## Arquitetura geral

Site estático (HTML/CSS/JS puro, sem build step) hospedado no GitHub
Pages. Dados "vivos" vêm de duas formas:

1. **Direto do navegador** (client-side fetch): dólar/euro, Bitcoin,
   clima — APIs públicas que aceitam CORS de qualquer origem.
2. **Via robôs do GitHub Actions**: soja/milho/boi gordo, vídeo ao vivo
   do YouTube, notícias RSS, ações B3+EUA — cada um roda em intervalo
   fixo, escreve um `.json` em `data/`, e o navegador lê esse arquivo
   estático. Usado sempre que a fonte de dados exige scraping, chave de
   API sensível, ou bloqueia requisições vindas de navegador/CORS.

## Estrutura de arquivos

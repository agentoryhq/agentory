<div align="center">

# Agentory

**La piattaforma AI sovrana e self-hosted per i team.**
Esegui agenti AI, workflow deterministici e codice custom in sandbox — multi-tenant, sulla tua infrastruttura, con i tuoi dati che non escono mai di casa.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](docs/LICENSING_it.md#contributi)
![Built with NestJS · React · LangGraph](https://img.shields.io/badge/built_with-NestJS_·_React_·_LangGraph-6E56CF.svg)

[🇬🇧 English](README.md) · 🇮🇹 Italiano

</div>

---

## Perché Agentory?

La maggior parte dei tool AI self-hosted sceglie una sola corsia: un'interfaccia di chat (Open WebUI, LibreChat), un builder di app/agenti (Dify, Flowise), o un automatore di workflow (n8n). **Agentory è l'unico prodotto che unisce tutte e tre le cose sotto un vero modello di governance multi-tenant** — così un'intera organizzazione può usare l'AI su un'infrastruttura che controlla, senza mandare i dati a un SaaS di terze parti.

La combinazione difendibile, in un solo prodotto:

- 🧠 **Agenti stateful** (LangGraph ReAct) *e* 🔀 **workflow deterministici** (canvas DAG) — improvvisazione *e* ripetibilità.
- 🧩 **Skill eseguibili** — esegui Python/Node/JS non fidato in una sandbox blindata, un container per job.
- 🔌 **MCP nativo** (Model Context Protocol) — transport `http` · `sse` · `local` · `remote`.
- 🏢 **Multi-tenant by design** — org · team · utenti, con scope risorse `personal | team | org` e progetti condivisi tra più team.
- 🗄️ **Sorgenti dati eterogenee** — SQL (Postgres/MySQL/MSSQL/Oracle/SQLite), MongoDB, Redis e file share (SMB/SFTP/WebDAV).
- 🔒 **Sicurezza a capability** — ogni potere (rete, filesystem, operazioni SQL, MCP `local`) è dichiarato e approvato, con default sicuri.

> **La sovranità del dato è il punto.** Usa il tuo LLM (Anthropic, OpenAI, Gemini, Ollama, LM Studio, DeepSeek, qualsiasi endpoint OpenAI-compatible) o esegui i modelli in locale. Nulla lascia il tuo perimetro se non lo decidi tu.

<!-- TODO prima del lancio: aggiungi qui una GIF demo / screenshot — è il fattore n.1 per una buona accoglienza. -->

## Avvio rapido

> Richiede Docker + Docker Compose. Avvia l'intero stack (Postgres, Qdrant, Redis, servizi embedding e whisper, skill executor, backend, frontend).

```bash
git clone https://github.com/andreagenovese/agentory.git
cd agentory
./scripts/install.sh
```

L'**installer guidato** fa tutto: preflight Docker → genera tutti i segreti → scegli un livello di isolamento per l'esecuzione di skill/sandbox (**Standard / Isolato / Massimo**) → builda le immagini necessarie → avvia lo stack. È idempotente — puoi rilanciarlo quando vuoi. Poi gestisci lo stack con il wrapper che genera:

```bash
./scripts/compose.sh ps         # stato
./scripts/compose.sh logs -f    # segui i log
./scripts/compose.sh down       # ferma
```

<details>
<summary><b>Setup manuale</b> (senza l'installer)</summary>

```bash
cp .env.example .env
```

Compila i segreti obbligatori nel `.env` (il backend **fa fail-fast** se ne manca uno o è debole — genera ognuno con `openssl rand -hex 32`):

```bash
JWT_SECRET=          # min 32 caratteri casuali — altrimenti l'app non parte
TOOL_SECRETS_KEY=    # 64 caratteri hex — chiave AES-256-GCM per i segreti a riposo
RUN_TOKEN_SECRET=    # firma i token dei run interni
SERVICE_API_KEY=     # auth mesh: backend ↔ executor ↔ broker
DB_PASSWORD=         # password Postgres
```

Poi avvialo:

```bash
# Sviluppo (espone le porte dei servizi, comodità dev)
docker compose up -d

# Produzione (i servizi interni NON hanno porte host; richiede i segreti sopra)
docker compose -f docker-compose.yml up -d
```

Per gli overlay di isolamento (broker / allowlist egress) che `install.sh` collega in automatico, vedi **[GUIDE.md](docs/GUIDE.md)**.

</details>

- Frontend → http://localhost:5173
- API backend → http://localhost:3000 · Swagger → http://localhost:3000/api/docs

Il **primo utente registrato diventa admin**. Provider LLM, embedding e vector DB si configurano dalla UI (**Impostazioni → Sistema AI**) — nessuna API key nei file.

Per lo sviluppo non-Docker, l'accesso da LAN e gli overlay di hardening opzionali, vedi **[GUIDE.md](docs/GUIDE.md)**.

## I quattro pilastri

Oltre alla chat, quattro sistemi integrati — e interconnessi (i flow sono tool dell'agente e possono invocare agenti/team; le automazioni girano headless e possono usare un team):

| Pilastro | Cosa fa |
|---|---|
| 🤖 **Agente** | Agente LangGraph ReAct con tool custom, server MCP, RAG e system prompt a 4 livelli (base → utente → progetto → skill). |
| 🔀 **Flows** | Canvas DAG visuale per workflow ripetibili. 12 tipi di nodo (`tool`, `llm`, `condition`, `http`, `skill`, `transform`, `flow`, `agent`, `team`, `loop`, `join`, `chat`); trigger: manual, cron, scheduled, webhook, chat-as-tool. |
| 👥 **Multi-Agent** | Agenti riusabili composti in team con topologie `supervisor` / `sequential` / `parallel`. Agent-as-tool per la delega gerarchica. |
| ⏰ **Auto-Scheduling** | Programma automazioni *dalla chat* («ogni mattina alle 8 controlla la mail e riassumi»). Conferma di default, runner headless, consegna via notifica o thread chat dedicato, con guardrail token/costo per run. |

Altre funzionalità: **tool custom** no-code (HTTP/SQL/RAG/prompt), **RAG con scope** (universale/progetto/personale), **DataSource**, **Skill eseguibili**, una **Sandbox** per codice arbitrario (`run_in_sandbox`), **streaming SSE** con rilevamento automatico dei file, input vocale (Whisper), i18n (EN/IT) e un **bridge** Electron per i processi MCP locali.

👉 Riferimento completo delle funzionalità e architettura: **[PROJECT.md](docs/PROJECT.md)**. Creare Skill: **[SKILLS.md](docs/SKILLS.md)**.

## Stack tecnologico

| Layer | Tecnologia |
|---|---|
| Backend API + Agent | NestJS 10 (TypeScript) |
| Orchestrazione AI | LangChain.js + LangGraph |
| LLM | Configurabile da UI: Anthropic, OpenAI, Gemini, Ollama, LM Studio, DeepSeek, qualsiasi OpenAI-compatible |
| Frontend | React 18 + Vite + Tailwind CSS |
| Database app | PostgreSQL + TypeORM |
| Vector DB | Qdrant (default) / PGVector / Chroma / AstraDB |
| Coda / scheduler | BullMQ + Redis |
| Skill executor | Sidecar Node.js (Fastify) — runner Python/JS/Node |
| Isolamento skill | Egress allowlist (Squid), capability `network`/`filesystem` dichiarate, container-per-job via broker (cap-drop, read-only, non-root, gVisor opzionale) |
| Packaging | Docker Compose (base sicuro + overlay `egress`/`broker`) |

## Architettura

```
[Browser]
    │
    ├── React SPA (Vite + Tailwind) — JWT auth · streaming SSE · upload file
    │
    └── REST + SSE /api/* ◄─────────────────────────────────────────────┐
                   ▼                                                      │
           NestJS Backend :3000                                          │
                   │                                                      │
              AgentModule — LangGraph ReAct Agent                        │
                   │                                                      │
    ┌──────────────┼──────────────────────────┐                          │
    ▼              ▼              ▼            ▼                          │
CustomTools    McpServers   DataSources   VectorDb                       │
 http/sql/rag  http/sse/    SQL/Mongo/    Qdrant/PGV/                     │
               local/remote Redis         Chroma/Astra                   │
                   │                                                      │
              McpBridgeGateway (WebSocket /mcp-bridge)                    │
                   │                                                      │
              Electron Bridge ◄────────────────────────────────────────┘
              └─ McpProcess (stdio → JSON-RPC)
```

## Sicurezza & isolamento

Agentory usa un **modello a capability**: ogni potere (rete, filesystem, operazioni SQL, MCP `local`) è *dichiarato e approvato*, con default sicuri e un soffitto legato all'identità — mai implicito e globale.

- **AES-256-GCM** autenticata per i segreti; `TOOL_SECRETS_KEY` obbligatoria (fail-fast).
- **Docker prod sicuro**: i servizi interni non hanno porte host; password obbligatorie.
- **MCP `local`** ristretto agli admin; **guard anti-SSRF** su `http`/`sse` (blocca metadata cloud, RFC1918, localhost).
- **Skill** (codice di terze parti non fidato): egress allowlist, filesystem per-tenant access-aware, container-per-job blindati via broker, capability dichiarate, checksum dei pacchetti.
- **Audit log strutturato** sui chokepoint (auth, admin, esecuzioni, file, SQL, MCP) con identità "runs-as".

## Documentazione

| Doc | Contenuto |
|---|---|
| [PROJECT.md](docs/PROJECT.md) | Approfondimento completo prodotto & architettura |
| [GUIDE.md](docs/GUIDE.md) | Guida uso & sviluppo (setup, overlay, LAN, note dev) |
| [SKILLS.md](docs/SKILLS.md) | Come creare Skill (schema, template, convenzioni) |
| [MEMORY.md](docs/MEMORY.md) | Design della memoria agentica (A-MEM) |
| [LICENSING_it.md](docs/LICENSING_it.md) | Licenza (AGPL-3.0) e termini di contribuzione |
| [THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md) | Attribuzioni di terze parti |

## Contribuire

I contributi sono benvenuti! Vengono accettati sotto la licenza del progetto — **AGPL-3.0**, *inbound = outbound*: aprendo una Pull Request accetti di licenziare il tuo contributo sotto AGPL-3.0. Nessun CLA richiesto.

## Sostieni il progetto

Agentory è libero e open source sotto AGPL-3.0. Se è utile a te o alla tua organizzazione, puoi sostenerne lo sviluppo tramite [GitHub Sponsors](https://github.com/sponsors/andreagenovese). La sponsorizzazione è del tutto volontaria: **non** modifica la licenza né concede diritti aggiuntivi — serve solo a sostenere la manutenzione e le nuove funzionalità.

## Licenza

Agentory è software libero e open source sotto **GNU AGPL-3.0** (vedi [LICENSE](LICENSE) e [LICENSING_it.md](docs/LICENSING_it.md)):

- 🆓 Libero da usare, modificare e self-hostare — anche come servizio di rete (SaaS) — **a condizione di rendere disponibile il codice sorgente corrispondente sotto AGPL-3.0** (copyleft di rete, art. 13).
- Il software è fornito **"AS IS", senza garanzie né responsabilità** (AGPL-3.0 §15–16).

Tutte le dipendenze distribuite sono sotto licenze permissive (MIT, ISC, BSD, Apache-2.0) o copyleft debole a livello di file (MPL-2.0, solo build tooling) — **nessun copyleft forte (GPL/LGPL) tra le dipendenze**. Vedi [THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md).

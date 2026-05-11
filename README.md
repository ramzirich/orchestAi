# OrchestAI

Chain specialized AI agents into a workflow and watch each one do its part live in the browser.

Instead of asking a single all-purpose AI to do everything, OrchestAI runs a pipeline of focused agents — a **Researcher**, a **Writer**, a **Critic**, a **Summarizer** — passing each agent's output into the next, and streams every token to the UI in real time.

> Screenshots: drop `docs/screenshot-builder.png` and `docs/screenshot-run.png` next to this README and they'll render below.
>
> ![Visual workflow builder](docs/screenshot-builder.png)
> ![Live run with streaming output](docs/screenshot-run.png)

## What's in the box

- **Visual workflow builder** — drag agents onto a [React Flow](https://reactflow.dev/) canvas, wire them together, save the graph.
- **Live run console** — each agent's tokens stream in over SignalR as they're generated, with per-step status, run history, and one-click cancellation.
- **Pluggable agents** — agents are just C# classes implementing `IAgent`; workflows are JSON files in `backend/Workflows/Definitions/`.
- **One-command boot** — `docker compose up --build` brings the whole stack up.

## Tech stack

| Layer    | Stack                                                                                         |
| -------- | --------------------------------------------------------------------------------------------- |
| Frontend | Next.js (App Router) · React · TypeScript · Tailwind · React Flow · SignalR client · Vitest   |
| Backend  | ASP.NET Core 8 · SignalR · Anthropic Messages API (Claude)                                    |
| Infra    | Docker · Docker Compose · multi-stage builds (SDK→runtime, deps→build→standalone)             |

## Architecture

```
┌────────────────┐    HTTP + WebSocket (SignalR)    ┌────────────────┐    HTTPS     ┌────────────────┐
│   Browser      │ ───────────────────────────────► │   Backend      │ ───────────► │  Anthropic API │
│  (Next.js UI)  │ ◄─────────────────────────────── │  (ASP.NET 8)   │ ◄─────────── │   (Claude)     │
│   :3000        │      streamed agent tokens       │   :5100        │  streamed    │                │
└────────────────┘                                  └────────┬───────┘   tokens     └────────────────┘
                                                             │
                                                             ▼
                                                   Workflows/Definitions/*.json
                                                   (declarative agent pipelines)
```

A request from the UI hits the backend, which loads a workflow definition, runs each agent in sequence against Claude, and pipes the streamed tokens back out through SignalR so the browser can render them as they arrive.

## Quick start

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) and an Anthropic API key.

```bash
# 1. Clone and enter the repo
git clone <this-repo> orchestAi
cd orchestAi

# 2. Provide your API key
cp .env.example .env
# then edit .env and replace the placeholder with a real key

# 3. Bring up the stack
docker compose up --build
```

When the logs settle, open <http://localhost:3000>. The backend's Swagger UI is at <http://localhost:5100/swagger>.

To stop everything: `Ctrl+C`, then `docker compose down`.

## Compose cheat sheet

The five commands that cover ~95% of day-to-day usage:

```bash
docker compose up --build              # build images and run in the foreground
docker compose up -d                   # ...same, but detached (background)
docker compose logs -f backend         # tail logs from a single service
docker compose build --no-cache backend  # force a clean rebuild of one service
docker compose exec backend sh         # open a shell inside a running container
docker compose down                    # stop and remove containers
docker compose down -v                 # ...and also wipe volumes
```

## Project layout

```
orchestAi/
├── backend/                       # ASP.NET Core 8 API + SignalR hub
│   ├── Agents/                    # IAgent implementations (Researcher, Writer, Critic, Summarizer)
│   ├── Hubs/                      # SignalR hubs (WorkflowHub)
│   ├── Services/                  # Anthropic client, AgentRunner, WorkflowRunner
│   ├── Workflows/Definitions/     # JSON workflow graphs
│   └── Dockerfile                 # multi-stage SDK → aspnet runtime
├── frontend/                      # Next.js (App Router)
│   ├── src/app/                   # routes (live console, /builder, ...)
│   ├── src/components/            # React Flow graph, run console, agent cards, ...
│   └── Dockerfile                 # multi-stage deps → build → standalone
├── docker-compose.yml             # one-command orchestration
└── .env.example                   # template for ANTHROPIC_API_KEY
```

## Configuration

| Variable                  | Where it lives                  | Notes                                                                                  |
| ------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`       | root `.env` (gitignored)        | Required. Read by the backend at startup; missing/empty fails fast with a clear error. |
| `NEXT_PUBLIC_BACKEND_URL` | `frontend/.env.example` / build arg | Baked into the frontend bundle at build time. Defaults to `http://localhost:5100`.     |

## Local development (without Docker)

If you'd rather run the services on the host:

```bash
# backend (port 5100)
cd backend
dotnet user-secrets set "Anthropic:ApiKey" "sk-ant-..."
dotnet run

# frontend (port 3000)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## Tests

```bash
cd frontend && npm test 
```

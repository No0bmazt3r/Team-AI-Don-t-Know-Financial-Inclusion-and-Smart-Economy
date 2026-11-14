<p align="center">
  <img src="public/Coinvoy-tile.png" alt="Coinvoy logo" width="200">
</p>

<h1 align="center">Coinvoy</h1>

<p align="center">
  <b>Tiada majikan? Coinvoy beri apa yang majikan beri.</b><br>
  <sub>("No employer? Coinvoy gives you what an employer gives.")</sub><br>
  A steady weekly salary, payslips, contributions, paid leave and an advisor for Malaysian gig riders, using only their own money.
</p>

<p align="center">
  <img alt="TRACK 5 · FINANCE" src="https://img.shields.io/badge/TRACK-5%20%C2%B7%20FINANCE-B5FC04?style=for-the-badge&labelColor=1D1E1D">
  <img alt="BAHASA BM + EN" src="https://img.shields.io/badge/BAHASA-BM%20%2B%20EN-136C33?style=for-the-badge&labelColor=1D1E1D">
  <img alt="TESTS 188 PASSING" src="https://img.shields.io/badge/TESTS-188%20PASSING-4C1?style=for-the-badge&labelColor=1D1E1D">
  <img alt="LICENSE MIT" src="https://img.shields.io/badge/LICENSE-MIT-C4A5F5?style=for-the-badge&labelColor=1D1E1D">
</p>

<p align="center"><sub>built with</sub></p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React%2019-20232A?style=flat&logo=react&logoColor=61DAFB">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white">
  <img alt="TanStack" src="https://img.shields.io/badge/TanStack%20Router%20%2B%20Query-FF4154?style=flat&logo=reactquery&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-5A0FC8?style=flat&logo=pwa&logoColor=white">
</p>

<p align="center">
  <img alt="Node 24" src="https://img.shields.io/badge/Node%2024-5FA04E?style=flat&logo=nodedotjs&logoColor=white">
  <img alt="Express 5" src="https://img.shields.io/badge/Express%205-000000?style=flat&logo=express&logoColor=white">
  <img alt="Drizzle" src="https://img.shields.io/badge/Drizzle%20ORM-C5F74F?style=flat&logo=drizzle&logoColor=1D1E1D">
  <img alt="Postgres" src="https://img.shields.io/badge/Postgres%20%2B%20PGlite-4169E1?style=flat&logo=postgresql&logoColor=white">
  <img alt="zod" src="https://img.shields.io/badge/zod-3E67B1?style=flat&logo=zod&logoColor=white">
</p>

<p align="center">
  <img alt="Python 3.12" src="https://img.shields.io/badge/Python%203.12-3776AB?style=flat&logo=python&logoColor=white">
  <img alt="NumPy" src="https://img.shields.io/badge/NumPy-013243?style=flat&logo=numpy&logoColor=white">
  <img alt="scikit-learn" src="https://img.shields.io/badge/scikit--learn-F7931E?style=flat&logo=scikitlearn&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI%20(ML%20service)-009688?style=flat&logo=fastapi&logoColor=white">
  <img alt="Google Sign-In" src="https://img.shields.io/badge/Google%20Sign--In-4285F4?style=flat&logo=google&logoColor=white">
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest%20%2B%20pytest-6E9F18?style=flat&logo=vitest&logoColor=white">
</p>

<p align="center"><sub>UTP CodeFest '26 · Track 5: Finance (Financial Inclusion)</sub></p>

---

## Contents

1. [The problem](#the-problem)
2. [Our solution](#our-solution)
3. [Objectives and what Coinvoy achieves](#objectives-and-what-coinvoy-achieves)
4. [Getting started](#getting-started)
5. [Architecture](#architecture)
6. [API reference](#api-reference)
7. [How the salary engine works](#how-the-salary-engine-works)
8. [Results (honest status)](#results-honest-status)
9. [Security](#security) · [Privacy (PDPA)](#privacy-pdpa) · [Legal positioning](#legal-positioning)
10. [Deployment](#deployment) · [Running cost](#running-cost) · [Infrastructure](infra/README.md)
11. [Contributing](#contributing) · [License](#license) · [Team](#team-ai-dont-know)

---

## The problem

**CodeFest 2026, Track 5: Finance (Financial Inclusion).** The brief names B40 families, **gig economy workers**, the rural population, street vendors and micro-SMEs as the groups financial services still leave behind. Digital finance reached 63% of Malaysians in 2023, yet many still struggle to access financial products, manage their money and spot financial risks online. The brief asks for fintech that makes money management easier, builds financial literacy and opens access to financial services.

We focus on **gig riders** (food delivery and e-hailing: Grab, foodpanda, ShopeeFood, Lalamove):

<div align="center">

| Fact | Source |
|---|---|
| About **1.64 million** Malaysians earned income from gig work at the end of 2025 | [The Star, Jul 2026](https://www.thestar.com.my/business/business-news/2026/07/11/hailstorm-over-rides) |
| Driver groups say net earnings are **down 30–50%** compared with 3–4 years ago | [The Star, Jul 2026](https://www.thestar.com.my/business/business-news/2026/07/11/hailstorm-over-rides) |
| A "significant majority" of e-hailing and delivery drivers have **no emergency or retirement savings** | [SAYS / The Centre](https://says.com/my/news/a-risky-gig-majority-of-m-sian-e-hailing-delivery-drivers-have-no-insurance-or-savings) |
| The **Gig Workers Act 2025** is in force (31 Mar 2026), making social security contributions mandatory | [NST](https://www.nst.com.my/amp/news/nation/2026/03/1403257/better-protection-gig-workers-under-new-law) |
| Budget 2026 **i-Saraan Plus** gives gig workers up to **RM600 a year** in EPF matching | [Malay Mail](https://www.malaymail.com/news/malaysia/2025/10/10/budget-2026-gig-workers-to-get-up-to-rm600-a-year-in-epf-matching-under-new-i-saraan-plus-scheme/194145) |

</div>

An employee gets five things a gig rider doesn't:

<div align="center">

| What an employer gives | What a gig rider has today |
|---|---|
| **Steady pay** on a fixed day | RM950 one week, RM400 the next |
| **A payslip** to show a bank or landlord | Screenshots, nothing official |
| **Contributions** (EPF, PERKESO) set aside automatically | Has to remember to pay them; most don't |
| **Paid leave**, so Raya or illness doesn't mean losing pay | Every day off is a day without pay |
| **Someone to ask** about money | Nobody, and loan sharks in WhatsApp |

</div>

The problem has two parts. **Uneven income:** good weeks get spent and bad weeks hurt. **Low income:** riders earn less than before, and no app can add money that isn't there. Coinvoy fixes the first and shows the second honestly.

**Why existing tools fall short:** budgeting apps assume a fixed salary and look backwards; banks want payslips riders don't have; earned-wage advances are lending, with fees and debt risk; platform savings features cover one platform when most riders work two or three; and the EPF/PERKESO portals leave the rider to remember and act alone.

## Our solution

**Coinvoy is a payroll department for one person.** It gives a rider the five things an employer gives, **using only their own money**: it never lends, never holds funds, and is not a credit score.

<div align="center">

| Benefit | What the rider gets |
|---|---|
| **Gaji Tetap** (steady pay) | One weekly salary that is safe in 95% of 1,000 simulated futures. Good week: "Pindah RM177 ke poket Penampan" (move RM177 into your buffer pocket); lean week: take it back out. The rider moves the money in their own bank and taps **Dah pindah** (done). The buffer counts confirmed transfers only. |
| **Slip Gaji** (payslip) | Weekly payslips and a Penyata income statement PDF, every figure labelled *Dilapor sendiri* or *Disemak silang* (self-reported or cross-checked against a bank statement), plus a revocable read-only link for a loans officer. |
| **Caruman** (contributions) | i-Saraan set-asides with a "government money claimed" counter; PERKESO shown as deducted at source. |
| **Cuti Berbayar** (paid leave) | Plan Raya leave, set a little aside each week, and the week off still pays. Sick days are covered too. |
| **Penasihat** (advisor) | **Odah Bot** (a chatbot where every number must come from the engine), **Semak Layak** (can I afford this instalment?), **Semak Pemberi Pinjaman** (a lender check against BNM's alert list), **Semak Mesej** (a scam message check), **Jurang** (an honest view when income is too low) and **Celik** lessons. |

</div>

**Getting money in takes seconds.** **Snap** reads an earnings screenshot or a platform's PDF statement into an editable draft; nothing is saved until the rider confirms. Grab's weekly statement is read with exact rules, and everything else by an AI. Costs are typed or spoken in BM ("isi minyak empat puluh") and parsed by our own rules and classifier first. **Tabung** (pots) holds the buffer and the rider's own goals, with suggestions worked out from their data.

**Why it isn't a budgeting app:** budgeting apps look back at what you spent; Coinvoy looks forward, simulates your next 12 weeks, and moves real money between them so a good week pays for a bad one.

## Objectives and what Coinvoy achieves

<div align="center">

| # | Objective | How Coinvoy delivers it | How we measure it |
|---|---|---|---|
| G1 | Riders have enough money more weeks | A steady salary from a 1,000-future simulation, recalculated weekly | Share of weekly check-ins answered "Ya" (the north star) |
| G2 | A real buffer gets built | Transfer instructions; the buffer counts only confirmed transfers | RM confirmed into pockets; buffer in weeks of cover |
| G3 | Riders can take paid leave | Cuti pot pays the salary in leave weeks | Leave weeks paid from the pot |
| G4 | Riders claim what they're entitled to | i-Saraan set-asides and the match counter | i-Saraan Plus match earned (RM) |
| G5 | Riders can prove their income | Payslips, the Penyata PDF and officer links | Statements and officer links issued |
| G6 | The engine's promise holds | 95% safety target, walk-forward backtest | Buffer below zero in ≤ 5% of real weeks |
| G7 | Usable in natural BM on a cheap phone | Bilingual PWA, ≤ 300 KB first load, a weekly ritual under a minute | Ritual time; usability tests with riders |

</div>

**Track 5 fit:** easier money management (Gaji Tetap, Tabung, Snap), financial literacy (Odah Bot, Celik, the ⓘ explanations of commission and flat rates), access to financial services (the Penyata for loans and rentals, Semak Layak before borrowing) and protection from online financial risk (the lender and scam message checks). **BM NLP bonus:** our own BM cost parser and classifier.

**Permanent boundaries (by design, not cuts):** Coinvoy never moves or holds money, never lends or gives advances, never builds a credit score or sells data, and never reads SMS or other apps.

---

## Getting started

This is a **monorepo**: one repository, and one command starts everything. The app and the backend each have their own `.env.example`.

<div align="center">

| Folder | What | Language |
|---|---|---|
| `frontend/` | The app (a PWA) | TypeScript, React |
| `backend/api/` | The API | TypeScript, Node + Express |
| `backend/ml/` | The salary engine, BM classifier and PDF renderer | Python, FastAPI |

</div>

`frontend` and `backend/api` are a [pnpm workspace](https://pnpm.io/workspaces) (`pnpm-workspace.yaml`); `backend/ml` is a [uv](https://docs.astral.sh/uv/) project. The backend deploys as **one container** (`backend/Dockerfile`). Run every command **from the repo root**.

### 1. Prerequisites

<div align="center">

| Tool | Version | Install |
|---|---|---|
| Node.js | 24.x | [nodejs.org](https://nodejs.org) or `nvm install 24` |
| pnpm | 12.x (pinned in `package.json`) | `corepack enable` |
| Python | 3.12+ | [python.org](https://www.python.org) (uv can install it for you) |
| uv | latest | [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |

</div>

No database to install: locally the API uses an embedded Postgres (PGlite) stored in `backend/api/.pglite`.

### 2. Install and run

```bash
git clone https://github.com/No0bmazt3r/Coinvoy.git
cd Coinvoy
pnpm bootstrap          # installs the web app and API (pnpm) and the ML service (uv)
cp backend/.env.example backend/.env    # optional: AI keys and Google sign-in (the demo works without them)
pnpm dev                # API :8000 · ML service :8001 · app http://localhost:5173
```

Open http://localhost:5173 and choose one of the synthetic demo accounts, or go straight to http://localhost:5173/try, which skips the intro and signs you into Abang Faiz in one step (the link the pitch deck's QR code uses). The login screen includes five varied stories: Abang Faiz (steady multi-platform work), Kak Lina (an income gap), Siti (part-time work and school costs), Ravi (strong weeks with i-Saraan), and Mei (irregular income and urgent bills). Snap and Odah Bot need an AI key; everything else works without one.

### 3. Configuration (`backend/.env`)

Every backend setting is documented in [`backend/.env.example`](backend/.env.example). The app (`frontend/`) needs none; its [`frontend/.env.example`](frontend/.env.example) explains why. To run locally, the only things you might add are:

<div align="center">

| Variable | Needed for |
|---|---|
| `AI_KEYS_MASTER_KEY` (`openssl rand -base64 32`) | Storing AI keys, which are then added in the app under `/admin/ai` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in (the demo login works without it) |
| `ADMIN_EMAILS` | The `/admin` pages (usage, AI keys) |

</div>

**AI keys live in the app, not in `.env`.** Sign in with an `ADMIN_EMAILS` account and open **Usage → AI keys** (`/admin/ai`). There you add connections (any OpenAI-compatible provider: Groq, Gemini, OpenRouter, OpenAI, Mistral, Ollama and others) and give each AI job an ordered fallback list of connection and model. A key the provider refuses is skipped until you fix it; a rate- or quota-limited key is skipped for 10 minutes and the next one takes the call, so a used-up key never reaches riders. Keys are stored encrypted (AES-256-GCM with `AI_KEYS_MASTER_KEY`), only their last 4 characters are ever shown, and every change is logged on the page. Switching provider is never a code change or a redeploy. Before sending real rider data, check the provider's data terms: Groq offers zero data retention, while Gemini's **free** tier may use prompts to improve Google's products.

### 4. Commands

<div align="center">

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the API, the ML service and the web app together |
| `pnpm check` | Lint, typecheck, all tests and the production build (what CI runs) |
| `pnpm test` | ML (pytest) + API (vitest, against the real ML service) + web tests |
| `pnpm preview:prod` | Builds the app and serves the **production build** at http://localhost:8000 (the dev build is several times slower) |
| `pnpm db:generate` | Writes a SQL migration from `backend/api/src/db/schema.ts` (applied when the API starts) |
| `pnpm train:bm` | Regenerates the seed phrases and retrains the BM cost classifier |
| `pnpm train:rate <csv>` | Trains the pooled rate model (`--synthetic N` for a dry run) |
| `pnpm icons` | Regenerates the app icons from `public/Coinvoy.png` |

</div>

**Browse the local database:** while `pnpm dev` runs, connect DBeaver or `psql` to `postgres://postgres@127.0.0.1:5433/postgres` (`PGLITE_PORT` in `.env`).

**Google sign-in:** create an OAuth client of type *Web application* in Google Cloud Console with origin `http://localhost:5173` and redirect URI `http://localhost:5173/api/auth/google/callback`, then put its ID and secret in `.env`.

### 5. Repository layout

```
Coinvoy/
├── frontend/                 React 19 PWA: src/routes (screens), src/components, src/lib, src/i18n (ms.json, en.json)
│   └── .env.example          the app's settings (none needed)
├── backend/                  everything server-side, deployed as one container
│   ├── api/
│   │   ├── src/routes/       HTTP: zod validation, auth, status codes
│   │   ├── src/services/     rules and orchestration (salary, pots, penyata, reco, scam, …)
│   │   ├── src/llm/          AI client, Snap, Odah Bot (`tanya.ts`), the number guard, prompts/*.md
│   │   ├── src/db/           Drizzle schema (every table), Postgres or PGlite
│   │   ├── drizzle/          SQL migrations
│   │   ├── scripts/          migrate.ts (check / apply), eval and cost reports
│   │   └── test/             vitest suites (fake AI provider, real ML service)
│   ├── ml/
│   │   ├── app/engine/       forecast, simulation, salary search, Malaysian calendar
│   │   ├── app/nlp/          BM parser and classifier
│   │   ├── app/render/       Penyata PDF and officer page
│   │   ├── scripts/          training, backtest, evaluation
│   │   └── tests/            pytest
│   ├── Dockerfile            the one image: API on $PORT, engine on 127.0.0.1 inside
│   ├── start.sh              starts both, stops both
│   └── .env.example          every backend setting
├── infra/                    Terraform: CloudFront + S3, ECS Express Mode, ECR, Secrets Manager, GitHub OIDC roles
├── scripts/                  bootstrap-state.sh (Terraform state bucket)
├── .github/workflows/        checks, deploy-frontend, deploy-backend, infra (Terraform)
└── .github/                  issue and PR templates, CODEOWNERS
```

---

## Architecture

Coinvoy runs on AWS, managed with Terraform ([`infra/`](infra/main.tf)), with GitHub Actions coordinating delivery:

- **Frontend: S3 + CloudFront.** The React/Vite progressive web app is served from a private S3 bucket through CloudFront, which is the browser's single public origin. CloudFront forwards `/api/*` and `/o/*` to the backend.
- **Backend: ECS Express Mode (Fargate).** One container runs the Node/Express API and the private Python/FastAPI salary engine together. The engine listens only on `127.0.0.1`, and the API only answers requests that came through CloudFront.
- **Database: RDS PostgreSQL 17** (private, inside the VPC). Migrations run as the backend starts. Local development and tests use PGlite.
- **Secrets: AWS Secrets Manager.** `coinvoy/api` (Google, push and the AI-key master key) and `coinvoy/db` (the database password, generated by Terraform without ever being stored in state). ECS hands both to the container. AI provider keys themselves are managed in the app, encrypted in the database.
- **Delivery: GitHub Actions** runs checks, applies database migrations, and gates the owner-triggered deploys, logging in to AWS through OIDC with no stored keys.

### System

```mermaid
flowchart LR
  rider(["Rider's phone<br/>PWA · BM / EN"])
  admin(["Admin<br/>/admin/ai"])

  subgraph aws["AWS · ap-southeast-1 · Terraform: infra/"]
    direction TB
    cf["CloudFront<br/>one address · security headers<br/>forwards /api and /o"]
    s3[("S3, private<br/>the app (PWA)")]
    subgraph ecs["ECS Express Mode · Fargate · exactly 1 task"]
      direction TB
      subgraph web["API: backend/api · Node 24 + Express 5 · :8000"]
        direction TB
        routes["/api/* routes<br/>zod · sessions · rate limits<br/>X-Origin-Verify check"]
        llm["src/llm/<br/>Snap · Odah Bot · number guard<br/>per-job fallback lists"]
      end
      ml["Engine: backend/ml · Python + FastAPI · 127.0.0.1 only<br/>salary engine · BM classifier · Penyata PDF"]
    end
    db[("RDS PostgreSQL 17<br/>private · backups 7 days<br/>AI keys encrypted")]
    secrets["Secrets Manager<br/>coinvoy/api · coinvoy/db"]
    ecr[("ECR<br/>image per commit")]
  end

  actions["GitHub Actions · OIDC<br/>checks · deploy app · deploy backend · terraform"]
  google["Google sign-in<br/>(OpenID Connect)"]
  ai["AI providers<br/>(any OpenAI-compatible)"]

  rider <-->|HTTPS| cf
  admin <-->|HTTPS| cf
  cf --> s3
  cf <-->|/api · /o + origin header| routes
  secrets -.->|at task start| ecs
  ecr -.->|image| ecs
  routes <-->|TLS| db
  routes -->|localhost + shared token| ml
  routes --> llm
  llm -->|key 1 → key 2 → …| ai
  rider -.->|sign in| google
  routes -.->|verify tokens| google
  actions -.->|push image · update service| ecr
  actions -.->|upload · refresh| s3
```

- **One address for the browser.** CloudFront serves the app and forwards `/api` and `/o` to the API, so the session cookie is first-party and there's no CORS.
- **The engine is private and stateless.** It runs in the same container as the API, listening on `127.0.0.1` only, with no database, users or AI; the API sends a rider's data as JSON and stores what comes back.
- **The AI reads and talks; code computes.** Every number a rider sees comes from the engine or the database.
- **AI keys are managed in the app.** Each AI job has an ordered list of provider keys; a refused or rate-limited key hands the call to the next, so riders never hit a used-up key. Keys are encrypted in the database, and admins rotate them at `/admin/ai` without a redeploy.
- **Deployments are gated.** GitHub Actions confirms the checks passed for the exact commit before the owner can deploy the app or the backend, each on its own.

### Confirming a week → a new salary

```mermaid
sequenceDiagram
  actor R as Rider
  participant A as API
  participant D as Postgres
  participant M as ML engine
  R->>A: POST /api/snap/extract (screenshot or PDF)
  A-->>R: editable drafts (nothing saved yet)
  R->>A: POST /api/weeks/confirm
  A->>D: save earnings (one transaction)
  A->>M: POST /solve (history, bills, pots, leave, seed)
  M-->>A: salary, risk, band, build-up, Jurang, reasons
  A->>D: save salary run + this week's transfer
  R->>A: GET /api/home
  A-->>R: "Gaji anda minggu ini: RM407"
```

### Odah Bot and the number guard

```mermaid
flowchart LR
  q["Rider's question"] --> loop["AI with read-only tools<br/>get_salary · simulate · get_pots · …"]
  loop --> tools["Engine + database"]
  tools --> loop
  loop --> draft["Draft reply (streamed)"]
  draft --> guard{"Every number from a<br/>tool or the rider?"}
  guard -- yes --> reply["Shown and saved"]
  guard -- no --> retry["One retry, then a reply<br/>built only from tool results"]
```

The reply streams word by word, but a word is only shown once the guard has passed it.

### Tech stack

<div align="center">

| Layer | Choice |
|---|---|
| App | React 19, TypeScript, Vite, TanStack Router + Query, Tailwind v4, hand-written service worker |
| API | Node 24 (runs `.ts` directly), Express 5, zod, Drizzle ORM |
| Database | Postgres in production, PGlite (Postgres in WASM) locally and in tests |
| ML service | Python 3.12, FastAPI, NumPy, scikit-learn, WeasyPrint, pypdf |
| AI | `openai` SDK against any OpenAI-compatible provider, a key and model per job |
| Auth | Google OpenID Connect (code flow + PKCE) and One Tap; server-side sessions |
| Tests and CI | vitest, supertest, pytest; GitHub Actions (lint, types, tests on PGlite and real Postgres, bundle budget, gitleaks) |
| Hosting | AWS: S3 + CloudFront (the app) · ECS Express Mode on Fargate (the backend, one container) · RDS PostgreSQL · Secrets Manager · Terraform |

</div>

---

## API reference

All routes are under `/api` and return JSON. Errors look like `{ "error": { "code", "message_ms", "message_en" } }`. Money is in **integer sen**; weeks are ISO weeks given as their Monday (`YYYY-MM-DD`, Asia/Kuala_Lumpur). Every rider route needs a session cookie and only ever reads that rider's data.

<details>
<summary><b>Auth and account</b></summary>

<div align="center">

| Method | Path | What it does |
|---|---|---|
| GET | `/api/auth/google` | Starts Google sign-in (redirect) |
| GET | `/api/auth/google/callback` | Google redirects back here; creates the session |
| GET · POST | `/api/auth/google/one-tap` | Google One Tap sign-in |
| POST | `/api/auth/demo` | Creates a temporary demo rider (`?persona=faiz|lina|siti|ravi|mei`, `?empty`) |
| POST | `/api/auth/logout` | Ends the session |
| GET | `/api/auth/me` | The signed-in rider, or 401 |
| PATCH | `/api/me` | Update profile and settings |
| POST · DELETE | `/api/tips` | Mark screen guides as seen / reset them |
| POST | `/api/consents` | Record a consent (privacy, AI processing, Rider Index) |
| GET | `/api/me/export` | Download all of the rider's data (JSON) |
| DELETE | `/api/me` | Delete the account and every row |

</div>

</details>

<details>
<summary><b>Earnings, bills and costs</b></summary>

<div align="center">

| Method | Path | What it does |
|---|---|---|
| POST | `/api/snap/extract` | Screenshots or PDFs in (multipart, 1–5 files), editable drafts out |
| POST | `/api/weeks/confirm` | Save confirmed weeks and recalculate the salary |
| GET | `/api/weeks` | Logged weeks, per platform |
| PATCH · DELETE | `/api/earnings/:id` | Edit or remove one platform's week |
| GET · POST | `/api/bills` | List or add bills |
| PATCH · DELETE | `/api/bills/:id` | Edit or remove a bill |
| POST | `/api/expenses/parse` | "minyak 40" → amount and category (rules, our classifier, then AI) |
| GET · POST | `/api/expenses` | List or add costs |
| DELETE | `/api/expenses/:id` | Remove a cost |
| POST | `/api/statement` | Cross-check against a bank or e-wallet statement PDF |

</div>

</details>

<details>
<summary><b>Salary, pots and transfers</b></summary>

<div align="center">

| Method | Path | What it does |
|---|---|---|
| GET | `/api/home` | This week's salary, transfer, buffer, streak and to-dos |
| POST | `/api/transfers/:id/confirm` | "Dah pindah": the money really moved (full or partial) |
| GET | `/api/pots` | All pots and balances |
| GET | `/api/pots/penampan/history` | Buffer balance after each confirmed transfer (chart) |
| GET | `/api/pots/suggestions` | Suggested pots (rules, ordered and worded by AI when allowed) |
| POST | `/api/pots/classify` | Category for a rider's own pot name |
| POST | `/api/pots/preview` | What a weekly set-aside does to the salary |
| POST | `/api/pots` | Add a pot |
| PATCH | `/api/pots/:kind` | Change a pot's target or weekly amount |
| POST | `/api/pots/:kind/close` | Close a pot (its money moves to the buffer) |

</div>

</details>

<details>
<summary><b>Benefits: leave, contributions, streaks</b></summary>

<div align="center">

| Method | Path | What it does |
|---|---|---|
| POST | `/api/leave/preview` | What planned leave costs per week |
| GET · POST | `/api/leave` | List or plan leave |
| POST | `/api/leave/sick` | Use sick days |
| DELETE | `/api/leave/:id` | Cancel planned leave |
| GET | `/api/caruman` | i-Saraan and PERKESO status |
| POST | `/api/caruman/isaraan` | Record an i-Saraan contribution |
| POST | `/api/checkins` | Weekly "did you have enough?" answer |
| GET | `/api/streak` | Streak weeks and level |
| POST | `/api/streak/freeze` | Use a streak freeze |
| GET | `/api/index` | Rider Index (anonymous rates, groups of 20+ only) |

</div>

</details>

<details>
<summary><b>Advisor: Odah Bot and the checks</b></summary>

<div align="center">

| Method | Path | What it does |
|---|---|---|
| GET | `/api/tanya/messages` | Chat history (kept 90 days) |
| POST | `/api/tanya/messages` | Ask Odah Bot; `?stream=1` streams one JSON event per line (`text`, `reset`, `done`, `error`) |
| DELETE | `/api/tanya/messages` | Clear the chat |
| POST | `/api/layak` | Semak Layak: can I afford this instalment? |
| POST | `/api/lender-check` | Check a loan offer (red flags, rate cap, BNM alert list) |
| POST | `/api/scam-check` | Check an SMS or WhatsApp message for scam signs |
| GET | `/api/jurang` | The honest gap view and three options |
| GET | `/api/celik` | Short lessons using the rider's numbers |

</div>

</details>

<details>
<summary><b>Records, reminders, admin and public</b></summary>

<div align="center">

| Method | Path | What it does |
|---|---|---|
| GET | `/api/payslip/:week` | One week's payslip |
| GET | `/api/penyata` · `/api/penyata.pdf` | Income statement summary and PDF |
| GET · POST | `/api/officer-links` | List or create read-only links for a loans officer |
| DELETE | `/api/officer-links/:id` | Revoke a link |
| GET | `/o/:token` | The officer's read-only page (no sign-in, expires) |
| GET · POST · DELETE | `/api/push` | Payday reminder subscription |
| POST | `/api/push/test` | Send a test reminder |
| GET | `/api/admin/usage` | Usage counts, retention, AI cost (`ADMIN_EMAILS` only; 404 otherwise) |
| GET | `/api/admin/ai` | AI connections (key's last 4 only), each job's fallback list, health, change log (`ADMIN_EMAILS` only) |
| POST · PATCH · DELETE | `/api/admin/ai/connections[/:id]` | Add, edit (re-tests), delete a connection; keys go in and never come out |
| POST · GET | `/api/admin/ai/connections/:id/test` · `/models` | Test the key with a real call · the provider's model list |
| PUT | `/api/admin/ai/jobs/:job` | Replace a job's ordered fallback list |
| GET | `/api/health` | Health check |
| GET | `/api/meta` | Public facts for the privacy page (AI provider, region, contact) |

</div>

</details>

<details>
<summary><b>ML service (private, called only by the API)</b></summary>

<div align="center">

| Method | Path | What it does |
|---|---|---|
| POST | `/solve` | The safe weekly salary and its explanation |
| POST | `/p-safe` | How safe a given salary is under a scenario |
| POST | `/jurang` | The gap and the three options |
| POST | `/leave-preview` | Leave set-aside per week |
| POST | `/bm/parse` | BM cost phrase → amount and category |
| POST | `/penyata` | Render the Penyata (HTML or PDF) |
| POST | `/statement/text` | A statement PDF's text lines |
| GET | `/health` | Health check |

</div>

</details>

---

## How the salary engine works

**The salary.** Income is forecast as rate × hours: the rider's own average RM per hour, shrunk toward a population prior when there are few weeks. The engine simulates 1,000 12-week futures with a **block bootstrap** (runs of 4 consecutive weeks, so bad spells stay together), subtracts bills, contributions and leave set-asides in the weeks they fall due, and searches for the largest whole-ringgit salary that keeps the buffer at or above zero in at least 95% of futures. While the buffer is below 2 weeks of essentials, it also has to reach that target within about 8 weeks. Same rider, same week, same seed: the number doesn't jitter.

**The Malaysian calendar.** Ramadan, public holidays and school holidays (`backend/ml/app/engine/data/calendar_my.json`) are features of every week: past weeks have their season effect taken out before fitting, and future weeks get theirs put back, so a Raya week isn't mistaken for a slump. A pooled gradient-boosted rate model can replace the shrinkage mean, but stays off until it beats it on real histories.

**The AI is fenced in.** Every number Odah Bot says is checked by plain code against the tool results and the rider's own message (`backend/api/src/llm/guard.ts`). Snap and the lender check have no tools and must answer in a schema; text inside a screenshot is data, never instructions.

**BM NLP, our own.** Cost phrases go through rules (BM number words like "dua ratus lima puluh", "rm40", "1.5k"), then our TF-IDF + logistic regression classifier (`backend/ml/app/nlp/`), and only reach the AI when both are unsure. A number the rules found always wins.

## Results (honest status)

<div align="center">

| What | Status |
|---|---|
| Walk-forward backtest (`backend/ml/scripts/backtest.py`) | **Dry run on 30 synthetic riders only**: Coinvoy ran short in 0.0% of 660 replayed weeks vs 1.2% for "4-week average − 20%", at a higher median salary (RM594 vs RM511). Synthetic data follows the engine's own assumptions, so this is **not evidence**; a real-data run comes after launch. |
| Pooled rate model | **Synthetic dry run only**; off by default (`RATE_MODEL`). |
| Calendar data | Transcribed from the official calendars but **not yet checked line by line** (`verified: false`); season effects are team estimates. |
| BM classifier (`backend/ml/app/nlp/artifacts/model_card.md`) | Trained on 770 **synthetic seed** phrases; no real-world accuracy figure yet. |
| Snap accuracy (`backend/api/scripts/eval-snap.ts`) | Script ready; needs labelled real screenshots. |
| Cost per rider (`backend/api/scripts/llm-cost-report.ts`) | AI runs on free tiers today (RM0). Every call is logged with its tokens, so the script prices paid-tier usage once there is real usage and a dated price table. |

</div>

## Security

<div align="center">

| Threat | What stops it |
|---|---|
| Account takeover | Google sign-in only (OIDC code flow with state, PKCE S256 and nonce), no passwords; server-side sessions storing only a SHA-256 of the token; httpOnly SameSite cookie; 7-day expiry |
| Seeing another rider's data | Every query is scoped to the signed-in rider; tests check that another rider's IDs return 404 |
| Cross-site requests | SameSite cookie + an Origin check on every unsafe request |
| Made-up numbers from the AI | The number guard, tested |
| Prompt injection via a screenshot or pasted text | No tools on those routes, schema-only output, clear delimiters; tested with an injected screenshot |
| Runaway AI costs | Per-rider daily limits and a monthly call cap; manual entry always works |
| Leaked keys | Server secrets in AWS Secrets Manager, never in git or Terraform state; `.env` and OAuth client files git-ignored; gitleaks in CI |
| AI provider keys | Managed in `/admin/ai` (admins only), stored AES-256-GCM-encrypted, never returned (last 4 characters only), every change in an audit log |
| Bypassing the edge | The API refuses `/api` and `/o` requests that didn't come through CloudFront (`X-Origin-Verify`); the database has no public address |
| Officer link leakage | Random 128-bit tokens stored hashed, 7-day expiry, revocable (410), noindex |
| Brute force | Rate limit on the auth routes; CSP, nosniff and Referrer-Policy headers |
| Secrets in logs | Request logs carry method, path, status, time and rider ID only; officer tokens are masked |

</div>

Found a vulnerability? Please report it privately: see [SECURITY.md](SECURITY.md).

## Privacy (PDPA)

Screenshots and statement PDFs are read in memory and **never stored**; EXIF is stripped first. Riders consent to the privacy notice and, separately, to AI processing, which they can switch off in Profil. The privacy page is a layered notice in BM and English that names the AI providers and where they process data. Odah Bot messages are deleted after 90 days and demo accounts after 24 hours. Riders can download all their data or delete their account (every row cascades) from Profil. The Rider Index is opt-in, stores no user ID, and shows nothing for groups under 20.

## Legal positioning

<div align="center">

| Topic | Position |
|---|---|
| Lending | None. No loans, advances or earned-wage access. The money is always the rider's own. |
| Holding funds | Never. Pockets belong to the rider's licensed bank or e-wallet; Coinvoy only tracks earmarks. |
| Credit reporting | Not a credit score; the rider shares only their own statement and the lender decides. |
| Financial advice | Information from the rider's own data, labelled as an estimate; the rider decides. |
| Lender check | States facts ("appears on BNM's alert list, copy dated …"), never accusations; points to KPKT's licence check. |
| Rates and schemes | i-Saraan match, PERKESO rate and moneylender caps are configuration, to be verified against official sources. |

</div>

---

## Deployment

Everything runs on AWS in `ap-southeast-1`, described by Terraform in [`infra/`](infra/main.tf). Deploys are buttons only the repository owner can press, and the frontend and backend deploy separately.

<div align="center">

| Part | Where | How it deploys |
|---|---|---|
| The app (`frontend/`) | **S3 + CloudFront** | [`deploy-frontend.yml`](.github/workflows/deploy-frontend.yml): owner runs it on `main` |
| The backend (`backend/`: API + engine) | **ECS Express Mode**, one Fargate task (image in ECR) | [`deploy-backend.yml`](.github/workflows/deploy-backend.yml): owner runs it on `main` |
| The database | **RDS PostgreSQL 17**, private, `db.t4g.micro` | Migrations apply as the new backend task starts (`MIGRATE_ON_START=true`) |
| Secrets | **Secrets Manager** `coinvoy/api`, `coinvoy/db` | `coinvoy/api`: set once with the AWS CLI. `coinvoy/db`: Terraform generates it |
| AI provider keys | The database, encrypted | In the app: `/admin/ai` |
| The infrastructure | **Terraform** (`infra/`, state in S3) | [`infra.yml`](.github/workflows/infra.yml): plan on pull requests, apply when the owner runs it |

</div>

Both deploy workflows refuse to run unless **Coinvoy checks** passed for the same commit. They log in to AWS with GitHub OIDC, so no AWS keys are stored in GitHub. There are three IAM roles: `coinvoy-github-plan` (read-only, used by pull requests), `coinvoy-github-apply` (admin, used only by the `infra` environment) and `coinvoy-github-deploy` (push images, update the service, write the bucket, refresh CloudFront; used only by the `production` environment).

The backend always runs **exactly one task**. Payday reminders run on a timer inside the API, so a second task would send them twice, and migrations at startup can't race.

The database has no public address: only things inside the VPC (the backend) can reach it, over verified TLS. Daily backups are kept 7 days with point-in-time restore, deletion protection is on, and a final snapshot is taken if it's ever destroyed. Nobody knows the password: Terraform generates it during the apply and writes it straight to RDS and `coinvoy/db` through write-only arguments, so it's never in state. To change it, raise `db_password_version` in `infra/main.tf`, apply, then run **Deploy backend**.

### 1. GitHub environments and variables

- **Environments** (Settings → Environments), each limited to the `main` branch under **Deployment branches and tags**:
  - `production`: the deploy workflows.
  - `infra`: Terraform apply. Add yourself as a **required reviewer** to approve each apply.
- **Repository variables** (Settings → Secrets and variables → Actions → Variables): `AWS_ACCOUNT_ID`, `ECS_SERVICE_ARN` and `CLOUDFRONT_DISTRIBUTION_ID` (Terraform prints the commands in step 2), and `ALERT_EMAIL` for budget and downtime emails.
- Leftovers from Vercel, Render and Supabase can be deleted: the `production` secrets `VERCEL_*`, `RENDER_DEPLOY_HOOK_URL`, `DATABASE_URL`, `DATABASE_SSL_CA`, and the `BACKEND_URL` variable.

### 2. First run of Terraform (once, from your machine)

GitHub can only log in to AWS after Terraform has created the OIDC roles, so the first run is local. You need an AWS admin login (`aws configure` or SSO), Terraform 1.11 or newer, Docker and `openssl`.

```bash
# 1. The state bucket, then terraform init
bash scripts/bootstrap-state.sh

# 2. The image registry and the (empty) app secret first
terraform -chdir=infra apply -target=aws_ecr_repository.api -target=aws_secretsmanager_secret.api

# 3. The app secret: a JSON object with every key in secret_keys (infra/app.auto.tfvars), e.g.
#    {"AI_KEYS_MASTER_KEY":"<openssl rand -base64 32>","GOOGLE_CLIENT_SECRET":"…","VAPID_PUBLIC_KEY":"…",
#     "VAPID_PRIVATE_KEY":"…","ADMIN_EMAILS":"you@example.com","PRIVACY_CONTACT_EMAIL":"…"}
#    Write it outside the repo and delete it afterwards. Remove keys you don't use from secret_keys rather than leaving them empty.
aws secretsmanager put-secret-value --secret-id coinvoy/api --secret-string "file://$HOME/coinvoy-secret.json"
rm "$HOME/coinvoy-secret.json"

# 4. A first image for the service to start from
REPO=$(terraform -chdir=infra state show -no-color aws_ecr_repository.api | awk -F'"' '/repository_url/{print $2}')
aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%%/*}"
docker build -f backend/Dockerfile -t "$REPO:initial" . && docker push "$REPO:initial"

# 5. Everything else: the database (~10 minutes), the backend (it creates the tables as it starts) and CloudFront
TF_VAR_alert_email=you@example.com terraform -chdir=infra apply
terraform -chdir=infra output -raw github_variables | bash   # sets the repository variables
terraform -chdir=infra output app_url
```

6. Paste the `app_url` output into `app_url` in [`infra/app.auto.tfvars`](infra/app.auto.tfvars), then apply again. This is a separate step because CloudFront needs the backend's address before it exists, so the backend can't learn CloudFront's address in the same apply.
7. If you set `ALERT_EMAIL`, confirm the subscription email from AWS, or alerts won't arrive.
8. Open `<app_url>/admin/ai`, signed in with an `ADMIN_EMAILS` account, and add your AI connections and each job's fallback list. Until then AI is off and riders enter things by hand.

**Keep `AI_KEYS_MASTER_KEY` safe.** If it changes or is lost, the stored AI keys can't be decrypted: the page marks them "Can't decrypt: re-enter the key", and nothing else breaks. To change any `coinvoy/api` value later, edit it in the AWS console (**Secrets Manager → coinvoy/api → Retrieve secret value → Edit**) and run **Deploy backend**, which starts a fresh task that reads the new value. Plain settings live in `infra/app.auto.tfvars` and go live through **Infra (Terraform)**.

After the first run, Terraform changes go through pull requests (the plan shows in the run summary) and **Actions → Infra (Terraform) → Run workflow** on `main`.

### 3. Deploy

1. Push to `main` and wait for **Coinvoy checks** to pass. CI runs every migration against Postgres, so a broken one fails there first.
2. **Actions → Deploy backend (AWS) → Run workflow** builds the image tagged with the commit, pushes it to ECR, switches the service to it and waits until the new task is healthy. The new task applies pending migrations before it starts serving; if that fails, the deploy fails and the old task keeps running. Running it again for the same commit reuses the image.
3. **Actions → Deploy app (AWS) → Run workflow** builds the app, uploads it to S3 (hashed assets cached for a year, everything else re-checked on every load) and refreshes CloudFront.

Run either one on its own. Deploy the backend first only when the app depends on a new API. `https://<app_url>/api/health` shows the running commit as `version`.

### 4. Google sign-in

In Google Cloud Console, add the CloudFront address (`app_url`) as an authorized JavaScript origin and `<app_url>/api/auth/google/callback` as a redirect URI.

Once everything is live, `<app_url>/try` is the one-scan demo link for a QR code. The estimated cost is in [Running cost](#running-cost) below; how the infrastructure is built and run is in [`infra/README.md`](infra/README.md).

---

## Running cost

About **$80 a month** on AWS in Singapore (on-demand, hackathon traffic): one Fargate task (~$22), the load balancer Express Mode creates (~$21), public IPv4 addresses (~$15), RDS (~$21), and small change for secrets, logs and images. CloudFront and S3 fit in the free tier. A $100 budget alert emails you at 80% of the forecast. Nothing in the setup can scale or loop on its own: the task count is fixed at one, there's no NAT gateway, storage and logs are capped, and no workflow runs on a schedule. The full breakdown, ways to make it cheaper, and the runaway-cost check are in [`infra/README.md`](infra/README.md#cost).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch and commit conventions and what CI checks, and follow our [Code of Conduct](CODE_OF_CONDUCT.md). Please don't open public issues for security problems; see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Sharvin A/L Kanesan and the AI Don't Know team.

## Team: AI Don't Know

<div align="center">
<table>
  <tr>
    <td align="center" width="25%"><img src="public/team/Wardah.svg" alt="Nurul Hawardah" width="160"><br><b>Nurul Hawardah Binti Mohammad Yusoff</b></td>
    <td align="center" width="25%"><img src="public/team/Zuyyin.svg" alt="Zuyyin Damia" width="160"><br><b>Zuyyin Damia Binti Norazmi</b></td>
    <td align="center" width="25%"><img src="public/team/Batrisyia%20Bilqis.svg" alt="Batrisyia Bilqis" width="160"><br><b>Batrisyia Bilqis Binti Ahmad Ridzuan</b></td>
    <td align="center" width="25%"><img src="public/team/Sharvin.svg" alt="Sharvin" width="160"><br><b>Sharvin A/L Kanesan</b></td>
  </tr>
</table>
</div>

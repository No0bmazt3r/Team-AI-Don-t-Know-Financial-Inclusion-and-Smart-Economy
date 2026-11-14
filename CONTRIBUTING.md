# Contributing to Coinvoy

Thanks for helping. Coinvoy gives Malaysian gig riders a steady salary from their own money, so correctness and plain language matter more than cleverness. This guide covers how to set up, how we work, and what a good pull request looks like.

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug** or **suggest a feature**: open an issue using the templates.
- **Improve the BM**: wording that sounds natural to riders is always welcome (`frontend/src/i18n/ms.json`).
- **Fix an issue**: look for the `good first issue` and `help wanted` labels.
- **Security problems**: never open a public issue; follow [SECURITY.md](SECURITY.md).

For anything bigger than a small fix, **open an issue first** so we can agree on the approach before you spend time on it.

## Set up

You need Node 24, pnpm (`corepack enable`), Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/<your-username>/Coinvoy.git   # your fork
cd Coinvoy
pnpm bootstrap
cp backend/.env.example backend/.env     # optional; the demo login works without any keys
pnpm dev                 # http://localhost:5173
```

Rules for this repo:
- **pnpm only** (no npm or yarn), and run every command **from the repo root**.
- **Settings live in `backend/.env`** (and the app needs none). Never commit it, or any key, token or Google client file.

## Workflow

`main` is protected: nobody pushes to it directly, and every change goes through a pull request that passes CI and is approved by a maintainer.

1. **Fork** the repo (or, if you're a team member, create a branch in it).
2. Branch from `main` with a short name: `feat/leave-reminder`, `fix/snap-pdf-dates`, `docs/readme-setup`.
3. Make your change, with tests.
4. Run `pnpm check` (lint, types, all tests and the build). It must pass.
5. Open a pull request against `main` and fill in the template.
6. A maintainer reviews it. Please respond to comments by pushing new commits; we squash on merge.

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org):

```
feat: plan sick days from the Cuti screen
fix: read Grab's PDF statement week correctly
docs: explain the number guard
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.

## What we look for in a pull request

<div align="center">

| Area | Rule |
|---|---|
| **Scope** | One change per pull request. Small is easier to review. |
| **Tests** | New logic comes with a test: vitest for `api/` and `frontend/`, pytest for `ml/`. Fix a bug with a test that fails without the fix. |
| **Money** | Always integer **sen**, never floats. Show RM only at display time. |
| **Dates** | Weeks are ISO weeks as their Monday (`YYYY-MM-DD`) in Asia/Kuala_Lumpur. |
| **Languages** | Every string the rider sees exists in **both** `ms.json` and `en.json`. No hard-coded text. |
| **Numbers from the AI** | The AI never computes a figure the rider sees. Numbers come from the engine or the database. Don't weaken the number guard. |
| **Privacy** | Never store screenshots or statements, never log request bodies or emails, and keep every query scoped to the signed-in rider. |
| **Wording** | Never use "guaranteed / dijamin", "credit score / skor kredit" or "financial advice / nasihat kewangan". Coinvoy gives estimates from the rider's own data. |
| **Dependencies** | Add one only when a few lines of our own code can't do the job, and say why in the PR. |
| **UI** | Works on a phone first, in light and dark mode, with tap targets of at least 44 px. Attach before/after screenshots. |
| **Style** | `pnpm lint` (oxlint, ruff) and `pnpm typecheck` must be clean. Match the surrounding code. |

</div>

## Project map

<div align="center">

| Folder | What |
|---|---|
| `frontend/` | The React PWA (screens in `src/routes`) |
| `backend/api/` | Express API: `src/routes` (HTTP), `src/services` (rules), `src/llm` (AI), `src/db/schema.ts` (tables) |
| `backend/ml/` | Python engine: `app/engine` (salary), `app/nlp` (BM parser), `app/render` (PDF) |

</div>

Changing the database? Edit `backend/api/src/db/schema.ts`, run `pnpm db:generate`, and commit the new file in `backend/api/drizzle/`. CI runs every migration against Postgres, and the new backend task applies pending ones as it starts on AWS (if one fails, the deploy fails and the old task keeps running).

## Licence

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

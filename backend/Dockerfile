# The whole backend in one image: the API (Node) on $PORT and the engine (Python) on 127.0.0.1:8001 inside,
# so the engine is never reachable from outside. Measured: ~265 MB RAM idle, ~320 MB at peak.
# Build from the repo root (the pnpm workspace files live there):  docker build -f backend/Dockerfile .

# 1. The API's production dependencies, installed with the repo's own pnpm and lockfile
FROM node:24-bookworm-slim AS api-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/api/package.json backend/api/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --prod --filter coinvoy-api

# 2. The runtime: Python for the engine, plus the Node binary for the API
FROM python:3.12-slim-bookworm
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv
ENV UV_PYTHON_DOWNLOADS=never UV_COMPILE_BYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app

# The engine's dependencies (from uv.lock), then its code
COPY backend/ml/pyproject.toml backend/ml/uv.lock backend/ml/
RUN uv sync --directory backend/ml --frozen --no-dev --python /usr/local/bin/python3
COPY backend/ml/app backend/ml/app

# The API's dependencies and code
COPY --from=api-deps /app/node_modules node_modules
COPY --from=api-deps /app/backend/api/node_modules backend/api/node_modules
COPY backend/api/package.json backend/api/
COPY backend/api/src backend/api/src
COPY backend/api/drizzle backend/api/drizzle
COPY backend/api/data backend/api/data
COPY backend/api/scripts backend/api/scripts
COPY backend/start.sh backend/start.sh

# Amazon RDS signs its certificate with its own CA: trust it so the database connection stays fully verified
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem

# The commit this image was built from, shown by /api/health (deploy-backend.yml passes it)
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

# Run as a normal user, not root
RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app
EXPOSE 8000
CMD ["bash", "/app/backend/start.sh"]

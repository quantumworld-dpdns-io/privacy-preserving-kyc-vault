FROM node:22-alpine AS node-base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM rust:1.85-alpine AS rust-base
RUN apk add --no-cache musl-dev pkg-config openssl-dev
RUN rustup component add clippy rustfmt

FROM node-base AS ts-deps
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

FROM node-base AS ts-build
WORKDIR /app
COPY --from=ts-deps /app/node_modules ./node_modules
COPY tsconfig.json nx.json ./
COPY packages ./packages
RUN pnpm run build

FROM rust-base AS rust-build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release --workspace

FROM python:3.12-slim AS py-base
RUN pip install --no-cache-dir uv

FROM py-base AS py-deps
WORKDIR /app
COPY pyproject.toml .
RUN uv sync --frozen

FROM node-base AS production
RUN apk add --no-cache libgcc openssl ca-certificates curl
WORKDIR /app
COPY --from=ts-build /app/dist ./dist
COPY --from=rust-build /app/target/release ./bin
COPY --from=py-deps /app/.venv ./.venv
COPY package.json ./
EXPOSE 3000 3100 50051
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
ENTRYPOINT ["node", "dist/main.js"]

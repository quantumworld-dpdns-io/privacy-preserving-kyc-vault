FROM rust:1.85-alpine AS chef
RUN apk add --no-cache musl-dev pkg-config openssl-dev protoc protobuf-dev
RUN cargo install cargo-chef
WORKDIR /build

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY proto ./proto
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /build/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY proto ./proto
RUN cargo build --release --package kyc-vault-tee --bin teaclave-function

FROM python:3.12-slim AS py-deps
RUN pip install --no-cache-dir numpy pandas onnxruntime cryptography
COPY deploy/teaclave/functions /opt/teaclave/functions
RUN python -c "
import compileall
import sys
compileall.compile_dir('/opt/teaclave/functions', force=True, legacy=True)
print('Python functions validated')
"

FROM alpine:3.20 AS runtime
RUN apk add --no-cache \
    libgcc libstdc++ openssl ca-certificates \
    libsgx-dcap-ql libsgx-urts libsgx-launch \
    libsgx-aepid libsgx-quote-ex \
    grpc-health-probe \
    tini

RUN addgroup -S teaclave && adduser -S -G teaclave teaclave

COPY --from=builder /build/target/release/teaclave-function /usr/local/bin/
COPY --from=py-deps /opt/teaclave/functions /opt/teaclave/functions
COPY deploy/teaclave/config.toml /etc/teaclave/config.toml

RUN mkdir -p /var/log/teaclave /var/lib/teaclave /etc/teaclave/certs && \
    chown -R teaclave:teaclave /var/log/teaclave /var/lib/teaclave /etc/teaclave

USER teaclave
WORKDIR /opt/teaclave

EXPOSE 7779 9090
VOLUME ["/var/lib/teaclave"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD grpc_health_probe -addr=localhost:7779 || exit 1

ENTRYPOINT ["/sbin/tini", "--", "teaclave-function"]
CMD ["--config", "/etc/teaclave/config.toml"]

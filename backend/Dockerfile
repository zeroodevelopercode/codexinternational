# Build stage
FROM rust:1.75-slim AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

# Run stage
FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/target/release/backend .
# Ganti "backend" di atas dengan nama project di Cargo.toml kamu (biasanya name = "backend")

EXPOSE 8080
CMD ["./backend"]

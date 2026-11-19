# Build stage
# Opsi 2: Versi yang lebih baru (lebih aman jika ada dependency lain yang butuh versi tinggi)
FROM rust:1.90-slim AS builder
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

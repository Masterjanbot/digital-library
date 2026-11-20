FROM golang:1.24-alpine AS builder
ARG MINIO_VERSION=7aac2a2c5b7c882e68c1ce017d8256be2feea27f
RUN GOMAXPROCS=2 CGO_ENABLED=0 go install -p=2 -trimpath -ldflags="-s -w" github.com/minio/minio@${MINIO_VERSION}

FROM alpine:3.21
RUN apk add --no-cache ca-certificates curl \
    && addgroup -S minio \
    && adduser -S -G minio -u 10001 minio \
    && mkdir -p /data \
    && chown minio:minio /data
COPY --from=builder /go/bin/minio /usr/local/bin/minio
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]

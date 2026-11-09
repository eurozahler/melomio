# melomio – ein Image für Webseite, Worker und Migrationen (Testserver, Modul M11).
# Gebaut wird auf dem Server (siehe infra/testserver/README.md, Abschnitt „App“).
FROM node:24-bookworm-slim

# FFmpeg für Hörprobe und Video, DejaVu-Schrift für den Videotitel
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Nur für den Build: Platzhalter, damit die Konfigurationsprüfung durchläuft.
# Die echten Werte kommen beim Start aus /opt/melomio/app/.env (nie ins Image).
RUN APP_MODE=test PAYMENT_PROVIDER=mock LYRICS_PROVIDER=mock MUSIC_PROVIDER=mock \
    EMAIL_PROVIDER=console STORAGE_PROVIDER=local \
    DATABASE_URL=postgres://build:build@127.0.0.1:1/build \
    APP_BASE_URL=https://build.invalid \
    BETTER_AUTH_SECRET=build-only-placeholder-not-a-secret-000000 \
    npx next build

ARG GIT_COMMIT=unbekannt
ENV GIT_COMMIT=$GIT_COMMIT \
    NODE_ENV=production \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    VIDEO_FONT_FILE=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
    STORAGE_LOCAL_DIR=/data/storage

RUN mkdir -p /data/storage && chown -R node:node /data /app/.next
USER node

# Standard: Webseite (nur lokal am Server, Caddy davor). Worker/Migration siehe compose.yaml.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3000"]

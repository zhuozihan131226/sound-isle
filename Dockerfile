# syntax=docker/dockerfile:1

# Node runtime + a static FFmpeg build that includes the whisper filter.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
  && rm -rf /var/lib/apt/lists/*

# BtbN's gpl build ships ffmpeg + ffprobe with the whisper filter enabled.
RUN mkdir -p /tmp/ffmpeg \
  && curl -fsSL "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz" \
    -o /tmp/ffmpeg.tar.xz \
  && tar -xJf /tmp/ffmpeg.tar.xz -C /tmp/ffmpeg --strip-components=1 \
  && install -m 0755 /tmp/ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg \
  && install -m 0755 /tmp/ffmpeg/bin/ffprobe /usr/local/bin/ffprobe \
  && rm -rf /tmp/ffmpeg /tmp/ffmpeg.tar.xz

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json server.js README.md ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p models data \
  && chown -R node:node /app

USER node

# Optional: bake the multilingual Whisper model into the image with
# `docker build --build-arg BAKE_MODEL=1 .`. By default it is downloaded
# lazily on the first AI transcription so the image stays smaller and the
# build does not depend on an external model host.
ARG BAKE_MODEL=0
RUN if [ "$BAKE_MODEL" = "1" ]; then node scripts/download-model.js; fi

EXPOSE 10000

CMD ["node", "server.js"]

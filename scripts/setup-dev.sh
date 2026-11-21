#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v ffmpeg >/dev/null 2>&1 || ! ffmpeg -hide_banner -filters 2>/dev/null | grep -q whisper; then
  echo "Installing FFmpeg with whisper support..."
  case "$(uname -m)" in
    x86_64|amd64) ffmpeg_arch="linux64" ;;
    aarch64|arm64) ffmpeg_arch="linuxarm64" ;;
    *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
  esac

  curl -fsSL \
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-${ffmpeg_arch}-gpl.tar.xz" \
    -o /tmp/ffmpeg.tar.xz
  sudo mkdir -p /opt/ffmpeg
  sudo tar -xJf /tmp/ffmpeg.tar.xz -C /opt/ffmpeg --strip-components=1
  sudo install -m 0755 /opt/ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg
  sudo install -m 0755 /opt/ffmpeg/bin/ffprobe /usr/local/bin/ffprobe
  rm -f /tmp/ffmpeg.tar.xz
fi

ffmpeg -hide_banner -filters 2>/dev/null | grep -q whisper \
  || echo "Warning: this FFmpeg build has no whisper filter; online lyrics and MP4 conversion still work."

npm ci
npm run download-model

echo ""
echo "Ready. Start with: npm start"
echo "Then open the forwarded port 4310 and set its visibility to Public if needed."

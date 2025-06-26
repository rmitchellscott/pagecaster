#!/bin/bash

# Environment validation
if [ -z "$WEB_URL" ] || [ -z "$RTMP_URL" ]; then
  echo "Error: WEB_URL and RTMP_URL must be set."
  exit 1
fi

# Set defaults
export SCREEN_WIDTH="${SCREEN_WIDTH:-854}"
export SCREEN_HEIGHT="${SCREEN_HEIGHT:-480}"
export AUDIO_SOURCE="${AUDIO_SOURCE:-icecast}"
export FFMPEG_PRESET="${FFMPEG_PRESET:-veryfast}"

echo "Starting PageCaster with Puppeteer..."
echo "Audio source: $AUDIO_SOURCE"
echo "Screen size: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}"
echo "Web URL: $WEB_URL"

# Configure display system for X11 capture
Xvfb :99 -screen 0 "${SCREEN_WIDTH}"x"${SCREEN_HEIGHT}"x24 &
export DISPLAY=:99

# Wait for Xvfb to start
sleep 3

# Start the Node.js Puppeteer application
exec node src/index.js

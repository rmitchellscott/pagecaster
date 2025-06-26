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
export FRAMERATE="${FRAMERATE:-30}"

echo "Starting PageCaster with Puppeteer..."
echo "Audio source: $AUDIO_SOURCE"
echo "Screen size: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}"
echo "Web URL: $WEB_URL"

# Configure display system for X11 capture
Xvfb :99 -screen 0 "${SCREEN_WIDTH}"x"${SCREEN_HEIGHT}"x24 &
export DISPLAY=:99

# Configure audio system - run in user mode, not system mode
rm -rf /var/run/pulse /var/lib/pulse /root/.config/pulse

# Create a simple PulseAudio configuration
mkdir -p /root/.config/pulse
cat > /root/.config/pulse/default.pa << 'EOF'
load-module module-null-sink sink_name=virtual-audio sink_properties=device.description=Virtual_Audio_Device
load-module module-native-protocol-unix auth-anonymous=1 socket=/tmp/pulse-socket
set-default-sink virtual-audio
EOF

export PULSE_SERVER=unix:/tmp/pulse-socket
pulseaudio -D --verbose --exit-idle-time=-1 --disallow-exit --disable-shm -F /root/.config/pulse/default.pa

# Wait for PulseAudio to start and create the virtual device
sleep 5

# Verify audio setup
echo "Checking audio devices:"
pulseaudio --check || echo "PulseAudio not running"
pactl info || echo "pactl failed"

# Start the Node.js Puppeteer application
exec node src/index.js

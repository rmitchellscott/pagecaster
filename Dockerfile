FROM node:24-alpine3.21

RUN apk update && \
    apk add --no-cache \
    vim \
    chromium \
    xvfb \
    ffmpeg \
    bash \
    udev \
    ttf-freefont \
    ca-certificates

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY entrypoint.sh .

RUN chmod +x entrypoint.sh

CMD ["bash", "entrypoint.sh"]

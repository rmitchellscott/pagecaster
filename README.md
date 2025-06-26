# Pagecaster
Pagecaster streams a web browser to an RTMP server with flexible audio source options! It uses Puppeteer to control a headless browser and streams the content via FFmpeg to an RTMP server. You can choose between webpage audio capture, external Icecast streams, or silent audio. A 480p stream typically consumes about half a CPU core and 300MB of RAM.

# Examples
The following examples are provided as a way to get started. Some adjustments may be required before production use, particularly regarding secret management.
## Docker
```shell
# With browser audio capture
docker run -d \
--shm-size=256m \
-e WEB_URL="https://weatherstar.netbymatt.com/" \
-e AUDIO_SOURCE="browser" \
-e RTMP_URL="rtmp://supercool.stream:1935/live" \
-e SCREEN_HEIGHT=480 \
-e SCREEN_WIDTH=854 \
ghcr.io/rmitchellscott/pagecaster

# With Icecast audio stream
docker run -d \
--shm-size=256m \
-e WEB_URL="https://weatherstar.netbymatt.com/" \
-e AUDIO_SOURCE="icecast" \
-e ICE_URL="https://radio.supercool.stream" \
-e RTMP_URL="rtmp://supercool.stream:1935/live" \
-e SCREEN_HEIGHT=480 \
-e SCREEN_WIDTH=854 \
ghcr.io/rmitchellscott/pagecaster

# With silent audio
docker run -d \
--shm-size=256m \
-e WEB_URL="https://weatherstar.netbymatt.com/" \
-e AUDIO_SOURCE="silent" \
-e RTMP_URL="rtmp://supercool.stream:1935/live" \
-e SCREEN_HEIGHT=480 \
-e SCREEN_WIDTH=854 \
ghcr.io/rmitchellscott/pagecaster
```

## Docker Compose

```yaml
version: '3.8'

services:
  pagecaster:
    image: ghcr.io/rmitchellscott/pagecaster
    deploy:
      resources:
        limits:
          shm_size: 256m
    environment:
      - WEB_URL=https://weatherstar.netbymatt.com/
      - AUDIO_SOURCE=browser  # or 'icecast' or 'silent'
      - ICE_URL=https://radio.supercool.stream  # only needed if AUDIO_SOURCE=icecast
      - RTMP_URL=rtmp://supercool.stream:1935/live
      - SCREEN_HEIGHT=480
      - SCREEN_WIDTH=854
    restart: always
```

## Kubernetes statefulset
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: pagecaster
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/component: pagecaster
      app.kubernetes.io/instance: pagecaster
      app.kubernetes.io/name: pagecaster
  serviceName: pagecaster
  template:
    metadata:
      labels:
        app.kubernetes.io/component: pagecaster
        app.kubernetes.io/instance: pagecaster
        app.kubernetes.io/name: pagecaster
    spec:
      containers:
      - env:
        - name: RTMP_URL
          value: rtmp://supercool.stream:1935/live
        - name: SCREEN_HEIGHT
          value: "480"
        - name: SCREEN_WIDTH
          value: "854"
        - name: WEB_URL
          value: https://weatherstar.netbymatt.com/
       - name: ICE_URL
          value: https://radio.supercool.stream
        image: ghcr.io/rmitchellscott/pagecaster
        imagePullPolicy: IfNotPresent
        name: pagecaster
        volumeMounts:
        - mountPath: /dev/shm
          name: dshm
      volumes:
      - emptyDir:
          sizeLimit: 256Mi
        name: dshm
```

## Kubernetes via flux, using the bjw-s/app-template Helm chart
```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: pagecaster
spec:
  chart:
    spec:
      chart: app-template
      version: 3.3.2
      reconcileStrategy: ChartVersion
      sourceRef:
        kind: HelmRepository
        namespace: flux-system
        name: bjw-s
  interval: 1h
  driftDetection:
    mode: enabled
  values:
    controllers:
     pagecaster:
        type: statefulset
        replicas: 1
        containers:
          pagecaster:
            image:
              repository: ghcr.io/rmitchellscott/pagecaster
              pullPolicy: IfNotPresent
            env:
              WEB_URL: "https://weatherstar.netbymatt.com/"
              ICE_URL: "https://radio.supercool.stream"
              RTMP_URL: rtmp://supercool.stream:1935/live
              SCREEN_WIDTH: 854
              SCREEN_HEIGHT: 480

    persistence:
      dshm:
        enabled: true
        type: emptyDir
        sizeLimit: 256Mi
        globalMounts:
          - path: /dev/shm
            readOnly: false
````

# Environment Variables

| Variable                 | Required? | Details | Example |
|--------------------------|-----------|---------|---------|
| WEB_URL               | yes       | URL to stream | https://weatherstar.netbymatt.com/   |
| AUDIO_SOURCE          | no        | Audio source: 'browser', 'icecast', or 'silent' (default: auto-detects to 'icecast' if ICE_URL is set, otherwise 'silent') | browser |
| ICE_URL               | conditional | Icecast URL (required if AUDIO_SOURCE=icecast) | https://radio.supercool.stream |
| RTMP_URL               | yes       | RTMP URL to stream to | rtmp://supercool.stream:1935/live |
| SCREEN_HEIGHT           | no        | Height of browser window (default: 480) | 480 |
| SCREEN_WIDTH          | no        | Width of browser window (default: 854) | 854 |
| FFMPEG_PRESET         | no        | FFmpeg encoding preset (default: veryfast) | medium |
| FRAMERATE             | no        | Video framerate (default: 30) | 60 |

## Audio Source Options

- **browser**: Captures audio directly from the webpage using pulseaudio
- **icecast**: Uses an external Icecast stream as the audio source (maintains backward compatibility)
- **silent**: Generates a silent audio track for video-only streaming

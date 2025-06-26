const puppeteer = require('puppeteer');
const { getStream } = require('puppeteer-stream');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');

class PageCaster {
  constructor() {
    this.validateEnvironment();
    this.audioSource = process.env.AUDIO_SOURCE || 'icecast';
    this.webUrl = process.env.WEB_URL;
    this.rtmpUrl = process.env.RTMP_URL;
    this.iceUrl = process.env.ICE_URL;
    this.screenWidth = parseInt(process.env.SCREEN_WIDTH) || 854;
    this.screenHeight = parseInt(process.env.SCREEN_HEIGHT) || 480;
    this.ffmpegPreset = process.env.FFMPEG_PRESET || 'veryfast';
    
    this.browser = null;
    this.page = null;
    this.ffmpegProcess = null;
    this.audioStream = null;
  }

  validateEnvironment() {
    const required = ['WEB_URL', 'RTMP_URL'];
    const missing = required.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      console.error(`Missing required environment variables: ${missing.join(', ')}`);
      process.exit(1);
    }
  }

  async setupBrowser() {
    console.log('Starting Puppeteer browser...');
    
    try {
      this.browser = await puppeteer.launch({
        headless: false,  // Use non-headless for X11 display
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          `--window-size=${this.screenWidth},${this.screenHeight}`,
          '--window-position=0,0',
          '--autoplay-policy=no-user-gesture-required',
          '--kiosk'
        ],
        defaultViewport: null
      });
      console.log('Browser launched successfully');

      this.page = await this.browser.newPage();
      console.log('New page created');
      
      await this.page.setViewport({
        width: this.screenWidth,
        height: this.screenHeight
      });
      console.log('Viewport set');

      console.log(`Navigating to: ${this.webUrl}`);
      await this.page.goto(this.webUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      console.log('Page loaded successfully');

      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Browser setup complete');
    } catch (error) {
      console.error('Browser setup failed:', error);
      throw error;
    }
  }

  async setupAudioCapture() {
    console.log(`Setting up audio capture (source: ${this.audioSource})`);
    
    switch (this.audioSource.toLowerCase()) {
      case 'webpage':
        return await this.setupWebpageAudio();
      case 'icecast':
        return this.setupIcecastAudio();
      case 'silent':
        return this.setupSilentAudio();
      default:
        console.warn(`Unknown audio source: ${this.audioSource}, falling back to icecast`);
        return this.setupIcecastAudio();
    }
  }

  async setupWebpageAudio() {
    try {
      console.log('Capturing webpage audio using puppeteer-stream...');
      
      await this.page.evaluate(() => {
        if (typeof window.webkitAudioContext !== 'undefined') {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          audioContext.resume();
        }
      });

      this.audioStream = await getStream(this.page, { 
        audio: true, 
        video: false,
        mimeType: 'audio/webm;codecs=opus'
      });

      return {
        type: 'stream',
        stream: this.audioStream
      };
      
    } catch (error) {
      console.error('Failed to capture webpage audio:', error);
      console.log('Falling back to silent audio...');
      return this.setupSilentAudio();
    }
  }

  setupIcecastAudio() {
    if (this.iceUrl) {
      console.log(`Using Icecast audio from: ${this.iceUrl}`);
      return {
        type: 'url',
        source: this.iceUrl
      };
    } else {
      console.log('No ICE_URL provided, falling back to silent audio');
      return this.setupSilentAudio();
    }
  }

  setupSilentAudio() {
    console.log('Using silent audio track');
    return {
      type: 'silent'
    };
  }

  async startScreencast() {
    console.log('Starting screen capture...');
    
    const audioConfig = await this.setupAudioCapture();
    const ffmpegArgs = this.buildFFmpegArgs(audioConfig);
    
    console.log('Starting FFmpeg with args:', ffmpegArgs.join(' '));
    
    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.ffmpegProcess.stdout.on('data', (data) => {
      console.log(`FFmpeg stdout: ${data}`);
    });

    this.ffmpegProcess.stderr.on('data', (data) => {
      console.log(`FFmpeg stderr: ${data}`);
    });

    this.ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      this.cleanup();
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('FFmpeg process error:', error);
      this.cleanup();
    });

    // FFmpeg handles X11 capture directly - no screenshot loop needed
    console.log('FFmpeg started - X11 screen capture in progress...');
  }

  buildFFmpegArgs(audioConfig) {
    // Use X11 capture for better performance
    const baseArgs = [
      '-y',
      '-f', 'x11grab',
      '-s', `${this.screenWidth}x${this.screenHeight}`,
      '-draw_mouse', '0',
      '-i', ':99.0'
    ];

    const audioArgs = [];
    switch (audioConfig.type) {
      case 'url':
        audioArgs.push('-i', audioConfig.source);
        break;
      case 'stream':
        // For webpage audio, we would need different handling
        console.warn('Webpage audio capture not yet implemented, falling back to silent');
        audioArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
        break;
      case 'silent':
        audioArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
        break;
    }

    const outputArgs = [
      '-c:v', 'libx264',
      '-preset', this.ffmpegPreset,
      '-tune', 'zerolatency',
      '-maxrate', '3000k',
      '-bufsize', '6000k',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-f', 'flv',
      this.rtmpUrl
    ];

    return [...baseArgs, ...audioArgs, ...outputArgs];
  }

  async cleanup() {
    console.log('Cleaning up resources...');
    
    if (this.audioStream) {
      this.audioStream.destroy();
    }
    
    if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
      this.ffmpegProcess.kill('SIGTERM');
    }
    
    if (this.page) {
      await this.page.close();
    }
    
    if (this.browser) {
      await this.browser.close();
    }
  }

  async start() {
    try {
      console.log('Starting PageCaster...');
      console.log(`Audio source: ${this.audioSource}`);
      console.log(`Web URL: ${this.webUrl}`);
      console.log(`RTMP URL: ${this.rtmpUrl}`);
      console.log(`Screen size: ${this.screenWidth}x${this.screenHeight}`);
      
      await this.setupBrowser();
      await this.startScreencast();
      
    } catch (error) {
      console.error('Error starting PageCaster:', error);
      await this.cleanup();
      process.exit(1);
    }
  }
}

process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  if (global.pageCaster) {
    await global.pageCaster.cleanup();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  if (global.pageCaster) {
    await global.pageCaster.cleanup();
  }
  process.exit(0);
});

const pageCaster = new PageCaster();
global.pageCaster = pageCaster;
pageCaster.start();
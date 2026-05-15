type SfxName = 'dragonBreath' | 'hit' | 'build' | 'click';

type SfxOptions = {
  volume?: number;
  playbackRate?: number;
  randomPitch?: [number, number];
  startAt?: number;
};

const HIT_QUEUE_INTERVAL_SECONDS = 0.055;

const AUDIO_ASSETS = {
  bgm: new URL('../../assets/maou_bgm_ethnic02.mp3', import.meta.url).href,
  dragonBreath: new URL('../../assets/龙息.wav', import.meta.url).href,
  hit: new URL('../../assets/受击.mp3', import.meta.url).href,
  build: new URL('../../assets/建造.wav', import.meta.url).href,
  click: new URL('../../assets/点击.wav', import.meta.url).href,
} as const;

export class AudioSystem {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private buffers = new Map<SfxName | 'bgm', AudioBuffer>();
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmRequested = false;
  private unlocked = false;
  private nextHitStartTime = 0;
  private boundUnlock = this.tryUnlock.bind(this);

  async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.context = new AudioCtx();
    } catch {
      this.context = null;
      return;
    }
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.92;
    this.masterGain.connect(this.context.destination);

    this.bgmGain = this.context.createGain();
    this.bgmGain.gain.value = 0.32;
    this.bgmGain.connect(this.masterGain);

    await this.preloadAll();
    this.installUnlockListeners();
  }

  async preloadAll(): Promise<void> {
    if (!this.context) return;
    const entries: Array<[SfxName | 'bgm', string]> = [
      ['bgm', AUDIO_ASSETS.bgm],
      ['dragonBreath', AUDIO_ASSETS.dragonBreath],
      ['hit', AUDIO_ASSETS.hit],
      ['build', AUDIO_ASSETS.build],
      ['click', AUDIO_ASSETS.click],
    ];

    await Promise.all(entries.map(async ([name, url]) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await this.decodeAudioData(arrayBuffer);
        this.buffers.set(name, buffer);
      } catch (error) {
        console.warn(`[AudioSystem] Failed to preload ${name}`, error);
      }
    }));
  }

  restartBgm(): void {
    this.stopBgm();
    this.bgmRequested = true;
    this.playBgm();
  }

  playBgm(): void {
    this.bgmRequested = true;
    if (!this.context || !this.bgmGain) return;
    if (this.bgmSource) return;
    const buffer = this.buffers.get('bgm');
    if (!buffer) return;
    this.startLoopingSource(buffer, this.bgmGain, 1, 0.86);
  }

  stopBgm(): void {
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
      } catch {
        // ignore
      }
      this.bgmSource.disconnect();
      this.bgmSource = null;
    }
  }

  playDragonBreath(): void {
    this.playSfx('dragonBreath', { volume: 0.86, randomPitch: [0.96, 1.07] });
  }

  playHit(): void {
    if (!this.context || !this.masterGain) return;
    const startAt = Math.max(this.context.currentTime, this.nextHitStartTime);
    this.nextHitStartTime = startAt + HIT_QUEUE_INTERVAL_SECONDS;
    this.playSfx('hit', { volume: 0.92, randomPitch: [0.92, 1.08], startAt });
  }

  playBuild(): void {
    this.playSfx('build', { volume: 0.9, playbackRate: 1 });
  }

  playClick(): void {
    this.playSfx('click', { volume: 0.82, playbackRate: 1 });
  }

  playSfx(name: SfxName, options: SfxOptions = {}): void {
    if (!this.context || !this.masterGain) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options.playbackRate ?? this.pickRandomPitch(options.randomPitch) ?? 1;
    const gain = this.context.createGain();
    gain.gain.value = options.volume ?? 1;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(options.startAt);
  }

  dispose(): void {
    this.removeUnlockListeners();
    this.stopBgm();
    this.buffers.clear();
    if (this.context && this.context.state !== 'closed') {
      void this.context.close();
    }
    this.context = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.unlocked = false;
    this.bgmRequested = false;
    this.nextHitStartTime = 0;
  }

  private async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.context) throw new Error('AudioContext not initialized');
    return await new Promise<AudioBuffer>((resolve, reject) => {
      this.context!.decodeAudioData(arrayBuffer, resolve, reject);
    });
  }

  private startLoopingSource(buffer: AudioBuffer, output: AudioNode, rate: number, volume: number): void {
    if (!this.context) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(output);
    source.start(0);
    this.bgmSource = source;
  }

  private pickRandomPitch(range?: [number, number]): number | null {
    if (!range) return null;
    const [min, max] = range;
    return min + Math.random() * (max - min);
  }

  private installUnlockListeners(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('pointerdown', this.boundUnlock, true);
    document.addEventListener('keydown', this.boundUnlock, true);
    document.addEventListener('touchstart', this.boundUnlock, true);
  }

  private removeUnlockListeners(): void {
    if (typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', this.boundUnlock, true);
    document.removeEventListener('keydown', this.boundUnlock, true);
    document.removeEventListener('touchstart', this.boundUnlock, true);
  }

  private tryUnlock(): void {
    if (!this.context || this.unlocked) return;
    if (this.bgmRequested && !this.bgmSource) this.playBgm();
    void this.context.resume().then(() => {
      this.unlocked = this.context?.state === 'running';
      if (this.unlocked && this.bgmRequested && !this.bgmSource) this.playBgm();
    }).catch(() => {
      // ignore
    });
  }
}

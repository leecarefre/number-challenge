import { _decorator, Component, AudioSource, AudioClip, game, resources, tween, Node } from 'cc';
import { DataManager } from './DataManager';

const { ccclass } = _decorator;

export type SfxKey =
    | 'connect_success'
    | 'connect_error'
    | 'win'
    | 'fail'
    | 'button_click'
    | 'heart_lose';

@ccclass('AudioManager')
export class AudioManager extends Component {
    private static _inst: AudioManager | null = null;
    static get inst(): AudioManager {
        return AudioManager._inst!;
    }

    private _bgmSource!: AudioSource;
    private _sfxSource!: AudioSource;
    private _clips: Map<string, AudioClip> = new Map();

    onLoad() {
        if (AudioManager._inst && AudioManager._inst !== this) {
            this.destroy();
            return;
        }
        AudioManager._inst = this;
        game.addPersistRootNode(this.node);

        const bgmNode = new Node('BGMSource');
        this.node.addChild(bgmNode);
        this._bgmSource = bgmNode.addComponent(AudioSource);
        this._bgmSource.loop = true;
        this._bgmSource.volume = 0.6;

        const sfxNode = new Node('SFXSource');
        this.node.addChild(sfxNode);
        this._sfxSource = sfxNode.addComponent(AudioSource);
        this._sfxSource.loop = false;
        this._sfxSource.volume = 1.0;
    }

    // ─── BGM ───────────────────────────────────────────────────────────────────

    playBGM(path: string) {
        if (!DataManager.inst.data.settings.bgmOn) return;
        this._loadClip(`audio/bgm/${path}`, clip => {
            if (this._bgmSource.clip === clip && this._bgmSource.playing) return;
            this._fadeOut(this._bgmSource, 0.5, () => {
                this._bgmSource.clip = clip;
                this._bgmSource.play();
                this._fadeIn(this._bgmSource, 0.5);
            });
        });
    }

    stopBGM() {
        this._fadeOut(this._bgmSource, 0.5, () => this._bgmSource.stop());
    }

    // ─── SFX ───────────────────────────────────────────────────────────────────

    playSFX(key: SfxKey) {
        if (!DataManager.inst.data.settings.sfxOn) return;
        this._loadClip(`audio/sfx/${key}`, clip => {
            this._sfxSource.playOneShot(clip, 1.0);
        });
    }

    // ─── Volume toggles ────────────────────────────────────────────────────────

    setBGMEnabled(on: boolean) {
        DataManager.inst.setSetting('bgmOn', on);
        if (on) {
            this._bgmSource.play();
        } else {
            this._bgmSource.pause();
        }
    }

    setSFXEnabled(on: boolean) {
        DataManager.inst.setSetting('sfxOn', on);
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    private _loadClip(path: string, cb: (clip: AudioClip) => void) {
        if (this._clips.has(path)) {
            cb(this._clips.get(path)!);
            return;
        }
        resources.load(path, AudioClip, (err, clip) => {
            if (err) {
                console.warn('[Audio] Failed to load:', path);
                return;
            }
            this._clips.set(path, clip);
            cb(clip);
        });
    }

    private _fadeOut(source: AudioSource, duration: number, onDone?: () => void) {
        tween(source)
            .to(duration, { volume: 0 })
            .call(() => {
                source.pause();
                onDone?.();
            })
            .start();
    }

    private _fadeIn(source: AudioSource, duration: number) {
        source.volume = 0;
        tween(source)
            .to(duration, { volume: 0.6 })
            .start();
    }
}

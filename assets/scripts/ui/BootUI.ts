import {
    _decorator, Component, Node, ProgressBar, Label, director, resources,
    Color, Graphics, Sprite, Camera, UITransform, UIOpacity,
} from 'cc';
import { DataManager } from '../core/DataManager';
import { I18nManager } from '../core/I18nManager';
import { AudioManager } from '../core/AudioManager';
import { AdManager } from '../core/AdManager';
import { preloadIcons } from './IconUtil';

const { ccclass, property } = _decorator;

@ccclass('BootUI')
export class BootUI extends Component {
    @property(ProgressBar) progressBar: ProgressBar | null = null;
    @property(Label)       loadingLabel: Label | null = null;
    @property(Node)        privacyDialog: Node | null = null;

    async start() {
        console.log('[BootUI] start() called');
        this._applyTheme();
        await this._load();
    }

    private _applyTheme() {
        const C_TITLE = new Color(255, 200,  50, 255);
        const C_LOAD  = new Color(160, 175, 215, 255);

        // Use the Canvas's runtime size so the background fills the actual visible
        // viewport on any aspect ratio, and tint the Camera clearColor so any
        // letterbox blends with the gradient edges.
        const cs = this.node.getComponent(UITransform)?.contentSize;
        const w = cs?.width  ?? 1280;
        const h = cs?.height ?? 720;
        const camera = (this.node.getChildByName('Camera')
                     ?? this.node.parent?.getChildByName('Camera'))?.getComponent(Camera);
        if (camera) camera.clearColor = new Color(6, 8, 22, 255);

        // Background – game-style gradient with starfield
        const bg = this.node.getChildByName('Background');
        if (bg) _paintSceneBg(bg, w, h);

        // Title styling
        const title = this.node.getChildByName('TitleLabel')?.getComponent(Label);
        if (title) {
            title.color = C_TITLE;
            if (title.fontSize < 48) title.fontSize = 56;
            title.isBold = true;
        }

        // Loading text
        if (this.loadingLabel) this.loadingLabel.color = C_LOAD;
    }

    private async _load() {
        console.log('[BootUI] _load() begin');
        const steps = [
            { label: 'Loading data...', weight: 0.15, fn: () => this._waitForData() },
            { label: 'Loading language...', weight: 0.3,  fn: () => I18nManager.inst.init() },
            { label: 'Loading icons...', weight: 0.55, fn: () => preloadIcons() },
            { label: 'Loading resources...', weight: 0.85, fn: () => this._preloadAudio() },
            { label: 'Done!', weight: 1.0, fn: () => Promise.resolve() },
        ];

        for (const step of steps) {
            console.log('[BootUI] step:', step.label);
            if (this.loadingLabel) this.loadingLabel.string = step.label;
            await step.fn();
            if (this.progressBar) this.progressBar.progress = step.weight;
        }

        // Small delay so progress bar visually reaches 100%
        await new Promise(r => setTimeout(r, 300));
        this._proceedFromBoot();
    }

    private _waitForData(): Promise<void> {
        // DataManager loads asynchronously in onLoad via storage call.
        // Poll briefly until data is valid.
        return new Promise(resolve => {
            const check = () => {
                if (DataManager.inst) { resolve(); return; }
                setTimeout(check, 50);
            };
            check();
        });
    }

    private _preloadAudio(): Promise<void> {
        return new Promise(resolve => {
            // Non-blocking — preload key SFX
            const keys = ['connect_success', 'connect_error', 'button_click'];
            let done = 0;
            keys.forEach(k => {
                resources.load(`audio/sfx/${k}`, () => {
                    done++;
                    if (done >= keys.length) resolve();
                });
            });
            // Resolve after 2s max even if some fail
            setTimeout(resolve, 2000);
        });
    }

    private _proceedFromBoot() {
        // Loading is finished – hide the progress UI so it doesn't sit behind
        // the PrivacyDialog or flash before scene transition.
        if (this.loadingLabel)        this.loadingLabel.node.active        = false;
        if (this.progressBar)         this.progressBar.node.active         = false;
        const titleNode = this.node.getChildByName('TitleLabel');
        if (titleNode) titleNode.active = false;

        const data = DataManager.inst.data;
        if (!data.privacyAccepted) {
            if (this.privacyDialog) {
                this.privacyDialog.active = true;
                return;
            }
        }
        director.loadScene('Home');
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _bgChild(node: Node): Node {
    let bg = node.getChildByName('__bg__');
    if (!bg) {
        bg = new Node('__bg__');
        bg.addComponent(UITransform);
        bg.addComponent(Graphics);
        bg.addComponent(UIOpacity);
        node.addChild(bg);
        bg.setSiblingIndex(0);
    }
    return bg;
}

function _paintSceneBg(node: Node, w: number, h: number) {
    // Scene-stored Background nodes carry a leftover cc.Sprite (no spriteFrame)
    // whose render pass races our Graphics child and leaves a black flash.
    const sp = node.getComponent(Sprite);
    if (sp) sp.enabled = false;

    const ut = node.getComponent(UITransform);
    if (ut) ut.setContentSize(w, h);
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();

    // Bands use fillRect which is self-contained (no path accumulation).
    // Cocos Graphics has no beginPath(); calling rect()+fill() in a loop re-fills
    // the accumulated path with the latest color, leaving a solid block.
    const TOP    = [ 6,  8, 22];
    const MID    = [22, 24, 52];
    const BANDS  = 36;
    for (let i = 0; i < BANDS; i++) {
        const t = i / (BANDS - 1);
        const k = t < 0.5 ? t * 2 : (1 - t) * 2;
        const r  = Math.round(TOP[0] + (MID[0] - TOP[0]) * k);
        const gg = Math.round(TOP[1] + (MID[1] - TOP[1]) * k);
        const b  = Math.round(TOP[2] + (MID[2] - TOP[2]) * k);
        g.fillColor = new Color(r, gg, b, 255);
        const y0 = -h / 2 + (h * i) / BANDS;
        const yh = h / BANDS + 1;
        g.fillRect(-w / 2, y0, w, yh);
    }

    // Stars share one color, so build all circles into the path and fill once.
    let seed = 1337;
    const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
    const STAR_COUNT = Math.max(40, Math.floor((w * h) / 14000));
    g.fillColor = new Color(255, 220, 160, 70);
    for (let i = 0; i < STAR_COUNT; i++) {
        const x  = -w / 2 + rand() * w;
        const y  = -h / 2 + rand() * h;
        const rr = 1 + rand() * 1.8;
        g.circle(x, y, rr);
    }
    g.fill();
}

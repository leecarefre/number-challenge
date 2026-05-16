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
        const C_TITLE = new Color(182,  97,  62, 255);  // #B6613E
        const C_LOAD  = new Color(139,  94,  74, 255);

        // Use the Canvas's runtime size so the background fills the actual visible
        // viewport on any aspect ratio, and tint the Camera clearColor so any
        // letterbox blends with the gradient edges.
        const cs = this.node.getComponent(UITransform)?.contentSize;
        const w = cs?.width  ?? 1280;
        const h = cs?.height ?? 720;
        const camera = (this.node.getChildByName('Camera')
                     ?? this.node.parent?.getChildByName('Camera'))?.getComponent(Camera);
        if (camera) camera.clearColor = new Color(242, 240, 227, 255);

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
            { label: 'Initializing SDK...', weight: 0.05, fn: () => this._initSDK() },
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

    private _initSDK(): Promise<void> {
        return new Promise(resolve => {
            // Skip in mock environment (Cocos Preview / browser)
            if (typeof TTMinis === 'undefined' || !(TTMinis.game as any).init) {
                resolve();
                return;
            }
            (TTMinis.game as any).init({
                clientKey: 'YOUR_CLIENT_KEY', // ← 替换为真实 client_key
                success: () => { console.log('[SDK] init ok'); resolve(); },
                fail: (err: any) => { console.error('[SDK] init fail', err); resolve(); },
            });
        });
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
    const sp = node.getComponent(Sprite);
    if (sp) sp.enabled = false;

    const ut = node.getComponent(UITransform);
    if (ut) ut.setContentSize(w, h);
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();
    g.fillColor = new Color(242, 240, 227, 255);  // #F2F0E3
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
}

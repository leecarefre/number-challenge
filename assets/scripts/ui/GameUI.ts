import {
    _decorator, Component, Label, Node, ProgressBar, Button,
    Color, Graphics, Sprite, Camera, UITransform, UIOpacity,
    Vec3, tween,
} from 'cc';
import { createIconNode } from './IconUtil';
import { GameController } from '../gameplay/GameController';
import { GameManager } from '../core/GameManager';
import { DataManager } from '../core/DataManager';
import { AudioManager } from '../core/AudioManager';
import { I18nManager } from '../core/I18nManager';
import { TutorialManager } from '../tutorial/TutorialManager';

const { ccclass, property } = _decorator;

@ccclass('GameUI')
export class GameUI extends Component {
    @property(Label)       levelLabel: Label | null = null;
    @property(Label)       livesLabel: Label | null = null;
    @property(ProgressBar) progressBar: ProgressBar | null = null;
    @property(Node)        winDialog: Node | null = null;
    @property(Node)        failDialog: Node | null = null;
    @property(GameController) gameController: GameController | null = null;
    @property(Node)        hintBtn: Node | null = null;
    @property(Node)        rangeHintBtn: Node | null = null;
    @property(Node)        magnifyBtn: Node | null = null;
    @property(TutorialManager) tutorialManager: TutorialManager | null = null;

    private _unregisterLang: (() => void) | null = null;
    private _progressLabel: Label | null = null;

    onLoad() {
        this._applyTheme();
        AudioManager.inst.playBGM('game_bgm');

        const entry = GameManager.inst.currentLevel;
        // Level label: show "Tutorial" for the intro level, numbered for all others.
        this._unregisterLang = I18nManager.inst.registerCallback(() => {
            if (this.levelLabel) {
                this.levelLabel.string = entry.isTutorial
                    ? I18nManager.inst.t('tutorial_label')
                    : I18nManager.inst.t('level', { n: entry.level });
            }
        });

        this.gameController?.setCallbacks({
            onLivesChanged: lives => this._updateLives(lives),
            onProgressChanged: (cur, total) => this._updateProgress(cur, total),
            onWin: stars => this._showWin(stars),
            onFail: () => this._showFail(),
        });

        this.gameController?.startLevel(entry.level, entry.isTutorial);
        this._updateLives(DataManager.inst.data.lives);
        this._updateItems();

        if (entry.isTutorial && this.tutorialManager) {
            this.tutorialManager.startTutorial();
        }

        // Tool button click handlers are bound in _applyTheme via TOUCH_END
        // after the buttons are reset (the scene-stored Sprite + Label
        // children otherwise blocked the click on top of the Button comp).
    }

    onDestroy() {
        this._unregisterLang?.();
    }

    private _updateLives(lives: number) {
        if (!this.livesLabel) return;
        // Hide the text label; render hearts as sprite icons under the same node
        this.livesLabel.string = '';
        const host = this.livesLabel.node;
        // Remove old heart children
        host.children.slice().forEach(c => {
            if (c.name.startsWith('__heart-')) c.removeFromParent();
        });
        const ICON = 32;
        const GAP  = 8;
        const totalW = lives * ICON + Math.max(0, lives - 1) * GAP;
        for (let i = 0; i < lives; i++) {
            const h = createIconNode('heart', ICON);
            h.name = `__heart-${i}`;
            h.setPosition(-totalW / 2 + ICON / 2 + i * (ICON + GAP), 0, 0);
            host.addChild(h);
        }
    }

    private _updateProgress(current: number, total: number) {
        if (this.progressBar) this.progressBar.progress = current / total;
        if (this._progressLabel) this._progressLabel.string = `${current + 1} / ${total}`;
    }

    private _updateItems() {
        // Hint / Range buttons are icon-only by design; no count badge yet.
        // Method kept as a hook so item counts can re-render later if needed.
    }

    private _toggleMagnify() {
        this.gameController?.useMagnifier();
        this._refreshMagnifyState();
    }

    private _refreshMagnifyState() {
        if (!this.magnifyBtn) return;
        const active = this.gameController?.isMagnified ?? false;
        const C_ACTIVE = new Color(255, 195, 60, 240);
        const C_IDLE   = new Color(182,  97, 62, 220);
        _paintRoundedBg(this.magnifyBtn, active ? C_ACTIVE : C_IDLE, 18);
        // Reattach the icon last so the freshly-painted bg doesn't cover it.
        const icon = this.magnifyBtn.getChildByName('__icon-magnify__');
        if (icon) icon.setSiblingIndex(99);
        if (active) _glowPulse(this.magnifyBtn);
    }

    private _tryUseHint() {
        const items = DataManager.inst.data.items;
        if (items.hint <= 0) {
            this._showItemEmptyToast(this.hintBtn);
            return;
        }
        this.gameController?.useHint();
    }

    private _tryUseRangeHint() {
        const items = DataManager.inst.data.items;
        if (items.rangeHint <= 0) {
            this._showItemEmptyToast(this.rangeHintBtn);
            return;
        }
        this.gameController?.useRangeHint();
    }

    private _showItemEmptyToast(host: Node | null) {
        if (!host) return;
        // Reuse a single toast node so rapid taps don't spawn duplicates.
        const toastName = '__empty-toast__';
        let toast = host.getChildByName(toastName);
        if (!toast) {
            toast = new Node(toastName);
            const ut = toast.addComponent(UITransform);
            ut.setContentSize(180, 30);
            const lbl = toast.addComponent(Label);
            lbl.string          = '0';
            lbl.fontSize        = 22;
            lbl.color           = new Color(255, 200, 80, 255);
            lbl.isBold          = true;
            lbl.horizontalAlign = 1;
            host.addChild(toast);
        }
        const lbl = toast.getComponent(Label)!;
        lbl.string = I18nManager.inst.t('item_empty') || '0 left — visit shop';
        toast.setPosition(0, 80, 0);
        let op = toast.getComponent(UIOpacity);
        if (!op) op = toast.addComponent(UIOpacity);
        op.opacity = 255;
        tween(op).stop();
        tween(op)
            .delay(0.9)
            .to(0.3, { opacity: 0 })
            .start();
    }

    private _showWin(stars: number) {
        if (this.winDialog) {
            this.winDialog.active = true;
            const wd = this.winDialog.getComponent('WinDialog') as any;
            wd?.show(GameManager.inst.currentLevel.level, stars);
        }
    }

    private _showFail() {
        if (this.failDialog) {
            this.failDialog.active = true;
        }
    }

    onBackHome() {
        AudioManager.inst.playSFX('button_click');
        GameManager.inst.loadScene('Home');
    }

    // ── Theme ──────────────────────────────────────────────────────────────────

    private _applyTheme() {
        const C_NAV    = new Color(182,  97,  62, 250);  // #B6613E
        const C_NAV_LO = new Color(150,  75,  45, 250);
        const C_BTN    = new Color(182,  97,  62, 220);  // #B6613E
        const C_BACK   = new Color(210, 150, 110, 235);
        const C_TXT    = new Color(242, 240, 227, 255);  // #F2F0E3
        const C_GOLD   = new Color(242, 240, 227, 255);  // #F2F0E3

        // ── Scene background – fills the actual Canvas runtime size ──
        const cs = this.node.getComponent(UITransform)?.contentSize;
        const sw = cs?.width  ?? 750;
        const sh = cs?.height ?? 1334;
        const camera = (this.node.getChildByName('Camera')
                     ?? this.node.parent?.getChildByName('Camera'))?.getComponent(Camera);
        if (camera) camera.clearColor = new Color(242, 240, 227, 255);

        const sceneBg = this.node.getChildByName('Background');
        if (sceneBg) {
            _paintSceneBg(sceneBg, sw, sh);
            sceneBg.setSiblingIndex(0);
        }

        // ── TopBar – flush top (y=617, height 100 → top edge 667) ──
        const topBar = this.node.getChildByName('TopBar');
        if (topBar) {
            topBar.setPosition(0, 617, 0);
            _paintTopBarBg(topBar, C_NAV, C_NAV_LO, C_GOLD);
        }

        // Level label – bold gold, larger
        if (this.levelLabel) {
            this.levelLabel.color    = C_GOLD;
            this.levelLabel.fontSize = 38;
            this.levelLabel.isBold   = true;
        }

        // Lives label – inside TopBar right side
        if (this.livesLabel) {
            this.livesLabel.node.setPosition(260, 617, 0);
            this.livesLabel.color = C_TXT;
        }

        // ProgressBar – tucked just below TopBar (TopBar bottom = 567)
        if (this.progressBar) {
            this.progressBar.node.setPosition(0, 547, 0);
        }

        // Progress counter label: "current / total" below the bar
        {
            const pcName = '__progress-count__';
            let pcNode = this.node.getChildByName(pcName);
            if (!pcNode) {
                pcNode = new Node(pcName);
                pcNode.addComponent(UITransform).setContentSize(200, 34);
                this._progressLabel = pcNode.addComponent(Label);
                this._progressLabel.fontSize = 22;
                this._progressLabel.isBold   = true;
                this._progressLabel.color    = new Color(182, 97, 62, 255);
                this._progressLabel.horizontalAlign = 1; // CENTER
                this.node.addChild(pcNode);
            } else {
                this._progressLabel = pcNode.getComponent(Label);
            }
            pcNode.setPosition(0, 518, 0);
            pcNode.setSiblingIndex(99);
        }

        // BottomToolbar – flush bottom (y=-587, height 160 → bottom edge -667)
        const toolbar = this.node.getChildByName('BottomToolbar');
        if (toolbar) {
            toolbar.setPosition(0, -587, 0);
            _paintBg(toolbar, C_NAV);
        }

        // Re-center the play area between the progress bar (~+540) and the
        // toolbar's top edge (~-507). The scene puts GridArea at y=-80, which
        // looks bottom-heavy on portrait phones; pulling it to ~+15 balances
        // the empty bands above and below the grid.
        const gridArea = this.gameController?.gridRenderer?.node;
        if (gridArea) gridArea.setPosition(0, 15, 0);

        // Wire the magnifier's camera ref — the scene leaves cameraNode null
        // so useMagnifier() returns silently. Falling back to the scene Camera
        // makes the click visibly do something.
        if (this.gameController && !this.gameController.cameraNode) {
            const cam = this.node.getChildByName('Camera')
                     ?? this.node.parent?.getChildByName('Camera');
            if (cam) this.gameController.cameraNode = cam;
        }

        // Tool buttons — full programmatic rebuild. The scene-stored variants
        // accumulate stale Label children + a leftover cc.Sprite that quietly
        // intercepts touches; nuking children and re-attaching the click
        // handler ensures the buttons actually fire. Hint / Range only show
        // their icon (per UX request — no "Ad" / count text underneath).
        // Each handler also runs a press-bounce so clicks read as registered
        // even when the underlying action no-ops (e.g. items.hint === 0).
        const toolButtons: Array<[Node | null, string, number, () => void]> = [
            [this.magnifyBtn,   'magnify', 64, () => this._toggleMagnify()],
            [this.hintBtn,      'hint',    60, () => this._tryUseHint()],
            [this.rangeHintBtn, 'range',   60, () => this._tryUseRangeHint()],
        ];
        toolButtons.forEach(([btn, icon, size, action]) => {
            if (!btn) return;
            _resetButton(btn);
            _paintRoundedBg(btn, C_BTN, 18);
            _attachIcon(btn, icon, size, 0, 0);
            if (!btn.getComponent(Button)) btn.addComponent(Button);
            btn.off(Node.EventType.TOUCH_END);
            btn.on(Node.EventType.TOUCH_END, () => {
                AudioManager.inst.playSFX('button_click');
                _bounce(btn);
                action();
            }, this);
        });
        this._refreshMagnifyState();

        // ── Replace "?" placeholders with sprite icons ──
        // Back arrow on TopBar.SettingsBtn – round dark pill behind icon
        // (lookup by name; children[0] would be the __bg__ node added by _paintTopBarBg)
        const settingsBtn = topBar?.getChildByName('SettingsBtn');
        if (settingsBtn) {
            settingsBtn.children.forEach(c => {
                const lbl = c.getComponent(Label);
                if (lbl) lbl.string = '';
            });
            _paintRoundedBg(settingsBtn, C_BACK, 32);
            _attachIcon(settingsBtn, 'back', 40);
            settingsBtn.on(Button.EventType.CLICK, this.onBackHome, this);
        }

        // ── Render order: TopBar / BottomToolbar must always paint on top ──
        topBar?.setSiblingIndex(99);
        toolbar?.setSiblingIndex(99);
        // Lives label sits inside TopBar visually – keep it above the bar
        this.livesLabel?.node.setSiblingIndex(99);
        this.progressBar?.node.setSiblingIndex(99);
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

function _paintBg(node: Node, color: Color) {
    const ut = node.getComponent(UITransform);
    const w  = ut?.contentSize.width  ?? 750;
    const h  = ut?.contentSize.height ?? 100;
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();
    g.fillColor = color;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
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

function _paintTopBarBg(node: Node, top: Color, bottom: Color, accent: Color) {
    const ut = node.getComponent(UITransform);
    const w  = ut?.contentSize.width  ?? 750;
    const h  = ut?.contentSize.height ?? 100;
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();
    // Two-band fake gradient: lighter top half, darker bottom half
    g.fillColor = top;
    g.rect(-w / 2, 0, w, h / 2);
    g.fill();
    g.fillColor = bottom;
    g.rect(-w / 2, -h / 2, w, h / 2);
    g.fill();
    // Gold accent line at the bottom edge
    g.fillColor = accent;
    g.rect(-w / 2, -h / 2 - 1, w, 2);
    g.fill();
}

function _paintRoundedBg(node: Node, color: Color, r: number) {
    const ut = node.getComponent(UITransform);
    const w  = ut?.contentSize.width  ?? 150;
    const h  = ut?.contentSize.height ?? 120;
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();
}

function _bounce(btn: Node) {
    tween(btn).stop();
    btn.setScale(1, 1, 1);
    tween(btn)
        .to(0.08, { scale: new Vec3(0.88, 0.88, 1) })
        .to(0.12, { scale: new Vec3(1.0,  1.0,  1) })
        .start();
}

// Brief expand-and-settle used when a button toggles into an active state.
// Reads as a "glow up" alongside the bg color swap done by the caller.
function _glowPulse(btn: Node) {
    tween(btn).stop();
    btn.setScale(1, 1, 1);
    tween(btn)
        .to(0.12, { scale: new Vec3(1.18, 1.18, 1) })
        .to(0.18, { scale: new Vec3(1.0,  1.0,  1) })
        .start();
}

function _resetButton(btn: Node) {
    // Strip leftover Label children and the prefab/scene cc.Sprite — both
    // can render over the icon or quietly eat touches. We keep our own
    // `__bg__` and `__icon-*__` children if they already exist (they're
    // re-painted/sized by _paintRoundedBg / _attachIcon below).
    btn.children.slice().forEach(c => {
        if (c.name.startsWith('__bg__') || c.name.startsWith('__icon-')) return;
        c.removeFromParent();
        c.destroy();
    });
    const sp = btn.getComponent(Sprite);
    if (sp) { sp.spriteFrame = null; sp.enabled = false; }
}

function _attachIcon(parent: Node | null | undefined, iconName: string,
                     size: number, x = 0, y = 0): Node | null {
    if (!parent) return null;
    let icon = parent.getChildByName(`__icon-${iconName}__`);
    if (!icon) {
        icon = createIconNode(iconName, size);
        icon.name = `__icon-${iconName}__`;
        parent.addChild(icon);
    } else {
        icon.getComponent(UITransform)?.setContentSize(size, size);
    }
    icon.setPosition(x, y, 0);
    return icon;
}

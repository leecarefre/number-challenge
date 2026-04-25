import {
    _decorator, Component, Label, Node, ScrollView, Prefab, instantiate,
    Button, Color, Graphics, Sprite, Camera, UITransform, UIOpacity,
    Layout, Size,
} from 'cc';
import { createIconNode } from './IconUtil';
import { LevelCard } from './LevelCard';
import { DataManager } from '../core/DataManager';
import { GameManager } from '../core/GameManager';
import { AudioManager } from '../core/AudioManager';
import { AdManager } from '../core/AdManager';
import { I18nManager } from '../core/I18nManager';

const { ccclass, property } = _decorator;

@ccclass('HomeUI')
export class HomeUI extends Component {
    @property(Label)    staminaLabel: Label | null = null;
    @property(Label)    staminaTimerLabel: Label | null = null;
    @property(ScrollView) levelScrollView: ScrollView | null = null;
    @property(Prefab)   levelCardPrefab: Prefab | null = null;
    @property(Node)     signInDot: Node | null = null;
    @property(Node)     signInDialog: Node | null = null;
    @property(Node)     settingsPanel: Node | null = null;
    @property(Node)     noStaminaDialog: Node | null = null;
    @property(Node)     noLivesDialog: Node | null = null;
    @property(Node)     allClearDialog: Node | null = null;

    private _timerInterval: number = 0;
    private _unregisterLang: (() => void) | null = null;

    onLoad() {
        AudioManager.inst.playBGM('menu_bgm');

        // Bind buttons by scene name — no @property wiring needed
        this.node.getChildByName('SignInBtn')
            ?.on(Button.EventType.CLICK, this.onSignInBtn, this);
        this.node.getChildByName('FreeStaminaBtn')
            ?.on(Button.EventType.CLICK, this.onFreeStaminaBtn, this);

        // TopBar: 3rd child is SettingsBtn
        const topBar = this.node.getChildByName('TopBar');
        topBar?.children[2]?.on(Button.EventType.CLICK, this.onSettingsBtn, this);

        // BottomNav: 1st child = Home tab, 2nd child = Shop tab
        const bottomNav = this.node.getChildByName('BottomNav');
        bottomNav?.children[1]?.on(Button.EventType.CLICK, this.onShopBtn, this);

        // NoStaminaDialog / NoLivesDialog: no scripts, bind close from here
        this.noStaminaDialog?.children[0]?.on(Button.EventType.CLICK,
            () => { if (this.noStaminaDialog) this.noStaminaDialog.active = false; }, this);
        this.noLivesDialog?.children[0]?.on(Button.EventType.CLICK,
            () => { if (this.noLivesDialog) this.noLivesDialog.active = false; }, this);
    }

    start() {
        this._applyTheme();
        this._buildLevelCards();
        this._updateStamina();
        this._startStaminaTimer();
        this._checkSignIn();
        this._checkAllClear();
    }

    onDestroy() {
        clearInterval(this._timerInterval);
        this._unregisterLang?.();
    }

    // ─── Theme ─────────────────────────────────────────────────────────────────

    private _applyTheme() {
        const C_NAV = new Color(16, 16, 34, 245);

        // ── Scene background – fills the actual Canvas runtime size ──
        const cs = this.node.getComponent(UITransform)?.contentSize;
        const sw = cs?.width  ?? 750;
        const sh = cs?.height ?? 1334;
        const camera = (this.node.getChildByName('Camera')
                     ?? this.node.parent?.getChildByName('Camera'))?.getComponent(Camera);
        if (camera) camera.clearColor = new Color(6, 8, 22, 255);

        const bg = this.node.getChildByName('Background');
        if (bg) {
            _paintSceneBg(bg, sw, sh);
            bg.setSiblingIndex(0); // furthest back
        }

        // TopBar / BottomNav – cache child refs BEFORE _paintBg inserts __bg__
        const topBar      = this.node.getChildByName('TopBar');
        const bottomNav   = this.node.getChildByName('BottomNav');
        const settingsBtn = topBar?.children[2] ?? null;
        const homeTab     = bottomNav?.children[0] ?? null;
        const shopTab     = bottomNav?.children[1] ?? null;

        if (topBar) {
            topBar.setPosition(0, 617, 0); // flush to top: 667 - 50
            _paintBg(topBar, C_NAV);
        }
        if (bottomNav) {
            bottomNav.setPosition(0, -617, 0); // flush to bottom: -667 + 50
            _paintBg(bottomNav, C_NAV);
        }

        // SignInBtn – reposition, gold pill
        const signInBtn = this.node.getChildByName('SignInBtn');
        if (signInBtn) {
            signInBtn.setPosition(290, 490, 0);
            _paintPill(signInBtn, new Color(255, 175, 35, 255), 128, 52);
        }

        // FreeStaminaBtn – reposition, blue pill
        const freeBtn = this.node.getChildByName('FreeStaminaBtn');
        if (freeBtn) {
            freeBtn.setPosition(290, 424, 0);
            _paintPill(freeBtn, new Color(60, 150, 255, 255), 148, 52);
        }

        // ── Resize ScrollView to fit between TopBar bottom (y=567) and BottomNav top (y=-567) ──
        // Available band: height ~1110, center y=0
        const sv = this.levelScrollView?.node;
        if (sv) {
            const ut = sv.getComponent(UITransform);
            if (ut) ut.setContentSize(750, 1100);
            sv.setPosition(0, 0, 0);
        }

        // ── Render order (call from BACK to FRONT; setSiblingIndex(99) moves to last)
        // ScrollView < SignInBtn / FreeStaminaBtn < TopBar / BottomNav (topmost)
        signInBtn?.setSiblingIndex(99);
        freeBtn?.setSiblingIndex(99);
        topBar?.setSiblingIndex(99);
        bottomNav?.setSiblingIndex(99);

        // Tint stamina labels for dark background
        if (this.staminaLabel)
            this.staminaLabel.color      = new Color(230, 235, 255, 255);
        if (this.staminaTimerLabel)
            this.staminaTimerLabel.color = new Color(140, 155, 210, 255);

        // ── Replace label "?" placeholders with sprite icons ──
        const i18n = I18nManager.inst;

        // Settings (gear) icon on TopBar.SettingsBtn (cached above)
        _hideLabel(settingsBtn);
        _attachIcon(settingsBtn, 'settings', 40);

        // SignIn calendar icon
        _hideLabel(signInBtn);
        _attachIcon(signInBtn, 'calendar', 36);

        // FreeStamina lightning icon + "+1" text
        _hideLabel(freeBtn);
        _attachIcon(freeBtn, 'energy', 32, -34);
        _attachText(freeBtn, '+1', 26, new Color(255, 255, 255, 255), 18);

        // BottomNav tabs: icon (left) + label (right) – use cached refs.
        // Register Labels with I18nManager so they auto-refresh on language switch.
        const homeLbl = _setTabIcon(homeTab, 'home', new Color(255, 200, 50, 255));
        const shopLbl = _setTabIcon(shopTab, 'cart', new Color(180, 190, 220, 255));
        if (homeLbl) i18n.registerLabel(homeLbl, 'btn_home');
        if (shopLbl) i18n.registerLabel(shopLbl, 'btn_shop');

        // Stamina timer string is dynamic (uses params), so refresh via callback.
        this._unregisterLang?.();
        this._unregisterLang = i18n.registerCallback(() => this._updateStamina());
    }

    // ─── Stamina display ───────────────────────────────────────────────────────

    private _updateStamina() {
        const d = DataManager.inst.data;
        if (this.staminaLabel) {
            this.staminaLabel.string = `${d.stamina}/5`;
        }
        const ms = DataManager.inst.staminaNextRecoverMs();
        if (this.staminaTimerLabel) {
            if (ms <= 0) {
                this.staminaTimerLabel.string = I18nManager.inst.t('stamina_full');
            } else {
                const mins = Math.ceil(ms / 60000);
                this.staminaTimerLabel.string = I18nManager.inst.t('stamina_recover_in', {
                    time: `${mins}m`,
                });
            }
        }
    }

    private _startStaminaTimer() {
        this._timerInterval = setInterval(() => this._updateStamina(), 10000) as any;
    }

    // ─── Level cards ───────────────────────────────────────────────────────────

    private _buildLevelCards() {
        if (!this.levelScrollView || !this.levelCardPrefab) return;
        const content = this.levelScrollView.content;
        if (!content) return;
        content.removeAllChildren();

        // ── Auto-fit grid: 3 cards per row, evenly distributed across ScrollView width ──
        const svW = this.levelScrollView.node.getComponent(UITransform)?.contentSize.width ?? 750;
        const COLS = 3;
        const CARD = 200; // matches LevelCard.CARD_W/H
        // Distribute the leftover horizontal space as: pad + card + gap + card + gap + card + pad
        // i.e. (COLS+1) equal slots of size `gap`.
        const gapX = Math.max(8, Math.floor((svW - COLS * CARD) / (COLS + 1)));

        let layout = content.getComponent(Layout);
        if (!layout) layout = content.addComponent(Layout);
        layout.type               = Layout.Type.GRID;
        layout.startAxis          = Layout.AxisDirection.HORIZONTAL;
        layout.resizeMode         = Layout.ResizeMode.CONTAINER;
        layout.horizontalDirection = Layout.HorizontalDirection.LEFT_TO_RIGHT;
        layout.cellSize           = new Size(CARD, CARD);
        layout.spacingX           = gapX;
        layout.spacingY           = gapX;
        layout.paddingLeft        = gapX;
        layout.paddingRight       = gapX;
        layout.paddingTop         = gapX;
        layout.paddingBottom      = gapX;

        // Match content width to ScrollView so the grid centers correctly.
        const contentUt = content.getComponent(UITransform);
        if (contentUt) contentUt.width = svW;

        const data = DataManager.inst.data;
        for (let i = 1; i <= 20; i++) {
            const card = instantiate(this.levelCardPrefab);
            const lc = card.getComponent(LevelCard) ?? card.addComponent(LevelCard);
            lc.setup(i, data.levelStars[i] ?? 0, i <= data.unlockedLevel);
            content.addChild(card);
        }
    }

    // ─── Level entry ───────────────────────────────────────────────────────────

    enterLevel(level: number) {
        AudioManager.inst.playSFX('button_click');
        const data = DataManager.inst.data;

        // Tutorial level never costs stamina or lives
        if (level === 1) {
            GameManager.inst.setCurrentLevel(1, false);
            GameManager.inst.loadScene('Game');
            return;
        }

        if (data.lives <= 0) {
            if (this.noLivesDialog) {
                this.noLivesDialog.active = true;
                this.noLivesDialog.setSiblingIndex(99);
            }
            return;
        }
        if (data.stamina <= 0) {
            if (this.noStaminaDialog) {
                this.noStaminaDialog.active = true;
                this.noStaminaDialog.setSiblingIndex(99);
            }
            return;
        }

        DataManager.inst.consumeStamina();
        GameManager.inst.setCurrentLevel(level);
        GameManager.inst.loadScene('Game');
    }

    // ─── Sign-in ───────────────────────────────────────────────────────────────

    private _checkSignIn() {
        const canSign = DataManager.inst.canSignInToday();
        if (this.signInDot) this.signInDot.active = canSign;
        if (canSign && this.signInDialog) {
            this.scheduleOnce(() => {
                if (this.signInDialog) {
                    this.signInDialog.active = true;
                    this.signInDialog.setSiblingIndex(99);
                }
            }, 0.5);
        }
    }

    onSignInBtn() {
        AudioManager.inst.playSFX('button_click');
        if (this.signInDialog) {
            this.signInDialog.active = true;
            this.signInDialog.setSiblingIndex(99);
        }
    }

    // ─── Settings ──────────────────────────────────────────────────────────────

    onSettingsBtn() {
        AudioManager.inst.playSFX('button_click');
        if (this.settingsPanel) {
            this.settingsPanel.active = true;
            this.settingsPanel.setSiblingIndex(99); // above chrome
        }
    }

    // ─── Shop ──────────────────────────────────────────────────────────────────

    onShopBtn() {
        AudioManager.inst.playSFX('button_click');
        GameManager.inst.loadScene('Shop');
    }

    // ─── Free stamina ad ──────────────────────────────────────────────────────

    async onFreeStaminaBtn() {
        AudioManager.inst.playSFX('button_click');
        const watched = await AdManager.inst.showStaminaAd();
        if (watched) {
            DataManager.inst.addStamina(1);
            this._updateStamina();
        }
    }

    // ─── All clear ─────────────────────────────────────────────────────────────

    private _checkAllClear() {
        const data = DataManager.inst.data;
        if (data.unlockedLevel > 20 && this.allClearDialog) {
            // Show once: check a flag we can reuse via levelStars sentinel
            if (!data.levelStars[-1]) {
                (DataManager.inst.data.levelStars as any)[-1] = 1;
                DataManager.inst.save();
                this.scheduleOnce(() => {
                    if (this.allClearDialog) {
                        this.allClearDialog.active = true;
                        this.allClearDialog.setSiblingIndex(99);
                    }
                }, 0.5);
            }
        }
    }
}

// ── Helper painters ───────────────────────────────────────────────────────────
// Sprite and Graphics can't coexist on the same node, so we paint onto a
// dedicated child node (__bg__) rendered at sibling-index 0 (behind all others).

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
    const h  = ut?.contentSize.height ?? 108;
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();
    g.fillColor = color;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
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

    // Bands use fillRect (self-contained, no path accumulation). Cocos Graphics
    // has no beginPath(), so rect()+fill() in a loop re-fills the accumulated
    // path with the latest color and leaves a solid block.
    const TOP   = [ 6,  8, 22];
    const MID   = [22, 24, 52];
    const BANDS = 36;
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

    // Stars share one color: build the whole path then fill once.
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

function _paintPill(node: Node, color: Color, w: number, h: number) {
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
}

// ── Icon attachment helpers ───────────────────────────────────────────────────

function _hideLabel(node: Node | null | undefined) {
    if (!node) return;
    node.children.forEach(c => {
        const lbl = c.getComponent(Label);
        if (lbl) lbl.string = '';
    });
}

function _attachIcon(parent: Node | null | undefined, iconName: string,
                     size: number, x = 0, y = 0): Node | null {
    if (!parent) return null;
    // Reuse if already attached
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

function _attachText(parent: Node | null | undefined, text: string, size: number,
                     color: Color, x = 0, y = 0): Node | null {
    if (!parent) return null;
    const name = `__txt-${text}__`;
    let n = parent.getChildByName(name);
    if (!n) {
        n = new Node(name);
        n.addComponent(UITransform).setContentSize(120, size + 12);
        const lbl = n.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = size;
        lbl.color = color;
        lbl.horizontalAlign = 1;
        parent.addChild(n);
    }
    n.setPosition(x, y, 0);
    return n;
}

function _setTabIcon(tab: Node | null | undefined, iconName: string,
                     textColor: Color): Label | null {
    if (!tab) return null;
    // Repurpose existing scene label – caller registers it with I18nManager.
    const existingLbl = tab.children[0]?.getComponent(Label) ?? null;
    if (existingLbl) {
        existingLbl.color = textColor;
        existingLbl.fontSize = 22;
        tab.children[0].setPosition(18, 0, 0);
    }
    _attachIcon(tab, iconName, 36, -42, 0);
    return existingLbl;
}

import {
    _decorator, Component, Label, Node, ScrollView, Prefab, instantiate,
    Button, Color, Graphics, Sprite, SpriteFrame, Camera, UITransform, UIOpacity,
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
    @property(SpriteFrame) homeBgFrame: SpriteFrame | null = null;
    @property(SpriteFrame) homeTabIconFrame: SpriteFrame | null = null;
    @property(SpriteFrame) shopTabIconFrame: SpriteFrame | null = null;
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
        AudioManager.inst.playBGM('game_bgm');

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
        const C_NAV = new Color(182, 97, 62, 245);  // #B6613E

        // ── Scene background – fills the actual Canvas runtime size ──
        const cs = this.node.getComponent(UITransform)?.contentSize;
        const sw = cs?.width  ?? 750;
        const sh = cs?.height ?? 1334;
        const camera = (this.node.getChildByName('Camera')
                     ?? this.node.parent?.getChildByName('Camera'))?.getComponent(Camera);
        if (camera) camera.clearColor = new Color(242, 240, 227, 255);

        const bg = this.node.getChildByName('Background');
        if (bg) {
            if (this.homeBgFrame) {
                const imgW = this.homeBgFrame.width;
                const imgH = this.homeBgFrame.height;
                const scale = Math.max(sw / imgW, sh / imgH);
                const ut = bg.getComponent(UITransform) ?? bg.addComponent(UITransform);
                ut.setContentSize(imgW * scale, imgH * scale);
                const sp = bg.getComponent(Sprite) ?? bg.addComponent(Sprite);
                sp.color = new Color(255, 255, 255, 255);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                sp.spriteFrame = this.homeBgFrame;
            } else {
                _paintSceneBg(bg, sw, sh);
            }
            bg.setSiblingIndex(0);
        }

        // TopBar / BottomNav – cache child refs BEFORE _paintBg inserts __bg__
        const topBar      = this.node.getChildByName('TopBar');
        const bottomNav   = this.node.getChildByName('BottomNav');
        const settingsBtn = topBar?.children[2] ?? null;
        const homeTab     = bottomNav?.children[0] ?? null;
        const shopTab     = bottomNav?.children[1] ?? null;

        if (topBar) {
            topBar.setPosition(0, 617, 0); // flush to top: 667 - 50
        }
        if (bottomNav) {
            bottomNav.setPosition(0, -617, 0); // flush to bottom: -667 + 50
        }

        // SignInBtn – reposition, terracotta pill
        const signInBtn = this.node.getChildByName('SignInBtn');
        if (signInBtn) {
            signInBtn.setPosition(290, 490, 0);
            _paintPill(signInBtn, new Color(182, 97, 62, 255), 128, 52);
        }

        // FreeStaminaBtn – reposition, darker terracotta pill
        const freeBtn = this.node.getChildByName('FreeStaminaBtn');
        if (freeBtn) {
            freeBtn.setPosition(290, 424, 0);
            _paintPill(freeBtn, new Color(150, 75, 45, 255), 148, 52);
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

        // Tint stamina labels for light background
        if (this.staminaLabel) {
            this.staminaLabel.color = new Color( 61,  43, 31, 255);
            _attachIcon(this.staminaLabel.node, 'energy', 28, -52, 0);
        }
        if (this.staminaTimerLabel)
            this.staminaTimerLabel.color = new Color(139,  94, 74, 255);

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
        const C_TAB_ACTIVE   = new Color(182,  97,  62, 255);  // terracotta text on milky active block
        const C_TAB_INACTIVE = new Color(242, 240, 227, 255);  // milky text on terracotta inactive block
        const C_TAB_BG       = new Color(222, 218, 205, 255);  // active block: slightly deeper than bg
        const C_TAB_RED      = new Color(182,  97,  62, 245);  // inactive block: terracotta
        const homeLbl = _setTabIcon(homeTab, 'home', C_TAB_ACTIVE,   this.homeTabIconFrame);
        const shopLbl = _setTabIcon(shopTab, 'cart', C_TAB_INACTIVE, this.shopTabIconFrame);
        if (homeLbl) i18n.registerLabel(homeLbl, 'btn_home');
        if (shopLbl) i18n.registerLabel(shopLbl, 'btn_shop');
        // Two connected full-width rectangles: home = active (milky), shop = inactive (terracotta)
        _paintTabBg(homeTab, C_TAB_BG,  375, 100, 0);
        _paintTabBg(shopTab, C_TAB_RED, 375, 100, 0);

        // Stamina timer string is dynamic (uses params), so refresh via callback.
        this._unregisterLang?.();
        this._unregisterLang = i18n.registerCallback(() => this._updateStamina());
    }

    // ─── Stamina display ───────────────────────────────────────────────────────

    private _updateStamina() {
        const d = DataManager.inst.data;
        if (this.staminaLabel) {
            if (DataManager.inst.isUnlimitedStaminaActive()) {
                this.staminaLabel.string = '∞';
            } else {
                this.staminaLabel.string = `${d.stamina}`;
            }
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

function _paintTabBg(node: Node | null | undefined, color: Color | null,
                     w: number, h: number, r: number) {
    if (!node) return;
    node.getComponent(UITransform)?.setContentSize(w, h);
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();
    if (color) {
        g.fillColor = color;
        if (r > 0) g.roundRect(-w / 2, -h / 2, w, h, r);
        else        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
    }
}

function _attachSpriteIcon(parent: Node | null | undefined, frame: SpriteFrame,
                          size: number, x = 0, y = 0): Node | null {
    if (!parent) return null;
    const name = '__tab-sprite__';
    let icon = parent.getChildByName(name);
    if (!icon) {
        icon = new Node(name);
        icon.addComponent(UITransform).setContentSize(size, size);
        const sp = icon.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = frame;
        parent.addChild(icon);
    } else {
        icon.getComponent(UITransform)?.setContentSize(size, size);
        const sp = icon.getComponent(Sprite);
        if (sp) sp.spriteFrame = frame;
    }
    icon.setPosition(x, y, 0);
    return icon;
}

function _setTabIcon(tab: Node | null | undefined, iconName: string,
                     textColor: Color, frame: SpriteFrame | null = null): Label | null {
    if (!tab) return null;
    // Repurpose existing scene label – caller registers it with I18nManager.
    const existingLbl = tab.children[0]?.getComponent(Label) ?? null;
    if (existingLbl) {
        existingLbl.color = textColor;
        existingLbl.fontSize = 22;
        tab.children[0].setPosition(18, 0, 0);
    }
    if (frame) _attachSpriteIcon(tab, frame, 36, -42, 0);
    else        _attachIcon(tab, iconName, 36, -42, 0);
    return existingLbl;
}

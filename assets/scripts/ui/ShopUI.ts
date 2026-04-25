import {
    _decorator, Component, Label, Node, Button,
    Color, Graphics, Sprite, Camera, UITransform, UIOpacity,
} from 'cc';
import { createIconNode } from './IconUtil';
import { DataManager } from '../core/DataManager';
import { AdManager } from '../core/AdManager';
import { AudioManager } from '../core/AudioManager';
import { GameManager } from '../core/GameManager';
import { I18nManager } from '../core/I18nManager';

const { ccclass, property } = _decorator;

const DAILY_ITEM_LIMIT = 3;
const STORAGE_KEY_SHOP_DATE   = 'shop_date';
const STORAGE_KEY_ITEM_COUNTS = 'shop_item_counts';

@ccclass('ShopUI')
export class ShopUI extends Component {
    @property(Label) staminaLabel: Label | null = null;
    @property(Label) hintCountLabel: Label | null = null;
    @property(Label) rangeHintCountLabel: Label | null = null;

    private _todayCounts: Record<string, number> = { hint: 0, rangeHint: 0 };
    private _unregisterLang: (() => void) | null = null;

    onLoad() {
        this._wireButtons();
    }

    onDestroy() {
        this._unregisterLang?.();
    }

    start() {
        this._applyTheme();
        this._loadDailyCounts();
        this._updateStamina();
        this._updateItemLabels();
    }

    private _wireButtons() {
        // Header has no back button – Header.children[1] is the stamina display.
        // Navigate home via BottomNav Home tab instead.

        // Daily items
        this.node.getChildByName('DailyItemsSection')?.getChildByName('HintAdBtn')
            ?.on(Button.EventType.CLICK, this.onBuyHint, this);
        this.node.getChildByName('DailyItemsSection')?.getChildByName('RangeHintAdBtn')
            ?.on(Button.EventType.CLICK, this.onBuyRangeHint, this);

        // Stamina section: children[1] = +20, children[2] = +50
        const stam = this.node.getChildByName('StaminaSection');
        stam?.children[1]?.on(Button.EventType.CLICK, this.onBuyStamina20, this);
        stam?.children[2]?.on(Button.EventType.CLICK, this.onBuyStamina50, this);

        // BottomNav: children[0] = Home, children[1] = Shop (current)
        const nav = this.node.getChildByName('BottomNav');
        nav?.children[0]?.on(Button.EventType.CLICK, this.onHomeBtn, this);
    }

    private _applyTheme() {
        // ── Hide orphan "New Node" left over in the scene ──
        // It references a deleted script class (UUID 2f14fK4S9ZPK7kDhEDr9VXH that no
        // longer exists in the codebase), so its Button + Label children just render
        // "label" placeholders on top of the real UI. The Background "New Node" has
        // 0 children, so we filter by children count.
        this.node.children.forEach(c => {
            if (c.name === 'New Node' && c.children.length >= 2) {
                c.active = false;
            }
        });

        const C_NAV      = new Color( 16,  16,  34, 245);
        const C_SECTION  = new Color( 26,  28,  52, 230);
        const C_BTN      = new Color( 80, 160, 255, 255);
        const C_BTN_GOLD = new Color(220, 160,  30, 255);
        const C_TXT      = new Color(220, 230, 255, 255);
        const C_TITLE    = new Color(255, 200,  50, 255);

        // Canvas background – Shop scene has no Background node, create one.
        // Use the Canvas's runtime size so the gradient fills the actual viewport.
        const cs = this.node.getComponent(UITransform)?.contentSize;
        const sw = cs?.width  ?? 750;
        const sh = cs?.height ?? 1334;
        const camera = (this.node.getChildByName('Camera')
                     ?? this.node.parent?.getChildByName('Camera'))?.getComponent(Camera);
        if (camera) camera.clearColor = new Color(6, 8, 22, 255);

        let cBg = this.node.getChildByName('Background');
        if (!cBg) {
            cBg = new Node('Background');
            cBg.addComponent(UITransform);
            this.node.addChild(cBg);
        }
        cBg.setSiblingIndex(0);
        _paintSceneBg(cBg, sw, sh);

        // Cache all child refs BEFORE painting (paint adds __bg__ at index 0)
        const header   = this.node.getChildByName('Header');
        const nav      = this.node.getChildByName('BottomNav');
        const dailySec = this.node.getChildByName('DailyItemsSection');
        const stam     = this.node.getChildByName('StaminaSection');

        const headerTitleNode = header?.children[0] ?? null;
        const headerStamNode  = header?.children[1] ?? null; // "? 5/5" stamina display
        const headerTitleLbl  = headerTitleNode?.getComponent(Label) ?? null;
        const headerStamLbl   = headerStamNode?.getComponent(Label) ?? null;
        const dailyTitleLbl   = dailySec?.children[0]?.getComponent(Label) ?? null;
        const stamTitleLbl    = stam?.children[0]?.getComponent(Label) ?? null;
        const stam20Btn       = stam?.children[1] ?? null;
        const stam50Btn       = stam?.children[2] ?? null;
        const homeTab         = nav?.children[0] ?? null;
        const shopTab         = nav?.children[1] ?? null;

        // ── Header redesign: 750×100 with two-band gradient + gold accent line ──
        if (header) {
            const hUt = header.getComponent(UITransform);
            if (hUt) hUt.setContentSize(750, 100);
            header.setPosition(0, 617, 0); // flush top
            _paintHeaderBg(header, C_NAV, new Color(8, 8, 22, 250), C_TITLE);

            // Title centered, bigger and bolder
            if (headerTitleNode) headerTitleNode.setPosition(0, 0, 0);
            if (headerTitleLbl) {
                headerTitleLbl.color    = C_TITLE;
                headerTitleLbl.fontSize = 36;
                headerTitleLbl.isBold   = true;
            }

            // Stamina display: ⚡ icon + "X/5" on right side
            if (headerStamNode) {
                headerStamNode.setPosition(280, 0, 0);
                if (headerStamLbl) {
                    headerStamLbl.color    = C_TXT;
                    headerStamLbl.fontSize = 26;
                    headerStamLbl.isBold   = true;
                    // _updateStamina() overrides string at runtime, but clear scene "?" early
                    if (headerStamLbl.string.includes('?')) headerStamLbl.string = '';
                }
                _attachIcon(headerStamNode, 'energy', 36, -50, 0);
            }
        }

        // BottomNav (flush bottom: y=-667 + 50)
        if (nav) {
            nav.setPosition(0, -617, 0);
            _paintBg(nav, C_NAV);
        }

        // Section backgrounds
        [dailySec, stam].forEach(s => {
            if (!s) return;
            _paintRoundedFixed(s, C_SECTION, 660, 260, 20);
        });
        if (dailyTitleLbl) { dailyTitleLbl.color = C_TITLE; dailyTitleLbl.isBold = true; }
        if (stamTitleLbl)  { stamTitleLbl.color  = C_TITLE; stamTitleLbl.isBold  = true; }

        // Style action buttons in sections
        if (dailySec) {
            this._styleActionBtn(dailySec.getChildByName('HintAdBtn'),     C_BTN_GOLD, C_TXT);
            this._styleActionBtn(dailySec.getChildByName('RangeHintAdBtn'), C_BTN_GOLD, C_TXT);
        }
        this._styleActionBtn(stam20Btn, C_BTN, C_TXT);
        this._styleActionBtn(stam50Btn, C_BTN, C_TXT);

        // Stamina label color
        if (this.staminaLabel)        this.staminaLabel.color        = C_TXT;
        if (this.hintCountLabel)      this.hintCountLabel.color      = C_TXT;
        if (this.rangeHintCountLabel) this.rangeHintCountLabel.color = C_TXT;

        // ── Replace scene-stored "?" placeholders with text + sprite icons ──
        const i18n = I18nManager.inst;

        if (headerTitleLbl) i18n.registerLabel(headerTitleLbl, 'shop_title');

        if (dailySec) {
            if (dailyTitleLbl) i18n.registerLabel(dailyTitleLbl, 'shop_daily_items');
            const hintBtn  = dailySec.getChildByName('HintAdBtn');
            const rangeBtn = dailySec.getChildByName('RangeHintAdBtn');
            _hideChildLabels(hintBtn);
            _hideChildLabels(rangeBtn);
            _attachIcon(hintBtn,  'hint',  44);
            _attachIcon(rangeBtn, 'range', 44);
        }

        if (stam) {
            if (stamTitleLbl) i18n.registerLabel(stamTitleLbl, 'shop_stamina');
            _hideChildLabels(stam20Btn);
            _hideChildLabels(stam50Btn);
            _attachIcon(stam20Btn, 'energy', 36, -28);
            _attachText(stam20Btn, '+20', 24, C_TXT, 22);
            _attachIcon(stam50Btn, 'energy', 36, -28);
            _attachText(stam50Btn, '+50', 24, C_TXT, 22);
        }

        // BottomNav tabs – use cached refs
        const homeLbl = _setTabIcon(homeTab, 'home', new Color(180, 190, 220, 255));
        const shopLbl = _setTabIcon(shopTab, 'cart', new Color(255, 200, 50, 255));
        if (homeLbl) i18n.registerLabel(homeLbl, 'btn_home');
        if (shopLbl) i18n.registerLabel(shopLbl, 'btn_shop');

        // Daily-limit labels use params – refresh via callback.
        this._unregisterLang?.();
        this._unregisterLang = i18n.registerCallback(() => this._updateItemLabels());

        // ── Render order: Header / BottomNav must always paint on top ──
        header?.setSiblingIndex(99);
        nav?.setSiblingIndex(99);
    }

    private _styleActionBtn(btn: Node | null, bg: Color, txt: Color) {
        if (!btn) return;
        _paintRoundedBg(btn, bg, 16);
        const lbl = btn.getComponentInChildren(Label);
        if (lbl) lbl.color = txt;
    }

    private _updateStamina() {
        if (this.staminaLabel) {
            this.staminaLabel.string = `${DataManager.inst.data.stamina}/5`;
        }
    }

    private _loadDailyCounts() {
        const today = new Date().toISOString().slice(0, 10);
        const saved = localStorage.getItem(STORAGE_KEY_SHOP_DATE);
        if (saved !== today) {
            this._todayCounts = { hint: 0, rangeHint: 0 };
            localStorage.setItem(STORAGE_KEY_SHOP_DATE, today);
            localStorage.setItem(STORAGE_KEY_ITEM_COUNTS, JSON.stringify(this._todayCounts));
        } else {
            try {
                this._todayCounts = JSON.parse(localStorage.getItem(STORAGE_KEY_ITEM_COUNTS) ?? '{}');
            } catch {
                this._todayCounts = { hint: 0, rangeHint: 0 };
            }
        }
    }

    private _saveDailyCounts() {
        localStorage.setItem(STORAGE_KEY_ITEM_COUNTS, JSON.stringify(this._todayCounts));
    }

    private _updateItemLabels() {
        const i18n = I18nManager.inst;
        if (this.hintCountLabel) {
            this.hintCountLabel.string = i18n.t('shop_daily_limit', {
                used: this._todayCounts.hint ?? 0,
                max: DAILY_ITEM_LIMIT,
            });
        }
        if (this.rangeHintCountLabel) {
            this.rangeHintCountLabel.string = i18n.t('shop_daily_limit', {
                used: this._todayCounts.rangeHint ?? 0,
                max: DAILY_ITEM_LIMIT,
            });
        }
    }

    async onBuyHint() {
        AudioManager.inst.playSFX('button_click');
        if ((this._todayCounts.hint ?? 0) >= DAILY_ITEM_LIMIT) return;
        const watched = await AdManager.inst.showItemAd();
        if (!watched) return;
        DataManager.inst.addItem('hint', 1);
        this._todayCounts.hint = (this._todayCounts.hint ?? 0) + 1;
        this._saveDailyCounts();
        this._updateItemLabels();
    }

    async onBuyRangeHint() {
        AudioManager.inst.playSFX('button_click');
        if ((this._todayCounts.rangeHint ?? 0) >= DAILY_ITEM_LIMIT) return;
        const watched = await AdManager.inst.showItemAd();
        if (!watched) return;
        DataManager.inst.addItem('rangeHint', 1);
        this._todayCounts.rangeHint = (this._todayCounts.rangeHint ?? 0) + 1;
        this._saveDailyCounts();
        this._updateItemLabels();
    }

    async onBuyStamina20() {
        AudioManager.inst.playSFX('button_click');
        const watched = await AdManager.inst.showStaminaAd();
        if (!watched) return;
        DataManager.inst.addStamina(20);
        this._updateStamina();
    }

    async onBuyStamina50() {
        AudioManager.inst.playSFX('button_click');
        // Requires watching ad twice (simplified: just reward 50)
        const watched = await AdManager.inst.showStaminaAd();
        if (!watched) return;
        DataManager.inst.addStamina(50);
        this._updateStamina();
    }

    onHomeBtn() {
        AudioManager.inst.playSFX('button_click');
        GameManager.inst.loadScene('Home');
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
    const w  = ut?.contentSize.width  ?? 1280;
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

function _paintHeaderBg(node: Node, top: Color, bottom: Color, accent: Color) {
    const ut = node.getComponent(UITransform);
    const w  = ut?.contentSize.width  ?? 750;
    const h  = ut?.contentSize.height ?? 100;
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();
    g.fillColor = top;
    g.rect(-w / 2, 0, w, h / 2);
    g.fill();
    g.fillColor = bottom;
    g.rect(-w / 2, -h / 2, w, h / 2);
    g.fill();
    g.fillColor = accent;
    g.rect(-w / 2, -h / 2 - 1, w, 2);
    g.fill();
}

function _paintRoundedFixed(node: Node, color: Color, w: number, h: number, r: number) {
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();
}

function _paintRoundedBg(node: Node, color: Color, r: number) {
    const ut = node.getComponent(UITransform);
    const w  = ut?.contentSize.width  ?? 200;
    const h  = ut?.contentSize.height ?? 80;
    const bg = _bgChild(node);
    bg.getComponent(UITransform)!.setContentSize(w, h);
    const g = bg.getComponent(Graphics)!;
    g.clear();
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();
}

function _hideChildLabels(node: Node | null | undefined) {
    if (!node) return;
    node.children.forEach(c => {
        const lbl = c.getComponent(Label);
        if (lbl) lbl.string = '';
    });
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
    const existingLbl = tab.children[0]?.getComponent(Label) ?? null;
    if (existingLbl) {
        existingLbl.color = textColor;
        existingLbl.fontSize = 22;
        tab.children[0].setPosition(18, 0, 0);
    }
    _attachIcon(tab, iconName, 36, -42, 0);
    return existingLbl;
}

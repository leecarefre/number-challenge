import {
    _decorator, Component, Label, Node, Button,
    Color, Graphics, Sprite, SpriteFrame, Camera, UITransform, UIOpacity,
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
    @property(SpriteFrame) shopBgFrame: SpriteFrame | null = null;
    @property(SpriteFrame) homeTabIconFrame: SpriteFrame | null = null;
    @property(SpriteFrame) shopTabIconFrame: SpriteFrame | null = null;
    @property(Label) staminaLabel: Label | null = null;
    @property(Label) hintCountLabel: Label | null = null;
    @property(Label) rangeHintCountLabel: Label | null = null;

    private _todayCounts: Record<string, number> = { hint: 0, rangeHint: 0 };
    private _unregisterLang: (() => void) | null = null;
    private _unlimitedBtn: Node | null = null;
    private _stam50Btn: Node | null = null;

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

        const C_NAV      = new Color(182,  97,  62, 245);  // #B6613E
        const C_SECTION  = new Color(232, 227, 210, 230);
        const C_BTN      = new Color(182,  97,  62, 255);  // #B6613E
        const C_BTN_GOLD = new Color(150,  75,  45, 255);
        const C_TXT      = new Color( 61,  43,  31, 255);
        const C_TITLE    = new Color(242, 240, 227, 255);  // #F2F0E3 on terracotta nav

        // Canvas background – Shop scene has no Background node, create one.
        // Use the Canvas's runtime size so the gradient fills the actual viewport.
        const cs = this.node.getComponent(UITransform)?.contentSize;
        const sw = cs?.width  ?? 750;
        const sh = cs?.height ?? 1334;
        const camera = (this.node.getChildByName('Camera')
                     ?? this.node.parent?.getChildByName('Camera'))?.getComponent(Camera);
        if (camera) camera.clearColor = new Color(242, 240, 227, 255);

        let cBg = this.node.getChildByName('Background');
        if (!cBg) {
            cBg = new Node('Background');
            cBg.addComponent(UITransform);
            this.node.addChild(cBg);
        }
        cBg.setSiblingIndex(0);

        if (this.shopBgFrame) {
            const imgW = this.shopBgFrame.width;
            const imgH = this.shopBgFrame.height;
            const scale = Math.max(sw / imgW, sh / imgH);
            const ut = cBg.getComponent(UITransform)!;
            ut.setContentSize(imgW * scale, imgH * scale);
            const sp = cBg.getComponent(Sprite) ?? cBg.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.spriteFrame = this.shopBgFrame;
        } else {
            _paintSceneBg(cBg, sw, sh);
        }

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

            // Title centered, bigger and bolder
            if (headerTitleNode) headerTitleNode.setPosition(0, 0, 0);
            if (headerTitleLbl) {
                headerTitleLbl.color    = C_TXT;
                headerTitleLbl.fontSize = 36;
                headerTitleLbl.isBold   = true;
            }

            // Stamina display is shown above StaminaSection, not in header
            if (headerStamNode) headerStamNode.active = false;
        }

        // BottomNav (flush bottom: y=-667 + 50)
        if (nav) {
            nav.setPosition(0, -617, 0);
        }

        // Row card color: warm cream, lighter than section bg, used for all item/stamina rows
        const C_ROW  = new Color(252, 249, 242, 255);
        const C_PILL = new Color(182,  97,  62, 255);  // terracotta play pill

        // ── DailyItemsSection ──
        // h=226: title(40) + pad(12) + row(68) + gap(8) + row(68) + pad(30)
        if (dailySec) {
            _paintRoundedFixed(dailySec, C_SECTION, 660, 226, 20);
            dailySec.setPosition(0, 180, 0);
            dailyTitleLbl?.node.setPosition(0, 93, 0);

            const hintBtn  = dailySec.getChildByName('HintAdBtn');
            const rangeBtn = dailySec.getChildByName('RangeHintAdBtn');
            hintBtn?.getComponent(UITransform)?.setContentSize(600, 68);
            hintBtn?.setPosition(0, 27, 0);
            rangeBtn?.getComponent(UITransform)?.setContentSize(600, 68);
            rangeBtn?.setPosition(0, -51, 0);
            _paintRoundedBg(hintBtn,  C_ROW, 14);
            _paintRoundedBg(rangeBtn, C_ROW, 14);
        }

        // ── StaminaSection ──
        // h=310: title(40) + pad(13) + 3×row(68) + 2×gap(8) + pad(31)
        if (stam) {
            _paintRoundedFixed(stam, C_SECTION, 660, 310, 20);
            stam.setPosition(0, -118, 0);
            stamTitleLbl?.node.setPosition(0, 125, 0);
        }
        stam20Btn?.getComponent(UITransform)?.setContentSize(600, 68);
        stam20Btn?.setPosition(0, 62, 0);
        stam50Btn?.getComponent(UITransform)?.setContentSize(600, 68);
        stam50Btn?.setPosition(0, -14, 0);
        if (stam) {
            let ub = stam.getChildByName('__stam-unlim__');
            if (!ub) {
                ub = new Node('__stam-unlim__');
                ub.addComponent(UITransform).setContentSize(600, 68);
                ub.addComponent(Button);
                stam.addChild(ub);
                ub.on(Button.EventType.CLICK, this.onBuyUnlimitedStamina, this);
            }
            ub.setPosition(0, -90, 0);
            this._unlimitedBtn = ub;
        }
        this._stam50Btn = stam50Btn;
        _paintRoundedBg(stam20Btn,          C_ROW, 14);
        _paintRoundedBg(stam50Btn,          C_ROW, 14);
        _paintRoundedBg(this._unlimitedBtn, C_ROW, 14);

        if (dailyTitleLbl) { dailyTitleLbl.color = C_TXT; dailyTitleLbl.isBold = true; }
        if (stamTitleLbl)  { stamTitleLbl.color  = C_TXT; stamTitleLbl.isBold  = true; }

        // Stamina label above StaminaSection: add energy icon, no extra text
        if (this.staminaLabel) {
            this.staminaLabel.color  = new Color(61, 43, 31, 255);
            this.staminaLabel.isBold = true;
            _attachIcon(this.staminaLabel.node, 'energy', 28, -28, 0);
        }

        // ── Icons, text and play pills ──
        const i18n   = I18nManager.inst;
        const C_NAME = new Color( 61,  43,  31, 255);   // dark brown for item names
        const C_SUB  = new Color(160, 120,  90, 200);   // muted brown for secondary text

        if (headerTitleLbl) i18n.registerLabel(headerTitleLbl, 'shop_title');

        if (dailySec) {
            if (dailyTitleLbl) i18n.registerLabel(dailyTitleLbl, 'shop_daily_items');
            const hintBtn  = dailySec.getChildByName('HintAdBtn');
            const rangeBtn = dailySec.getChildByName('RangeHintAdBtn');
            _clearAllLabels(hintBtn);
            _clearAllLabels(rangeBtn);

            // Layout: [icon x=-215] — [count x=10] — [▶btn x=215]
            _attachIcon(hintBtn,  'hint',  44, -215, 0);
            _attachNamedText(hintBtn,  '__count__', '0/3', 19, C_SUB, 10, 0);
            _attachPlayBtn(hintBtn,  C_PILL, 215);

            _attachIcon(rangeBtn, 'range', 44, -215, 0);
            _attachNamedText(rangeBtn, '__count__', '0/3', 19, C_SUB, 10, 0);
            _attachPlayBtn(rangeBtn, C_PILL, 215);
        }

        if (stam) {
            if (stamTitleLbl) i18n.registerLabel(stamTitleLbl, 'shop_stamina');
            _clearAllLabels(stam20Btn);
            _clearAllLabels(stam50Btn);
            _clearAllLabels(this._unlimitedBtn);

            // Layout: [icon x=-215] — [amount x=-100] — [count x=65] — [▶btn x=215]
            const C_AMT = new Color(61, 43, 31, 255);
            _attachIcon(stam20Btn, 'energy', 44, -215, 0);
            _attachText(stam20Btn, '+20',    22, C_AMT, -105, 0);
            _attachNamedText(stam20Btn, '__count__', '0/1', 19, C_SUB, 65, 0);
            _attachPlayBtn(stam20Btn, C_PILL, 215);

            _attachIcon(stam50Btn, 'energy', 44, -215, 0);
            _attachText(stam50Btn, '+50',    22, C_AMT, -105, 0);
            _attachNamedText(stam50Btn, '__count__', '0/2', 19, C_SUB, 65, 0);
            _attachPlayBtn(stam50Btn, C_PILL, 215);

            _attachIcon(this._unlimitedBtn, 'energy', 44, -215, 0);
            _attachText(this._unlimitedBtn, '∞20min', 22, C_AMT, -105, 0);
            _attachNamedText(this._unlimitedBtn, '__count__', '0/3', 19, C_SUB, 65, 0);
            _attachPlayBtn(this._unlimitedBtn, C_PILL, 215);
        }

        // BottomNav tabs – use cached refs
        const C_TAB_ACTIVE   = new Color(182,  97,  62, 255);  // terracotta text on milky active block
        const C_TAB_INACTIVE = new Color(242, 240, 227, 255);  // milky text on terracotta inactive block
        const C_TAB_BG       = new Color(222, 218, 205, 255);  // active block: slightly deeper than bg
        const homeLbl = _setTabIcon(homeTab, 'home', C_TAB_INACTIVE, this.homeTabIconFrame);
        const shopLbl = _setTabIcon(shopTab, 'cart', C_TAB_ACTIVE,   this.shopTabIconFrame);
        if (homeLbl) i18n.registerLabel(homeLbl, 'btn_home');
        if (shopLbl) i18n.registerLabel(shopLbl, 'btn_shop');
        // Two connected full-width rectangles: home = inactive (terracotta), shop = active (milky)
        _paintTabBg(homeTab, C_NAV,    375, 100, 0);
        _paintTabBg(shopTab, C_TAB_BG, 375, 100, 0);

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
        if (!this.staminaLabel) return;
        this.staminaLabel.string = DataManager.inst.isUnlimitedStaminaActive()
            ? '∞' : `${DataManager.inst.data.stamina}`;
    }

    private _loadDailyCounts() {
        const today = new Date().toISOString().slice(0, 10);
        TTMinis.game.getStorage({
            key: STORAGE_KEY_SHOP_DATE,
            success: (res) => {
                if (res.data !== today) {
                    this._todayCounts = { hint: 0, rangeHint: 0 };
                    this._persistDate(today);
                    this._saveDailyCounts();
                } else {
                    TTMinis.game.getStorage({
                        key: STORAGE_KEY_ITEM_COUNTS,
                        success: (r) => {
                            try { this._todayCounts = JSON.parse(r.data); } catch { /**/ }
                            this._updateItemLabels();
                        },
                        fail: () => this._updateItemLabels(),
                    });
                }
            },
            fail: () => {
                this._todayCounts = { hint: 0, rangeHint: 0 };
                this._persistDate(today);
                this._saveDailyCounts();
            },
        });
    }

    private _persistDate(date: string) {
        TTMinis.game.setStorage({ key: STORAGE_KEY_SHOP_DATE, data: date });
    }

    private _saveDailyCounts() {
        TTMinis.game.setStorage({
            key: STORAGE_KEY_ITEM_COUNTS,
            data: JSON.stringify(this._todayCounts),
        });
        this._updateItemLabels();
    }

    private _updateItemLabels() {
        const hintUsed  = this._todayCounts.hint      ?? 0;
        const rangeUsed = this._todayCounts.rangeHint ?? 0;
        const dailySec  = this.node.getChildByName('DailyItemsSection');
        const hintCount  = dailySec?.getChildByName('HintAdBtn')
                                    ?.getChildByName('__count__')?.getComponent(Label);
        const rangeCount = dailySec?.getChildByName('RangeHintAdBtn')
                                    ?.getChildByName('__count__')?.getComponent(Label);
        if (hintCount)  hintCount.string  = `${hintUsed}/${DAILY_ITEM_LIMIT}`;
        if (rangeCount) rangeCount.string = `${rangeUsed}/${DAILY_ITEM_LIMIT}`;
        // Silence legacy inspector-wired labels
        if (this.hintCountLabel)      this.hintCountLabel.string      = '';
        if (this.rangeHintCountLabel) this.rangeHintCountLabel.string = '';
    }

    async onBuyHint() {
        AudioManager.inst.playSFX('button_click');
        if ((this._todayCounts.hint ?? 0) >= DAILY_ITEM_LIMIT) return;
        const watched = await AdManager.inst.showItemAd();
        if (!watched) return;
        DataManager.inst.addItem('hint', 1);
        this._todayCounts.hint = (this._todayCounts.hint ?? 0) + 1;
        this._saveDailyCounts();
    }

    async onBuyRangeHint() {
        AudioManager.inst.playSFX('button_click');
        if ((this._todayCounts.rangeHint ?? 0) >= DAILY_ITEM_LIMIT) return;
        const watched = await AdManager.inst.showItemAd();
        if (!watched) return;
        DataManager.inst.addItem('rangeHint', 1);
        this._todayCounts.rangeHint = (this._todayCounts.rangeHint ?? 0) + 1;
        this._saveDailyCounts();
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
        const watched = await this._watchAdsWithProgress(this._stam50Btn, 2);
        if (!watched) return;
        DataManager.inst.addStamina(50);
        this._updateStamina();
    }

    async onBuyUnlimitedStamina() {
        AudioManager.inst.playSFX('button_click');
        const watched = await this._watchAdsWithProgress(this._unlimitedBtn, 3);
        if (!watched) return;
        DataManager.inst.startUnlimitedStamina(20 * 60 * 1000);
        this._updateStamina();
    }

    private _setAdProgress(btn: Node | null, current: number, total: number) {
        const lbl = btn?.getChildByName('__count__')?.getComponent(Label) ?? null;
        if (!lbl) return;
        lbl.string = `${current}/${total}`;
    }

    private async _watchAdsWithProgress(btn: Node | null, count: number): Promise<boolean> {
        for (let i = 0; i < count; i++) {
            this._setAdProgress(btn, i + 1, count);
            const watched = await AdManager.inst.showStaminaAd();
            if (!watched) {
                this._setAdProgress(btn, 0, count);
                return false;
            }
        }
        this._setAdProgress(btn, 0, count);
        return true;
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

function _clearAllLabels(node: Node | null | undefined) {
    if (!node) return;
    node.getComponentsInChildren(Label).forEach(lbl => { lbl.string = ''; });
}

function _attachNamedText(parent: Node | null | undefined, name: string, text: string,
                           size: number, color: Color, x = 0, y = 0): Node | null {
    if (!parent) return null;
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
    } else {
        const lbl = n.getComponent(Label);
        if (lbl) { lbl.string = text; lbl.color = color; }
    }
    n.setPosition(x, y, 0);
    return n;
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

/**
 * Attaches (or updates) a simple ▶-only play button — no count text.
 * Used for the redesigned shop rows where the count is shown separately.
 */
function _attachPlayBtn(parent: Node | null | undefined, bgColor: Color, x = 0, y = 0) {
    if (!parent) return;
    const W = 64;
    const H = 52;

    let btn = parent.getChildByName('__play-btn__');
    if (!btn) {
        btn = new Node('__play-btn__');
        btn.addComponent(UITransform).setContentSize(W, H);
        btn.addComponent(Graphics);
        parent.addChild(btn);
    }
    btn.setPosition(x, y, 0);
    btn.getComponent(UITransform)!.setContentSize(W, H);

    const g = btn.getComponent(Graphics)!;
    g.clear();
    g.fillColor = bgColor;
    g.roundRect(-W / 2, -H / 2, W, H, 12);
    g.fill();

    let icon = btn.getChildByName('__play-icon__');
    if (!icon) {
        icon = new Node('__play-icon__');
        icon.addComponent(UITransform).setContentSize(W, H);
        const lbl = icon.addComponent(Label);
        lbl.string = '▶';
        lbl.fontSize = 22;
        lbl.color = new Color(255, 238, 205, 255);
        lbl.horizontalAlign = 1;
        btn.addChild(icon);
    }
    icon.setPosition(0, 0, 0);
}

/**
 * Attaches (or updates) a play pill button on the right side of a row card.
 * The pill shows a ▶ icon on the left and the ad-count text on the right.
 * The __ad-count__ child name is kept so _setAdProgress() can update it live.
 */
function _attachPlayPill(parent: Node | null | undefined, count: string,
                          bgColor: Color, x = 0, y = 0) {
    if (!parent) return;
    const PILL_W = 112;
    const PILL_H = 44;
    const C_WHITE = new Color(255, 255, 255, 255);

    let pill = parent.getChildByName('__play-pill__');
    if (!pill) {
        pill = new Node('__play-pill__');
        pill.addComponent(UITransform).setContentSize(PILL_W, PILL_H);
        pill.addComponent(Graphics);
        parent.addChild(pill);
    }
    pill.setPosition(x, y, 0);
    pill.getComponent(UITransform)!.setContentSize(PILL_W, PILL_H);

    const g = pill.getComponent(Graphics)!;
    g.clear();
    g.fillColor = bgColor;
    g.roundRect(-PILL_W / 2, -PILL_H / 2, PILL_W, PILL_H, 12);
    g.fill();

    const C_PILL_TEXT = new Color(255, 238, 205, 255);  // warm cream — not white

    // ▶ play symbol
    let playNode = pill.getChildByName('__play-icon__');
    if (!playNode) {
        playNode = new Node('__play-icon__');
        playNode.addComponent(UITransform).setContentSize(26, PILL_H);
        const lbl = playNode.addComponent(Label);
        lbl.string = '▶';
        lbl.fontSize = 14;
        lbl.color = new Color(255, 238, 205, 160);
        lbl.horizontalAlign = 1;
        pill.addChild(playNode);
    }
    playNode.setPosition(-28, 0, 0);

    // Ad count text (e.g. ×1, ×2, ×3 — updated live by _setAdProgress)
    let countNode = pill.getChildByName('__ad-count__');
    if (!countNode) {
        countNode = new Node('__ad-count__');
        countNode.addComponent(UITransform).setContentSize(62, PILL_H);
        const lbl = countNode.addComponent(Label);
        lbl.fontSize = 19;
        lbl.isBold = true;
        lbl.color = C_PILL_TEXT;
        lbl.horizontalAlign = 1;
        pill.addChild(countNode);
    }
    countNode.getComponent(Label)!.string = count;
    countNode.setPosition(18, 0, 0);
}

function _setTabIcon(tab: Node | null | undefined, iconName: string,
                     textColor: Color, frame: SpriteFrame | null = null): Label | null {
    if (!tab) return null;
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

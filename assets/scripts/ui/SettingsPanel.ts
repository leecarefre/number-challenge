import {
    _decorator, Component, Node, Label, Color, Button,
    Graphics, UITransform, UIOpacity,
} from 'cc';
import { DataManager } from '../core/DataManager';
import { AudioManager } from '../core/AudioManager';
import { I18nManager } from '../core/I18nManager';

const { ccclass } = _decorator;

// ── Layout ────────────────────────────────────────────────────────────────────
const PANEL_W = 560;
const PANEL_H = 620;
const ROW_W   = PANEL_W - 80;
const ROW_H   = 70;

// ── Colors ────────────────────────────────────────────────────────────────────
const C_OVERLAY  = new Color(  0,   0,   0, 130);
const C_PANEL    = new Color(255, 252, 244, 255);  // #FFFCF4 light warm cream
const C_ROW      = new Color(232, 227, 210, 255);  // warm cream row
const C_TOGGLE_OFF = new Color(200, 190, 175, 255);
const C_TOGGLE_ON  = new Color(182,  97,  62, 255);  // #B6613E
const C_LANG_ON  = new Color(242, 240, 227, 255);  // #F2F0E3 label on selected row
const C_CLOSE_BG = new Color(182,  97,  62, 255);  // #B6613E
const C_GOLD     = new Color(182,  97,  62, 255);  // #B6613E title
const C_TXT      = new Color( 61,  43,  31, 255);  // dark brown
const C_DIM      = new Color(139,  94,  74, 255);  // medium warm brown
const C_WHITE    = new Color(255, 255, 255, 255);

@ccclass('SettingsPanel')
export class SettingsPanel extends Component {
    private _bgmDot:  Node | null = null;
    private _sfxDot:  Node | null = null;
    private _enLbl:   Label | null = null;
    private _jaLbl:   Label | null = null;
    private _enRow:   Node | null = null;
    private _jaRow:   Node | null = null;
    private _built = false;

    onLoad() {
        if (!this._built) this._build();
    }

    onEnable() {
        if (!this._built) this._build();
        this._refresh();
    }

    // ── Build ─────────────────────────────────────────────────────────────────

    private _build() {
        this._built = true;
        this.node.removeAllChildren();
        const i18n = I18nManager.inst;

        // Full-screen overlay
        const overlay = _node('Overlay', 750, 1334);
        _fill(overlay, C_OVERLAY);
        // Tap overlay to close
        overlay.addComponent(Button);
        overlay.on(Button.EventType.CLICK, this.onClose, this);
        this.node.addChild(overlay);

        // Panel
        const panel = _node('Panel', PANEL_W, PANEL_H);
        _roundRect(panel, C_PANEL, 24);
        this.node.addChild(panel);

        // Title – auto-refreshes on language switch via registerLabel
        const title = _label('Title', '', PANEL_W - 40, 36, C_GOLD, true);
        title.setPosition(0, PANEL_H / 2 - 50, 0);
        panel.addChild(title);
        i18n.registerLabel(title.getComponent(Label)!, 'settings_title');

        // ── BGM toggle row ──
        const bgmRow = this._buildToggleRow(
            'settings_bgm',
            () => this.onBGMToggle()
        );
        bgmRow.setPosition(0, 160, 0);
        panel.addChild(bgmRow);
        this._bgmDot = bgmRow.getChildByName('__dot__');

        // ── SFX toggle row ──
        const sfxRow = this._buildToggleRow(
            'settings_sfx',
            () => this.onSFXToggle()
        );
        sfxRow.setPosition(0, 80, 0);
        panel.addChild(sfxRow);
        this._sfxDot = sfxRow.getChildByName('__dot__');

        // ── Language section header ──
        const langHdr = _label('LangHdr', '', ROW_W, 22, C_DIM);
        langHdr.setPosition(0, 10, 0);
        panel.addChild(langHdr);
        i18n.registerLabel(langHdr.getComponent(Label)!, 'settings_language');

        // EN row (literal text, no i18n)
        this._enRow = this._buildLangRow('English', () => this.onLangEn());
        this._enRow.setPosition(0, -50, 0);
        panel.addChild(this._enRow);
        this._enLbl = this._enRow.getChildByName('__lbl__')?.getComponent(Label) ?? null;

        // JA row (literal text, no i18n)
        this._jaRow = this._buildLangRow('日本語', () => this.onLangJa());
        this._jaRow.setPosition(0, -130, 0);
        panel.addChild(this._jaRow);
        this._jaLbl = this._jaRow.getChildByName('__lbl__')?.getComponent(Label) ?? null;

        // ── Close button ──
        const closeBtn = _node('CloseBtn', 200, 56);
        _roundRect(closeBtn, C_CLOSE_BG, 14);
        closeBtn.addComponent(Button);
        closeBtn.on(Button.EventType.CLICK, this.onClose, this);
        const closeLbl = _label('label', '', 200, 24, C_TXT);
        closeBtn.addChild(closeLbl);
        closeBtn.setPosition(0, -PANEL_H / 2 + 50, 0);
        panel.addChild(closeBtn);
        i18n.registerLabel(closeLbl.getComponent(Label)!, 'btn_close');
    }

    private _buildToggleRow(i18nKey: string, onTap: () => void): Node {
        const row = _node('Row', ROW_W, ROW_H);
        _roundRect(row, C_ROW, 14);

        const lbl = _label('label', '', ROW_W - 140, 24, C_TXT);
        lbl.setPosition(-ROW_W / 2 + 24 + (ROW_W - 140) / 2, 0, 0);
        const lblComp = lbl.getComponent(Label)!;
        lblComp.horizontalAlign = 0; // LEFT
        row.addChild(lbl);
        I18nManager.inst.registerLabel(lblComp, i18nKey);

        // Toggle pill
        const pill = _node('__pill__', 64, 32);
        _roundRect(pill, C_TOGGLE_OFF, 16);
        pill.setPosition(ROW_W / 2 - 50, 0, 0);
        row.addChild(pill);

        // Toggle dot (sliding circle)
        const dot = _node('__dot__', 28, 28);
        _circle(dot, C_WHITE, 14);
        dot.setPosition(ROW_W / 2 - 64, 0, 0);
        row.addChild(dot);

        // Make whole row tappable
        row.addComponent(Button);
        row.on(Button.EventType.CLICK, onTap, this);

        return row;
    }

    private _buildLangRow(text: string, onTap: () => void): Node {
        const row = _node('LangRow', ROW_W, ROW_H);
        _roundRect(row, C_ROW, 14);

        const lbl = _label('__lbl__', text, ROW_W - 40, 26, C_TXT, true);
        row.addChild(lbl);

        row.addComponent(Button);
        row.on(Button.EventType.CLICK, onTap, this);
        return row;
    }

    private _refresh() {
        const d = DataManager.inst.data;
        this._setToggleVisual(this._bgmDot, d.settings.bgmOn);
        this._setToggleVisual(this._sfxDot, d.settings.sfxOn);
        this._setLangSelected('en', d.language === 'en');
        this._setLangSelected('ja', d.language === 'ja');
    }

    private _setToggleVisual(dot: Node | null, on: boolean) {
        if (!dot) return;
        // Move dot
        dot.setPosition(on ? ROW_W / 2 - 36 : ROW_W / 2 - 64, 0, 0);
        // Recolor pill
        const pill = dot.parent?.getChildByName('__pill__');
        if (pill) _roundRect(pill, on ? C_TOGGLE_ON : C_TOGGLE_OFF, 16);
    }

    private _setLangSelected(lang: 'en' | 'ja', selected: boolean) {
        const row = lang === 'en' ? this._enRow : this._jaRow;
        const lbl = lang === 'en' ? this._enLbl : this._jaLbl;
        if (row) _roundRect(row, selected ? C_TOGGLE_ON : C_ROW, 14);
        if (lbl) lbl.color = selected ? C_LANG_ON : C_TXT;
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    onBGMToggle() {
        AudioManager.inst.playSFX('button_click');
        const on = !DataManager.inst.data.settings.bgmOn;
        AudioManager.inst.setBGMEnabled(on);
        this._setToggleVisual(this._bgmDot, on);
    }

    onSFXToggle() {
        AudioManager.inst.playSFX('button_click');
        const on = !DataManager.inst.data.settings.sfxOn;
        AudioManager.inst.setSFXEnabled(on);
        if (on) AudioManager.inst.playSFX('button_click');
        this._setToggleVisual(this._sfxDot, on);
    }

    onLangEn() {
        AudioManager.inst.playSFX('button_click');
        I18nManager.inst.switchLanguage('en');
        this._setLangSelected('en', true);
        this._setLangSelected('ja', false);
    }

    onLangJa() {
        AudioManager.inst.playSFX('button_click');
        I18nManager.inst.switchLanguage('ja');
        this._setLangSelected('en', false);
        this._setLangSelected('ja', true);
    }

    onClose() {
        AudioManager.inst.playSFX('button_click');
        this.node.active = false;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _node(name: string, w: number, h: number): Node {
    const n  = new Node(name);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    n.addComponent(Graphics);
    n.addComponent(UIOpacity);
    return n;
}

function _label(name: string, str: string, w: number, size: number,
                color: Color, bold = false): Node {
    const n  = new Node(name);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, size + 12);
    const lbl = n.addComponent(Label);
    lbl.string          = str;
    lbl.fontSize        = size;
    lbl.color           = color;
    lbl.isBold          = bold;
    lbl.horizontalAlign = 1; // CENTER
    lbl.verticalAlign   = 1; // CENTER
    return n;
}

function _fill(node: Node, color: Color) {
    const g  = node.getComponent(Graphics)!;
    const ut = node.getComponent(UITransform)!;
    const { width: w, height: h } = ut.contentSize;
    g.clear();
    g.fillColor = color;
    g.fillRect(-w / 2, -h / 2, w, h);
}

function _roundRect(node: Node, color: Color, r: number) {
    const g  = node.getComponent(Graphics)!;
    const ut = node.getComponent(UITransform)!;
    const { width: w, height: h } = ut.contentSize;
    g.clear();
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();
}

function _circle(node: Node, color: Color, r: number) {
    const g = node.getComponent(Graphics)!;
    g.clear();
    g.fillColor = color;
    g.circle(0, 0, r);
    g.fill();
}

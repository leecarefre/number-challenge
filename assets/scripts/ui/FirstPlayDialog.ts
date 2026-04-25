import {
    _decorator, Component, Node, Label, Color, Button,
    Graphics, UITransform, UIOpacity,
} from 'cc';
import { GameManager } from '../core/GameManager';
import { AudioManager } from '../core/AudioManager';
import { I18nManager } from '../core/I18nManager';

const { ccclass } = _decorator;

// ── Layout ────────────────────────────────────────────────────────────────────
const PANEL_W = 520;
const PANEL_H = 360;

// ── Colors ────────────────────────────────────────────────────────────────────
const C_OVERLAY = new Color(  0,   0,   0, 130);
const C_PANEL   = new Color( 24,  24,  44, 255);
const C_BTN_PRI = new Color( 80, 160, 255, 255);
const C_BTN_SEC = new Color( 64,  64,  90, 255);
const C_GOLD    = new Color(255, 200,  50, 255);
const C_WHITE   = new Color(255, 255, 255, 255);
const C_DIM     = new Color(190, 200, 230, 255);

@ccclass('FirstPlayDialog')
export class FirstPlayDialog extends Component {
    private _built = false;

    onLoad() {
        if (!this._built) this._build();
    }

    private _build() {
        this._built = true;
        this.node.removeAllChildren();
        const i18n = I18nManager.inst;

        // Overlay
        const overlay = _node('Overlay', 1280, 720);
        _fill(overlay, C_OVERLAY);
        this.node.addChild(overlay);

        // Panel
        const panel = _node('Panel', PANEL_W, PANEL_H);
        _roundRect(panel, C_PANEL, 24);
        this.node.addChild(panel);

        // Title
        const title = _label('Title', i18n.t('first_play_title'), PANEL_W - 40, 36, C_GOLD);
        title.setPosition(0, 120, 0);
        panel.addChild(title);

        // Question
        const q = _label('Question', i18n.t('first_play_question'), PANEL_W - 60, 22, C_DIM, true);
        q.setPosition(0, 35, 0);
        const qUt = q.getComponent(UITransform)!;
        qUt.setContentSize(PANEL_W - 60, 60);
        panel.addChild(q);

        // Yes + No buttons
        const yesBtn = _button('YesBtn', i18n.t('btn_yes'), C_BTN_PRI, 200, 64);
        yesBtn.setPosition(-115, -100, 0);
        yesBtn.on(Button.EventType.CLICK, this.onYes, this);
        panel.addChild(yesBtn);

        const noBtn = _button('NoBtn', i18n.t('btn_no'), C_BTN_SEC, 200, 64);
        noBtn.setPosition(115, -100, 0);
        noBtn.on(Button.EventType.CLICK, this.onNo, this);
        panel.addChild(noBtn);
    }

    onYes() {
        AudioManager.inst.playSFX('button_click');
        this.node.active = false;
        GameManager.inst.setCurrentLevel(1, true);
        GameManager.inst.loadScene('Game');
    }

    onNo() {
        AudioManager.inst.playSFX('button_click');
        this.node.active = false;
        GameManager.inst.loadScene('Home');
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

function _label(name: string, str: string, w: number, size: number, color: Color, wrap = false): Node {
    const n  = new Node(name);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, size + 12);
    const lbl = n.addComponent(Label);
    // enableWrapText is ignored when overflow == NONE (default), so set CLAMP first.
    if (wrap) {
        lbl.overflow       = Label.Overflow.CLAMP;
        lbl.enableWrapText = true;
    }
    lbl.string          = str;
    lbl.fontSize        = size;
    lbl.color           = color;
    lbl.horizontalAlign = 1;
    return n;
}

function _button(name: string, text: string, bg: Color, w: number, h: number): Node {
    const n = _node(name, w, h);
    _roundRect(n, bg, 14);
    n.addComponent(Button);
    const lbl = _label('label', text, w - 16, 26, C_WHITE);
    n.addChild(lbl);
    return n;
}

function _fill(node: Node, color: Color) {
    const g  = node.getComponent(Graphics)!;
    const ut = node.getComponent(UITransform)!;
    const { width: w, height: h } = ut.contentSize;
    g.clear();
    g.fillColor = color;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
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

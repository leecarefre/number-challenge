import {
    _decorator, Component, Node, Label, Color, Button,
    Graphics, UITransform, UIOpacity,
} from 'cc';
import { AudioManager } from '../core/AudioManager';
import { AdManager } from '../core/AdManager';
import { GameManager } from '../core/GameManager';
import { DataManager } from '../core/DataManager';
import { I18nManager } from '../core/I18nManager';
import { GameController } from '../gameplay/GameController';

const { ccclass, property } = _decorator;

// ── Layout ────────────────────────────────────────────────────────────────────
const PANEL_W = 460;
const PANEL_H = 400;

// ── Colors ────────────────────────────────────────────────────────────────────
const C_OVERLAY   = new Color(  0,   0,   0,  76);
const C_PANEL     = new Color(255, 252, 244, 255);
const C_BTN_AD    = new Color(182,  97,  62, 255);
const C_BTN_HOME  = new Color(120,  95,  75, 255);
const C_RED       = new Color(200,  60,  60, 255);
const C_WHITE     = new Color(255, 255, 255, 255);
const C_DIM       = new Color( 61,  43,  31, 255);

@ccclass('FailDialog')
export class FailDialog extends Component {
    @property(GameController) gameController: GameController | null = null;

    private _livesLbl:  Label | null = null;
    private _reviveLbl: Label | null = null;
    private _homeLbl:   Label | null = null;
    private _built = false;

    onLoad() {
        this._build();
    }

    onEnable() {
        if (!this._built) this._build();
        this._refresh();
    }

    // ── Build ─────────────────────────────────────────────────────────────────

    private _build() {
        this._built = true;
        this.node.removeAllChildren();

        // Full-screen overlay
        const overlay = _node('Overlay', 750, 1334);
        _fill(overlay, C_OVERLAY);
        this.node.addChild(overlay);

        // Panel
        const panel = _node('Panel', PANEL_W, PANEL_H);
        _roundRect(panel, C_PANEL, 24);
        this.node.addChild(panel);

        // Title
        const titleNode = _label('Title', '', PANEL_W - 40, 36, C_RED);
        titleNode.setPosition(0, 148, 0);
        panel.addChild(titleNode);
        const titleLbl = titleNode.getComponent(Label)!;
        titleLbl.string = I18nManager.inst.t('fail_title');

        // Lives info
        const livesNode = _label('LivesInfo', '', PANEL_W - 40, 22, C_DIM);
        livesNode.setPosition(0, 88, 0);
        panel.addChild(livesNode);
        this._livesLbl = livesNode.getComponent(Label);

        // Revive (watch ad) button
        const reviveBtn = _button('ReviveBtn', '', C_BTN_AD, PANEL_W - 60, 70);
        reviveBtn.setPosition(0, -10, 0);
        reviveBtn.on(Button.EventType.CLICK, () => this.onRevive(), this);
        panel.addChild(reviveBtn);
        this._reviveLbl = reviveBtn.children[0]?.getComponent(Label) ?? null;
        if (this._reviveLbl) this._reviveLbl.string = I18nManager.inst.t('btn_revive');

        // Back home button
        const homeBtn = _button('BackHomeBtn', '', C_BTN_HOME, 240, 56);
        homeBtn.setPosition(0, -100, 0);
        homeBtn.on(Button.EventType.CLICK, this.onBackHome, this);
        panel.addChild(homeBtn);
        this._homeLbl = homeBtn.children[0]?.getComponent(Label) ?? null;
        if (this._homeLbl) this._homeLbl.string = I18nManager.inst.t('btn_back_home');
    }

    private _refresh() {
        const i18n  = I18nManager.inst;
        const lives = DataManager.inst.data.lives;
        if (this._livesLbl) {
            this._livesLbl.string = lives > 0
                ? i18n.t('fail_lives_left', { n: lives })
                : i18n.t('fail_no_lives');
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    async onRevive() {
        AudioManager.inst.playSFX('button_click');
        const watched = await AdManager.inst.showReviveAd();
        if (!watched) return;

        DataManager.inst.restoreLife(1);
        this.node.active = false;
        this.gameController?.revive();
    }

    onBackHome() {
        AudioManager.inst.playSFX('button_click');
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

function _label(name: string, str: string, w: number, size: number, color: Color): Node {
    const n  = new Node(name);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, size + 12);
    const lbl = n.addComponent(Label);
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
    const lbl = _label('label', text, w - 16, 24, new Color(255, 255, 255, 255));
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

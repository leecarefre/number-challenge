import {
    _decorator, Component, Node, Label, Color, Button,
    Graphics, UITransform, UIOpacity, tween, Vec3,
} from 'cc';
import { GameManager } from '../core/GameManager';
import { AudioManager } from '../core/AudioManager';
import { I18nManager } from '../core/I18nManager';
import { DataManager } from '../core/DataManager';
import { createIconNode } from './IconUtil';

const { ccclass } = _decorator;

// ── Layout ────────────────────────────────────────────────────────────────────
const PANEL_W = 520;
const PANEL_H = 540;

// ── Colors ────────────────────────────────────────────────────────────────────
const C_OVERLAY  = new Color(  0,   0,   0, 130);
const C_PANEL    = new Color( 24,  24,  44, 255);
const C_BTN_PRI  = new Color( 80, 160, 255, 255);
const C_BTN_SEC  = new Color( 48,  50,  82, 255);
const C_BTN_HOME = new Color( 30,  32,  56, 255);
const C_GOLD     = new Color(255, 200,  50, 255);
const C_STAR_OFF = new Color( 46,  50,  88, 255);
const C_WHITE    = new Color(255, 255, 255, 255);
const C_DIM      = new Color(140, 155, 205, 255);

@ccclass('WinDialog')
export class WinDialog extends Component {
    private _titleLbl:  Label | null = null;
    private _levelLbl:  Label | null = null;
    private _nextLbl:   Label | null = null;
    private _retryLbl:  Label | null = null;
    private _homeLbl:   Label | null = null;
    private _starNodes: Node[]  = [];
    private _built = false;

    onLoad() {
        this._build();
    }

    onEnable() {
        if (!this._built) this._build();
    }

    // ── Build ─────────────────────────────────────────────────────────────────

    private _build() {
        this._built = true;
        this.node.removeAllChildren();
        this._starNodes = [];

        // Full-screen dim overlay
        const overlay = _node('Overlay', 750, 1334);
        _fill(overlay, C_OVERLAY);
        this.node.addChild(overlay);

        // Panel
        const panel = _node('Panel', PANEL_W, PANEL_H);
        _roundRect(panel, C_PANEL, 24);
        this.node.addChild(panel);

        // Title
        const titleNode = _label('WinTitle', '', PANEL_W - 40, 36, C_GOLD);
        titleNode.setPosition(0, 210, 0);
        panel.addChild(titleNode);
        this._titleLbl = titleNode.getComponent(Label);

        // Level sub-title
        const levelNode = _label('LevelInfo', '', PANEL_W - 40, 22, C_DIM);
        levelNode.setPosition(0, 162, 0);
        panel.addChild(levelNode);
        this._levelLbl = levelNode.getComponent(Label);

        // 3 star slots (sprite icons)
        for (let i = 0; i < 3; i++) {
            const star = createIconNode('star', 80);
            star.name = `Star${i + 1}`;
            star.setPosition(-112 + i * 112, 72, 0);
            const op = star.addComponent(UIOpacity);
            op.opacity = 70; // dim by default; show() will brighten earned stars
            panel.addChild(star);
            this._starNodes.push(star);
        }

        // Next Level (primary)
        const nextBtn = _button('NextLevelBtn', '', C_BTN_PRI, 300, 68);
        nextBtn.setPosition(0, -18, 0);
        nextBtn.on(Button.EventType.CLICK, this.onNextLevel, this);
        panel.addChild(nextBtn);
        this._nextLbl = nextBtn.children[0]?.getComponent(Label) ?? null;

        // Retry + Home row
        const retryBtn = _button('RetryBtn', '', C_BTN_SEC, 220, 56);
        retryBtn.setPosition(-130, -106, 0);
        retryBtn.on(Button.EventType.CLICK, this.onRetry, this);
        panel.addChild(retryBtn);
        this._retryLbl = retryBtn.children[0]?.getComponent(Label) ?? null;

        const homeBtn = _button('BackHomeBtn', '', C_BTN_HOME, 220, 56);
        homeBtn.setPosition(130, -106, 0);
        homeBtn.on(Button.EventType.CLICK, this.onBackHome, this);
        panel.addChild(homeBtn);
        this._homeLbl = homeBtn.children[0]?.getComponent(Label) ?? null;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    show(level: number, stars: number) {
        this.node.active = true;
        if (!this._built) this._build();

        const i18n = I18nManager.inst;
        if (this._titleLbl) this._titleLbl.string = i18n.t('win_title');
        if (this._levelLbl) this._levelLbl.string = i18n.t('level', { n: level });
        if (this._nextLbl)  this._nextLbl.string  = i18n.t('btn_next_level');
        if (this._retryLbl) this._retryLbl.string = i18n.t('btn_retry');
        if (this._homeLbl)  this._homeLbl.string  = i18n.t('btn_home');

        // Animate stars
        this._starNodes.forEach((star, i) => {
            const op = star.getComponent(UIOpacity);
            if (op) op.opacity = i < stars ? 255 : 70;
            star.setScale(0, 0, 1);
            if (i < stars) {
                tween(star)
                    .delay(0.15 + i * 0.2)
                    .to(0.18, { scale: new Vec3(1.25, 1.25, 1) })
                    .to(0.10, { scale: new Vec3(1.0,  1.0,  1) })
                    .start();
            } else {
                tween(star).to(0.1, { scale: new Vec3(0.9, 0.9, 1) }).start();
            }
        });

        if (level === 20 && DataManager.inst.data.unlockedLevel > 20) {
            this.scheduleOnce(() => this._showAllClear(), 1.5);
        }
    }

    private _showAllClear() {
        // All-clear handled by HomeUI on return
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    onNextLevel() {
        AudioManager.inst.playSFX('button_click');
        const next = GameManager.inst.currentLevel.level + 1;
        if (next > 20) { GameManager.inst.loadScene('Home'); return; }
        GameManager.inst.setCurrentLevel(next);
        GameManager.inst.loadScene('Game');
    }

    onRetry() {
        AudioManager.inst.playSFX('button_click');
        const level = GameManager.inst.currentLevel.level;
        if (!DataManager.inst.consumeStamina()) return;
        GameManager.inst.setCurrentLevel(level);
        GameManager.inst.loadScene('Game');
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
    lbl.horizontalAlign = 1; // CENTER
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

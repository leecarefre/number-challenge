import {
    _decorator, Component, Node, Label, Color, tween, Vec3,
    UIOpacity, Button, Graphics, UITransform,
} from 'cc';
import { DataManager } from '../core/DataManager';
import { AudioManager } from '../core/AudioManager';
import { I18nManager } from '../core/I18nManager';
import { createIconNode } from './IconUtil';

const { ccclass } = _decorator;

// ── Layout constants ──────────────────────────────────────────────────────────
const PANEL_W  = 680;
const PANEL_H  = 480;
const SLOT_W   = 76;
const SLOT_H   = 110;
const SLOT_GAP = 10;

// ── Color palette ─────────────────────────────────────────────────────────────
const C_OVERLAY  = new Color(  0,   0,   0, 130);
const C_PANEL    = new Color( 28,  28,  46, 255);
const C_SLOT_DEF = new Color( 50,  52,  80, 255);
const C_CLAIMED  = new Color( 72, 199, 116, 255);
const C_TODAY    = new Color(255, 200,  50, 255);
const C_LOCKED   = new Color( 38,  38,  58, 255);
const C_BTN      = new Color( 80, 160, 255, 255);
const C_CLOSE    = new Color( 80,  80, 105, 255);
const C_WHITE    = new Color(255, 255, 255, 255);
const C_DIM      = new Color(140, 140, 165, 255);
const C_DARK     = new Color( 20,  20,  35, 255);

// [icon name, count text]; gift slot has empty count
const REWARDS: Array<[string, string]> = [
    ['energy', '×2'],
    ['hint',   '×1'],
    ['range',  '×1'],
    ['energy', '×2'],
    ['hint',   '×1'],
    ['range',  '×1'],
    ['gift',   ''],
];

@ccclass('SignInDialog')
export class SignInDialog extends Component {
    private _slots: Node[] = [];
    private _claimBtn: Node | null = null;
    private _statusLabel: Label | null = null;
    private _built = false;

    onLoad() {
        this._build();
    }

    onEnable() {
        if (!this._built) this._build();
        this._refresh();
    }

    // ── Build UI ───────────────────────────────────────────────────────────────

    private _build() {
        this._built = true;
        this.node.removeAllChildren();
        this._slots = [];

        // Full-screen overlay (tap to close)
        const overlay = _node('Overlay', 750, 1334);
        _fillRect(overlay, C_OVERLAY);
        overlay.on(Button.EventType.CLICK, this.onClose, this);
        this.node.addChild(overlay);

        // Panel
        const panel = _node('Panel', PANEL_W, PANEL_H);
        _roundRect(panel, C_PANEL, 20);
        this.node.addChild(panel);

        // Title
        const title = _label('Title', '', 30, C_WHITE);
        title.setPosition(0, PANEL_H / 2 - 44, 0);
        panel.addChild(title);
        // text set in _refresh so i18n is ready

        // Divider line
        const divider = _node('Divider', PANEL_W - 60, 2);
        _fillRect(divider, new Color(60, 60, 90, 255));
        divider.setPosition(0, PANEL_H / 2 - 72, 0);
        panel.addChild(divider);

        // Day slots
        const totalW = 7 * SLOT_W + 6 * SLOT_GAP;
        for (let i = 0; i < 7; i++) {
            const slot = this._buildSlot(i + 1);
            slot.setPosition(-totalW / 2 + SLOT_W / 2 + i * (SLOT_W + SLOT_GAP), 30, 0);
            panel.addChild(slot);
            this._slots.push(slot);
        }

        // Claim button
        this._claimBtn = _button('ClaimBtn', '', C_BTN, 260, 64);
        this._claimBtn.setPosition(0, -148, 0);
        this._claimBtn.on(Button.EventType.CLICK, this.onClaim, this);
        panel.addChild(this._claimBtn);

        // Status label — sits in the same slot as the Claim button so the
        // panel doesn't look top-heavy after claiming (button hides, text
        // takes its place instead of dangling near the bottom edge).
        const statusNode = _label('Status', '', 28, C_CLAIMED);
        statusNode.setPosition(0, -148, 0);
        this._statusLabel = statusNode.getComponent(Label);
        const statusLbl = statusNode.getComponent(Label)!;
        statusLbl.isBold = true;
        panel.addChild(statusNode);

        // Close (×) button
        const closeBtn = _button('CloseBtn', '✕', C_CLOSE, 52, 52);
        closeBtn.setPosition(PANEL_W / 2 - 36, PANEL_H / 2 - 36, 0);
        closeBtn.on(Button.EventType.CLICK, this.onClose, this);
        panel.addChild(closeBtn);
    }

    private _buildSlot(day: number): Node {
        const slot = _node(`Day${day}`, SLOT_W, SLOT_H);
        _roundRect(slot, C_SLOT_DEF, 12);

        const dayLbl = _label('Day', `Day ${day}`, 16, C_DIM);
        dayLbl.setPosition(0, SLOT_H / 2 - 16, 0);
        slot.addChild(dayLbl);

        // Reward = icon + count (icon centered, count below)
        const [iconName, count] = REWARDS[day - 1];
        const iconSize = day === 7 ? 44 : 36;
        const iconNode = createIconNode(iconName, iconSize);
        iconNode.setPosition(0, 8, 0);
        slot.addChild(iconNode);

        if (count) {
            const countLbl = _label('Count', count, 14, C_WHITE);
            countLbl.setPosition(0, -16, 0);
            slot.addChild(countLbl);
        }

        const state = _label('State', '', 22, C_WHITE);
        state.setPosition(0, -SLOT_H / 2 + 18, 0);
        slot.addChild(state);

        return slot;
    }

    // ── Refresh state ──────────────────────────────────────────────────────────

    private _refresh() {
        const i18n = I18nManager.inst;
        const dm   = DataManager.inst;
        const sd   = dm.data.signIn;
        const canClaim   = dm.canSignInToday();
        const currentDay = dm.signInCurrentDay();

        // Update title text
        const panel = this.node.children[1];
        const titleLbl = panel?.children[0]?.getComponent(Label);
        if (titleLbl) titleLbl.string = i18n.t('sign_in_title');

        // Claim btn text
        const claimLbl = this._claimBtn?.children[0]?.getComponent(Label);
        if (claimLbl) claimLbl.string = i18n.t('sign_in_today');

        this._slots.forEach((slot, idx) => {
            const day = idx + 1;
            const stateNode = slot.getChildByName('State');
            const stateLbl  = stateNode?.getComponent(Label) ?? null;
            tween(slot).stop();
            slot.setScale(1, 1, 1);
            const op = slot.getComponent(UIOpacity);
            if (op) op.opacity = 255;

            if (sd.claimedDays.includes(day)) {
                _roundRect(slot, C_CLAIMED, 12);
                if (stateLbl) stateLbl.string = '✓';
            } else if (day === currentDay) {
                _roundRect(slot, C_TODAY, 12);
                if (stateLbl) stateLbl.string = canClaim ? '▶' : '·';
                if (canClaim) {
                    tween(slot).repeatForever(
                        tween(slot)
                            .to(0.5, { scale: new Vec3(1.08, 1.08, 1) })
                            .to(0.5, { scale: new Vec3(1.0,  1.0,  1) }),
                    ).start();
                }
            } else if (day < currentDay) {
                _roundRect(slot, C_LOCKED, 12);
                const op2 = slot.getComponent(UIOpacity);
                if (op2) op2.opacity = 100;
                if (stateLbl) stateLbl.string = '✗';
            } else {
                _roundRect(slot, C_SLOT_DEF, 12);
                const op3 = slot.getComponent(UIOpacity);
                if (op3) op3.opacity = 160;
                if (stateLbl) stateLbl.string = '';
            }
        });

        if (this._claimBtn) this._claimBtn.active = canClaim;
        if (this._statusLabel) {
            this._statusLabel.string = canClaim ? '' : `✓  ${i18n.t('sign_in_claimed')}`;
        }
    }

    // ── Actions ────────────────────────────────────────────────────────────────

    onClaim() {
        AudioManager.inst.playSFX('button_click');
        if (!DataManager.inst.claimSignIn()) return;

        const day = DataManager.inst.signInCurrentDay() - 1;
        const slot = this._slots[day - 1];
        if (slot) {
            tween(slot).stop();
            tween(slot)
                .to(0.15, { scale: new Vec3(1.35, 1.35, 1) })
                .to(0.15, { scale: new Vec3(1.0,  1.0,  1) })
                .call(() => this._refresh())
                .start();
        } else {
            this._refresh();
        }
    }

    onClose() {
        AudioManager.inst.playSFX('button_click');
        this._slots.forEach(s => { tween(s).stop(); s.setScale(1, 1, 1); });
        this.node.active = false;
    }
}

// ── Helper factories ──────────────────────────────────────────────────────────

function _node(name: string, w: number, h: number): Node {
    const n = new Node(name);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    n.addComponent(Graphics);
    n.addComponent(UIOpacity);
    return n;
}

function _label(name: string, str: string, size: number, color: Color): Node {
    const n = new Node(name);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(200, size + 8);
    const lbl = n.addComponent(Label);
    lbl.string = str;
    lbl.fontSize = size;
    lbl.color = color;
    lbl.enableWrapText = true;
    lbl.horizontalAlign = 1; // CENTER
    return n;
}

function _button(name: string, text: string, bg: Color, w: number, h: number): Node {
    const n = _node(name, w, h);
    _roundRect(n, bg, 14);
    n.addComponent(Button);
    const lbl = _label('label', text, 26, new Color(255, 255, 255, 255));
    n.addChild(lbl);
    return n;
}

function _fillRect(node: Node, color: Color) {
    const g = node.getComponent(Graphics)!;
    const ut = node.getComponent(UITransform)!;
    const { width: w, height: h } = ut.contentSize;
    g.clear();
    g.fillColor = color;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
}

function _roundRect(node: Node, color: Color, r: number) {
    const g = node.getComponent(Graphics)!;
    const ut = node.getComponent(UITransform)!;
    const { width: w, height: h } = ut.contentSize;
    g.clear();
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();
}

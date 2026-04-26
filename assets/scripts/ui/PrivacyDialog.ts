import {
    _decorator, Component, Node, Label, Color, Button,
    Graphics, UITransform, UIOpacity,
} from 'cc';
import { DataManager } from '../core/DataManager';
import { AudioManager } from '../core/AudioManager';
import { I18nManager } from '../core/I18nManager';

const { ccclass, property } = _decorator;

// ── Layout ────────────────────────────────────────────────────────────────────
const PANEL_W = 580;
const PANEL_H = 480;
const CONFIRM_W = 480;
const CONFIRM_H = 260;

// ── Colors ────────────────────────────────────────────────────────────────────
const C_OVERLAY  = new Color(  0,   0,   0, 130);
const C_PANEL    = new Color(255, 252, 244, 255);  // #FFFCF4 light warm cream
const C_BTN_PRI  = new Color(182,  97,  62, 255);  // #B6613E
const C_BTN_DEC  = new Color(120,  95,  75, 255);  // medium warm brown
const C_BTN_LINK = new Color(182,  97,  62, 255);  // #B6613E
const C_GOLD     = new Color(182,  97,  62, 255);  // #B6613E title
const C_WHITE    = new Color(255, 255, 255, 255);
const C_DIM      = new Color( 61,  43,  31, 255);  // dark brown text

@ccclass('PrivacyDialog')
export class PrivacyDialog extends Component {
    @property(Node) firstPlayDialog: Node | null = null;

    private _confirmDialog: Node | null = null;
    private _built = false;

    onLoad() {
        if (!this._built) this._build();
    }

    // ── Build ─────────────────────────────────────────────────────────────────

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

        // ── Layout: top-down, balanced spacing ──
        // Title at top
        const title = _label('Title', i18n.t('privacy_title'), PANEL_W - 60, 32, C_GOLD);
        title.setPosition(0, PANEL_H / 2 - 50, 0);
        panel.addChild(title);

        // Message (wrapped) – centered vertically in the body
        const msg = _label('Message', i18n.t('privacy_message'), PANEL_W - 60, 22, C_DIM, true);
        const msgUt = msg.getComponent(UITransform)!;
        msgUt.setContentSize(PANEL_W - 60, 160);
        msg.setPosition(0, 50, 0);
        const msgLbl = msg.getComponent(Label)!;
        msgLbl.lineHeight = 30;
        msgLbl.verticalAlign = 1; // CENTER vertically within the box
        panel.addChild(msg);

        // Privacy link button – right under the message
        const linkBtn = _button('PrivacyLinkBtn', i18n.t('settings_privacy'),
            new Color(0, 0, 0, 0), 280, 36);
        linkBtn.setPosition(0, -70, 0);
        const linkLbl = linkBtn.children[0]?.getComponent(Label);
        if (linkLbl) { linkLbl.color = C_BTN_LINK; linkLbl.fontSize = 22; }
        linkBtn.on(Button.EventType.CLICK, this.onPrivacyLink, this);
        panel.addChild(linkBtn);

        // Decline + Agree buttons at bottom
        const btnY = -PANEL_H / 2 + 60;
        const declineBtn = _button('DeclineBtn', i18n.t('btn_decline'), C_BTN_DEC, 220, 60);
        declineBtn.setPosition(-130, btnY, 0);
        declineBtn.on(Button.EventType.CLICK, this.onDecline, this);
        panel.addChild(declineBtn);

        const agreeBtn = _button('AgreeBtn', i18n.t('btn_agree'), C_BTN_PRI, 220, 60);
        agreeBtn.setPosition(130, btnY, 0);
        agreeBtn.on(Button.EventType.CLICK, this.onAgree, this);
        panel.addChild(agreeBtn);

        // Decline confirm sub-dialog (initially hidden)
        this._confirmDialog = this._buildConfirmDialog();
        this._confirmDialog.active = false;
        this.node.addChild(this._confirmDialog);
    }

    private _buildConfirmDialog(): Node {
        const i18n = I18nManager.inst;
        const root = new Node('DeclineConfirmDialog');
        root.addComponent(UITransform).setContentSize(1280, 720);

        const ov = _node('SubOverlay', 1280, 720);
        _fill(ov, new Color(0, 0, 0, 110));
        root.addChild(ov);

        const panel = _node('ConfirmPanel', CONFIRM_W, CONFIRM_H);
        _roundRect(panel, C_PANEL, 20);
        root.addChild(panel);

        const msg = _label('Msg', i18n.t('privacy_decline_confirm'),
            CONFIRM_W - 60, 22, C_WHITE, true);
        msg.setPosition(0, 50, 0);
        const msgUt = msg.getComponent(UITransform)!;
        msgUt.setContentSize(CONFIRM_W - 60, 100);
        const msgLbl = msg.getComponent(Label)!;
        msgLbl.lineHeight = 30;
        panel.addChild(msg);

        const cancelBtn = _button('CancelBtn', i18n.t('btn_cancel'), C_BTN_DEC, 180, 56);
        cancelBtn.setPosition(-110, -80, 0);
        cancelBtn.on(Button.EventType.CLICK, this.onDeclineCancel, this);
        panel.addChild(cancelBtn);

        const confirmBtn = _button('ConfirmBtn', i18n.t('btn_confirm'), C_BTN_PRI, 180, 56);
        confirmBtn.setPosition(110, -80, 0);
        confirmBtn.on(Button.EventType.CLICK, this.onDeclineConfirm, this);
        panel.addChild(confirmBtn);

        return root;
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    onAgree() {
        AudioManager.inst.playSFX('button_click');
        DataManager.inst.setPrivacyAccepted(true);
        this.node.active = false;
        if (this.firstPlayDialog) this.firstPlayDialog.active = true;
    }

    onDecline() {
        AudioManager.inst.playSFX('button_click');
        if (this._confirmDialog) this._confirmDialog.active = true;
    }

    onDeclineConfirm() {
        (TTMinis?.game as any)?.exitMiniProgram?.();
    }

    onDeclineCancel() {
        AudioManager.inst.playSFX('button_click');
        if (this._confirmDialog) this._confirmDialog.active = false;
    }

    onPrivacyLink() {
        const url = 'https://your-privacy-policy-url.com';
        (TTMinis?.game as any)?.openUrl?.({ url });
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
    // Set overflow before string/wrap: enableWrapText is ignored when
    // overflow == NONE (the default), which makes the label grow horizontally
    // to fit a single line and overflow the screen.
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
    if (bg.a > 0) _roundRect(n, bg, 14);
    n.addComponent(Button);
    const lbl = _label('label', text, w - 16, 24, C_WHITE);
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

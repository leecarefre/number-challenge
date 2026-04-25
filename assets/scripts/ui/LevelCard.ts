import {
    _decorator, Component, Node, Label, Color, Button,
    Graphics, Sprite, UITransform, UIOpacity,
} from 'cc';
import { createIconNode } from './IconUtil';

const { ccclass } = _decorator;

// ── Card dimensions ────────────────────────────────────────────────────────────
const CARD_W = 200;
const CARD_H = 200;

// ── Color palette ──────────────────────────────────────────────────────────────
const C_UNLOCKED   = new Color( 32,  68, 142, 255);
const C_THREE_STAR = new Color( 90,  62,  12, 255);
const C_LOCKED     = new Color( 24,  24,  44, 255);
const C_NUM        = new Color(210, 225, 255, 255);
const C_NUM_LOCK   = new Color( 52,  52,  82, 255);
const C_GOLD       = new Color(255, 200,  50, 255);
const C_STAR_EMPTY = new Color( 48,  68, 115, 255);

@ccclass('LevelCard')
export class LevelCard extends Component {
    private _level    = 1;
    private _unlocked = false;

    setup(level: number, stars: number, unlocked: boolean) {
        this._level    = level;
        this._unlocked = unlocked;

        // Ensure root UITransform
        let ut = this.node.getComponent(UITransform);
        if (!ut) ut = this.node.addComponent(UITransform);
        ut.setContentSize(CARD_W, CARD_H);

        // Kill the prefab's leftover sliced Sprite — it draws cyan corner brackets
        // (a Kenney "blue_button00.png" 9-slice frame from kenney_ui).
        // Belt-and-suspenders: clear frame, zero alpha, disable, then destroy.
        const sp = this.node.getComponent(Sprite);
        if (sp) {
            sp.spriteFrame = null;
            sp.color = new Color(0, 0, 0, 0);
            sp.enabled = false;
            sp.destroy();
        }

        this.node.removeAllChildren();

        // Background child (Sprite on prefab root conflicts with Graphics)
        const bgNode = new Node('__bg__');
        const bgUt   = bgNode.addComponent(UITransform);
        bgUt.setContentSize(CARD_W, CARD_H);
        bgNode.addComponent(Graphics);
        bgNode.addComponent(UIOpacity);
        this.node.addChild(bgNode);

        const bgColor = !unlocked ? C_LOCKED : (stars === 3 ? C_THREE_STAR : C_UNLOCKED);
        _roundRect(bgNode, bgColor, 18);

        // Level number
        const numNode = _label(String(level), 54, unlocked ? C_NUM : C_NUM_LOCK, true);
        numNode.setPosition(0, 26, 0);
        this.node.addChild(numNode);

        // Stars (sprite icons) or lock icon
        if (unlocked) {
            const SIZE = 22;
            const GAP  = 4;
            const totalW = 3 * SIZE + 2 * GAP;
            for (let i = 0; i < 3; i++) {
                const filled = i < stars;
                const star = createIconNode('star', SIZE);
                if (!filled) {
                    const op = star.addComponent(UIOpacity);
                    op.opacity = 70;
                }
                star.setPosition(-totalW / 2 + SIZE / 2 + i * (SIZE + GAP), -44, 0);
                this.node.addChild(star);
            }
        } else {
            const lock = createIconNode('lock', 36);
            lock.setPosition(0, -44, 0);
            const op = lock.addComponent(UIOpacity);
            op.opacity = 130;
            this.node.addChild(lock);
        }

        // Tap target
        let btn = this.node.getComponent(Button);
        if (!btn) btn = this.node.addComponent(Button);
        btn.interactable = unlocked;
        this.node.off('click');
        if (unlocked) this.node.on('click', this.onCardTap, this);
    }

    onCardTap() {
        if (!this._unlocked) return;
        let p: Node | null = this.node.parent;
        while (p) {
            const comp = p.getComponent('HomeUI') as any;
            if (comp) { comp.enterLevel(this._level); return; }
            p = p.parent;
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _label(str: string, size: number, color: Color, bold = false): Node {
    const n  = new Node('lbl');
    const ut = n.addComponent(UITransform);
    ut.setContentSize(CARD_W - 16, size + 12);
    const lbl = n.addComponent(Label);
    lbl.string          = str;
    lbl.fontSize        = size;
    lbl.color           = color;
    lbl.isBold          = bold;
    lbl.horizontalAlign = 1; // CENTER
    return n;
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

import {
    _decorator, Component, Node, Label, Graphics, Color,
    UITransform, Vec3, tween, Prefab, instantiate,
} from 'cc';
import { LevelData } from './LevelGenerator';

const { ccclass, property } = _decorator;

export type NodeState = 'normal' | 'current' | 'connected' | 'error' | 'hint' | 'rangeHint';

// Design reference (from spec)
const GRID_SPECS: Record<number, { spacing: number; diameter: number }> = {
    4: { spacing: 140, diameter: 110 },
    6: { spacing: 105, diameter: 80  },
    8: { spacing: 82,  diameter: 62  },
};

const COLOR_NODE_BG      = new Color(255, 255, 255, 255);
const COLOR_NODE_BLANK   = new Color(180, 180, 180, 80);
const COLOR_CONNECTED    = new Color(100, 220, 120, 255);
const COLOR_CURRENT      = new Color(90,  180, 255, 255);
const COLOR_ERROR        = new Color(255,  80,  80, 255);
const COLOR_HINT         = new Color(255, 230,  60, 255);
const COLOR_RANGE_HINT   = new Color(100, 220, 120, 80);
const COLOR_TEXT_NORMAL  = new Color( 50,  50,  50, 255);
const COLOR_TEXT_BLANK   = new Color(160, 160, 160, 80);

@ccclass('GridRenderer')
export class GridRenderer extends Component {
    @property(Prefab) numberNodePrefab: Prefab | null = null;

    private _data: LevelData | null = null;
    private _nodeMap: Map<string, Node> = new Map(); // "r,c" → Node
    private _spacing = 82;
    private _diameter = 62;

    /** Call once with level data to build the grid. */
    build(data: LevelData) {
        this._data = data;
        // Destroy ONLY previously-built grid cells. Calling
        // node.removeAllChildren() also strips siblings like LineRenderer
        // that share this container, killing the connection line.
        this._nodeMap.forEach(n => n.destroy());
        this._nodeMap.clear();

        const spec = GRID_SPECS[data.size] ?? GRID_SPECS[8];
        this._spacing = spec.spacing;
        this._diameter = spec.diameter;

        const n = data.size;
        const offset = ((n - 1) * this._spacing) / 2;

        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const val = data.grid[r][c];
                const nodeEl = this._createNodeElement(val);
                nodeEl.setPosition(
                    c * this._spacing - offset,
                    -(r * this._spacing - offset),
                    0,
                );
                this.node.addChild(nodeEl);
                this._nodeMap.set(`${r},${c}`, nodeEl);
            }
        }
    }

    /** World position → grid [row, col], or null if out of bounds. */
    worldPosToGrid(wx: number, wy: number): [number, number] | null {
        const local = this.node.getComponent(UITransform)!
            .convertToNodeSpaceAR(new Vec3(wx, wy, 0));
        const n = this._data!.size;
        const offset = ((n - 1) * this._spacing) / 2;
        const c = Math.round((local.x + offset) / this._spacing);
        const r = Math.round((-local.y + offset) / this._spacing);
        if (c < 0 || c >= n || r < 0 || r >= n) return null;
        // Hit-test: within half spacing radius
        const ex = c * this._spacing - offset;
        const ey = -(r * this._spacing - offset);
        const dist = Math.sqrt((local.x - ex) ** 2 + (local.y - ey) ** 2);
        if (dist > this._spacing * 0.55) return null;
        return [r, c];
    }

    getNodeWorldPos(r: number, c: number): Vec3 {
        const n = this._nodeMap.get(`${r},${c}`);
        if (!n) return Vec3.ZERO.clone();
        return n.getWorldPosition();
    }

    setNodeState(r: number, c: number, state: NodeState) {
        const n = this._nodeMap.get(`${r},${c}`);
        if (!n) return;
        const g = n.getComponent(Graphics)!;
        g.clear();
        const isBlank = this._data!.grid[r][c] === 0;
        this._drawCircle(g, state, isBlank);

        // Reveal the blank cell's number once it's reached.
        if (isBlank && (state === 'connected' || state === 'current')) {
            this._ensureBlankLabel(r, c, n);
        }

        if (state === 'error') {
            // Flash red then restore
            tween(n)
                .delay(0.4)
                .call(() => {
                    this.setNodeState(r, c, 'normal');
                })
                .start();
        }

        if (state === 'current') {
            // Breathing scale animation
            tween(n)
                .repeatForever(
                    tween(n)
                        .to(0.6, { scale: new Vec3(1.15, 1.15, 1) })
                        .to(0.6, { scale: new Vec3(1.0,  1.0,  1) }),
                )
                .start();
        } else {
            tween(n).stop();
            n.setScale(1, 1, 1);
        }
    }

    setRangeHint(r: number, c: number) {
        const n = this._data!.size;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
                const node = this._nodeMap.get(`${nr},${nc}`);
                if (!node) continue;
                const g = node.getComponent(Graphics)!;
                g.clear();
                this._drawCircle(g, 'rangeHint', this._data!.grid[nr][nc] === 0);
            }
        }
        this.scheduleOnce(() => this._resetAllNonConnected(), 3);
    }

    clearHintStates() {
        this._resetAllNonConnected();
    }

    private _resetAllNonConnected() {
        if (!this._data) return;
        const n = this._data.size;
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const node = this._nodeMap.get(`${r},${c}`);
                if (node) {
                    tween(node).stop();
                    node.setScale(1, 1, 1);
                    const g = node.getComponent(Graphics)!;
                    g.clear();
                    this._drawCircle(g, 'normal', this._data!.grid[r][c] === 0);
                }
            }
        }
    }

    private _ensureBlankLabel(r: number, c: number, node: Node) {
        if (node.getChildByName('label')) return;
        const pathIdx = this._data!.path.findIndex(([pr, pc]) => pr === r && pc === c);
        if (pathIdx < 0) return;
        const labelNode = new Node('label');
        const label = labelNode.addComponent(Label);
        label.string   = String(pathIdx + 1);
        label.fontSize = Math.round(this._diameter * 0.45);
        label.color    = COLOR_TEXT_NORMAL;
        node.addChild(labelNode);
    }

    // ─── Node creation ─────────────────────────────────────────────────────────

    private _createNodeElement(value: number): Node {
        const n = new Node(`node_${value}`);

        const g = n.addComponent(Graphics);
        const isBlank = value === 0;
        this._drawCircle(g, 'normal', isBlank);

        if (value > 0) {
            const labelNode = new Node('label');
            const label = labelNode.addComponent(Label);
            label.string = String(value);
            label.fontSize = Math.round(this._diameter * 0.45);
            label.color = COLOR_TEXT_NORMAL;
            n.addChild(labelNode);
        }

        const ut = n.getComponent(UITransform) ?? n.addComponent(UITransform);
        ut.setContentSize(this._diameter, this._diameter);
        return n;
    }

    private _drawCircle(g: Graphics, state: NodeState, isBlank: boolean) {
        const r = this._diameter / 2;

        // Blank cells stay subtle only while in the default 'normal' state.
        // Once they're connected/current/error/hint we render them as solid
        // circles like any other reached node. The dashed-arc style read as a
        // bright white outline against the dark scene bg, so we replace it
        // with a faint dotted ring that hints at the slot without competing
        // with filled cells.
        if (isBlank && state === 'normal') {
            g.fillColor = new Color(110, 130, 175, 110);
            const dots = 10;
            const dotR = Math.max(1.5, r * 0.05);
            for (let i = 0; i < dots; i++) {
                const a = (i / dots) * Math.PI * 2;
                g.circle(Math.cos(a) * (r - dotR), Math.sin(a) * (r - dotR), dotR);
            }
            g.fill();
            return;
        }

        g.lineWidth = 3;
        switch (state) {
            case 'connected':   g.fillColor = COLOR_CONNECTED;  break;
            case 'current':     g.fillColor = COLOR_CURRENT;    break;
            case 'error':       g.fillColor = COLOR_ERROR;      break;
            case 'hint':        g.fillColor = COLOR_HINT;       break;
            case 'rangeHint':   g.fillColor = COLOR_RANGE_HINT; break;
            default:            g.fillColor = COLOR_NODE_BG;    break;
        }
        g.strokeColor = new Color(200, 200, 200, 255);
        g.circle(0, 0, r);
        g.fill();
        g.stroke();
    }
}

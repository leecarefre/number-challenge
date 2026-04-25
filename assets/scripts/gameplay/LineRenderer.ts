import { _decorator, Component, Graphics, Color, Vec3, tween, UITransform } from 'cc';

const { ccclass } = _decorator;

const COLOR_PREVIEW   = new Color(120, 210, 255, 180);
const COLOR_PREVIEW_CORE = new Color(220, 240, 255, 220);
const COLOR_CONNECTED = new Color( 80, 210, 110, 255);
const COLOR_CONNECTED_CORE = new Color(200, 255, 215, 255);
const COLOR_ERROR     = new Color(255,  60,  60, 255);
const LINE_WIDTH_PREVIEW       = 10;
const LINE_WIDTH_PREVIEW_CORE  = 4;
const LINE_WIDTH_CONNECTED     = 14;
const LINE_WIDTH_CONNECTED_CORE = 6;

interface Segment {
    from: Vec3;
    to: Vec3;
}

@ccclass('LineRenderer')
export class LineRenderer extends Component {
    private _g: Graphics | null = null;
    private _committed: Segment[] = [];
    private _previewFrom: Vec3 | null = null;
    private _previewTo: Vec3 | null = null;
    private _showingError = false;
    private _hintSegment: Segment | null = null;

    onLoad() {
        this._g = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        // Coordinate conversion in _toLocal needs UITransform; the scene-stored
        // node already provides one but we add a fallback for safety.
        if (!this.node.getComponent(UITransform)) this.node.addComponent(UITransform);
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /** Update the live drag preview line. fromWorld / toWorld in world coordinates. */
    updatePreview(from: Vec3, to: Vec3) {
        if (this._showingError) return;
        this._previewFrom = from.clone();
        this._previewTo   = to.clone();
        this._redraw();
    }

    clearPreview() {
        this._previewFrom = null;
        this._previewTo   = null;
        this._redraw();
    }

    /** Permanently commit a successful connection segment. */
    commitSegment(from: Vec3, to: Vec3) {
        this._committed.push({ from: from.clone(), to: to.clone() });
        this._previewFrom = null;
        this._previewTo   = null;
        this._redraw();
    }

    /** Flash a red error line then remove it. */
    showError(from: Vec3, to: Vec3) {
        this._showingError = true;
        this._previewFrom = null;
        this._previewTo   = null;
        this._drawErrorLine(from, to);
        this.scheduleOnce(() => {
            this._showingError = false;
            this._redraw();
        }, 0.4);
    }

    /** Draw a temporary hint line (auto-disappears after 3 s). */
    showHintSegment(from: Vec3, to: Vec3) {
        this._hintSegment = { from: from.clone(), to: to.clone() };
        this._redraw();
        this.scheduleOnce(() => {
            this._hintSegment = null;
            this._redraw();
        }, 3);
    }

    clearAll() {
        this._committed = [];
        this._previewFrom = null;
        this._previewTo   = null;
        this._hintSegment = null;
        this._showingError = false;
        this._g?.clear();
    }

    // ─── Drawing ───────────────────────────────────────────────────────────────

    private _redraw() {
        const g = this._g;
        if (!g) return;
        g.clear();
        g.lineCap  = 1; // ROUND
        g.lineJoin = 1;

        // Committed segments — outer halo + inner highlight, drawn in two
        // separate stroke passes so each carries its own width/color.
        if (this._committed.length > 0) {
            g.lineWidth   = LINE_WIDTH_CONNECTED;
            g.strokeColor = COLOR_CONNECTED;
            for (const seg of this._committed) {
                const f = this._toLocal(seg.from);
                const t = this._toLocal(seg.to);
                g.moveTo(f.x, f.y);
                g.lineTo(t.x, t.y);
            }
            g.stroke();

            g.lineWidth   = LINE_WIDTH_CONNECTED_CORE;
            g.strokeColor = COLOR_CONNECTED_CORE;
            for (const seg of this._committed) {
                const f = this._toLocal(seg.from);
                const t = this._toLocal(seg.to);
                g.moveTo(f.x, f.y);
                g.lineTo(t.x, t.y);
            }
            g.stroke();
        }

        // Hint segment — gold glow
        if (this._hintSegment) {
            const f = this._toLocal(this._hintSegment.from);
            const t = this._toLocal(this._hintSegment.to);
            g.lineWidth   = LINE_WIDTH_CONNECTED;
            g.strokeColor = new Color(255, 220, 60, 180);
            g.moveTo(f.x, f.y);
            g.lineTo(t.x, t.y);
            g.stroke();
            g.lineWidth   = LINE_WIDTH_CONNECTED_CORE;
            g.strokeColor = new Color(255, 245, 200, 255);
            g.moveTo(f.x, f.y);
            g.lineTo(t.x, t.y);
            g.stroke();
        }

        // Preview line — translucent halo + bright core, follows the touch.
        if (this._previewFrom && this._previewTo) {
            const f = this._toLocal(this._previewFrom);
            const t = this._toLocal(this._previewTo);
            g.lineWidth   = LINE_WIDTH_PREVIEW;
            g.strokeColor = COLOR_PREVIEW;
            g.moveTo(f.x, f.y);
            g.lineTo(t.x, t.y);
            g.stroke();
            g.lineWidth   = LINE_WIDTH_PREVIEW_CORE;
            g.strokeColor = COLOR_PREVIEW_CORE;
            g.moveTo(f.x, f.y);
            g.lineTo(t.x, t.y);
            g.stroke();
        }
    }

    private _drawErrorLine(from: Vec3, to: Vec3) {
        const g = this._g;
        if (!g) return;
        g.clear();
        g.lineCap  = 1;
        g.lineJoin = 1;

        // Redraw committed (halo only — keep the error stroke prominent).
        if (this._committed.length > 0) {
            g.lineWidth   = LINE_WIDTH_CONNECTED;
            g.strokeColor = COLOR_CONNECTED;
            for (const seg of this._committed) {
                const fc = this._toLocal(seg.from);
                const tc = this._toLocal(seg.to);
                g.moveTo(fc.x, fc.y);
                g.lineTo(tc.x, tc.y);
            }
            g.stroke();
        }

        const f = this._toLocal(from);
        const t = this._toLocal(to);
        g.lineWidth   = LINE_WIDTH_PREVIEW;
        g.strokeColor = COLOR_ERROR;
        g.moveTo(f.x, f.y);
        g.lineTo(t.x, t.y);
        g.stroke();
    }

    private _toLocal(world: Vec3): Vec3 {
        return this.node.getComponent(UITransform)
            ?.convertToNodeSpaceAR(world) ?? world;
    }
}

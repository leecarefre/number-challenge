import { _decorator, Component, EventTouch, Node, Vec2, Vec3, input, Input, UITransform } from 'cc';
import { GridRenderer } from './GridRenderer';
import { LineRenderer } from './LineRenderer';

const { ccclass, property } = _decorator;

export interface DragResult {
    fromRow: number;
    fromCol: number;
    toRow: number;
    toCol: number;
}

/** Fires when the user completes a drag from one grid cell to another. */
export type DragCompleteCallback = (result: DragResult) => void;

@ccclass('InputHandler')
export class InputHandler extends Component {
    @property(GridRenderer) gridRenderer: GridRenderer | null = null;
    @property(LineRenderer) lineRenderer: LineRenderer | null = null;

    private _active = true;
    private _dragging = false;
    private _startRow = -1;
    private _startCol = -1;
    private _startWorldPos = new Vec3();
    private _onDragComplete: DragCompleteCallback | null = null;

    onLoad() {
        this.node.on(Node.EventType.TOUCH_START,  this._onTouchStart,  this);
        this.node.on(Node.EventType.TOUCH_MOVE,   this._onTouchMove,   this);
        this.node.on(Node.EventType.TOUCH_END,    this._onTouchEnd,    this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
    }

    onDestroy() {
        this.node.off(Node.EventType.TOUCH_START,  this._onTouchStart,  this);
        this.node.off(Node.EventType.TOUCH_MOVE,   this._onTouchMove,   this);
        this.node.off(Node.EventType.TOUCH_END,    this._onTouchEnd,    this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
    }

    setDragCompleteCallback(cb: DragCompleteCallback) {
        this._onDragComplete = cb;
    }

    setActive(v: boolean) {
        this._active = v;
        if (!v) this._cancelDrag();
    }

    // ─── Touch handlers ────────────────────────────────────────────────────────

    private _onTouchStart(evt: EventTouch) {
        if (!this._active || !this.gridRenderer) return;
        const wp = this._touchWorldPos(evt);
        const cell = this.gridRenderer.worldPosToGrid(wp.x, wp.y);
        if (!cell) return;

        this._dragging = true;
        this._startRow = cell[0];
        this._startCol = cell[1];
        this._startWorldPos.set(wp.x, wp.y, 0);
    }

    private _onTouchMove(evt: EventTouch) {
        if (!this._dragging || !this.lineRenderer) return;
        const wp = this._touchWorldPos(evt);
        this.lineRenderer.updatePreview(this._startWorldPos, new Vec3(wp.x, wp.y, 0));
    }

    private _onTouchEnd(evt: EventTouch) {
        if (!this._dragging) return;
        const wp = this._touchWorldPos(evt);
        const cell = this.gridRenderer?.worldPosToGrid(wp.x, wp.y);

        this.lineRenderer?.clearPreview();
        this._dragging = false;

        if (!cell) {
            // Released outside grid — cancel silently
            return;
        }

        const [toRow, toCol] = cell;
        if (toRow === this._startRow && toCol === this._startCol) return; // tapped same cell

        this._onDragComplete?.({
            fromRow: this._startRow,
            fromCol: this._startCol,
            toRow,
            toCol,
        });
    }

    private _onTouchCancel(_evt: EventTouch) {
        this._cancelDrag();
    }

    private _cancelDrag() {
        if (!this._dragging) return;
        this._dragging = false;
        this.lineRenderer?.clearPreview();
    }

    private _touchWorldPos(evt: EventTouch): Vec2 {
        return evt.getUILocation();
    }
}

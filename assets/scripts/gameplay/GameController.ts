import { _decorator, Component, Node, tween, Vec3, Camera } from 'cc';
import { LevelData, generateLevel } from './LevelGenerator';
import { GridRenderer } from './GridRenderer';
import { LineRenderer } from './LineRenderer';
import { InputHandler, DragResult } from './InputHandler';
import { DataManager } from '../core/DataManager';
import { AudioManager } from '../core/AudioManager';
import { GameManager } from '../core/GameManager';

const { ccclass, property } = _decorator;

export type GameState = 'idle' | 'playing' | 'win' | 'fail';

export interface GameEventCallbacks {
    onLivesChanged?: (lives: number) => void;
    onProgressChanged?: (current: number, total: number) => void;
    onWin?: (stars: number) => void;
    onFail?: () => void;
}

@ccclass('GameController')
export class GameController extends Component {
    @property(GridRenderer) gridRenderer: GridRenderer | null = null;
    @property(LineRenderer) lineRenderer: LineRenderer | null = null;
    @property(InputHandler) inputHandler: InputHandler | null = null;
    @property(Node)         cameraNode: Node | null = null;

    private _levelData: LevelData | null = null;
    private _state: GameState = 'idle';
    private _currentValue = 1;
    private _currentRow = -1;
    private _currentCol = -1;
    private _lives = 3;
    private _isTutorial = false;
    private _magnified = false;
    private _callbacks: GameEventCallbacks = {};

    get isMagnified(): boolean { return this._magnified; }

    // ─── Lifecycle ─────────────────────────────────────────────────────────────

    onLoad() {
        this.inputHandler?.setDragCompleteCallback(r => this._onDrag(r));
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    setCallbacks(cb: GameEventCallbacks) {
        this._callbacks = cb;
    }

    startLevel(level: number, isTutorial = false) {
        this._isTutorial = isTutorial;
        this._levelData = generateLevel(level);
        this._lives = DataManager.inst.data.lives;
        this._currentValue = 1;
        this._state = 'playing';

        this.gridRenderer!.build(this._levelData);
        this.lineRenderer!.clearAll();
        this.inputHandler!.setActive(true);

        // Find starting node (value=1)
        this._findAndSetCurrent(1);
        this._callbacks.onLivesChanged?.(this._lives);
        this._callbacks.onProgressChanged?.(0, this._levelData.total);
    }

    get state(): GameState { return this._state; }

    // ─── Item usage ────────────────────────────────────────────────────────────

    useHint() {
        if (this._state !== 'playing' || !this._levelData) return;
        if (!DataManager.inst.useItem('hint')) return;

        const next = this._currentValue + 1;
        const [nr, nc] = this._findCell(next);
        if (nr < 0) return;

        this.gridRenderer!.setNodeState(nr, nc, 'hint');
        const from = this.gridRenderer!.getNodeWorldPos(this._currentRow, this._currentCol);
        const to   = this.gridRenderer!.getNodeWorldPos(nr, nc);
        this.lineRenderer!.showHintSegment(from, to);

        this.scheduleOnce(() => {
            if (this._state === 'playing') {
                this.gridRenderer!.setNodeState(nr, nc, 'normal');
            }
        }, 3);
    }

    useRangeHint() {
        if (this._state !== 'playing') return;
        if (!DataManager.inst.useItem('rangeHint')) return;
        this.gridRenderer!.setRangeHint(this._currentRow, this._currentCol);
    }

    revive() {
        if (this._state !== 'fail') return;
        this._lives = DataManager.inst.data.lives;
        this._state = 'playing';
        this.inputHandler?.setActive(true);
        this._callbacks.onLivesChanged?.(this._lives);
    }

    useMagnifier() {
        if (!this.cameraNode) return;
        const cam = this.cameraNode.getComponent(Camera);
        if (!cam) return;
        // Track an explicit toggle flag instead of inferring from current
        // orthoHeight — the inferred check raced the in-flight tween and
        // could leave the camera stuck zoomed-in for the user.
        this._magnified = !this._magnified;
        const target = this._magnified ? 380 : 667;
        tween(cam).stop();
        tween(cam).to(0.25, { orthoHeight: target }).start();
    }

    // ─── Drag validation ───────────────────────────────────────────────────────

    private _onDrag(result: DragResult) {
        if (this._state !== 'playing' || !this._levelData) return;

        const { fromRow, fromCol, toRow, toCol } = result;
        const data = this._levelData;

        // Must start from the current active node
        if (fromRow !== this._currentRow || fromCol !== this._currentCol) {
            this._handleError(toRow, toCol);
            return;
        }

        // Must be 8-directionally adjacent
        const dr = Math.abs(toRow - fromRow);
        const dc = Math.abs(toCol - fromCol);
        if (dr > 1 || dc > 1) {
            this._handleError(toRow, toCol);
            return;
        }

        // Target value must be currentValue+1
        const targetVal = data.grid[toRow][toCol];
        const expectedVal = this._currentValue + 1;
        if (targetVal !== 0 && targetVal !== expectedVal) {
            this._handleError(toRow, toCol);
            return;
        }
        // Blank node: only valid if the path says this cell should be expectedVal
        if (targetVal === 0) {
            const pathIdx = data.path.findIndex(([r, c]) => r === toRow && c === toCol);
            if (pathIdx !== expectedVal - 1) {
                this._handleError(toRow, toCol);
                return;
            }
        }

        this._handleSuccess(toRow, toCol);
    }

    private _handleSuccess(toRow: number, toCol: number) {
        const from = this.gridRenderer!.getNodeWorldPos(this._currentRow, this._currentCol);
        const to   = this.gridRenderer!.getNodeWorldPos(toRow, toCol);

        this.gridRenderer!.setNodeState(this._currentRow, this._currentCol, 'connected');
        this.lineRenderer!.commitSegment(from, to);
        AudioManager.inst.playSFX('connect_success');

        this._currentValue++;
        this._currentRow = toRow;
        this._currentCol = toCol;

        const total = this._levelData!.total;
        this._callbacks.onProgressChanged?.(this._currentValue - 1, total);

        if (this._currentValue >= total) {
            this._handleWin();
        } else {
            this.gridRenderer!.setNodeState(toRow, toCol, 'current');
        }
    }

    private _handleError(toRow: number, toCol: number) {
        const from = this.gridRenderer!.getNodeWorldPos(this._currentRow, this._currentCol);
        const to   = this.gridRenderer!.getNodeWorldPos(toRow, toCol);

        this.lineRenderer!.showError(from, to);
        this.gridRenderer!.setNodeState(toRow, toCol, 'error');
        AudioManager.inst.playSFX('connect_error');

        if (!this._isTutorial) {
            const lost = DataManager.inst.loseLife();
            if (lost) {
                this._lives--;
                AudioManager.inst.playSFX('heart_lose');
                this._shakeScreen();
                this._callbacks.onLivesChanged?.(this._lives);
            }
            if (this._lives <= 0) {
                this.scheduleOnce(() => this._handleFail(), 0.5);
            }
        }
    }

    private _handleWin() {
        this._state = 'win';
        this.inputHandler!.setActive(false);
        AudioManager.inst.playSFX('win');
        const stars = this._lives >= 3 ? 3 : this._lives === 2 ? 2 : 1;
        const level = GameManager.inst.currentLevel.level;
        DataManager.inst.setLevelStars(level, stars);
        this.scheduleOnce(() => this._callbacks.onWin?.(stars), 0.6);
    }

    private _handleFail() {
        this._state = 'fail';
        this.inputHandler!.setActive(false);
        AudioManager.inst.playSFX('fail');
        this._callbacks.onFail?.();
    }

    private _shakeScreen() {
        const node = this.node.parent ?? this.node;
        const origin = node.position.clone();
        tween(node)
            .to(0.05, { position: new Vec3(origin.x + 12, origin.y, 0) })
            .to(0.05, { position: new Vec3(origin.x - 12, origin.y, 0) })
            .to(0.05, { position: new Vec3(origin.x + 8,  origin.y, 0) })
            .to(0.05, { position: new Vec3(origin.x - 8,  origin.y, 0) })
            .to(0.05, { position: origin })
            .start();
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    private _findAndSetCurrent(value: number) {
        const [r, c] = this._findCell(value);
        if (r < 0) return;
        this._currentRow = r;
        this._currentCol = c;
        this.gridRenderer!.setNodeState(r, c, 'current');
    }

    private _findCell(value: number): [number, number] {
        const d = this._levelData!;
        // value=1 and last node are never blanked; others may be 0
        const pathIdx = value - 1;
        if (pathIdx >= 0 && pathIdx < d.path.length) {
            return d.path[pathIdx];
        }
        return [-1, -1];
    }
}

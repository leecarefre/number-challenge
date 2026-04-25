import { _decorator, Component, director, game, Node, tween, UIOpacity, Sprite } from 'cc';

const { ccclass } = _decorator;

export interface LevelEntry {
    level: number;
    isTutorial: boolean;
}

@ccclass('GameManager')
export class GameManager extends Component {
    private static _inst: GameManager | null = null;
    static get inst(): GameManager {
        return GameManager._inst!;
    }

    private _currentLevel: LevelEntry = { level: 1, isTutorial: false };
    private _transitioning = false;

    onLoad() {
        if (GameManager._inst && GameManager._inst !== this) {
            this.destroy();
            return;
        }
        GameManager._inst = this;
        game.addPersistRootNode(this.node);
    }

    get currentLevel(): Readonly<LevelEntry> {
        return this._currentLevel;
    }

    setCurrentLevel(level: number, isTutorial = false) {
        this._currentLevel = { level, isTutorial };
    }

    // ─── Scene transitions with fade ───────────────────────────────────────────

    loadScene(name: 'Boot' | 'Home' | 'Game' | 'Shop') {
        if (this._transitioning) return;
        this._transitioning = true;
        this._fadeOut(() => {
            director.loadScene(name, () => {
                this._transitioning = false;
                this._fadeIn();
            });
        });
    }

    private _fadeOut(onDone: () => void) {
        const overlay = this._getOrCreateOverlay();
        const opacity = overlay.getComponent(UIOpacity)!;
        opacity.opacity = 0;
        overlay.active = true;
        tween(opacity)
            .to(0.25, { opacity: 255 })
            .call(onDone)
            .start();
    }

    private _fadeIn() {
        const overlay = this._getOrCreateOverlay();
        const opacity = overlay.getComponent(UIOpacity)!;
        tween(opacity)
            .to(0.25, { opacity: 0 })
            .call(() => { overlay.active = false; })
            .start();
    }

    private _overlay: Node | null = null;
    private _getOrCreateOverlay(): Node {
        if (this._overlay && this._overlay.isValid) return this._overlay;
        // Create a full-screen black overlay on a persistent canvas layer
        const n = new Node('__FadeOverlay');
        n.addComponent(Sprite);
        // Use a 1×1 white texture tinted black
        n.addComponent(UIOpacity);
        n.active = false;
        this.node.addChild(n);
        this._overlay = n;
        return n;
    }
}

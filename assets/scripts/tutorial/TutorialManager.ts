import {
    _decorator, Component, Node, Label, Color, tween, Vec3,
    UIOpacity, Button,
} from 'cc';
import { GridRenderer } from '../gameplay/GridRenderer';
import { LineRenderer } from '../gameplay/LineRenderer';
import { InputHandler } from '../gameplay/InputHandler';
import { GameController } from '../gameplay/GameController';
import { DataManager } from '../core/DataManager';
import { AudioManager } from '../core/AudioManager';
import { GameManager } from '../core/GameManager';
import { I18nManager } from '../core/I18nManager';

const { ccclass, property } = _decorator;

type TutorialStep = 1 | 2 | 3 | 4 | 5 | 6;

@ccclass('TutorialManager')
export class TutorialManager extends Component {
    @property(Node)           overlay: Node | null = null;
    @property(Label)          bubbleLabel: Label | null = null;
    @property(Node)           bubbleNode: Node | null = null;
    @property(Node)           fingerNode: Node | null = null;
    @property(Node)           skipBtn: Node | null = null;
    @property(Node)           skipConfirmDialog: Node | null = null;
    @property(GridRenderer)   gridRenderer: GridRenderer | null = null;
    @property(LineRenderer)   lineRenderer: LineRenderer | null = null;
    @property(InputHandler)   inputHandler: InputHandler | null = null;
    @property(GameController) gameController: GameController | null = null;

    private _step: TutorialStep = 1;
    private _demoInterval: any = null;

    // ─── Entry point ───────────────────────────────────────────────────────────

    startTutorial() {
        this.node.active = true;
        this.skipBtn && (this.skipBtn.active = false);
        this._goStep(1);
    }

    // ─── Step dispatch ─────────────────────────────────────────────────────────

    private _goStep(step: TutorialStep) {
        this._step = step;
        switch (step) {
            case 1: this._step1(); break;
            case 2: this._step2(); break;
            case 3: this._step3(); break;
            case 4: this._step4(); break;
            case 5: this._step5(); break;
            case 6: this._step6(); break;
        }
    }

    // Step 1: Full overlay + bubble intro + highlight node 1
    private _step1() {
        this._showOverlay(true);
        this._showBubble(I18nManager.inst.t('tutorial_intro'));
        this._highlightNode(1);
        this.scheduleOnce(() => this._goStep(2), 2.5);
    }

    // Step 2: Show finger pointing at node 1
    private _step2() {
        this._showBubble(I18nManager.inst.t('tutorial_tap_start'));
        this._showFinger(1);
        this.scheduleOnce(() => this._goStep(3), 2.5);
    }

    // Step 3: Auto-demo 1→2→3→4 with live lines
    private _step3() {
        this._showBubble(I18nManager.inst.t('tutorial_demo'));
        this._hideFinger();
        this.skipBtn && (this.skipBtn.active = true);
        this._demoSequence([1, 2, 3, 4], () => this._goStep(4));
    }

    // Step 4: Force a wrong move (player taps a non-adjacent cell), demonstrate life loss
    private _step4() {
        this._showBubble(I18nManager.inst.t('tutorial_mistake'));
        // Temporarily let input through but intercept result
        this.inputHandler?.setActive(true);
        this.gameController?.setCallbacks({
            onLivesChanged: () => {
                // After the red flash, show heart loss then proceed
                this.scheduleOnce(() => this._goStep(5), 1.5);
            },
        });
        // Prompt player to make a wrong move — restrict which cell they should hit
        // (We simply wait; GameController handles error feedback automatically)
    }

    // Step 5: Item introduction cards
    private _step5() {
        this.inputHandler?.setActive(false);
        this._showBubble(I18nManager.inst.t('tutorial_items'));
        // Give free trial items
        DataManager.inst.addItem('hint', 1);
        DataManager.inst.addItem('rangeHint', 1);
        this.scheduleOnce(() => this._goStep(6), 3);
    }

    // Step 6: Player independently completes the 4×4 level
    private _step6() {
        this._showOverlay(false);
        this._showBubble(I18nManager.inst.t('tutorial_intro'));
        this.inputHandler?.setActive(true);
        this.gameController?.setCallbacks({
            onWin: () => this._completeTutorial(),
            onFail: () => {
                // Restore lives and restart the free play
                DataManager.inst.restoreLife(3);
                this.gameController?.startLevel(1, true);
            },
        });
    }

    private _completeTutorial() {
        this._showBubble(I18nManager.inst.t('tutorial_complete'));
        // Reward
        DataManager.inst.addStamina(1);
        DataManager.inst.addItem('hint', 1);
        this.scheduleOnce(() => {
            this.node.active = false;
            GameManager.inst.loadScene('Home');
        }, 2);
    }

    // ─── Skip flow ─────────────────────────────────────────────────────────────

    onSkipBtn() {
        AudioManager.inst.playSFX('button_click');
        if (this.skipConfirmDialog) this.skipConfirmDialog.active = true;
    }

    onSkipConfirm() {
        AudioManager.inst.playSFX('button_click');
        if (this._demoInterval) { clearInterval(this._demoInterval); this._demoInterval = null; }
        this.unscheduleAllCallbacks();
        this.node.active = false;
        GameManager.inst.loadScene('Home');
    }

    onSkipCancel() {
        AudioManager.inst.playSFX('button_click');
        if (this.skipConfirmDialog) this.skipConfirmDialog.active = false;
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────

    private _showOverlay(on: boolean) {
        if (this.overlay) this.overlay.active = on;
    }

    private _showBubble(text: string) {
        if (this.bubbleNode) this.bubbleNode.active = true;
        if (this.bubbleLabel) this.bubbleLabel.string = text;
    }

    private _showFinger(value: number) {
        if (!this.fingerNode || !this.gridRenderer) return;
        const [r, c] = this._findCell(value);
        if (r < 0) return;
        const wp = this.gridRenderer.getNodeWorldPos(r, c);
        this.fingerNode.active = true;
        this.fingerNode.setWorldPosition(wp.x + 30, wp.y - 30, 0);
        // Bounce animation
        tween(this.fingerNode)
            .repeatForever(
                tween(this.fingerNode)
                    .to(0.4, { position: new Vec3(this.fingerNode.position.x, this.fingerNode.position.y + 10, 0) })
                    .to(0.4, { position: new Vec3(this.fingerNode.position.x, this.fingerNode.position.y - 10, 0) }),
            )
            .start();
    }

    private _hideFinger() {
        if (this.fingerNode) {
            tween(this.fingerNode).stop();
            this.fingerNode.active = false;
        }
    }

    private _highlightNode(value: number) {
        const [r, c] = this._findCell(value);
        if (r >= 0) this.gridRenderer?.setNodeState(r, c, 'hint');
    }

    private _demoSequence(values: number[], onDone: () => void) {
        let idx = 0;
        const next = () => {
            if (idx >= values.length - 1) { onDone(); return; }
            const fromVal = values[idx];
            const toVal   = values[idx + 1];
            const [fr, fc] = this._findCell(fromVal);
            const [tr, tc] = this._findCell(toVal);
            if (fr >= 0 && tr >= 0) {
                const from = this.gridRenderer!.getNodeWorldPos(fr, fc);
                const to   = this.gridRenderer!.getNodeWorldPos(tr, tc);
                this.gridRenderer!.setNodeState(fr, fc, 'connected');
                this.lineRenderer!.commitSegment(from, to);
                this.gridRenderer!.setNodeState(tr, tc, 'current');
                AudioManager.inst.playSFX('connect_success');
            }
            idx++;
            this.scheduleOnce(next, 0.6);
        };
        this.scheduleOnce(next, 0.5);
    }

    private _findCell(value: number): [number, number] {
        const ctrl = this.gameController as any;
        const data = ctrl?._levelData;
        if (!data) return [-1, -1];
        const idx = value - 1;
        return idx >= 0 && idx < data.path.length ? data.path[idx] : [-1, -1];
    }
}

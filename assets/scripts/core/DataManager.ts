import { _decorator, Component, game } from 'cc';
import '../mock/TTMinisMock';

const { ccclass } = _decorator;

export interface PlayerData {
    privacyAccepted: boolean;
    language: 'en' | 'ja';

    unlockedLevel: number;
    levelStars: Record<number, number>;

    stamina: number;
    staminaLastRecoverTime: number;

    lives: number;
    livesResetDate: string;

    items: {
        hint: number;
        rangeHint: number;
    };

    signIn: {
        weekStartDate: string;
        claimedDays: number[];
        lastSignInDate: string;
    };

    settings: {
        bgmOn: boolean;
        sfxOn: boolean;
    };
}

const STORAGE_KEY = 'numlink_player_data';
const STAMINA_MAX = 5;
const STAMINA_RECOVER_MS = 20 * 60 * 1000;
const LIVES_MAX = 3;

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function defaultData(): PlayerData {
    return {
        privacyAccepted: false,
        language: 'en',
        unlockedLevel: 1,
        levelStars: {},
        stamina: STAMINA_MAX,
        staminaLastRecoverTime: Date.now(),
        lives: LIVES_MAX,
        livesResetDate: todayStr(),
        items: { hint: 0, rangeHint: 0 },
        signIn: {
            weekStartDate: todayStr(),
            claimedDays: [],
            lastSignInDate: '',
        },
        settings: { bgmOn: true, sfxOn: true },
    };
}

@ccclass('DataManager')
export class DataManager extends Component {
    private static _inst: DataManager | null = null;
    static get inst(): DataManager {
        return DataManager._inst!;
    }

    private _data: PlayerData = defaultData();

    onLoad() {
        console.log('[DataManager] onLoad() called');
        if (DataManager._inst && DataManager._inst !== this) {
            this.destroy();
            return;
        }
        DataManager._inst = this;
        game.addPersistRootNode(this.node);
        this._load();
    }

    get data(): Readonly<PlayerData> {
        return this._data;
    }

    // ─── Persistence ───────────────────────────────────────────────────────────

    private _load() {
        TTMinis.game.getStorage({
            key: STORAGE_KEY,
            success: (res) => {
                try {
                    const saved = JSON.parse(res.data) as PlayerData;
                    this._data = Object.assign(defaultData(), saved);
                } catch {
                    this._data = defaultData();
                }
                this._applyOfflineRecovery();
                this._applyDailyLivesReset();
                this.save();
            },
            fail: () => {
                this._data = defaultData();
                this.save();
            },
        });
    }

    save() {
        TTMinis.game.setStorage({
            key: STORAGE_KEY,
            data: JSON.stringify(this._data),
        });
    }

    // ─── Stamina ───────────────────────────────────────────────────────────────

    private _applyOfflineRecovery() {
        const d = this._data;
        if (d.stamina >= STAMINA_MAX) {
            d.staminaLastRecoverTime = Date.now();
            return;
        }
        const elapsed = Date.now() - d.staminaLastRecoverTime;
        const recovered = Math.floor(elapsed / STAMINA_RECOVER_MS);
        if (recovered > 0) {
            d.stamina = Math.min(STAMINA_MAX, d.stamina + recovered);
            d.staminaLastRecoverTime += recovered * STAMINA_RECOVER_MS;
        }
    }

    /** Milliseconds until next stamina point (0 if full). */
    staminaNextRecoverMs(): number {
        const d = this._data;
        if (d.stamina >= STAMINA_MAX) return 0;
        const elapsed = Date.now() - d.staminaLastRecoverTime;
        return Math.max(0, STAMINA_RECOVER_MS - elapsed);
    }

    consumeStamina(): boolean {
        const d = this._data;
        if (d.stamina <= 0) return false;
        if (d.stamina === STAMINA_MAX) {
            d.staminaLastRecoverTime = Date.now();
        }
        d.stamina -= 1;
        this.save();
        return true;
    }

    addStamina(amount: number) {
        this._data.stamina = Math.min(STAMINA_MAX, this._data.stamina + amount);
        this.save();
    }

    // ─── Lives ─────────────────────────────────────────────────────────────────

    private _applyDailyLivesReset() {
        const d = this._data;
        if (d.livesResetDate !== todayStr()) {
            d.lives = LIVES_MAX;
            d.livesResetDate = todayStr();
        }
    }

    loseLife(): boolean {
        const d = this._data;
        if (d.lives <= 0) return false;
        d.lives -= 1;
        this.save();
        return true;
    }

    restoreLife(amount = 1) {
        this._data.lives = Math.min(LIVES_MAX, this._data.lives + amount);
        this.save();
    }

    // ─── Level Stars ───────────────────────────────────────────────────────────

    setLevelStars(level: number, stars: number) {
        const d = this._data;
        if ((d.levelStars[level] ?? 0) < stars) {
            d.levelStars[level] = stars;
        }
        if (level >= d.unlockedLevel && level < 20) {
            d.unlockedLevel = level + 1;
        }
        this.save();
    }

    // ─── Items ─────────────────────────────────────────────────────────────────

    addItem(type: 'hint' | 'rangeHint', amount: number) {
        this._data.items[type] += amount;
        this.save();
    }

    useItem(type: 'hint' | 'rangeHint'): boolean {
        if (this._data.items[type] <= 0) return false;
        this._data.items[type] -= 1;
        this.save();
        return true;
    }

    // ─── Sign In ───────────────────────────────────────────────────────────────

    /** Returns current day index (1–7) in the weekly cycle, or 0 if not yet started. */
    signInCurrentDay(): number {
        const d = this._data.signIn;
        const today = todayStr();
        if (!d.weekStartDate) return 1;
        const diffMs = new Date(today).getTime() - new Date(d.weekStartDate).getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        return Math.min(diffDays + 1, 7);
    }

    canSignInToday(): boolean {
        const d = this._data.signIn;
        const today = todayStr();
        if (d.lastSignInDate === today) return false;
        const currentDay = this.signInCurrentDay();
        return !d.claimedDays.includes(currentDay);
    }

    claimSignIn(): boolean {
        if (!this.canSignInToday()) return false;
        const d = this._data.signIn;
        const today = todayStr();

        if (d.lastSignInDate) {
            const lastMs = new Date(d.lastSignInDate).getTime();
            const todayMs = new Date(today).getTime();
            const gap = Math.floor((todayMs - lastMs) / 86400000);
            if (gap > 1) {
                // Broken streak — reset
                d.weekStartDate = today;
                d.claimedDays = [];
            }
        }

        const currentDay = this.signInCurrentDay();
        d.claimedDays.push(currentDay);
        d.lastSignInDate = today;

        // Award rewards
        const rewards: Record<number, () => void> = {
            1: () => this.addStamina(2),
            2: () => this.addItem('hint', 1),
            3: () => this.addItem('rangeHint', 1),
            4: () => this.addStamina(2),
            5: () => this.addItem('hint', 1),
            6: () => this.addItem('rangeHint', 1),
            7: () => { this.addStamina(3); this.addItem('hint', 2); },
        };
        rewards[currentDay]?.();

        if (currentDay === 7) {
            // Reset for next cycle
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            d.weekStartDate = tomorrow.toISOString().slice(0, 10);
            d.claimedDays = [];
        }

        this.save();
        return true;
    }

    // ─── Settings ──────────────────────────────────────────────────────────────

    setSetting<K extends keyof PlayerData['settings']>(key: K, val: PlayerData['settings'][K]) {
        this._data.settings[key] = val;
        this.save();
    }

    setLanguage(lang: 'en' | 'ja') {
        this._data.language = lang;
        this.save();
    }

    setPrivacyAccepted(v: boolean) {
        this._data.privacyAccepted = v;
        this.save();
    }
}

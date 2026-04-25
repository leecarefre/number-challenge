import { _decorator, Component, Label, game, resources } from 'cc';
import { DataManager } from './DataManager';

const { ccclass } = _decorator;

type LangCode = 'en' | 'ja';

@ccclass('I18nManager')
export class I18nManager extends Component {
    private static _inst: I18nManager | null = null;
    static get inst(): I18nManager {
        return I18nManager._inst!;
    }

    private _lang: LangCode = 'en';
    private _strings: Record<string, string> = {};
    private _labels: Set<{ label: Label; key: string }> = new Set();
    private _callbacks: Set<() => void> = new Set();

    onLoad() {
        if (I18nManager._inst && I18nManager._inst !== this) {
            this.destroy();
            return;
        }
        I18nManager._inst = this;
        game.addPersistRootNode(this.node);
    }

    /** Load strings for language. Call once after DataManager is ready. */
    async init(lang?: LangCode): Promise<void> {
        this._lang = lang ?? DataManager.inst.data.language;
        return this._loadStrings(this._lang);
    }

    private _loadStrings(lang: LangCode): Promise<void> {
        return new Promise((resolve, reject) => {
            resources.load(`i18n/${lang}`, (err, asset: any) => {
                if (err) {
                    console.error('[I18n] Failed to load:', lang, err);
                    reject(err);
                    return;
                }
                this._strings = asset.json ?? asset;
                resolve();
            });
        });
    }

    t(key: string, params?: Record<string, string | number>): string {
        let str = this._strings[key] ?? key;
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
            }
        }
        return str;
    }

    async switchLanguage(lang: LangCode) {
        if (this._lang === lang) return;
        this._lang = lang;
        await this._loadStrings(lang);
        DataManager.inst.setLanguage(lang);
        this._refreshAllLabels();
    }

    get currentLang(): LangCode {
        return this._lang;
    }

    /** Register a Label so it auto-refreshes on language switch. */
    registerLabel(label: Label, key: string) {
        const entry = { label, key };
        this._labels.add(entry);
        label.string = this.t(key);
        // Clean up when node is destroyed
        label.node.once('destroy', () => this._labels.delete(entry));
    }

    /**
     * Register a callback fired on every language switch. Use this for labels
     * built with params (e.g., t('level', {n})) that registerLabel can't handle.
     * Returns an unregister function.
     */
    registerCallback(cb: () => void): () => void {
        this._callbacks.add(cb);
        cb();
        return () => this._callbacks.delete(cb);
    }

    private _refreshAllLabels() {
        for (const entry of this._labels) {
            if (entry.label.isValid) {
                entry.label.string = this.t(entry.key);
            }
        }
        for (const cb of this._callbacks) cb();
    }
}

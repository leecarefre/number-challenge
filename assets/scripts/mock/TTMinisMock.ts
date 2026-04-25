/**
 * TTMinis SDK local mock for Cocos Preview / browser development.
 * Replace nothing on release — the real SDK is injected by the TikTok runtime.
 */

interface StorageResult {
    data: string;
    errMsg: string;
}

interface AdCallbacks {
    onLoad?: () => void;
    onError?: (err: { errCode: number; errMsg: string }) => void;
    onClose?: (res: { isEnded: boolean }) => void;
}

class RewardedVideoAdMock {
    private callbacks: AdCallbacks = {};
    load(): Promise<void> {
        console.log('[TTMock] RewardedVideoAd.load()');
        setTimeout(() => this.callbacks.onLoad?.(), 300);
        return Promise.resolve();
    }
    show(): Promise<void> {
        console.log('[TTMock] RewardedVideoAd.show() — simulating watched ad');
        return new Promise(resolve => {
            setTimeout(() => {
                this.callbacks.onClose?.({ isEnded: true });
                resolve();
            }, 1000);
        });
    }
    onLoad(cb: () => void) { this.callbacks.onLoad = cb; }
    onError(cb: (err: { errCode: number; errMsg: string }) => void) { this.callbacks.onError = cb; }
    onClose(cb: (res: { isEnded: boolean }) => void) { this.callbacks.onClose = cb; }
    offLoad() { this.callbacks.onLoad = undefined; }
    offError() { this.callbacks.onError = undefined; }
    offClose() { this.callbacks.onClose = undefined; }
}

const _storage: Record<string, string> = {};
let _showListeners: Array<() => void> = [];
let _hideListeners: Array<() => void> = [];

const TTMinisMockImpl = {
    setStorage(opts: { key: string; data: string; success?: () => void; fail?: (err: { errMsg: string }) => void }) {
        _storage[opts.key] = opts.data;
        opts.success?.();
    },
    getStorage(opts: { key: string; success?: (res: StorageResult) => void; fail?: (err: { errMsg: string }) => void }) {
        if (opts.key in _storage) {
            opts.success?.({ data: _storage[opts.key], errMsg: 'getStorage:ok' });
        } else {
            opts.fail?.({ errMsg: 'getStorage:fail data not found' });
        }
    },
    removeStorage(opts: { key: string; success?: () => void }) {
        delete _storage[opts.key];
        opts.success?.();
    },
    createRewardedVideoAd(_opts: { adUnitId: string }): RewardedVideoAdMock {
        console.log('[TTMock] createRewardedVideoAd');
        return new RewardedVideoAdMock();
    },
    onShow(cb: () => void) { _showListeners.push(cb); },
    onHide(cb: () => void) { _hideListeners.push(cb); },
    offShow(cb: () => void) { _showListeners = _showListeners.filter(l => l !== cb); },
    offHide(cb: () => void) { _hideListeners = _hideListeners.filter(l => l !== cb); },
    // Trigger helpers for manual testing in Cocos Preview
    _triggerShow() { _showListeners.forEach(l => l()); },
    _triggerHide() { _hideListeners.forEach(l => l()); },
};

// Inject into global scope if the real SDK is absent
declare const TTMinis: { game: typeof TTMinisMockImpl } | undefined;
if (typeof TTMinis === 'undefined') {
    // @ts-ignore
    globalThis.TTMinis = { game: TTMinisMockImpl };
    console.log('[TTMock] TTMinis mock installed');
}

export {};

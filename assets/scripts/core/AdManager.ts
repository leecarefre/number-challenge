import { _decorator, Component, game } from 'cc';
import '../mock/TTMinisMock';

const { ccclass } = _decorator;

// ← 在 TikTok 开发者控制台 → Ad Units 获取真实 ID 后替换
const AD_UNIT_STAMINA = 'YOUR_STAMINA_AD_UNIT_ID';
const AD_UNIT_REVIVE  = 'YOUR_REVIVE_AD_UNIT_ID';
const AD_UNIT_ITEM    = 'YOUR_ITEM_AD_UNIT_ID';

@ccclass('AdManager')
export class AdManager extends Component {
    private static _inst: AdManager | null = null;
    static get inst(): AdManager {
        return AdManager._inst!;
    }

    onLoad() {
        if (AdManager._inst && AdManager._inst !== this) {
            this.destroy();
            return;
        }
        AdManager._inst = this;
        game.addPersistRootNode(this.node);
    }

    showRewardedAd(adUnitId: string): Promise<boolean> {
        return new Promise(resolve => {
            const ad = TTMinis.game.createRewardedVideoAd({ adUnitId });

            const cleanup = () => {
                ad.offClose();
                ad.offError();
            };

            ad.onClose(res => {
                cleanup();
                resolve(res.isEnded);
            });
            ad.onError(err => {
                console.warn('[Ad] Error:', err);
                cleanup();
                resolve(false);
            });
            ad.load()
                .then(() => ad.show())
                .catch(err => {
                    console.warn('[Ad] Show failed:', err);
                    cleanup();
                    resolve(false);
                });
        });
    }

    showStaminaAd(): Promise<boolean> {
        return this.showRewardedAd(AD_UNIT_STAMINA);
    }

    showReviveAd(): Promise<boolean> {
        return this.showRewardedAd(AD_UNIT_REVIVE);
    }

    showItemAd(): Promise<boolean> {
        return this.showRewardedAd(AD_UNIT_ITEM);
    }
}

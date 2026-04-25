### **TikTok 小游戏完整开发手册**
#### **1. 开发者准备与基础配置**
+ 创建 Organization 和 App
+ 完成企业认证 + 行业资质审核
+ 获取 client_key、client_secret、appid
+ 配置 Basic Information（图标、名称、描述、Terms & Privacy、Apple Team ID 等）
+ 开启 IAA + IAP 变现功能
+ 添加 Trusted Domains（所有后端域名必须注册）
+ 添加测试用户（最多 30 个）

---

#### **2. Server APIs（后端）**
后端负责所有敏感操作：OAuth Token 管理、支付订单创建、用户信息获取、订阅管理等。前端只传递 code 或 trade_order_id。

##### **2.1 OAuth Token 管理（核心）**
JavaScript

```plain
// services/tiktokAuth.js
const BASE_URL = 'https://open.tiktokapis.com/v2';

class TikTokAuth {
  constructor() {
    this.tokenCache = new Map(); // open_id -> token info
  }

  async getAccessToken(openId) {
    const cached = this.tokenCache.get(openId);
    if (cached && cached.expiresAt > Date.now() + 60000) { // 提前 1 分钟刷新
      return cached.access_token;
    }

    // 刷新或首次获取
    const refreshToken = cached?.refresh_token;
    const res = await fetch(`${BASE_URL}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        grant_type: refreshToken ? 'refresh_token' : 'authorization_code',
        ...(refreshToken ? { refresh_token: refreshToken } : { code: '前端传来的code' })
      })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error_description);

    const tokenInfo = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000
    };

    this.tokenCache.set(openId, tokenInfo);
    return data.access_token;
  }

  async revokeToken(accessToken) {
    await fetch(`${BASE_URL}/oauth/revoke/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        token: accessToken
      })
    });
  }
}

export default new TikTokAuth();
```

##### **2.2 支付订单管理**
JavaScript

```plain
// services/tiktokPayment.js
class TikTokPayment {
  async checkRedeemAmount(amount) {
    const token = await TikTokAuth.getAccessToken(openId);
    const res = await fetch(`${BASE_URL}/minis/utility/check_redeem_amounts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token_type: "BEANS",
        token_amounts: [amount]
      })
    });
    const data = await res.json();
    if (!data.data.valid) throw new Error('定价不符合 TikTok 政策');
  }

  async createOrder(openId, tokenAmount, orderInfo) {
    await this.checkRedeemAmount(tokenAmount);

    const token = await TikTokAuth.getAccessToken(openId);
    const res = await fetch(`${BASE_URL}/minis/trade_order/create/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token_type: "BEANS",
        token_amount: tokenAmount,
        order_info: orderInfo
      })
    });

    return res.json();
  }

  async queryOrder(tradeOrderId) {
    const token = await TikTokAuth.getAccessToken(openId);
    const res = await fetch(`${BASE_URL}/minis/trade_order/query/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ trade_order_id: tradeOrderId })
    });
    return res.json();
  }
}

export default new TikTokPayment();
```

---

#### **3. Client SDK 初始化与基础工具**
##### **3.1 SDK 初始化**
JavaScript

```plain
// core/init.js
export async function initializeTikTokSDK() {
  return new Promise((resolve, reject) => {
    TTMinis.game.init({
      clientKey: import.meta.env.VITE_TIKTOK_CLIENT_KEY,

      success: async () => {
        console.log('[SDK] 初始化成功');
        
        // 初始化完成后执行核心模块
        setupLifecycle();
        DeviceInfo.init();
        RetentionManager.triggerRetention();
        
        resolve();
      },

      fail: (error) => {
        console.error('[SDK] 初始化失败', error);
        reject(error);
      }
    });
  });
}
```

##### **3.2 基础工具封装**
JavaScript

```plain
// utils/tiktokUtils.js
export const TikTokUtils = {
  // 兼容性检查
  canUse: (feature) => TTMinis.game.canIUse(feature),

  // 网络请求封装
  async request(options) {
    return new Promise((resolve, reject) => {
      TTMinis.game.request({
        ...options,
        success: resolve,
        fail: reject
      });
    });
  },

  // 本地存储封装（推荐使用）
  Storage: {
    async set(key, data) {
      return new Promise((resolve, reject) => {
        TTMinis.game.setStorage({
          key,
          data,
          success: resolve,
          fail: reject
        });
      });
    },

    async get(key) {
      return new Promise((resolve, reject) => {
        TTMinis.game.getStorage({
          key,
          success: (res) => resolve(res.data),
          fail: reject
        });
      });
    },

    async remove(key) {
      return new Promise((resolve, reject) => {
        TTMinis.game.removeStorage({ key, success: resolve, fail: reject });
      });
    },

    clear: () => TTMinis.game.clearStorageSync()
  },

  // 文件系统管理器
  getFS() {
    return TTMinis.game.getFileSystemManager();
  }
};
```

---



JavaScript

```plain
// main.js
async function initApp() {
  await new Promise((resolve, reject) => {
    TTMinis.game.init({
      clientKey: import.meta.env.VITE_TIKTOK_CLIENT_KEY,
      success: resolve,
      fail: reject
    });
  });

  setupLifecycle();
  DeviceInfo.init();
  RetentionManager.triggerRetention();
}

initApp();
```

**基础工具封装**：

JavaScript

```plain
// utils/tiktok.js
export const TikTok = {
  canUse: (api) => TTMinis.game.canIUse(api),

  request: (options) => new Promise((resolve, reject) => {
    TTMinis.game.request({ ...options, success: resolve, fail: reject });
  }),

  Storage: {
    set: (key, data) => new Promise((r, j) => 
      TTMinis.game.setStorage({ key, data, success: r, fail: j })
    ),
    get: (key) => new Promise((r, j) => 
      TTMinis.game.getStorage({ key, success: res => r(res.data), fail: j })
    )
  }
};
```

---

#### **4. 客户端核心能力**
**4.1 生命周期**

JavaScript

```plain
// core/lifecycle.js
let isFirstShow = true;

export function setupLifecycle() {
  TTMinis.game.onShow((result) => {
    if (isFirstShow) {
      isFirstShow = false;
      handleFirstLaunch(result.query);
    } else {
      handleResume(result.query);
    }
    resumeGameLogic();
  });

  TTMinis.game.onHide(() => {
    saveGameProgress();
    pauseAllAudioAndTimers();
  });
}
```

**4.2 登录授权**

JavaScript

```plain
// core/auth.js
export async function fullLoginFlow(needUserInfo = false) {
  let code = await silentLogin();
  let tokens = await backendExchangeCode(code);

  if (needUserInfo) {
    code = await explicitAuthorize("user.info.basic");
    tokens = await backendExchangeCode(code);
  }
  return tokens;
}
```

**4.3 支付**

JavaScript

```plain
// core/payment.js
export async function startPayment(product) {
  const orderRes = await backendCreateOrder(...);
  const tradeOrderId = orderRes.data.trade_order_id;

  return new Promise((resolve, reject) => {
    TTMinis.game.pay({
      trade_order_id: tradeOrderId,
      success: () => { refreshUserAssets(); resolve(true); },
      fail: reject
    });
  });
}
```

**4.4 广告**

JavaScript

```plain
// core/adManager.js
export function showRewardedAd(onSuccess, onFail) {
  const ad = TTMinis.game.createRewardedVideoAd({ adUnitId: 'xxx' });

  ad.onClose((res) => {
    if (res.isEnded) onSuccess();
    else onFail?.('early close');
    cleanupAd(ad);
  });

  ad.onError((err) => { onFail?.(err); cleanupAd(ad); });

  ad.show();
}
```

**4.5 留存激励**

JavaScript

```plain
// core/retention.js
export function triggerRetention() {
  if (TTMinis.game.canIUse('addShortcut')) {
    TTMinis.game.addShortcut({ success: checkShortcutReward });
  }
  if (TTMinis.game.canIUse('startEntranceMission')) {
    TTMinis.game.startEntranceMission({ success: checkEntranceReward });
  }
}
```

**4.6 音频管理**

JavaScript

```plain
// core/audio.js
export const AudioManager = {
  bgm: null,

  playBGM(src) {
    this.bgm = TTMinis.game.createInnerAudioContext();
    this.bgm.src = src;
    this.bgm.loop = true;
    this.bgm.play();
  },

  playEffect(src) {
    const sound = TTMinis.game.createInnerAudioContext();
    sound.src = src;
    sound.play();
    sound.onEnded(() => sound.destroy());
  }
};
```

**4.7 渲染 & Canvas**

JavaScript

```plain
// core/renderer.js
export class GameRenderer {
  constructor() {
    this.canvas = TTMinis.game.createCanvas();
    this.ctx = this.canvas.getContext('2d');
    TTMinis.game.setPreferredFramesPerSecond(60);
  }

  async loadImage(key, src) {
    return new Promise((resolve, reject) => {
      const img = TTMinis.game.createImage();
      img.src = src;
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
  }
}
```

---

#### **5. WebSocket**
JavaScript

```plain
// core/websocket.js
class GameWebSocket {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  connect(url, options = {}) {
    this.socket = TTMinis.game.connectSocket({
      url,
      header: options.header || {},
      timeout: options.timeout || 15000,

      success: () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        options.onOpen?.();
      },
      fail: (err) => {
        console.error('WebSocket 连接失败', err);
        this.reconnect(url, options);
      }
    });

    this.bindEvents(options);
  }

  bindEvents(options) {
    this.socket.onOpen(() => options.onOpen?.());
    this.socket.onMessage((res) => options.onMessage?.(res.data));
    this.socket.onClose((res) => {
      this.isConnected = false;
      options.onClose?.(res);
      this.reconnect();
    });
    this.socket.onError((res) => options.onError?.(res));
  }

  send(data) {
    if (this.socket && this.isConnected) {
      this.socket.send({ data });
    }
  }

  close() {
    if (this.socket) this.socket.close();
    this.socket = null;
    this.isConnected = false;
  }

  reconnect(url, options) {
    if (this.reconnectAttempts < 5) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(url, options), 2000);
    }
  }
}

export default new GameWebSocket();
```

---

#### **6. 文件系统（File System）**
JavaScript

```plain
// core/fileManager.js
const fs = TTMinis.game.getFileSystemManager();
const basePath = TTMinis.game.env.USER_DATA_PATH;

export const FileManager = {
  async save(key, data) {
    const filePath = `${basePath}/${key}.json`;
    return new Promise((resolve, reject) => {
      fs.writeFile({
        filePath,
        data: JSON.stringify(data),
        encoding: 'utf8',
        success: resolve,
        fail: reject
      });
    });
  },

  async load(key) {
    const filePath = `${basePath}/${key}.json`;
    return new Promise((resolve, reject) => {
      fs.readFile({
        filePath,
        encoding: 'utf8',
        success: (res) => resolve(JSON.parse(res.data || '{}')),
        fail: (err) => {
          if (err.errMsg?.includes('no such file')) resolve(null);
          else reject(err);
        }
      });
    });
  },

  async exists(key) {
    return new Promise((resolve) => {
      fs.access({
        path: `${basePath}/${key}.json`,
        success: () => resolve(true),
        fail: () => resolve(false)
      });
    });
  }
};
```

---

#### **7. 调试、上线与数据分析**
**调试命令**：

Bash

```plain
ttmg dev
```

**包体积限制**：

+ 总包 ≤ 30MB
+ 主包 ≤ 4MB
+ 独立分包 ≤ 4MB

**上线流程**：上传代码 → 预览 → 提交审核 → 发布（首次 Production）

**数据重点指标**：

+ 付费渗透率、ARPPU、eCPM、留存率、For You Feed Cards CTR（≥5%）


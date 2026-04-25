import { Node, Sprite, SpriteFrame, UITransform, resources } from 'cc';

// In-process cache of loaded icon SpriteFrames keyed by short name.
const cache = new Map<string, SpriteFrame>();

const ALL_ICONS = [
    'settings', 'energy', 'calendar', 'home', 'cart', 'magnify',
    'hint', 'range', 'heart', 'lock', 'gift', 'star', 'close', 'back', 'check',
];

/** Load a single icon SpriteFrame (cached). */
export function loadIcon(name: string): Promise<SpriteFrame | null> {
    const hit = cache.get(name);
    if (hit) return Promise.resolve(hit);
    return new Promise(resolve => {
        resources.load(`icons/${name}/spriteFrame`, SpriteFrame, (err, sf) => {
            if (err || !sf) { console.warn('[IconUtil] missing icon:', name, err); resolve(null); return; }
            cache.set(name, sf);
            resolve(sf);
        });
    });
}

/** Synchronous lookup — returns null if not yet loaded. */
export function getIcon(name: string): SpriteFrame | null {
    return cache.get(name) ?? null;
}

/** Preload every known icon. Call once during boot. */
export async function preloadIcons(): Promise<void> {
    await Promise.all(ALL_ICONS.map(n => loadIcon(n)));
}

/** Create a Sprite node showing the named icon at the given size. */
export function createIconNode(name: string, size = 48): Node {
    const n  = new Node(`icon-${name}`);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(size, size);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    const hit = cache.get(name);
    if (hit) {
        sp.spriteFrame = hit;
    } else {
        loadIcon(name).then(sf => { if (sf && sp.isValid) sp.spriteFrame = sf; });
    }
    return n;
}

/** Assign an icon SpriteFrame to an existing Sprite (sync if cached, async otherwise). */
export function setSpriteIcon(sprite: Sprite, name: string) {
    const hit = cache.get(name);
    if (hit) { sprite.spriteFrame = hit; return; }
    loadIcon(name).then(sf => { if (sf && sprite.isValid) sprite.spriteFrame = sf; });
}

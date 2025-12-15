import { describe, expect, it, vi } from 'vitest';

function createCache(){
  const store = new Map();
  return {
    match: (req) => Promise.resolve(store.get(new URL(req.url).href) || null),
    put: (req, res) => {
      store.set(new URL(req.url).href, res);
      return Promise.resolve();
    },
    addAll: (assets) => Promise.all(assets.map((asset) => {
      const url = new URL(asset, globalThis.location.href);
      store.set(url.href, new Response(asset));
    })),
    _store: store
  };
}

function createCacheStorage(){
  const caches = new Map();
  return {
    open: async (name) => {
      if(!caches.has(name)) caches.set(name, createCache());
      return caches.get(name);
    },
    match: async (req) => {
      for(const cache of caches.values()){
        const hit = await cache.match(req);
        if(hit) return hit;
      }
      return undefined;
    },
    keys: async () => Array.from(caches.keys()),
    delete: async (name) => caches.delete(name),
    _caches: caches
  };
}

describe('service worker fetch handling', () => {
  async function importSW(globalOverrides = {}){
    const listeners = {};
    const cacheStorage = createCacheStorage();
    vi.resetModules();
    Object.assign(globalThis, {
      location: new URL('http://example.com/'),
      caches: cacheStorage,
      fetch: vi.fn(),
      self: {
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn() },
        addEventListener: (type, cb) => { listeners[type] = cb; }
      },
      ...globalOverrides
    });
    await import('../sw.js');
    return { listeners, cacheStorage };
  }

  it('prefers network for JSON and caches the response', async () => {
    const networkResponse = new Response('network');
    const { listeners, cacheStorage } = await importSW({ fetch: vi.fn(() => Promise.resolve(networkResponse.clone())) });
    const req = new Request('http://example.com/data.json');
    const handler = listeners.fetch;
    let resolved;
    let respondPromise;

    await handler({
      request: req,
      respondWith: (promise) => {
        respondPromise = promise;
        return promise.then((res) => { resolved = res; });
      }
    });

    await respondPromise;
    expect(resolved).toBeDefined();
    expect(await resolved.text()).toBe('network');
    const cache = await cacheStorage.open('botw-armor-tracker-v5');
    const cached = await cache.match(req);
    expect(cached).toBeInstanceOf(Response);
    expect(await cached.text()).toBe('network');
  });

  it('serves cached assets before network for static files', async () => {
    const { listeners, cacheStorage } = await importSW();
    const cache = await cacheStorage.open('botw-armor-tracker-v5');
    const req = new Request('http://example.com/styles.css');
    const cached = new Response('cached-style');
    await cache.put(req, cached.clone());
    let resolved;
    let respondPromise;

    await listeners.fetch({
      request: req,
      respondWith: (promise) => {
        respondPromise = promise;
        return promise.then((res) => { resolved = res; });
      }
    });

    await respondPromise;
    expect(await resolved.text()).toBe('cached-style');
  });
});

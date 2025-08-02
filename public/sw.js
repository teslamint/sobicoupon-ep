// @ts-check
/// <reference lib="webworker" />

// Service Worker for Eunpyeong Coupon Store Locator
const CACHE_NAME = 'eunpyeong-coupon-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/app.js',
    '/app-mobile.js',
    '/styles.css',
    '/favicon.svg',
    '/manifest.json'
];

// Install event
self.addEventListener('install', (/** @type {ExtendableEvent} */ event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
            .catch((error) => {
                console.error('Cache installation failed:', error);
            })
    );
});

// Fetch event
self.addEventListener('fetch', (/** @type {FetchEvent} */ event) => {
    // 외부 API 요청은 캐싱하지 않고 직접 fetch
    const url = new URL(event.request.url);

    // 카카오맵 API, CDN, 외부 리소스는 직접 fetch
    if (
        url.hostname.includes('kakao.com') ||
        url.hostname.includes('daumcdn.net') ||
        url.hostname.includes('cloudflare.com') ||
        url.hostname !== self.location.hostname
    ) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 자체 리소스만 캐싱 처리
    event.respondWith(
        caches
            .match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
            .catch((error) => {
                console.error('Fetch failed:', error);
                throw error;
            })
    );
});

// Activate event
self.addEventListener('activate', (/** @type {ExtendableEvent} */ event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

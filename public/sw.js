const CACHE_NAME = 'comngon-v2';
const STATIC_ASSETS = [
    '/',
    '/logo.png',
    '/manifest.json',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: network-first strategy
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// ============================================
// 📱 PUSH NOTIFICATION HANDLERS
// ============================================

// Receive push notification from server
self.addEventListener('push', (event) => {
    let data = {
        title: 'Cơm Ngon',
        body: 'Bạn có thông báo mới',
        icon: '/logo.png',
        badge: '/logo.png',
        tag: 'comngon-notification',
        url: '/dashboard'
    };

    try {
        if (event.data) {
            const payload = event.data.json();
            data = {
                title: payload.title || data.title,
                body: payload.body || data.body,
                icon: payload.icon || data.icon,
                badge: data.badge,
                tag: payload.tag || data.tag,
                url: payload.url || data.url,
                data: payload
            };
        }
    } catch (e) {
        // If JSON parse fails, use text
        if (event.data) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        tag: data.tag,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        actions: [
            { action: 'open', title: 'Mở app' },
            { action: 'dismiss', title: 'Bỏ qua' }
        ],
        data: {
            url: data.url,
            ...data.data
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const url = event.notification.data?.url || '/dashboard';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                // Focus existing window if open
                for (const client of clients) {
                    if (client.url.includes('comngon') && 'focus' in client) {
                        client.navigate(url);
                        return client.focus();
                    }
                }
                // Open new window
                return self.clients.openWindow(url);
            })
    );
});

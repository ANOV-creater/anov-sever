// JUNO HAIR Booking System - Service Worker for Push Notifications

const CACHE_NAME = 'juno-hair-v1';
const urlsToCache = [
    '/step2.html',
    '/sw.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    // 즉시 활성화
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache).catch((error) => {
                    console.warn('Cache addAll failed, but continuing:', error);
                    // 캐시 실패해도 서비스워커 설치는 계속 진행
                    return Promise.resolve();
                });
            })
            .catch((error) => {
                console.error('Cache open failed:', error);
                // 캐시 실패해도 서비스워커 설치는 계속 진행
                return Promise.resolve();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    // 즉시 모든 클라이언트 제어
    event.waitUntil(self.clients.claim());
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            }
        )
    );
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
    console.log('Push event received:', event);
    
    let notificationData = {
        title: 'JUNO HAIR 예약 알림',
        body: '곧 예약 시간이 다가옵니다!',
        icon: '/assets/images/logo.png',
        badge: '/assets/images/badge.png',
        data: {
            url: '/admin.html'
        },
        actions: [
            {
                action: 'view',
                title: '예약 확인',
                icon: '/assets/images/view-icon.png'
            },
            {
                action: 'close',
                title: '닫기',
                icon: '/assets/images/close-icon.png'
            }
        ],
        requireInteraction: true,
        vibrate: [200, 100, 200]
    };

    // Parse push data if available
    if (event.data) {
        try {
            const pushData = event.data.json();
            notificationData = {
                ...notificationData,
                ...pushData
            };
        } catch (e) {
            console.log('Error parsing push data:', e);
        }
    }

    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationData)
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked:', event);
    
    event.notification.close();
    
    if (event.action === 'view') {
        // Open the booking page
        event.waitUntil(
            clients.openWindow('/admin.html')
        );
    } else if (event.action === 'close') {
        // Just close the notification
        return;
    } else {
        // Default action - open main page
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Background sync for offline booking submissions
self.addEventListener('sync', (event) => {
    console.log('Background sync event:', event.tag);
    
    if (event.tag === 'booking-sync') {
        event.waitUntil(
            syncPendingBookings()
        );
    }
});

// Function to sync pending bookings when back online
async function syncPendingBookings() {
    try {
        // Get pending bookings from IndexedDB or localStorage
        const pendingBookings = JSON.parse(localStorage.getItem('pendingBookings') || '[]');
        
        for (const booking of pendingBookings) {
            try {
                // Try to submit booking to server
                const response = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(booking)
                });
                
                if (response.ok) {
                    console.log('Booking synced successfully:', booking.id);
                    // Remove from pending list
                    const updatedPending = pendingBookings.filter(b => b.id !== booking.id);
                    localStorage.setItem('pendingBookings', JSON.stringify(updatedPending));
                }
            } catch (error) {
                console.error('Error syncing booking:', error);
            }
        }
    } catch (error) {
        console.error('Error in syncPendingBookings:', error);
    }
}

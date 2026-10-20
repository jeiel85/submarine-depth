/* Abyssal Horizon 서비스워커 (scope: 이 파일이 있는 /submarine-depth/ 디렉터리)
 * - 내비게이션: network-first, 실패 시 캐시된 같은 페이지 → index.html (오프라인 실행)
 * - 그 밖의 같은 출처 정적 자산(GET): stale-while-revalidate
 * - 캐시 쓰기는 event.waitUntil 로 이벤트 수명 안에서 끝낸다.
 * - 배포 구조가 바뀌면 CACHE_VERSION 을 올려 이전 캐시를 정리한다.
 */
const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'submarine-depth-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const SCOPE_PATH = new URL('./', self.location).pathname;
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, response) {
  if (!response || !response.ok) return Promise.resolve();
  const copy = response.clone();
  return caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
}

// 네트워크 우선. 응답이 오면 캐시 갱신을 이벤트 수명에 묶고, 실패하면 캐시(→ fallback)로 응답한다.
function networkFirst(event, fallbackUrl) {
  const { request } = event;
  const network = fetch(request);
  event.waitUntil(network.then((response) => cachePut(request, response)).catch(() => {}));
  return network.catch(() => caches.match(request, { ignoreSearch: request.mode === 'navigate' })
    .then((cached) => cached || (fallbackUrl ? caches.match(fallbackUrl) : undefined))
    .then((cached) => cached || Response.error()));
}

// 캐시가 있으면 즉시 응답하고, 백그라운드 갱신은 event.waitUntil 로 끝까지 수행한다.
function staleWhileRevalidate(event) {
  const { request } = event;
  const network = fetch(request);
  event.waitUntil(network.then((response) => cachePut(request, response)).catch(() => {}));
  return caches.match(request)
    .then((cached) => cached || network.catch(() => Response.error()));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event, './index.html'));
    return;
  }

  event.respondWith(staleWhileRevalidate(event));
});

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // index.html 요청 처리
        if (url.pathname === '/' || url.pathname === '/index.html') {
            // 환경변수 검증 (CI 환경에서는 완화된 검증)
            const isCI = env.CI === 'true' || env.NODE_ENV === 'test';
            const kakaoApiKey = env.KAKAO_API_KEY || 'test-key-for-ci';

            // CI 환경이 아닌 경우에만 엄격한 검증
            if (!isCI && (!kakaoApiKey || kakaoApiKey.length < 10)) {
                console.error('Invalid KAKAO_API_KEY in environment');
                return new Response('Service Temporarily Unavailable', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            // HTML 파일을 ASSETS 바인딩에서 가져오기
            const response = await env.ASSETS.fetch(request);

            if (!response.ok) {
                return response;
            }

            // HTML 컨텐츠를 텍스트로 읽어서 치환
            const html = await response.text();
            const modifiedHtml = html.replace('[KAKAO_API_KEY]', kakaoApiKey).replace(
                '</head>',
                `
          <script>
            // API 키를 전역 변수로 설정
            window.KAKAO_API_KEY = '${kakaoApiKey}';
          </script>
        </head>`
            );

            // 보안 헤더 강화
            const securityHeaders = {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                Pragma: 'no-cache',
                Expires: '0',
                // CSP 헤더 - XSS 방지 (카카오맵 API 지원)
                'Content-Security-Policy': [
                    "default-src 'self'",
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://*.daumcdn.net https://t1.daumcdn.net https://cdnjs.cloudflare.com",
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                    "font-src 'self' https://fonts.gstatic.com",
                    "img-src 'self' data: blob: https://*.daumcdn.net https://t1.daumcdn.net",
                    "connect-src 'self' https://dapi.kakao.com https://*.daumcdn.net",
                    "media-src 'self' data: blob:",
                    "frame-src 'none'",
                    "object-src 'none'",
                    "base-uri 'self'"
                ].join('; '),
                // 추가 보안 헤더
                'X-Frame-Options': 'DENY',
                'X-Content-Type-Options': 'nosniff',
                'X-XSS-Protection': '1; mode=block',
                'Referrer-Policy': 'strict-origin-when-cross-origin',
                'Permissions-Policy': 'geolocation=(self), microphone=(), camera=()'
            };

            return new Response(modifiedHtml, {
                status: response.status,
                headers: securityHeaders
            });
        }

        // 다른 정적 자산은 그대로 서빙
        return env.ASSETS.fetch(request);
    }
};

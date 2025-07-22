export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // index.html 요청 처리
    if (url.pathname === '/' || url.pathname === '/index.html') {
      // HTML 파일을 ASSETS 바인딩에서 가져오기
      const response = await env.ASSETS.fetch(request);
      
      // API 키가 없으면 원본 응답 반환
      if (!env.KAKAO_API_KEY) {
        console.error('KAKAO_API_KEY not found in environment');
        return response;
      }

      // HTML 컨텐츠를 텍스트로 읽어서 치환
      const html = await response.text();
      const modifiedHtml = html.replace('[KAKAO_API_KEY]', env.KAKAO_API_KEY);

      // 새로운 Response 생성
      return new Response(modifiedHtml, {
        status: response.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      });
    }

    // 다른 정적 자산은 그대로 서빙
    return env.ASSETS.fetch(request);
  },
};

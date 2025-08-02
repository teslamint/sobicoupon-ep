# Content Security Policy (CSP) 설정

## 📋 개요

은평구 소비쿠폰 시스템에서 사용하는 Content Security Policy (CSP) 설정에 대한 문서입니다. CSP는 XSS (Cross-Site Scripting) 공격을 방지하기 위한 핵심 보안 메커니즘입니다.

## 🛡️ 현재 CSP 설정

### 전체 CSP 헤더

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://*.daumcdn.net https://t1.daumcdn.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.daumcdn.net https://t1.daumcdn.net; connect-src 'self' https://dapi.kakao.com https://*.daumcdn.net; media-src 'self' data: blob:; frame-src 'none'; object-src 'none'; base-uri 'self'
```

### 지시어별 상세 설명

#### 1. `default-src 'self'`

- **목적**: 기본 리소스 로딩 정책
- **설정**: 자체 도메인에서만 리소스 로딩 허용
- **보안 효과**: 외부 악성 리소스 차단

#### 2. `script-src`

```
'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://*.daumcdn.net https://t1.daumcdn.net https://cdnjs.cloudflare.com
```

**허용 소스**:

- `'self'`: 자체 도메인의 JavaScript 파일
- `'unsafe-inline'`: 인라인 스크립트 (필요시에만)
- `'unsafe-eval'`: eval() 함수 사용 (카카오맵 SDK 필요)
- `https://dapi.kakao.com`: 카카오맵 API
- `https://*.daumcdn.net`: 카카오 CDN
- `https://t1.daumcdn.net`: 카카오 타일 서버
- `https://cdnjs.cloudflare.com`: XLSX.js 라이브러리

**보안 고려사항**:

- `'unsafe-inline'`과 `'unsafe-eval'`은 보안 위험이 있으나 카카오맵 SDK 호환성을 위해 필요
- 향후 nonce 또는 hash 기반 방식으로 개선 예정

#### 3. `style-src`

```
'self' 'unsafe-inline' https://fonts.googleapis.com
```

**허용 소스**:

- `'self'`: 자체 CSS 파일
- `'unsafe-inline'`: 인라인 스타일 (동적 스타일링 필요)
- `https://fonts.googleapis.com`: Google Fonts CSS

#### 4. `font-src`

```
'self' https://fonts.gstatic.com
```

**허용 소스**:

- `'self'`: 자체 폰트 파일
- `https://fonts.gstatic.com`: Google Fonts 파일

#### 5. `img-src`

```
'self' data: blob: https://*.daumcdn.net https://t1.daumcdn.net
```

**허용 소스**:

- `'self'`: 자체 이미지
- `data:`: Base64 인코딩된 이미지
- `blob:`: Blob URL 이미지
- `https://*.daumcdn.net`: 카카오맵 이미지
- `https://t1.daumcdn.net`: 카카오맵 타일 이미지

#### 6. `connect-src`

```
'self' https://dapi.kakao.com https://*.daumcdn.net
```

**허용 소스**:

- `'self'`: 자체 API 호출
- `https://dapi.kakao.com`: 카카오맵 API 호출
- `https://*.daumcdn.net`: 카카오 서비스 호출

#### 7. `media-src`

```
'self' data: blob:
```

**허용 소스**:

- `'self'`: 자체 미디어 파일
- `data:`: 인라인 미디어
- `blob:`: Blob 미디어

#### 8. `frame-src 'none'`

- **목적**: iframe 사용 금지
- **보안 효과**: 클릭재킹 공격 방지

#### 9. `object-src 'none'`

- **목적**: 플러그인 객체 사용 금지
- **보안 효과**: 플러그인 기반 공격 방지

#### 10. `base-uri 'self'`

- **목적**: base 태그 제한
- **보안 효과**: 상대 URL 조작 공격 방지

## ⚠️ 보안 취약점 및 완화 방안

### 현재 취약점

#### 1. `'unsafe-inline'` 사용

- **위험**: XSS 공격 가능성
- **필요 이유**: 카카오맵 SDK 호환성
- **완화 방안**:
    - 엄격한 입력 검증
    - HTML 이스케이프 처리
    - 향후 nonce 기반 방식 도입 검토

#### 2. `'unsafe-eval'` 사용

- **위험**: 동적 코드 실행 가능성
- **필요 이유**: 카카오맵 SDK 내부 사용
- **완화 방안**:
    - 신뢰할 수 있는 소스에서만 스크립트 로드
    - 정기적인 의존성 보안 감사

### 추가 보안 조치

#### 1. 엄격한 입력 검증

```javascript
// 사용자 입력 검증 예시
function sanitizeInput(input) {
    return input
        .replace(/[<>]/g, '') // HTML 태그 제거
        .replace(/javascript:/gi, '') // JavaScript URL 제거
        .trim();
}
```

#### 2. DOM 조작 시 안전한 방법 사용

```javascript
// 안전한 방법
element.textContent = userInput; // XSS 안전
element.setAttribute('data-value', sanitizedValue);

// 위험한 방법 (사용 금지)
element.innerHTML = userInput; // XSS 위험
```

## 🔄 CSP 업데이트 가이드

### 새로운 외부 리소스 추가 시

1. **보안 검토 수행**
    - 리소스 출처 신뢰성 확인
    - HTTPS 사용 여부 확인
    - 최소 권한 원칙 적용

2. **테스트 환경에서 검증**
    - CSP 위반 로그 모니터링
    - 기능 정상 작동 확인

3. **단계적 배포**
    - `Content-Security-Policy-Report-Only` 헤더로 먼저 테스트
    - 문제 없음을 확인 후 정식 적용

### CSP 모니터링

#### 1. 브라우저 개발자 도구

- Console 탭에서 CSP 위반 로그 확인
- Network 탭에서 차단된 리소스 확인

#### 2. 서버 로그 모니터링

- CSP 위반 보고서 수집 (향후 구현 예정)
- 정기적인 로그 분석

## 📝 개선 계획

### 단기 계획 (1-3개월)

1. **Nonce 기반 스크립트 로딩**
    - `'unsafe-inline'` 제거
    - 동적 nonce 생성 시스템 구축

2. **CSP 위반 보고서 수집**
    - 보고서 엔드포인트 구축
    - 위반 사례 모니터링 시스템

### 중기 계획 (3-6개월)

1. **외부 의존성 최소화**
    - 필수가 아닌 외부 리소스 제거
    - 자체 호스팅 방식 검토

2. **CSP 레벨 3 기능 도입**
    - `strict-dynamic` 키워드 사용
    - `'wasm-unsafe-eval'` 세분화

### 장기 계획 (6개월 이상)

1. **완전한 CSP 강화**
    - 모든 `'unsafe-*'` 제거
    - Hash 기반 리소스 검증

2. **보안 모니터링 자동화**
    - 실시간 CSP 위반 알림
    - 자동 보안 분석 리포트

## 🧪 테스트 방법

### 1. CSP 테스트 도구

```bash
# CSP Evaluator (Google)
https://csp-evaluator.withgoogle.com/

# Observatory (Mozilla)
https://observatory.mozilla.org/
```

### 2. 로컬 테스트

```javascript
// 브라우저 콘솔에서 CSP 위반 테스트
console.log('CSP 위반 테스트');
document.body.innerHTML = '<script>alert("XSS")</script>'; // 차단되어야 함
```

### 3. 자동화된 테스트

```javascript
// Jest 테스트 예시
describe('CSP Security', () => {
    test('should block inline scripts', () => {
        // CSP 위반 시나리오 테스트
    });
});
```

## 📚 참고 자료

- [MDN CSP 가이드](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP CSP 가이드](https://owasp.org/www-community/controls/Content_Security_Policy)
- [Google CSP 개발자 가이드](https://developers.google.com/web/fundamentals/security/csp)
- [카카오맵 API CSP 호환성](https://apis.map.kakao.com/web/guide/)

---

**마지막 업데이트**: 2025년 8월 2일
**작성자**: 보안팀
**검토 주기**: 분기별

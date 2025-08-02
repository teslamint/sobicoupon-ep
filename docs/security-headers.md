# 보안 헤더 설정 가이드

## 📋 개요

은평구 소비쿠폰 시스템에서 구현하는 HTTP 보안 헤더에 대한 종합 가이드입니다. 이 문서는 각 보안 헤더의 목적, 설정값, 그리고 보안 효과를 설명합니다.

## 🛡️ 구현된 보안 헤더

### 1. Content Security Policy (CSP)

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://*.daumcdn.net https://t1.daumcdn.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.daumcdn.net https://t1.daumcdn.net; connect-src 'self' https://dapi.kakao.com https://*.daumcdn.net; media-src 'self' data: blob:; frame-src 'none'; object-src 'none'; base-uri 'self'
```

**목적**: XSS 공격 방지
**보안 등급**: 🟡 중간 (unsafe-inline/unsafe-eval 사용)
**상세 설명**: [CSP 상세 문서](security-csp.md) 참조

### 2. X-Frame-Options

```http
X-Frame-Options: DENY
```

**목적**: 클릭재킹(Clickjacking) 공격 방지
**보안 등급**: 🟢 높음
**설명**:

- 페이지가 iframe에서 로드되는 것을 완전히 차단
- UI 리드레싱 공격 방지
- 대안: CSP의 `frame-ancestors` 지시어도 사용 가능

**가능한 값**:

- `DENY`: 모든 iframe 로딩 금지 (현재 설정)
- `SAMEORIGIN`: 동일 도메인에서만 iframe 허용
- `ALLOW-FROM uri`: 특정 도메인에서만 iframe 허용

### 3. X-Content-Type-Options

```http
X-Content-Type-Options: nosniff
```

**목적**: MIME 타입 스니핑 공격 방지
**보안 등급**: 🟢 높음
**설명**:

- 브라우저가 응답의 Content-Type 헤더를 무시하고 내용을 추측하는 것을 방지
- JavaScript/CSS 파일이 다른 MIME 타입으로 해석되어 실행되는 것을 차단
- XSS 공격의 한 벡터를 차단

### 4. X-XSS-Protection

```http
X-XSS-Protection: 1; mode=block
```

**목적**: 브라우저 내장 XSS 필터 활성화
**보안 등급**: 🟡 중간 (레거시 기능)
**설명**:

- 구형 브라우저(IE, 구 Chrome)의 XSS 필터 활성화
- 현대 브라우저에서는 CSP로 대체됨
- `mode=block`: XSS 감지 시 페이지 로딩 차단

**가능한 값**:

- `0`: XSS 필터 비활성화
- `1`: XSS 필터 활성화 (기본)
- `1; mode=block`: XSS 감지 시 페이지 차단 (현재 설정)

### 5. Referrer-Policy

```http
Referrer-Policy: strict-origin-when-cross-origin
```

**목적**: Referrer 정보 누출 방지
**보안 등급**: 🟢 높음
**설명**:

- 외부 사이트로 이동할 때 전송되는 Referrer 정보 제어
- 사용자 프라이버시 보호
- 민감한 URL 정보 노출 방지

**정책 설명**:

- **동일 출처**: 전체 URL 전송
- **HTTPS → HTTP**: Referrer 전송 안함
- **HTTPS → HTTPS**: Origin만 전송
- **HTTP → HTTP**: Origin만 전송

### 6. Permissions-Policy

```http
Permissions-Policy: geolocation=(self), microphone=(), camera=()
```

**목적**: 브라우저 기능 접근 권한 제어
**보안 등급**: 🟢 높음
**설명**:

- 민감한 브라우저 API에 대한 접근 권한 제어
- 의도하지 않은 권한 요청 방지
- 사용자 프라이버시 강화

**현재 설정**:

- `geolocation=(self)`: 위치 정보는 자체 도메인에서만 접근 가능
- `microphone=()`: 마이크 접근 완전 차단
- `camera=()`: 카메라 접근 완전 차단

### 7. Cache-Control & Related Headers

```http
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

**목적**: 민감한 콘텐츠 캐싱 방지
**보안 등급**: 🟢 높음
**설명**:

- HTML 파일의 캐싱을 방지하여 항상 최신 보안 설정 적용
- 브라우저와 프록시 서버에서 캐싱 방지
- 보안 업데이트의 즉시 반영 보장

## 🔍 보안 헤더 검사 도구

### 1. 온라인 검사 도구

#### Security Headers (securityheaders.com)

```bash
https://securityheaders.com/?q=https://sobicoupon.tmint.dev
```

- 종합적인 보안 헤더 분석
- 등급 평가 (A+, A, B, C, D, F)
- 개선 권장사항 제공

#### Mozilla Observatory

```bash
https://observatory.mozilla.org/analyze/sobicoupon.tmint.dev
```

- Mozilla의 보안 분석 도구
- 상세한 보안 권장사항
- 점수 기반 평가

### 2. 로컬 검사 방법

#### curl 명령어

```bash
# 전체 헤더 확인
curl -I https://sobicoupon.tmint.dev

# 특정 헤더만 확인
curl -H "User-Agent: Mozilla/5.0" -I https://sobicoupon.tmint.dev | grep -i "x-frame-options\|content-security-policy"
```

#### 브라우저 개발자 도구

1. F12 개발자 도구 열기
2. Network 탭 선택
3. 페이지 새로고침
4. HTML 문서 클릭
5. Response Headers 섹션 확인

### 3. 자동화된 검사

#### GitHub Actions 워크플로우

```yaml
# .github/workflows/security.yml에서 실행
- name: Check security headers
  run: |
      response=$(curl -s -I https://sobicoupon.tmint.dev)
      echo "$response" | grep -q "X-Frame-Options" || exit 1
      echo "$response" | grep -q "Content-Security-Policy" || exit 1
```

## ⚠️ 보안 고려사항

### 현재 제한사항

#### 1. CSP의 unsafe-inline/unsafe-eval

- **위험도**: 중간
- **원인**: 카카오맵 SDK 호환성
- **완화책**: 엄격한 입력 검증, 정기 의존성 검토

#### 2. X-XSS-Protection 사용

- **위험도**: 낮음
- **원인**: 레거시 브라우저 지원
- **완화책**: CSP가 주요 보호 메커니즘

### 추가 보안 강화 방안

#### 1. HSTS (HTTP Strict Transport Security)

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

- **목적**: HTTPS 강제 사용
- **구현 필요**: Cloudflare 설정에서 활성화

#### 2. Certificate Transparency

```http
Expect-CT: max-age=86400, enforce
```

- **목적**: SSL 인증서 투명성 보장
- **구현 고려**: 인증서 모니터링 강화

#### 3. Cross-Origin Resource Policy

```http
Cross-Origin-Resource-Policy: same-origin
```

- **목적**: 리소스 접근 제어
- **구현 고려**: API 엔드포인트 보호

## 🧪 테스트 시나리오

### 1. 클릭재킹 테스트

```html
<!-- 외부 사이트에서 테스트 -->
<iframe src="https://sobicoupon.tmint.dev"></iframe>
<!-- X-Frame-Options에 의해 차단되어야 함 -->
```

### 2. XSS 테스트

```javascript
// 브라우저 콘솔에서 테스트
document.body.innerHTML = '<script>alert("XSS")</script>';
// CSP에 의해 차단되어야 함
```

### 3. MIME 스니핑 테스트

```bash
# 잘못된 Content-Type으로 JavaScript 파일 요청
curl -H "Content-Type: text/plain" https://sobicoupon.tmint.dev/app.js
# nosniff에 의해 실행 차단되어야 함
```

## 📈 모니터링 및 알림

### 1. 보안 헤더 누락 감지

```bash
#!/bin/bash
# 보안 헤더 확인 스크립트
DOMAIN="https://sobicoupon.tmint.dev"
HEADERS=("X-Frame-Options" "Content-Security-Policy" "X-Content-Type-Options")

for header in "${HEADERS[@]}"; do
    if ! curl -s -I "$DOMAIN" | grep -qi "$header"; then
        echo "⚠️ 누락된 헤더: $header"
    fi
done
```

### 2. 정기 보안 검사

- **주기**: 주 1회 자동 실행
- **도구**: GitHub Actions + securityheaders.com API
- **알림**: Slack/Discord 웹훅

## 🔄 업데이트 프로세스

### 1. 보안 헤더 변경 절차

1. **개발 환경 테스트**

    ```bash
    # 로컬에서 헤더 테스트
    http-server dist/public -p 8080 --cors
    ```

2. **스테이징 배포**
    - 변경사항을 스테이징 환경에 배포
    - 자동화된 보안 테스트 실행

3. **프로덕션 배포**
    - 기능 검증 완료 후 프로덕션 반영
    - 배포 후 보안 헤더 검증

### 2. 긴급 보안 업데이트

1. **즉시 적용**: 중요 보안 취약점 발견 시
2. **핫픽스 배포**: 최소 변경으로 즉시 수정
3. **사후 검토**: 원인 분석 및 재발 방지책 수립

## 📚 참고 자료

### 공식 문서

- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [MDN HTTP Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- [RFC 7034 - X-Frame-Options](https://tools.ietf.org/html/rfc7034)

### 보안 검사 도구

- [Security Headers](https://securityheaders.com/)
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [SSL Labs](https://www.ssllabs.com/ssltest/)

### 업데이트 소스

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Web Security Guidelines](https://infosec.mozilla.org/guidelines/web_security)
- [Cloudflare Security Center](https://developers.cloudflare.com/security/)

---

**마지막 업데이트**: 2025년 8월 2일
**작성자**: 보안팀
**검토 주기**: 월 1회

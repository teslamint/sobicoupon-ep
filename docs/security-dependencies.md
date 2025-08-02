# 의존성 보안 관리 가이드

## 📋 개요

은평구 소비쿠폰 시스템의 의존성 보안 관리에 대한 종합 가이드입니다. 안전한 의존성 관리 방법, 취약점 검사 도구, 그리고 보안 업데이트 프로세스를 다룹니다.

## 📦 현재 의존성 현황

### 프로덕션 의존성

#### 런타임 의존성 (0개)

```json
{
    "dependencies": {}
}
```

- **특징**: 순수 JavaScript 프로젝트로 런타임 의존성 없음
- **보안 이점**: 공급망 공격(Supply Chain Attack) 위험 최소화
- **관리 부담**: 낮음

#### CDN 의존성 (2개)

1. **XLSX.js** (`https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`)
    - **버전**: 0.18.5
    - **용도**: 엑셀 파일 파싱
    - **보안 검토**: ✅ 정기 검토 필요

2. **카카오맵 SDK** (`https://dapi.kakao.com/v2/maps/sdk.js`)
    - **버전**: v2 (카카오에서 관리)
    - **용도**: 지도 기능
    - **보안 검토**: ✅ 카카오 공식 SDK

### 개발 의존성

#### 빌드 도구

```json
{
    "esbuild": "^0.20.2",
    "wrangler": "^3.57.1"
}
```

#### 테스트 도구

```json
{
    "jest": "^29.7.0",
    "@playwright/test": "^1.44.1",
    "fake-indexeddb": "^6.0.0"
}
```

#### 코드 품질 도구

```json
{
    "eslint": "^9.4.0",
    "prettier": "^3.3.2",
    "husky": "^9.0.11",
    "lint-staged": "^15.2.7"
}
```

## 🛡️ 보안 검사 도구

### 1. pnpm audit

#### 자동 실행

```bash
# package.json scripts
"audit": "pnpm audit --audit-level=moderate"
```

#### 수동 실행

```bash
# 모든 취약점 확인
pnpm audit

# 중간 이상 심각도만 확인
pnpm audit --audit-level=moderate

# 높음 이상 심각도만 확인
pnpm audit --audit-level=high

# JSON 형태로 출력
pnpm audit --json
```

#### 심각도 분류

- **Critical**: 즉시 수정 필요
- **High**: 7일 이내 수정
- **Moderate**: 30일 이내 수정
- **Low**: 90일 이내 수정

### 2. GitHub Dependabot

#### 설정 파일 (`.github/dependabot.yml`)

```yaml
version: 2
updates:
    - package-ecosystem: 'npm'
      directory: '/'
      schedule:
          interval: 'weekly'
      reviewers:
          - 'security-team'
      assignees:
          - 'maintainer'
```

#### 기능

- **자동 의존성 업데이트**: 매주 확인
- **보안 패치 우선**: 취약점 발견 시 즉시 PR 생성
- **호환성 검사**: CI/CD를 통한 자동 테스트

### 3. GitHub Security Advisories

#### 모니터링 대상

- 직접 의존성의 보안 권고
- 간접 의존성의 취약점
- CVE (Common Vulnerabilities and Exposures) 알림

#### 알림 설정

- Repository Security 탭에서 설정
- 이메일/웹 알림 활성화
- Slack 통합 설정

## 🚨 취약점 대응 프로세스

### 1. 취약점 발견 시 대응 절차

#### 즉시 대응 (Critical/High)

1. **영향도 평가** (1시간 이내)

    ```bash
    # 취약점 상세 정보 확인
    pnpm audit --json | jq '.vulnerabilities'
    ```

2. **임시 완화 조치** (4시간 이내)

    ```bash
    # 취약한 패키지 즉시 제거 또는 격리
    pnpm remove vulnerable-package
    ```

3. **정식 수정** (24시간 이내)
    ```bash
    # 안전한 버전으로 업데이트
    pnpm update vulnerable-package
    ```

#### 일반 대응 (Moderate/Low)

1. **수정 계획 수립** (1주일 이내)
2. **테스트 및 검증** (2주일 이내)
3. **프로덕션 반영** (1개월 이내)

### 2. 업데이트 검증 프로세스

#### 자동 검증

```bash
# 의존성 업데이트 후 자동 실행
pnpm install
pnpm run test
pnpm run build
pnpm run lint
```

#### 수동 검증

- 기능 테스트 수행
- 보안 스캔 재실행
- 성능 영향 확인

## 🔍 정기 보안 감사

### 1. 주간 감사 (자동)

#### GitHub Actions 워크플로우

```yaml
# .github/workflows/security.yml
- name: Run pnpm audit
  run: |
      pnpm audit --audit-level=moderate --json > audit-results.json || true
      pnpm audit --audit-level=moderate
```

#### 감사 내용

- 새로운 취약점 확인
- 의존성 라이선스 검사
- 업데이트 가능한 패키지 확인

### 2. 월간 감사 (수동)

#### 종합 보안 검토

1. **의존성 트리 분석**

    ```bash
    pnpm list --depth=0
    pnpm list --depth=Infinity
    ```

2. **라이선스 호환성 검사**

    ```bash
    npx license-checker --summary
    ```

3. **사용하지 않는 의존성 제거**
    ```bash
    npx depcheck
    ```

### 3. 분기별 감사 (전문가)

#### 외부 보안 감사

- 전문 보안 업체 의뢰
- 침투 테스트 수행
- 코드 보안 리뷰

## 📋 의존성 관리 정책

### 1. 새로운 의존성 추가 기준

#### 필수 검토 사항

1. **보안 이력 확인**
    - CVE 데이터베이스 검색
    - GitHub Security Advisories 확인
    - 과거 보안 이슈 이력 검토

2. **메인테이너 신뢰성**
    - 활발한 개발 활동
    - 빠른 보안 패치 이력
    - 커뮤니티 평판

3. **라이선스 호환성**
    - MIT, Apache 2.0, BSD 등 허용
    - GPL, AGPL 등 제한적 라이선스 금지
    - 상업적 사용 제한 확인

#### 금지된 의존성

```bash
# 보안상 위험한 패키지들
FORBIDDEN_PACKAGES=(
  "lodash<4.17.21"  # 프로토타입 오염 취약점
  "moment<2.29.4"   # ReDoS 취약점
  "axios<0.21.2"    # SSRF 취약점
)
```

### 2. 업데이트 정책

#### 자동 업데이트 (허용)

- **Patch 버전**: 보안 패치 및 버그 수정
- **보안 업데이트**: 모든 심각도의 보안 패치

#### 수동 검토 (필수)

- **Minor 버전**: 새로운 기능 추가
- **Major 버전**: Breaking Changes 포함

#### 업데이트 제외 (금지)

- **Beta/Alpha 버전**: 안정성 검증 부족
- **Deprecated 패키지**: 지원 종료 예정

### 3. CDN 의존성 관리

#### 허용된 CDN

1. **Cloudflare CDN** (`cdnjs.cloudflare.com`)
    - ✅ 신뢰할 수 있는 공급자
    - ✅ SRI (Subresource Integrity) 지원
    - ✅ HTTPS 보장

2. **공식 SDK** (카카오맵)
    - ✅ 공식 제공자
    - ✅ 정기 보안 업데이트
    - ✅ 기술 지원 보장

#### 금지된 CDN

- 개인/소규모 CDN 서비스
- HTTP 전용 CDN
- SRI 미지원 CDN

## 🛠️ 보안 도구 설정

### 1. Snyk 통합 (선택사항)

#### 설치 및 설정

```bash
# Snyk CLI 설치
npm install -g snyk

# 프로젝트 스캔
snyk test

# 자동 수정 시도
snyk wizard
```

#### GitHub 통합

```yaml
# .github/workflows/security.yml
- name: Run Snyk to check for vulnerabilities
  uses: snyk/actions/node@master
  env:
      SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

### 2. OWASP Dependency-Check

#### 로컬 실행

```bash
# Dependency-Check 다운로드 및 실행
wget https://github.com/jeremylong/DependencyCheck/releases/download/v8.4.0/dependency-check-8.4.0-release.zip
unzip dependency-check-8.4.0-release.zip
./dependency-check/bin/dependency-check.sh --project "sobicoupon" --scan ./
```

#### CI/CD 통합

```yaml
- name: OWASP Dependency Check
  uses: dependency-check/Dependency-Check_Action@main
  with:
      project: 'sobicoupon'
      path: '.'
      format: 'HTML'
```

## 📊 보안 메트릭 및 KPI

### 1. 보안 지표

#### 취약점 관련

- **발견된 취약점 수**: 주/월별 트렌드
- **수정 시간**: 발견부터 수정까지 소요 시간
- **미해결 취약점**: 심각도별 분류

#### 의존성 관련

- **총 의존성 수**: 직접/간접 의존성
- **업데이트 빈도**: 월별 업데이트 횟수
- **라이선스 준수**: 허용된 라이선스 비율

### 2. 모니터링 대시보드

#### GitHub Security 탭

- Dependabot alerts
- Security advisories
- Code scanning alerts

#### 외부 도구

- Snyk 대시보드
- WhiteSource/Mend 대시보드
- OWASP Dependency-Track

## 🚀 개선 계획

### 단기 계획 (1-3개월)

1. **SRI (Subresource Integrity) 도입**

    ```html
    <script
        src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
        integrity="sha384-..."
        crossorigin="anonymous"
    ></script>
    ```

2. **의존성 검증 자동화**
    ```bash
    # package.json에 integrity 검증 추가
    "scripts": {
      "verify": "pnpm audit && pnpm list --depth=0"
    }
    ```

### 중기 계획 (3-6개월)

1. **공급망 보안 강화**
    - NPM package provenance 검증
    - Sigstore 서명 검증 도입

2. **의존성 최소화**
    - 불필요한 dev dependencies 제거
    - Tree shaking 최적화

### 장기 계획 (6개월 이상)

1. **Zero-dependency 전략**
    - 핵심 기능의 의존성 제거
    - 자체 구현으로 대체

2. **보안 자동화 고도화**
    - AI 기반 취약점 예측
    - 자동 패치 적용 시스템

## 📚 참고 자료

### 공식 문서

- [pnpm Audit Documentation](https://pnpm.io/cli/audit)
- [GitHub Dependabot](https://docs.github.com/en/code-security/dependabot)
- [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/)

### 보안 데이터베이스

- [NPM Security Advisories](https://www.npmjs.com/advisories)
- [CVE Database](https://cve.mitre.org/)
- [Snyk Vulnerability Database](https://snyk.io/vuln/)

### 도구 및 서비스

- [Snyk](https://snyk.io/)
- [WhiteSource/Mend](https://www.mend.io/)
- [Sonatype Nexus](https://www.sonatype.com/products/nexus-lifecycle)

### 모범 사례

- [NIST Software Supply Chain Security](https://www.nist.gov/itl/executive-order-improving-nations-cybersecurity/software-supply-chain-security)
- [SLSA Framework](https://slsa.dev/)
- [OpenSSF Best Practices](https://bestpractices.coreinfrastructure.org/)

---

**마지막 업데이트**: 2025년 8월 2일
**작성자**: 보안팀
**검토 주기**: 월 1회

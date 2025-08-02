# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Security Policy (SECURITY.md) 추가
- GitHub Actions 워크플로우 문법 오류 수정
- Git hooks에서 unstaged 파일 자동 추가 문제 수정

### Changed
- API 키 관리 방식 개선 (Cloudflare Workers에서 runtime 치환)
- HTML 플레이스홀더 시스템 구현

### Fixed
- Cloudflare Workers에서 API 키 주입 문제 해결
- GitHub Actions context 참조 오류 수정
- Pre-commit hook에서 의도하지 않은 파일 추가 문제 해결

## [2.1.0] - 2024-08-02

### Added
- v2 리팩토링 이전 데이터 마이그레이션 시스템
- 포괄적인 테스트 커버리지 (Jest)
- E2E 테스트 (Playwright)
- 성능 테스트 및 모니터링
- 보안 스캔 자동화 (CodeQL, TruffleHog, 의존성 감사)
- Git hooks (pre-commit, pre-push)
- 에러 복구 및 재시도 메커니즘

### Changed
- ES6 모듈 시스템으로 완전 마이그레이션
- 모듈화된 아키텍처 구조 개선
- Cloudflare Workers 기반 서버리스 배포
- 반응형 UI/UX 개선

### Security
- Content Security Policy (CSP) 헤더 강화
- API 키 보안 관리 개선
- XSS 방지 조치 강화
- 입력 검증 및 이스케이프 처리

## [2.0.0] - 2024-07-15

### Added
- 카카오맵 API 통합
- 실시간 가맹점 위치 검색
- 마커 클러스터링 및 그룹화
- 엑셀 파일 업로드 및 파싱 (XLSX.js)
- IndexedDB 기반 클라이언트 캐싱
- 반응형 모바일 지원
- Service Worker 기반 오프라인 지원

### Changed
- 전체 아키텍처 재설계
- 순수 JavaScript ES6+ 기반으로 전환
- 모던 웹 표준 적용

### Removed
- 레거시 jQuery 의존성 제거
- 구버전 브라우저 지원 중단

## [1.0.0] - 2024-06-01

### Added
- 초기 프로젝트 설정
- 기본 가맹점 검색 기능
- 정적 지도 표시
- 기본 필터링 기능

---

## 보안 관련 변경사항

### Security Policy Updates

#### 2024-08-02
- 초기 보안 정책 수립
- 취약점 신고 프로세스 정의
- 자동 보안 검사 도구 설정

### Security Fixes

#### 2024-08-02
- API 키 노출 방지 시스템 구현
- CSP 헤더를 통한 XSS 방지 강화
- 입력 검증 로직 개선

---

## 마이그레이션 가이드

### v1.x.x → v2.0.0
- **Breaking Changes**: jQuery 제거, ES6 모듈 시스템 적용
- **데이터**: 기존 localStorage 데이터는 자동으로 IndexedDB로 마이그레이션됩니다
- **브라우저 지원**: IE 지원 중단, 모던 브라우저만 지원

### v2.0.0 → v2.1.0
- **데이터**: EunpyeongStoreDB → StoreLocationCache 자동 마이그레이션
- **API**: 기존 API 호환성 유지
- **설정**: 환경변수 기반 설정으로 전환

---

## 기여자

이 프로젝트에 기여해주신 모든 분들께 감사드립니다:

- 보안 취약점 신고자들 (SECURITY.md 참조)
- 코드 기여자들
- 이슈 리포터들
- 문서 개선 기여자들

---

## 라이선스

이 프로젝트는 [MIT License](LICENSE) 하에 배포됩니다.

## 지원 및 도움말

- 🐛 **버그 신고**: [GitHub Issues](https://github.com/username/sobicoupon/issues)
- 🔒 **보안 취약점**: [Security Policy](SECURITY.md) 참조
- 💡 **기능 제안**: [GitHub Discussions](https://github.com/username/sobicoupon/discussions)
- 📧 **일반 문의**: support@tmint.dev
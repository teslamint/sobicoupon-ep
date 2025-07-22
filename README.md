# 은평구 소비쿠폰 가맹점 위치 검색 시스템

## 개요
은평구 민생회복 소비쿠폰을 사용할 수 있는 가맹점의 위치를 카카오맵 API로 검색하고 지도에 표시하는 웹 애플리케이션입니다.

## 주요 기능
- **엑셀 파일 업로드**: 은평구청에서 제공하는 가맹점 목록 엑셀 파일(.xlsx) 업로드
- **자동 위치 검색**: 카카오맵 API를 통한 가맹점 위치 자동 검색
- **현 지도에서 검색**: 현재 보이는 지도 영역 내 가맹점 검색
- **위치 정보 캐싱**: IndexedDB를 활용한 검색 결과 자동 저장
- **마커 클러스터링**: 지도 확대/축소 시 자동 그룹화
- **다양한 필터링**: 행정동, 카테고리, 상호명으로 필터링
- **반응형 디자인**: 모바일 최적화 인터페이스

## 환경 설정

### 1. 개발 환경

1. `.dev.vars` 파일에 카카오 API 키 설정:

   ```
   KAKAO_API_KEY=your-kakao-api-key
   ```

2. 개발 서버 실행:

   ```bash
   npm run dev
   ```

### 2. 프로덕션 배포

#### 시크릿 설정 (권장)

명령줄에서 시크릿 설정:

```bash
wrangler secret put KAKAO_API_KEY
```

프롬프트가 나타나면 API 키를 입력합니다.

#### 또는 Cloudflare Dashboard에서 설정

1. Cloudflare Dashboard → Workers & Pages → 프로젝트 선택
2. Settings → Variables → Environment Variables
3. `KAKAO_API_KEY` 추가 시 "Encrypt" 옵션 활성화

#### 배포 명령어

```bash
wrangler deploy
```

### 3. 카카오 API 키 발급

1. [Kakao Developers](https://developers.kakao.com) 접속
2. 애플리케이션 생성
3. 앱 키 → JavaScript 키 복사
4. 플랫폼 → Web → 사이트 도메인 등록 (보안 강화)

## 프로젝트 구조

```
sobicoupon/
├── public/
│   ├── index.html      # 메인 애플리케이션
│   ├── app.js          # 핵심 기능 구현
│   ├── app-mobile.js   # 모바일 전용 기능
│   ├── styles.css      # 스타일시트
│   └── favicon.svg     # 파비콘
├── src/
│   └── index.js        # Worker 스크립트 (시크릿 처리)
├── wrangler.jsonc      # Cloudflare Workers 설정
├── .dev.vars           # 개발 환경 변수 (Git 제외)
└── .gitignore
```

## 사용 방법

1. **엑셀 파일 준비**
   - [은평구청](https://www.ep.go.kr) 공지사항에서 소비쿠폰 가맹점 목록 엑셀 파일 다운로드

2. **파일 업로드**
   - "엑셀 파일 선택" 버튼을 클릭하여 파일 업로드
   - 자동으로 캐시된 데이터가 있으면 즉시 지도에 표시

3. **가맹점 검색**
   - **현 지도에서 검색**: 현재 보이는 지도 영역의 가맹점 검색
   - **모든 위치 표시**: 저장된 모든 가맹점 위치 표시

4. **필터링 옵션**
   - 상호명 검색
   - 행정동 필터
   - 카테고리 필터
   - 업종 다중 선택

## 기술적 특징

- **주소 기반 그룹화**: 같은 건물의 여러 매장을 하나의 마커로 표시
- **마커 클러스터링**: 줌 레벨에 따라 자동으로 마커 그룹화
- **IndexedDB 캐싱**: 검색된 위치 정보를 브라우저에 자동 저장
- **반응형 디자인**: 데스크톱/모바일 환경에 최적화된 UI
- **모바일 전체화면**: 모바일에서 지도 전체화면 토글 기능

## 보안 고려사항

- `.dev.vars` 파일은 Git에 커밋하지 않습니다
- 프로덕션 API 키는 시크릿으로 설정합니다 (`wrangler secret put KAKAO_API_KEY`)
- Cloudflare Dashboard에서 설정 시 "Encrypt" 옵션을 활성화합니다
- Kakao Developers에서 도메인 제한을 설정하여 API 키 보안을 강화합니다

## 시크릿 vs 환경 변수

- **시크릿 (권장)**: 암호화되어 저장되며, Worker 코드에서만 접근 가능
- **환경 변수**: 평문으로 저장되며, Dashboard에서 볼 수 있음

## 주의사항

- Kakao Maps JavaScript API는 클라이언트 사이드에서 실행되므로 API 키가 노출될 수 있습니다
- 도메인 제한 설정을 통해 무단 사용을 방지하세요
- 대량 검색 시 API 호출 제한으로 인해 속도가 느려질 수 있습니다

# WebStorm 개발환경 설정 가이드

이 프로젝트는 ESLint와 Prettier가 통합되어 있습니다. WebStorm에서 최적의 개발 경험을 위해 다음 설정을 확인해주세요.

## 자동 설정된 내용

이미 프로젝트에 다음 설정 파일들이 포함되어 있습니다:

- `.idea/codeStyleSettings.xml` - 코드 스타일 설정
- `.idea/prettier.xml` - Prettier 자동 적용 설정
- `.idea/eslint.xml` - ESLint 자동 적용 설정
- `.idea/inspectionProfiles/Project_Default.xml` - 코드 검사 설정
- `.idea/watcherTasks.xml` - 파일 와처 설정

## WebStorm에서 확인할 설정

### 1. Prettier 설정 확인
- **File → Settings → Languages & Frameworks → JavaScript → Prettier**
- ✅ "Automatic Prettier configuration" 체크
- ✅ "Run on save" 체크
- ✅ "Run on 'Reformat Code' action" 체크

### 2. ESLint 설정 확인
- **File → Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint**
- ✅ "Automatic ESLint configuration" 체크
- ✅ "Run eslint --fix on save" 체크

### 3. Code Style 설정 확인
- **File → Settings → Editor → Code Style → JavaScript**
- ✅ Tab size: 4
- ✅ Indent: 4
- ✅ Use single quotes
- ✅ Trailing comma: Remove

### 4. 파일 와처 설정 확인
- **File → Settings → Tools → File Watchers**
- ✅ "Prettier JS" 활성화
- ✅ "ESLint" 활성화

## 개발 워크플로우

### 자동 적용되는 것들
- 파일 저장 시 자동으로 Prettier 포맷팅 적용
- 파일 저장 시 자동으로 ESLint --fix 적용
- 코드 리포맷 (Ctrl+Alt+L) 시 Prettier 적용

### 수동 명령어
```bash
# 전체 프로젝트 린트 + 포맷팅
pnpm run lint:format

# 전체 검사
pnpm run check:all

# ESLint만 실행
pnpm run lint:check

# Prettier만 실행
pnpm run format:check
```

## 권장 플러그인

WebStorm에서 다음 플러그인을 설치하는 것을 권장합니다:

1. **Prettier** (기본 제공)
2. **ESLint** (기본 제공)
3. **GitToolBox** - Git 통합 향상
4. **String Manipulation** - 문자열 조작 도구

## 문제 해결

### 설정이 적용되지 않는 경우
1. WebStorm 재시작
2. **File → Invalidate Caches and Restart**
3. 프로젝트 다시 열기

### 파일 와처가 작동하지 않는 경우
1. **File → Settings → Tools → File Watchers**에서 활성화 확인
2. node_modules/.bin/prettier와 node_modules/.bin/eslint 경로 확인

## 팀 협업 주의사항

- `.idea/` 폴더의 설정 파일들이 Git에 포함되어 있습니다
- 모든 팀원이 동일한 코드 스타일을 사용하게 됩니다
- 설정 변경 시 팀원들과 논의 후 진행해주세요
EOF < /dev/null
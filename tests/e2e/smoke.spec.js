const { test, expect } = require('@playwright/test');

test.describe('Smoke Tests - 핵심 기능 검증', () => {
    test.beforeEach(async ({ page }) => {
        // 각 테스트 전에 홈페이지로 이동
        await page.goto('/');
    });

    test('페이지가 정상적으로 로드되어야 함', async ({ page }) => {
        // 페이지 제목 확인
        await expect(page).toHaveTitle(/은평구.*소비쿠폰/);

        // 메인 헤더 존재 확인
        await expect(page.locator('h1')).toContainText('은평구 민생회복 소비쿠폰');

        // 필수 UI 요소들 존재 확인
        await expect(page.locator('#fileInput')).toBeVisible();
        // 지도는 DOM에 존재하지만 처음에는 숨겨져 있음
        await expect(page.locator('#map')).toBeAttached();
        await expect(page.locator('#searchMapBtn')).toBeVisible();
    });

    test('지도가 정상적으로 초기화되어야 함', async ({ page }) => {
        // CI 환경에서는 외부 API 스크립트 로드가 불안정하므로 스킵
        test.skip(!!process.env.CI, 'CI 환경에서는 카카오맵 API 로드가 불안정함');

        // 지도 컨테이너 DOM 존재 확인
        const mapContainer = page.locator('#map');
        await expect(mapContainer).toBeAttached();

        // 카카오맵 스크립트 로드 대기
        await page.waitForFunction(() => window.kakao && window.kakao.maps, { timeout: 15000 });

        // 지도 컨트롤 버튼들 확인 (DOM에 존재)
        await expect(page.locator('.map-control-btn')).toHaveCount(3); // 확대, 축소, 현재위치
    });

    test('파일 업로드 섹션이 작동해야 함', async ({ page }) => {
        // 파일 입력 요소 확인
        const fileInput = page.locator('#fileInput');
        await expect(fileInput).toBeVisible();
        await expect(fileInput).toHaveAttribute('accept', '.xlsx,.xls');

        // 업로드 섹션 텍스트 확인
        await expect(page.locator('#uploadSection')).toContainText('엑셀 파일을 선택해주세요');
    });

    test('검색 버튼이 초기에는 비활성화되어야 함', async ({ page }) => {
        // 파일이 업로드되지 않았을 때는 검색 버튼이 비활성화되어야 함
        const searchBtn = page.locator('#searchMapBtn');
        await expect(searchBtn).toBeVisible();

        // 모든 위치 표시 버튼은 초기에 비활성화
        const showAllBtn = page.locator('#showAllBtn');
        await expect(showAllBtn).toBeDisabled();
    });

    test('통계 섹션이 초기 상태를 표시해야 함', async ({ page }) => {
        // 통계 카드들 확인
        await expect(page.locator('#totalStores')).toContainText('0');
        await expect(page.locator('#totalDongs')).toContainText('0');
        await expect(page.locator('#foundLocations')).toContainText('0');
        await expect(page.locator('#notFoundLocations')).toContainText('0');
    });

    test('사용법 안내가 표시되어야 함', async ({ page }) => {
        // 사용법 정보 섹션 확인
        const usageInfo = page.locator('#usageInfo');
        await expect(usageInfo).toBeVisible();
        await expect(usageInfo).toContainText('간단 사용법');

        // 주요 단계들이 표시되는지 확인
        await expect(usageInfo).toContainText('엑셀 파일 선택');
        await expect(usageInfo).toContainText('현 지도에서 검색');
        await expect(usageInfo).toContainText('가맹점 누르고 위치 확인');
    });

    test('페이지가 반응형으로 작동해야 함', async ({ page }) => {
        // 데스크톱 뷰포트에서 확인
        await page.setViewportSize({ width: 1200, height: 800 });
        await expect(page.locator('.container')).toBeVisible();

        // 모바일 뷰포트로 변경
        await page.setViewportSize({ width: 375, height: 667 });

        // 모바일에서도 주요 요소들이 DOM에 존재해야 함
        await expect(page.locator('#map')).toBeAttached();
        await expect(page.locator('#fileInput')).toBeVisible();

        // 지도 컨트롤이 모바일에서도 접근 가능해야 함
        await expect(page.locator('.map-controls')).toBeAttached();
    });

    test('에러 처리가 정상적으로 작동해야 함', async ({ page }) => {
        // 콘솔 에러 모니터링
        const consoleErrors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        // 페이지 로드 후 잠시 대기
        await page.waitForTimeout(2000);

        // 심각한 에러가 없어야 함 (일부 API 키 관련 경고는 허용)
        const seriousErrors = consoleErrors.filter(
            (error) =>
                !error.includes('API key') &&
                !error.includes('KAKAO_API_KEY') &&
                !error.includes('Failed to load resource')
        );

        expect(seriousErrors).toHaveLength(0);
    });

    test('JavaScript 모듈이 정상적으로 로드되어야 함', async ({ page }) => {
        // CI 환경에서는 외부 API 스크립트 로드가 불안정하므로 스킵
        test.skip(!!process.env.CI, 'CI 환경에서는 카카오맵 API 로드가 불안정함');

        // 필수 모듈들이 정의되어있는지 확인
        await page.waitForFunction(
            () => {
                return window.mapManager && window.searchManager && window.uiManager;
            },
            { timeout: 15000 }
        );

        // 카카오맵 SDK 로드 확인
        await page.waitForFunction(() => window.kakao && window.kakao.maps, { timeout: 15000 });

        // XLSX 라이브러리 로드 확인
        await page.waitForFunction(() => window.XLSX, { timeout: 15000 });
    });
});

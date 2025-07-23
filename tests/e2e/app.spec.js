const { test, expect } = require('@playwright/test');

test.describe('은평구 소비쿠폰 시스템 E2E 테스트', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // 페이지 로드 완료 대기
        await page.waitForLoadState('networkidle');
    });

    test('메인 페이지 로드 테스트', async ({ page }) => {
        // 제목 확인
        await expect(page).toHaveTitle(/은평구 소비쿠폰 가맹점 찾기/);

        // 주요 섹션 존재 확인
        await expect(page.locator('h1')).toContainText('은평구 민생회복 소비쿠폰');
        await expect(page.locator('#uploadSection')).toBeVisible();
        // 지도는 DOM에 존재하지만 처음에는 숨겨져 있음
        await expect(page.locator('#map')).toBeAttached();
    });

    test('파일 업로드 인터페이스 테스트', async ({ page }) => {
        // 파일 입력 존재 확인
        const fileInput = page.locator('#fileInput');
        await expect(fileInput).toBeAttached();
        await expect(fileInput).toHaveAttribute('accept', '.xlsx,.xls');

        // 업로드 라벨 클릭 가능 확인
        const uploadLabel = page.locator('label[for="fileInput"]');
        await expect(uploadLabel).toBeVisible();
        await expect(uploadLabel).toContainText('엑셀 파일 선택');
    });

    test('지도 초기화 테스트', async ({ page }) => {
        // CI 환경에서는 외부 API 스크립트 로드가 불안정하므로 스킵
        test.skip(!!process.env.CI, 'CI 환경에서는 카카오맵 API 로드가 불안정함');

        // 지도 컨테이너 DOM 존재 확인
        await expect(page.locator('#map')).toBeAttached();

        // 카카오맵 SDK 로드 대기
        await page.waitForFunction(() => window.kakao && window.kakao.maps, { timeout: 15000 });

        // 지도 컨트롤 버튼들 확인 (처음에는 숨겨져 있을 수 있음)
        await expect(page.locator('button[onclick="zoomIn()"]')).toBeAttached();
        await expect(page.locator('button[onclick="zoomOut()"]')).toBeAttached();
        await expect(page.locator('button[onclick="showCurrentLocation()"]')).toBeAttached();
    });

    test('검색 및 필터 인터페이스 테스트', async ({ page }) => {
        // 검색 입력 필드 (초기에는 숨겨져 있음)
        const searchInput = page.locator('#searchInput');
        await expect(searchInput).toBeAttached();
        await expect(searchInput).toHaveAttribute('placeholder', '상호명으로 검색...');

        // 필터 드롭다운들 (초기에는 숨겨져 있음)
        await expect(page.locator('#dongFilter')).toBeAttached();
        await expect(page.locator('#categoryFilter')).toBeAttached();

        // 업종 선택 버튼 (초기에는 숨겨져 있음)
        const categoryToggle = page.locator('button[onclick="toggleCategoryDropdown()"]');
        await expect(categoryToggle).toBeAttached();
        await expect(categoryToggle).toContainText('업종 선택');
    });

    test('통계 섹션 테스트', async ({ page }) => {
        // 통계 카드들 확인 (초기에는 숨겨져 있음)
        await expect(page.locator('#totalStores')).toBeAttached();
        await expect(page.locator('#totalDongs')).toBeAttached();
        await expect(page.locator('#foundLocations')).toBeAttached();
        await expect(page.locator('#notFoundLocations')).toBeAttached();

        // 초기값 확인
        await expect(page.locator('#totalStores')).toContainText('0');
        await expect(page.locator('#totalDongs')).toContainText('0');
        await expect(page.locator('#foundLocations')).toContainText('0');
        await expect(page.locator('#notFoundLocations')).toContainText('0');
    });

    test('위험 구역 테스트', async ({ page }) => {
        // 위험 구역 섹션 존재 확인
        const dangerZone = page.locator('.danger-zone');
        await expect(dangerZone).toBeVisible();

        // 캐시 삭제 버튼 확인
        const clearCacheBtn = page.locator('#clearCacheBtn');
        await expect(clearCacheBtn).toBeVisible();
        await expect(clearCacheBtn).toContainText('모든 캐시 데이터 삭제');

        // 경고 메시지 확인
        await expect(page.locator('.danger-warning')).toContainText(
            '저장된 모든 데이터를 삭제합니다'
        );
    });

    test('반응형 디자인 테스트', async ({ page }) => {
        // 데스크톱 뷰
        await page.setViewportSize({ width: 1200, height: 800 });
        await expect(page.locator('.container')).toBeVisible();

        // 태블릿 뷰
        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(page.locator('.container')).toBeVisible();

        // 모바일 뷰
        await page.setViewportSize({ width: 375, height: 667 });
        await expect(page.locator('.container')).toBeVisible();
        // 지도는 DOM에 존재하지만 처음에는 숨겨져 있음
        await expect(page.locator('#map')).toBeAttached();
    });

    test('모듈 로드 테스트', async ({ page }) => {
        // CI 환경에서는 외부 API 스크립트 로드가 불안정하므로 스킵
        test.skip(!!process.env.CI, 'CI 환경에서는 카카오맵 API 로드가 불안정함');

        // ES6 모듈들이 제대로 로드되는지 확인
        await page.waitForFunction(
            () => {
                return window.stateManager && window.mapManager;
            },
            { timeout: 15000 }
        );

        // 전역 객체 확인
        const stateManager = await page.evaluate(() => window.stateManager);
        const mapManager = await page.evaluate(() => window.mapManager);

        expect(stateManager).toBeTruthy();
        expect(mapManager).toBeTruthy();
    });

    test('접근성 테스트', async ({ page }) => {
        // 키보드 네비게이션 테스트
        await page.keyboard.press('Tab');
        await expect(page.locator('#fileInput')).toBeFocused();

        // ARIA 레이블 확인
        const fileLabel = page.locator('label[for="fileInput"]');
        await expect(fileLabel).toBeVisible();

        // CI 환경에서는 카카오맵 관련 버튼 테스트 스킵
        if (!process.env.CI) {
            // 버튼들의 title 속성 확인
            await expect(page.locator('button[onclick="zoomIn()"]')).toHaveAttribute(
                'title',
                '확대'
            );
            await expect(page.locator('button[onclick="zoomOut()"]')).toHaveAttribute(
                'title',
                '축소'
            );
        }
    });
});

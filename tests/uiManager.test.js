import { uiManager } from '../public/modules/uiManager.js';
import { stateManager } from '../public/modules/state.js';

// Mock dependencies
jest.mock('../public/modules/state.js', () => ({
    stateManager: {
        getState: jest.fn(),
        setState: jest.fn(),
        getComputedState: jest.fn(),
        subscribe: jest.fn()
    }
}));

describe('UIManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = `
            <div id="uploadSection" style="display: block;">
                <input type="file" id="fileInput" />
                <div id="uploadStatus"></div>
            </div>
            <div id="storesSection" style="display: none;">
                <table>
                    <tbody id="storesList"></tbody>
                </table>
                <div id="paginationContainer" style="display: none;">
                    <div id="paginationInfo"></div>
                    <div id="paginationButtons"></div>
                    <select id="pageSize">
                        <option value="10">10개</option>
                        <option value="25">25개</option>
                    </select>
                </div>
            </div>
            <div id="map" style="display: none;"></div>
            <div id="distanceHeader" style="display: none;"></div>
            <div id="totalStores"></div>
            <div id="totalDongs"></div>
            <div id="foundLocations"></div>
            <div id="notFoundLocations"></div>
        `;

        uiManager.initialized = false;
        uiManager.init();
    });

    describe('showSection', () => {
        it('main 섹션을 표시할 때 upload 섹션은 숨기고 나머지는 표시해야 함', () => {
            uiManager.showSection('main');

            expect(document.getElementById('uploadSection').style.display).toBe('none');
            expect(document.getElementById('storesSection').style.display).toBe('block');
            expect(document.getElementById('map').style.display).toBe('block');
        });

        it('upload 섹션을 표시할 때 다른 섹션은 숨겨야 함', () => {
            uiManager.showSection('upload');

            expect(document.getElementById('uploadSection').style.display).toBe('block');
            expect(document.getElementById('storesSection').style.display).toBe('none');
            expect(document.getElementById('map').style.display).toBe('none');
        });
    });

    describe('updateStats', () => {
        it('통계 정보를 올바르게 표시해야 함', () => {
            const stats = {
                total: 17097,
                dongs: 16,
                found: 767,
                notFound: 123
            };

            uiManager.updateStats(stats);

            expect(document.getElementById('totalStores').textContent).toBe('17,097');
            expect(document.getElementById('totalDongs').textContent).toBe('16');
            expect(document.getElementById('foundLocations').textContent).toBe('767');
            expect(document.getElementById('notFoundLocations').textContent).toBe('123');
        });
    });

    describe('createTableRow', () => {
        it('일반 가맹점 행을 생성해야 함', () => {
            const store = {
                읍면동명: '녹번동',
                상호: 'GS25 은평점',
                표준산업분류명: '편의점',
                도로명주소: '서울특별시 은평구 녹번동 123',
                searched: false
            };

            const row = uiManager.createTableRow(store);

            expect(row.tagName).toBe('TR');
            expect(row.innerHTML).toContain('녹번동');
            expect(row.innerHTML).toContain('GS25 은평점');
            expect(row.innerHTML).toContain('편의점');
            expect(row.innerHTML).toContain('미검색');
        });

        it('위치 정보가 있는 가맹점은 클릭 가능해야 함', () => {
            const store = {
                읍면동명: '녹번동',
                상호: 'GS25 은평점',
                location: { lat: 37.65, lng: 126.95 },
                searched: true
            };

            const row = uiManager.createTableRow(store);

            expect(row.className).toContain('clickable');
            expect(row.onclick).toBeDefined();
        });

        it('거리 정보가 있을 때 거리를 표시해야 함', () => {
            const store = {
                읍면동명: '녹번동',
                상호: 'GS25 은평점',
                거리: 150,
                location: { lat: 37.65, lng: 126.95 },
                searched: true
            };

            const row = uiManager.createTableRow(store);

            expect(row.innerHTML).toContain('150m');
        });

        it('XSS 공격을 방지해야 함', () => {
            const store = {
                읍면동명: '<script>alert("xss")</script>',
                상호: '<img src=x onerror=alert("xss")>',
                표준산업분류명: '"><script>alert("xss")</script>',
                도로명주소: '서울시 은평구'
            };

            const row = uiManager.createTableRow(store);

            expect(row.innerHTML).not.toContain('<script>');
            expect(row.innerHTML).not.toContain('<img src=x onerror=');
            expect(row.innerHTML).toContain('&lt;script&gt;');
            expect(row.innerHTML).toContain('&lt;img src=x onerror=alert');
        });
    });

    describe('getStatusBadge', () => {
        it('미검색 상태 배지를 표시해야 함', () => {
            const store = { searched: false };
            const badge = uiManager.getStatusBadge(store);

            expect(badge.className).toContain('status-badge searching');
            expect(badge.textContent).toBe('미검색');
        });

        it('검색완료 상태 배지를 표시해야 함', () => {
            const store = { searched: true, location: { lat: 37.65, lng: 126.95 } };
            const badge = uiManager.getStatusBadge(store);

            expect(badge.className).toContain('status-badge found');
            expect(badge.textContent).toBe('검색완료');
        });

        it('위치없음 상태 배지를 표시해야 함', () => {
            const store = { searched: true, location: null };
            const badge = uiManager.getStatusBadge(store);

            expect(badge.className).toContain('status-badge not-found');
            expect(badge.textContent).toBe('위치없음');
        });
    });

    describe('updateTable', () => {
        it('페이지네이션된 데이터를 테이블에 표시해야 함', () => {
            const paginatedStores = [
                { 읍면동명: '녹번동', 상호: 'GS25 은평점' },
                { 읍면동명: '대조동', 상호: '스타벅스 은평역점' }
            ];

            stateManager.getState.mockReturnValue({
                currentPage: 1,
                filteredStores: paginatedStores
            });

            stateManager.getComputedState.mockReturnValue({
                paginatedStores,
                totalPages: 1,
                startIndex: 0,
                endIndex: 2
            });

            uiManager.updateTable();

            const rows = document.getElementById('storesList').children;
            expect(rows.length).toBe(2);
            expect(rows[0].innerHTML).toContain('GS25 은평점');
            expect(rows[1].innerHTML).toContain('스타벅스 은평역점');
        });
    });

    describe('updatePagination', () => {
        it('페이지네이션 정보를 표시해야 함', () => {
            uiManager.updatePagination(1, 5, 100, 0, 25);

            const info = document.getElementById('paginationInfo');
            expect(info.textContent).toBe('1-25 / 총 100개');
        });

        it('페이지 버튼을 생성해야 함', () => {
            stateManager.getState.mockReturnValue({ currentPage: 3 });

            uiManager.updatePagination(3, 10, 250, 50, 75);

            const buttons = document.getElementById('paginationButtons');
            expect(buttons.children.length).toBeGreaterThan(0);

            // 이전 버튼
            expect(buttons.children[0].textContent).toBe('이전');
            expect(buttons.children[0].disabled).toBe(false);

            // 다음 버튼
            const lastButton = buttons.children[buttons.children.length - 1];
            expect(lastButton.textContent).toBe('다음');
            expect(lastButton.disabled).toBe(false);
        });
    });

    describe('toggleDistanceHeader', () => {
        it('거리 헤더를 표시/숨김 처리해야 함', () => {
            const distanceHeader = document.getElementById('distanceHeader');

            uiManager.toggleDistanceHeader(true);
            expect(distanceHeader.style.display).toBe('table-cell');

            uiManager.toggleDistanceHeader(false);
            expect(distanceHeader.style.display).toBe('none');
        });
    });

    describe('showUploadStatus', () => {
        it('업로드 상태 메시지를 표시해야 함', () => {
            uiManager.showUploadStatus('파일 업로드 중...', 'info');

            const status = document.getElementById('uploadStatus');
            expect(status.textContent).toBe('파일 업로드 중...');
            expect(status.className).toContain('info');
            expect(status.style.display).toBe('block');
        });

        it('성공 메시지는 3초 후 자동으로 숨겨야 함', () => {
            jest.useFakeTimers();

            uiManager.showUploadStatus('업로드 완료!', 'success');

            const status = document.getElementById('uploadStatus');
            expect(status.style.display).toBe('block');

            jest.advanceTimersByTime(3000);
            expect(status.style.display).toBe('none');

            jest.useRealTimers();
        });
    });
});

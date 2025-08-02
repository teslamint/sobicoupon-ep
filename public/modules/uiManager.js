// UI 관리 및 DOM 조작
import { Utils } from './utils.js';
import { stateManager } from './state.js';

export class UIManager {
    constructor() {
        this.elements = {};
        this.initialized = false;
    }

    // 초기화
    init() {
        if (this.initialized) {
            return;
        }

        this.cacheElements();
        this.setupEventListeners();
        this.initialized = true;
    }

    // DOM 요소 캐싱
    cacheElements() {
        this.elements = {
            // 업로드 섹션
            fileInput: document.getElementById('fileInput'),
            uploadStatus: document.getElementById('uploadStatus'),
            uploadSection: document.getElementById('uploadSection'),

            // 지도 섹션
            map: document.getElementById('map'),
            searchMapBtn: document.getElementById('searchMapBtn'),
            showAllBtn: document.getElementById('showAllBtn'),

            // 검색 컨트롤
            searchInput: document.getElementById('searchInput'),
            dongFilter: document.getElementById('dongFilter'),
            categoryFilter: document.getElementById('categoryFilter'),
            categoryDropdown: document.getElementById('categoryDropdown'),
            selectedCount: document.getElementById('selectedCount'),

            // 통계
            totalStores: document.getElementById('totalStores'),
            totalDongs: document.getElementById('totalDongs'),
            foundLocations: document.getElementById('foundLocations'),
            notFoundLocations: document.getElementById('notFoundLocations'),

            // 테이블
            storesSection: document.getElementById('storesSection'),
            storesList: document.getElementById('storesList'),
            distanceHeader: document.getElementById('distanceHeader'),

            // 페이지네이션
            paginationContainer: document.getElementById('paginationContainer'),
            paginationInfo: document.getElementById('paginationInfo'),
            paginationButtons: document.getElementById('paginationButtons'),
            pageSize: document.getElementById('pageSize'),

            // 진행률
            progressBar: document.getElementById('progressBar'),
            progressBarFill: document.getElementById('progressBarFill'),

            // 정보
            usageInfo: document.getElementById('usageInfo'),
            cautionInfo: document.getElementById('cautionInfo')
        };
    }

    // 이벤트 리스너 설정
    setupEventListeners() {
        // 상태 변경 구독
        stateManager.subscribe('stats', (stats) => this.updateStats(stats));
        stateManager.subscribe('filteredStores', () => this.updateTable());
        stateManager.subscribe('currentPage', () => this.updateTable());
        stateManager.subscribe('pageSize', () => this.updateTable());
        stateManager.subscribe('isLoading', (isLoading) => this.toggleLoading(isLoading));
        stateManager.subscribe('searchProgress', (progress) => this.updateProgress(progress));

        // 페이지 크기 변경
        this.elements.pageSize?.addEventListener('change', (e) => {
            stateManager.setState({
                pageSize: parseInt(e.target.value),
                currentPage: 1
            });
        });
    }

    // 업로드 상태 표시
    showUploadStatus(message, type = 'info') {
        const statusEl = this.elements.uploadStatus;
        if (!statusEl) {
            return;
        }

        statusEl.className = `status ${type}`;
        statusEl.textContent = message;
        statusEl.style.display = 'block';

        if (type === 'success') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    // 섹션 표시/숨기기
    showSection(sectionName) {
        const sections = ['uploadSection', 'storesSection', 'map'];

        sections.forEach((section) => {
            const el = this.elements[section];
            if (el) {
                if (sectionName === 'main') {
                    // main 섹션일 때는 uploadSection을 숨기고 나머지는 보여줌
                    el.style.display = section === 'uploadSection' ? 'none' : 'block';
                } else if (sectionName === 'upload') {
                    // upload 섹션일 때는 uploadSection만 보여줌
                    el.style.display = section === 'uploadSection' ? 'block' : 'none';
                } else {
                    // 특정 섹션만 보여줌
                    el.style.display = section === sectionName ? 'block' : 'none';
                }
            }
        });

        // 정보 섹션 토글
        if (sectionName === 'main') {
            if (this.elements.usageInfo) {
                this.elements.usageInfo.style.display = 'none';
            }
            if (this.elements.cautionInfo) {
                this.elements.cautionInfo.style.display = 'block';
            }
        }
    }

    // 통계 업데이트
    updateStats(stats) {
        if (this.elements.totalStores) {
            this.elements.totalStores.textContent = stats.total.toLocaleString();
        }
        if (this.elements.totalDongs) {
            this.elements.totalDongs.textContent = stats.dongs;
        }
        if (this.elements.foundLocations) {
            this.elements.foundLocations.textContent = stats.found.toLocaleString();
        }
        if (this.elements.notFoundLocations) {
            this.elements.notFoundLocations.textContent = stats.notFound.toLocaleString();
        }
    }

    // 필터 옵션 업데이트
    updateFilterOptions(dongs, categories) {
        // 행정동 필터
        if (this.elements.dongFilter) {
            const currentValue = this.elements.dongFilter.value;
            // 안전한 DOM 생성으로 동 필터 옵션 구성
            Utils.safeSetInnerHTML(this.elements.dongFilter, '');
            const defaultOption = Utils.createSafeElement('option', '모든 행정동', { value: '' });
            this.elements.dongFilter.appendChild(defaultOption);

            dongs.forEach((dong) => {
                const option = Utils.createSafeElement('option', dong, { value: dong });
                this.elements.dongFilter.appendChild(option);
            });

            this.elements.dongFilter.value = currentValue;
        }

        // 카테고리 필터
        if (this.elements.categoryFilter) {
            const currentValue = this.elements.categoryFilter.value;
            // 안전한 DOM 생성으로 카테고리 필터 옵션 구성
            Utils.safeSetInnerHTML(this.elements.categoryFilter, '');
            const defaultOption = Utils.createSafeElement('option', '모든 카테고리', { value: '' });
            this.elements.categoryFilter.appendChild(defaultOption);

            categories.forEach((category) => {
                const option = Utils.createSafeElement('option', category, { value: category });
                this.elements.categoryFilter.appendChild(option);
            });

            this.elements.categoryFilter.value = currentValue;
        }
    }

    // 테이블 업데이트
    updateTable() {
        const state = stateManager.getState();
        const computed = stateManager.getComputedState();
        const { paginatedStores, totalPages, startIndex, endIndex } = computed;

        // 테이블 바디 업데이트
        if (this.elements.storesList) {
            // DocumentFragment 사용하여 성능 개선
            const fragment = document.createDocumentFragment();

            paginatedStores.forEach((store) => {
                const tr = this.createTableRow(store);
                fragment.appendChild(tr);
            });

            // 기존 내용 제거 후 새 내용 추가
            this.elements.storesList.innerHTML = '';
            this.elements.storesList.appendChild(fragment);
        }

        // 페이지네이션 업데이트
        this.updatePagination(
            state.currentPage,
            totalPages,
            state.filteredStores.length,
            startIndex,
            endIndex
        );

        // 페이지네이션 컨테이너 표시
        if (this.elements.paginationContainer && state.filteredStores.length > 0) {
            this.elements.paginationContainer.style.display = 'flex';
        }
    }

    // 테이블 행 생성
    createTableRow(store) {
        const tr = document.createElement('tr');
        tr.className = store.nearbyMatch ? 'nearby-match' : '';
        tr.dataset.index = store.인덱스;

        // 모든 행을 클릭 가능하게 만들기
        tr.className += ' clickable';
        tr.onclick = () => this.handleStoreClick(store);

        // XSS 방지를 위해 escapeHtml 사용
        // 안전한 DOM 생성으로 테이블 행 구성
        const dongTd = document.createElement('td');
        const dongBadge = Utils.createSafeElement(
            'span',
            store.읍면동명,
            {},
            { className: 'dong-badge' }
        );
        dongBadge.className = 'dong-badge';
        dongTd.appendChild(dongBadge);

        const nameTd = Utils.createSafeElement('td', store.상호, {}, { className: 'store-name' });
        nameTd.className = 'store-name';

        const categoryTd = Utils.createSafeElement(
            'td',
            store.표준산업분류명 || store.카테고리 || ''
        );

        const addressTd = Utils.createSafeElement('td', store.도로명주소 || store.지번주소 || '');

        const statusTd = document.createElement('td');
        const statusBadge = this.getStatusBadge(store);
        statusTd.appendChild(statusBadge);

        tr.appendChild(dongTd);
        tr.appendChild(nameTd);
        tr.appendChild(categoryTd);
        tr.appendChild(addressTd);
        tr.appendChild(statusTd);

        // 거리 정보가 있는 경우 추가
        if (store.거리 !== undefined) {
            const distanceTd = document.createElement('td');
            const distanceSpan = Utils.createSafeElement(
                'span',
                `${store.거리}m`,
                {},
                {
                    color: '#667eea',
                    fontWeight: '600'
                }
            );
            distanceTd.appendChild(distanceSpan);
            tr.appendChild(distanceTd);
        } else if (document.getElementById('distanceHeader')?.style.display === 'table-cell') {
            const emptyTd = Utils.createSafeElement('td', '-');
            tr.appendChild(emptyTd);
        }

        return tr;
    }

    // 상태 배지 생성
    getStatusBadge(store) {
        const span = document.createElement('span');
        span.className = 'status-badge';

        if (!store.searched) {
            span.className += ' searching';
            span.textContent = '미검색';
        } else if (store.location) {
            if (store.nearbyMatch) {
                span.className += ' nearby-match';
                span.textContent = '📍 근처매치';
            } else {
                span.className += ' found';
                span.textContent = '검색완료';
            }
        } else {
            span.className += ' not-found';
            span.textContent = '위치없음';
        }

        return span;
    }

    // 가맹점 클릭 처리
    async handleStoreClick(store) {
        // 리팩토링된 searchManager의 searchSingleStore 활용
        const { searchManager } = await import('./searchManager.js');

        try {
            this.showNotification(`${store.상호} 위치를 검색하고 있습니다...`, 'info');

            // 현재 거리 헤더 표시 상태 저장
            const distanceHeader = document.getElementById('distanceHeader');
            const wasDistanceVisible = distanceHeader && distanceHeader.style.display !== 'none';

            // 순수 검색 기능 사용
            const result = await searchManager.searchSingleStore(store);

            if (result && result.location) {
                // 개별 가맹점 위치 표시 (전체 목록 보존)
                await searchManager.showSingleStoreLocation(result);
                this.showNotification(`${store.상호} 위치를 찾았습니다.`, 'success');

                // 거리 헤더가 이전에 표시되었다면 다시 표시
                if (wasDistanceVisible) {
                    this.toggleDistanceHeader(true);
                }
            } else {
                this.showNotification(`${store.상호} 위치를 찾을 수 없습니다.`, 'error');
            }
        } catch (error) {
            Utils.error('개별 가맹점 검색 실패:', error);
            this.showNotification('위치 검색 중 오류가 발생했습니다.', 'error');
        }
    }

    // 페이지네이션 업데이트
    updatePagination(currentPage, totalPages, totalItems, startIndex, endIndex) {
        // 정보 텍스트
        if (this.elements.paginationInfo) {
            this.elements.paginationInfo.textContent = `${startIndex + 1}-${Math.min(endIndex, totalItems)} / 총 ${totalItems}개`;
        }

        // 페이지 버튼
        if (this.elements.paginationButtons) {
            this.elements.paginationButtons.innerHTML = '';

            // 이전 버튼
            const prevBtn = this.createPageButton('이전', currentPage - 1, currentPage === 1);
            this.elements.paginationButtons.appendChild(prevBtn);

            // 페이지 번호 버튼
            const pageButtons = this.generatePageButtons(currentPage, totalPages);
            pageButtons.forEach((btn) => this.elements.paginationButtons.appendChild(btn));

            // 다음 버튼
            const nextBtn = this.createPageButton(
                '다음',
                currentPage + 1,
                currentPage === totalPages
            );
            this.elements.paginationButtons.appendChild(nextBtn);
        }
    }

    // 페이지 버튼 생성
    createPageButton(text, page, disabled = false) {
        const button = document.createElement('button');
        button.textContent = text;
        button.disabled = disabled;

        if (!disabled) {
            button.onclick = () => stateManager.setState({ currentPage: page });
        }

        if (text === String(stateManager.getState('currentPage'))) {
            button.className = 'active';
        }

        return button;
    }

    // 페이지 번호 버튼 생성
    generatePageButtons(current, total) {
        const buttons = [];
        const maxButtons = 5;

        let start = Math.max(1, current - Math.floor(maxButtons / 2));
        const end = Math.min(total, start + maxButtons - 1);

        if (end - start + 1 < maxButtons) {
            start = Math.max(1, end - maxButtons + 1);
        }

        for (let i = start; i <= end; i++) {
            buttons.push(this.createPageButton(String(i), i));
        }

        return buttons;
    }

    // 진행률 표시
    updateProgress(progress) {
        if (this.elements.progressBar) {
            this.elements.progressBar.style.display =
                progress > 0 && progress < 100 ? 'block' : 'none';
        }

        if (this.elements.progressBarFill) {
            this.elements.progressBarFill.style.width = `${progress}%`;
            this.elements.progressBarFill.textContent = `${progress}%`;
        }
    }

    /**
     * 검색 통계 실시간 표시 (리팩토링 완성!)
     */
    updateSearchStatistics(stats) {
        if (!stats) {
            return;
        }

        // 통계 표시 영역이 없으면 생성
        let statsContainer = document.getElementById('searchStats');
        if (!statsContainer) {
            statsContainer = Utils.createSafeElement(
                'div',
                '',
                { id: 'searchStats' },
                {
                    padding: '10px',
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    margin: '10px 0',
                    fontSize: '14px'
                }
            );

            // storesSection 상단에 추가
            const storesSection = this.elements.storesSection;
            if (storesSection && storesSection.firstChild) {
                storesSection.insertBefore(statsContainer, storesSection.firstChild);
            }
        }

        // 통계 내용 + 내보내기 버튼 (리팩토링 완성!)
        const statsContent = Utils.createSafeElement(
            'div',
            '',
            {},
            {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }
        );

        // 통계 정보
        const statsInfo = Utils.createSafeElement('div');

        const title = Utils.createSafeElement('strong', '📊 검색 통계');
        const br1 = document.createElement('br');
        const totalText = Utils.createSafeElement('div', `• 전체 가맹점: ${stats.totalStores}개`);
        const br2 = document.createElement('br');
        const dongText = Utils.createSafeElement('div', `• 행정동 수: ${stats.uniqueDongs}개`);
        const br3 = document.createElement('br');
        const categoryText = Utils.createSafeElement(
            'div',
            `• 카테고리 수: ${stats.uniqueCategories}개`
        );

        statsInfo.appendChild(title);
        statsInfo.appendChild(br1);
        statsInfo.appendChild(totalText);
        statsInfo.appendChild(br2);
        statsInfo.appendChild(dongText);
        statsInfo.appendChild(br3);
        statsInfo.appendChild(categoryText);

        // 내보내기 버튼들
        const exportButtons = Utils.createSafeElement(
            'div',
            '',
            {},
            {
                display: 'flex',
                gap: '8px'
            }
        );

        const csvBtn = Utils.createSafeElement(
            'button',
            '📄 CSV',
            {},
            {
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
            }
        );

        const jsonBtn = Utils.createSafeElement(
            'button',
            '📦 JSON',
            {},
            {
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
            }
        );

        // 내보내기 이벤트 연결
        csvBtn.onclick = () => this.exportSearchResults('csv');
        jsonBtn.onclick = () => this.exportSearchResults('json');

        exportButtons.appendChild(csvBtn);
        exportButtons.appendChild(jsonBtn);

        statsContent.appendChild(statsInfo);
        statsContent.appendChild(exportButtons);

        // 기존 내용 교체
        statsContainer.innerHTML = '';
        statsContainer.appendChild(statsContent);
    }

    /**
     * 검색 결과 내보내기 (리팩토링 완성!)
     */
    async exportSearchResults(format) {
        try {
            const { searchManager } = await import('./searchManager.js');
            const exportData = searchManager.exportResults(format, { pretty: true });

            // 파일 다운로드
            const blob = new Blob([exportData], {
                type: format === 'csv' ? 'text/csv' : 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `search_results_${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.showNotification(
                `검색 결과를 ${format.toUpperCase()} 파일로 내보냈습니다.`,
                'success'
            );
        } catch (error) {
            Utils.error('내보내기 실패:', error);
            this.showNotification('내보내기 중 오류가 발생했습니다.', 'error');
        }
    }

    // 로딩 상태 토글
    toggleLoading(isLoading) {
        // 버튼 비활성화
        if (this.elements.searchMapBtn) {
            this.elements.searchMapBtn.disabled = isLoading;
            this.elements.searchMapBtn.textContent = isLoading ? '검색 중...' : '현 지도에서 검색';
        }

        if (this.elements.showAllBtn) {
            this.elements.showAllBtn.disabled = isLoading;
        }

        // 커서 변경
        document.body.style.cursor = isLoading ? 'wait' : 'default';
    }

    // 카테고리 선택 업데이트
    updateCategorySelection() {
        const checkboxes = this.elements.categoryDropdown?.querySelectorAll(
            'input[type="checkbox"]:not(#selectAll)'
        );
        if (!checkboxes) {
            return;
        }

        const selected = Array.from(checkboxes).filter((cb) => cb.checked).length;
        const total = checkboxes.length;

        if (this.elements.selectedCount) {
            this.elements.selectedCount.textContent =
                selected === total ? '(전체)' : `(${selected}개)`;
        }

        // 전체 선택 체크박스 상태 업데이트
        const selectAll = document.getElementById('selectAll');
        if (selectAll) {
            selectAll.checked = selected === total;
            selectAll.indeterminate = selected > 0 && selected < total;
        }
    }

    // 정렬 헤더 토글
    toggleSortHeader(field) {
        const state = stateManager.getState();
        const currentField = state.sortField;
        const currentDirection = state.sortDirection;

        let newDirection = 'asc';
        if (currentField === field) {
            newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
        }

        stateManager.setState({
            sortField: field,
            sortDirection: newDirection
        });

        // 헤더 클래스 업데이트
        document.querySelectorAll('.sortable').forEach((th) => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.field === field) {
                th.classList.add(newDirection);
            }
        });
    }

    // 거리 헤더 표시/숨기기
    toggleDistanceHeader(show) {
        if (this.elements.distanceHeader) {
            this.elements.distanceHeader.style.display = show ? 'table-cell' : 'none';
        }
    }

    // 알림 표시
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        // 스타일 적용
        Object.assign(notification.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '16px 24px',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 10000,
            animation: 'slideInUp 0.3s ease',
            backgroundColor:
                type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3',
            color: 'white'
        });

        document.body.appendChild(notification);

        // 자동 제거
        setTimeout(() => {
            notification.style.animation = 'slideOutDown 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
}

// 싱글톤 인스턴스
export const uiManager = new UIManager();

// 애니메이션 스타일 추가
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInUp {
        from {
            transform: translateY(100%);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutDown {
        from {
            transform: translateY(0);
            opacity: 1;
        }
        to {
            transform: translateY(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

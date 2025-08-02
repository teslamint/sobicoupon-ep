// 은평구 소비쿠폰 가맹점 위치 검색 시스템 - 리팩토링 버전
import { CONSTANTS } from './modules/constants.js';
import { Utils } from './modules/utils.js';
import { AppError, ErrorCodes, ErrorHandler } from './modules/errors.js';
import { stateManager } from './modules/state.js';
import { storageManager } from './modules/storage.js';
import { mapManager } from './modules/mapManager.js';
import { uiManager } from './modules/uiManager.js';
import { searchManager } from './modules/searchManager.js';
import { fileHandler } from './modules/fileHandler.js';

// 전역 객체로 노출 (레거시 지원 및 테스트용)
window.mapManager = mapManager;
window.stateManager = stateManager;
window.searchManager = searchManager;
window.uiManager = uiManager;

// 애플리케이션 클래스
class App {
    constructor() {
        this.initialized = false;
    }

    // 초기화
    async init() {
        if (this.initialized) {
            return;
        }

        try {
            // 전역 에러 핸들러 설정
            this.setupGlobalErrorHandler();

            // 마이그레이션을 SDK와 독립적으로 실행
            this.initMigrationIndependently();

            // 카카오맵 SDK가 로드될 때까지 대기 (타임아웃 시 우회)
            try {
                await this.waitForKakaoSDK();
            } catch (sdkError) {
                console.warn('카카오맵 SDK 로드 실패, 마이그레이션만 진행:', sdkError.message);
                // SDK 로드 실패해도 마이그레이션은 계속 진행
                await this.waitForMigrationComplete();
                throw sdkError; // 원래 에러는 다시 던져서 UI에서 처리
            }

            uiManager.init();

            // 이벤트 리스너 설정
            this.setupEventListeners();

            // 캐시된 데이터 확인 및 자동 로드
            await this.loadCachedData();

            this.initialized = true;
            console.log('Application initialized successfully');
        } catch (error) {
            ErrorHandler.handle(error);
            console.error('Failed to initialize application:', error);
        }
    }

    // 카카오맵 SDK 로드 대기
    async waitForKakaoSDK() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5초 대기

            const checkKakao = () => {
                if (window.kakao && window.kakao.maps) {
                    resolve();
                    return;
                }

                attempts++;
                if (attempts >= maxAttempts) {
                    reject(new AppError('카카오맵 SDK 로드 타임아웃'));
                    return;
                }

                setTimeout(checkKakao, 100);
            };

            checkKakao();
        });
    }

    // 마이그레이션을 SDK와 독립적으로 실행
    initMigrationIndependently() {
        // 즉시 백그라운드에서 마이그레이션 시작
        storageManager
            .init()
            .then(() => {
                console.log('마이그레이션이 백그라운드에서 완료되었습니다.');
            })
            .catch((error) => {
                console.error('마이그레이션 실패:', error);
            });
    }

    // 마이그레이션 완료 대기
    async waitForMigrationComplete() {
        // storageManager 초기화 완료만 대기
        return new Promise((resolve) => {
            const checkInitialization = () => {
                if (storageManager.isInitialized) {
                    resolve();
                } else {
                    setTimeout(checkInitialization, 50);
                }
            };
            checkInitialization();
        });
    }

    // 전역 에러 핸들러
    setupGlobalErrorHandler() {
        window.addEventListener('error', (event) => {
            ErrorHandler.handle(
                new AppError(event.message, ErrorCodes.UNKNOWN_ERROR, {
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                })
            );
        });

        window.addEventListener('unhandledrejection', (event) => {
            ErrorHandler.handle(
                new AppError('Unhandled promise rejection', ErrorCodes.UNKNOWN_ERROR, {
                    reason: event.reason
                })
            );
            event.preventDefault();
        });

        // 페이지 언로드 시 리소스 정리
        window.addEventListener('beforeunload', () => {
            try {
                if (mapManager && typeof mapManager.destroy === 'function') {
                    mapManager.destroy();
                }
            } catch (error) {
                console.warn('MapManager 정리 중 오류:', error);
            }
        });

        // 페이지 가시성 변경 시 리소스 관리 (모바일 백그라운드 처리)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // 페이지가 숨겨질 때 주기적 정리 작업 일시 중지
                try {
                    if (mapManager && mapManager.cleanupInterval) {
                        clearInterval(mapManager.cleanupInterval);
                        mapManager.cleanupInterval = null;
                    }
                } catch (error) {
                    console.warn('정리 작업 일시 중지 중 오류:', error);
                }
            } else {
                // 페이지가 다시 보일 때 주기적 정리 작업 재시작
                try {
                    if (mapManager && !mapManager.cleanupInterval && mapManager.isInitialized) {
                        mapManager.cleanupInterval = setInterval(() => {
                            mapManager.cleanupOldEventListeners();
                        }, CONSTANTS.TIME.CIRCUIT_BREAKER_TIMEOUT);
                    }
                } catch (error) {
                    console.warn('정리 작업 재시작 중 오류:', error);
                }
            }
        });
    }

    // 이벤트 리스너 설정
    setupEventListeners() {
        // 파일 업로드
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        // 검색 버튼
        const searchMapBtn = document.getElementById('searchMapBtn');
        if (searchMapBtn) {
            searchMapBtn.addEventListener('click', () => this.searchInCurrentMap());
        }

        // 모든 위치 표시 버튼
        const showAllBtn = document.getElementById('showAllBtn');
        if (showAllBtn) {
            showAllBtn.addEventListener('click', () => this.showAllLocations());
        }

        // 검색 입력
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            const debouncedSearch = Utils.debounce(() => this.handleSearch(), 300);
            searchInput.addEventListener('input', debouncedSearch);
        }

        // 필터 변경
        const dongFilter = document.getElementById('dongFilter');
        const categoryFilter = document.getElementById('categoryFilter');

        if (dongFilter) {
            dongFilter.addEventListener('change', () => this.handleFilterChange());
        }

        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => this.handleFilterChange());
        }

        // 정렬 가능한 헤더
        document.querySelectorAll('.sortable').forEach((th) => {
            th.addEventListener('click', () => {
                const field = th.dataset.field || th.textContent.trim();
                uiManager.toggleSortHeader(field);
            });
        });

        // 거리 헤더 클릭 이벤트
        const distanceHeader = document.getElementById('distanceHeader');
        if (distanceHeader) {
            distanceHeader.addEventListener('click', () => {
                searchManager.toggleDistanceSort();
            });
        }
    }

    // 캐시된 데이터 로드 (성능 최적화)
    async loadCachedData() {
        try {
            console.log('캐시 데이터 로드 시작...');

            // 마이그레이션된 데이터 로드 시도
            const migratedStores = await storageManager.getMigratedStores();

            if (!migratedStores || migratedStores.length === 0) {
                console.log('마이그레이션된 데이터가 없습니다.');
                return false;
            }

            console.log(`마이그레이션된 데이터 ${migratedStores.length}개 발견`);

            // 위치 정보 로드
            const cachedLocations = await storageManager.getAllLocations();
            console.log(`캐시된 위치 정보 ${cachedLocations.size}개를 발견했습니다.`);

            // 데이터 변환 (undefined 요소 필터링)
            const stores = migratedStores
                .filter((store, index) => {
                    if (!store || typeof store !== 'object') {
                        console.warn(`인덱스 ${index}: 유효하지 않은 데이터 건너뜀`, store);
                        return false;
                    }
                    return true;
                })
                .map((store, index) => {
                    const processedStore = {
                        인덱스: store.인덱스 || index,
                        읍면동명: store.행정동 || store.읍면동명 || '',
                        행정동: store.행정동 || '',
                        상호: store.상호 || '',
                        표준산업분류명: store.category
                            ? store.category.split(' > ')[0]
                            : store.표준산업분류명 || store.업종 || store.분류 || '',
                        도로명주소: store.foundAddress || store.상세주소 || '',
                        지번주소: store.상세주소 || '',
                        상세주소: store.상세주소 || '',
                        location: null,
                        searched: false,
                        검색결과: store.검색결과 || ''
                    };

                    // 캐시된 위치 정보 적용 - 정확한 키 매칭
                    let cachedLocation = null;
                    const primaryKey = `${processedStore.행정동 || processedStore.읍면동명}_${processedStore.상호}`;

                    if (cachedLocations.has(primaryKey)) {
                        cachedLocation = cachedLocations.get(primaryKey);
                        console.log(`캐시 매칭 성공: ${primaryKey} -> ${processedStore.상호}`);
                    }

                    if (cachedLocation) {
                        processedStore.location = cachedLocation;
                        processedStore.searched = true;
                        processedStore.검색결과 = '찾음';
                    }

                    return processedStore;
                });

            // 통계 계산 - 정확한 계산
            const foundCount = stores.filter(
                (s) => s.location && s.location.lat && s.location.lng
            ).length;
            const dongs = [...new Set(stores.map((s) => s.읍면동명).filter(Boolean))].sort();
            // 상태에서 categories Map을 가져와서 배열로 변환
            const state = stateManager.getState();
            const categoriesMap = state.categories || new Map();
            let categories = Array.from(categoriesMap.keys()).sort();

            // fallback으로 stores에서 직접 추출 (categories가 비어있는 경우)
            if (categories.length === 0) {
                categories = [
                    ...new Set(stores.map((s) => s.표준산업분류명).filter(Boolean))
                ].sort();
            }

            const stats = {
                total: stores.length,
                dongs: dongs.length,
                found: foundCount,
                notFound: stores.length - foundCount
            };

            console.log(
                `통계 계산 완료: 전체 ${stats.total}개, 찾음 ${stats.found}개, 못찾음 ${stats.notFound}개`
            );

            // 상태 업데이트
            stateManager.setState({
                stores: stores,
                filteredStores: stores,
                currentPage: 1,
                stats: stats
            });

            // UI 업데이트
            uiManager.updateFilterOptions(dongs, categories);
            uiManager.updateStats(stats);

            // 지도 초기화 및 마커 표시
            if (!mapManager.isInitialized) {
                setTimeout(async () => {
                    await mapManager.init('map');
                    if (foundCount > 0) {
                        mapManager.showAllMarkers();
                    }
                }, 100);
            } else {
                mapManager.relayout();
                if (foundCount > 0) {
                    mapManager.showAllMarkers();
                }
            }

            // 모든 위치 표시 버튼 활성화
            const showAllBtn = document.getElementById('showAllBtn');
            if (showAllBtn) {
                showAllBtn.disabled = false;
            }

            uiManager.showSection('main');
            console.log(`캐시 로드 완료: ${stores.length}개 처리됨 (위치 정보: ${foundCount}개)`);

            return true;
        } catch (error) {
            console.error('캐시 데이터 로드 실패:', error);
            return false;
        }
    }

    // 마이그레이션된 스토어 데이터 로드 (재시도 로직 포함)
    async _loadMigratedStoresWithFallback() {
        try {
            return await storageManager.getMigratedStores();
        } catch (error) {
            console.warn('마이그레이션된 데이터 로드 실패, 재시도 중...', error);
            // 100ms 후 재시도
            await new Promise((resolve) => setTimeout(resolve, 100));
            try {
                return await storageManager.getMigratedStores();
            } catch (retryError) {
                console.error('마이그레이션된 데이터 로드 재시도 실패:', retryError);
                throw retryError;
            }
        }
    }

    // 위치 데이터 로드 (재시도 로직 포함)
    async _loadLocationDataWithRetry() {
        try {
            return await storageManager.getAllLocations();
        } catch (error) {
            console.warn('위치 데이터 로드 실패, 재시도 중...', error);
            await new Promise((resolve) => setTimeout(resolve, 50));
            return (await storageManager.getAllLocations()) || new Map();
        }
    }

    // 카테고리 데이터 로드 (재시도 로직 포함)
    async _loadCategoryDataWithRetry() {
        try {
            return await storageManager.getCategories();
        } catch (error) {
            console.warn('카테고리 데이터 로드 실패, 재시도 중...', error);
            return new Map();
        }
    }

    // 청크 기반 스토어 데이터 처리 (메인 스레드 블로킹 방지)
    async _processStoresInChunks(migratedStores, cachedLocations, progressCallback) {
        const CHUNK_SIZE = 500; // 500개씩 처리
        const totalCount = migratedStores.length;
        const processedStores = [];
        let foundCount = 0;

        for (let i = 0; i < totalCount; i += CHUNK_SIZE) {
            const chunk = migratedStores.slice(i, Math.min(i + CHUNK_SIZE, totalCount));

            // 청크 처리
            const processedChunk = chunk.map((store, chunkIndex) => {
                const globalIndex = i + chunkIndex;

                // 메모리 효율적인 객체 생성
                const processedStore = {
                    인덱스: store.인덱스 || globalIndex,
                    읍면동명: store.행정동 || store.읍면동명 || '',
                    행정동: store.행정동 || '',
                    상호: store.상호 || '',
                    표준산업분류명: store.category
                        ? store.category.split(' > ')[0]
                        : store.표준산업분류명 || store.업종 || store.분류 || '',
                    도로명주소: store.foundAddress || store.상세주소 || '',
                    지번주소: store.상세주소 || '',
                    상세주소: store.상세주소 || '',
                    location: null,
                    searched: false,
                    검색결과: store.검색결과
                };

                // 캐시된 위치 정보 병합 (메모리 효율적)
                const locationKey = `${processedStore.행정동}_${processedStore.상호}`;
                const cachedLocation = cachedLocations.get(locationKey);
                if (cachedLocation) {
                    processedStore.location = cachedLocation;
                    processedStore.searched = true;
                    processedStore.검색결과 = '찾음';
                    foundCount++;
                }

                return processedStore;
            });

            processedStores.push(...processedChunk);

            // 프로그레스 콜백 호출
            if (progressCallback) {
                progressCallback(processedStores.length, totalCount);
            }

            // 메인 스레드가 블로킹되지 않도록 yield
            if (i + CHUNK_SIZE < totalCount) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        return {
            data: processedStores,
            foundCount: foundCount
        };
    }

    // 통계 및 필터 데이터 최적화 계산
    async _calculateStatsOptimized(stores, cachedCategories) {
        const dongSet = new Set();
        let foundCount = 0;
        let notFoundCount = 0;

        // 단일 순회로 통계 계산 (메모리 효율적)
        for (const store of stores) {
            if (store.읍면동명) {
                dongSet.add(store.읍면동명);
            }
            if (store.검색결과 === '찾음') {
                foundCount++;
            } else if (store.검색결과 === '못찾음') {
                notFoundCount++;
            }
        }

        return {
            stats: {
                total: stores.length,
                dongs: dongSet.size,
                found: foundCount,
                notFound: notFoundCount
            },
            dongs: [...dongSet].sort(),
            categories: [...cachedCategories.values()]
        };
    }

    // 비동기 UI 초기화 (응답성 향상)
    async _initializeUIAsync(dongs, categories, foundCount) {
        // 메인 화면 표시
        uiManager.showSection('main');

        // 필터 옵션 업데이트
        uiManager.updateFilterOptions(dongs, categories);

        // 지도 초기화를 마이크로태스크로 연기
        await new Promise((resolve) => setTimeout(resolve, 0));

        setTimeout(async () => {
            try {
                await mapManager.init('map');
                if (foundCount > 0) {
                    mapManager.showAllMarkers();
                }
            } catch (mapError) {
                console.error('지도 초기화 실패:', mapError);
                // 지도 초기화 실패는 전체 로드를 실패시키지 않음
            }
        }, 100);
    }

    // 위치 정보만 로드하는 경우 (최적화)
    async _loadLocationOnlyData() {
        try {
            const cachedLocations = await this._loadLocationDataWithRetry();
            if (!cachedLocations || cachedLocations.size === 0) {
                return false;
            }

            console.log(`캐시된 위치 정보 ${cachedLocations.size}개를 발견했습니다.`);

            // 카테고리 정보도 로드
            const cachedCategories = await this._loadCategoryDataWithRetry();
            if (cachedCategories.size > 0) {
                stateManager.setState({ categories: cachedCategories });
            }

            // 청크 기반으로 임시 스토어 생성
            const tempStores = [];
            const entries = [...cachedLocations.entries()];
            const CHUNK_SIZE = 200;

            for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
                const chunk = entries.slice(i, i + CHUNK_SIZE);

                chunk.forEach(([key, location], chunkIndex) => {
                    const [dong, store] = key.split('_');
                    tempStores.push({
                        인덱스: i + chunkIndex,
                        읍면동명: dong,
                        행정동: dong,
                        상호: store,
                        도로명주소: location.roadAddress || '',
                        지번주소: location.jibunAddress || '',
                        상세주소: location.roadAddress || location.jibunAddress || '',
                        location: location,
                        searched: true,
                        검색결과: '찾음'
                    });
                });

                // 프로그레스 업데이트
                if (i + CHUNK_SIZE < entries.length) {
                    uiManager.showUploadStatus(
                        `캐시 데이터 처리 중... (${Math.min(i + CHUNK_SIZE, entries.length)}/${entries.length})`,
                        'info'
                    );
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }

            // 상태 업데이트
            const dongSet = new Set(tempStores.map((s) => s.읍면동명));
            stateManager.setState({
                stores: tempStores,
                filteredStores: tempStores,
                currentPage: 1,
                stats: {
                    total: tempStores.length,
                    dongs: dongSet.size,
                    found: tempStores.length,
                    notFound: 0
                }
            });

            // UI 업데이트
            uiManager.showUploadStatus(
                `캐시된 위치 정보 ${cachedLocations.size}개를 불러왔습니다. 엑셀 파일을 업로드하면 전체 데이터를 확인할 수 있습니다.`,
                'success'
            );

            // 비동기 UI 초기화
            await this._initializeUIAsync(
                [...dongSet].sort(),
                [...cachedCategories.values()],
                tempStores.length
            );

            return true;
        } catch (error) {
            console.error('위치 정보 로드 실패:', error);
            return false;
        }
    }

    // 로드 실패 처리 (Graceful Fallback)
    async _handleLoadFailure(error, processedCount) {
        console.error('캐시 데이터 로드 중 오류 발생:', error);

        // 부분적으로 로드된 데이터가 있는 경우
        if (processedCount > 0) {
            uiManager.showUploadStatus(
                `일부 데이터 로드 실패. ${processedCount}개의 데이터만 로드되었습니다. 새로고침 후 다시 시도해주세요.`,
                'warning'
            );
            return true; // 부분적 성공으로 처리
        }

        // 완전 실패의 경우
        uiManager.showUploadStatus(
            '캐시 데이터 로드에 실패했습니다. 엑셀 파일을 업로드해주세요.',
            'error'
        );

        // 기본 상태로 초기화
        stateManager.resetState();
        uiManager.showSection('upload');

        return false;
    }

    // 파일 선택 처리
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        try {
            uiManager.showUploadStatus('파일을 처리하는 중...', 'info');

            const result = await fileHandler.handleFile(file);

            // UI 업데이트
            uiManager.showUploadStatus(
                `${result.count}개의 가맹점을 불러왔습니다. (캐시된 위치: ${result.cached}개)`,
                'success'
            );

            uiManager.showSection('main');

            // 지도 초기화 (처음 로드 시)
            if (!mapManager.isInitialized) {
                // UI가 먼저 표시된 후 지도 초기화
                setTimeout(async () => {
                    await mapManager.init('map');

                    // 캐시된 위치가 있으면 자동으로 표시
                    if (result.cached > 0) {
                        mapManager.showAllMarkers();
                    }
                }, 100);
            } else {
                // 이미 초기화된 경우 지도 크기 재조정
                mapManager.relayout();

                // 캐시된 위치가 있으면 자동으로 표시
                if (result.cached > 0) {
                    mapManager.showAllMarkers();
                }
            }

            // 필터 옵션 업데이트
            const state = stateManager.getState();
            const dongs = [...new Set(state.stores.map((s) => s.읍면동명))].sort();
            // 상태에서 categories Map을 가져와서 배열로 변환
            const categoriesMap = state.categories || new Map();
            let categories = Array.from(categoriesMap.keys()).sort();

            // fallback으로 stores에서 직접 추출 (categories가 비어있는 경우)
            if (categories.length === 0) {
                categories = [
                    ...new Set(state.stores.map((s) => s.표준산업분류명).filter((c) => c))
                ].sort();
            }

            uiManager.updateFilterOptions(dongs, categories);

            // 모든 위치 표시 버튼 활성화
            const showAllBtn = document.getElementById('showAllBtn');
            if (showAllBtn) {
                showAllBtn.disabled = false;
            }
        } catch (error) {
            ErrorHandler.handle(error);
            event.target.value = '';
        }
    }

    // 현재 지도에서 검색
    async searchInCurrentMap() {
        try {
            await searchManager.searchInCurrentMap();
            // searchManager에서 이미 알림을 표시하므로 중복 제거
        } catch (error) {
            ErrorHandler.handle(error);
        }
    }

    // 모든 위치 표시
    async showAllLocations() {
        try {
            await searchManager.showAllLocations();
            // searchManager에서 이미 알림을 표시하므로 중복 제거
        } catch (error) {
            ErrorHandler.handle(error);
        }
    }

    // 검색 처리
    handleSearch() {
        const searchInput = document.getElementById('searchInput');
        const query = searchInput ? searchInput.value.trim() : '';

        stateManager.setState({ searchQuery: query });

        const state = stateManager.getState();
        searchManager.applyFilters({
            searchQuery: query,
            selectedDong: state.selectedDong || '',
            selectedCategory: state.selectedCategory || ''
        });
    }

    // 필터 변경 처리
    handleFilterChange() {
        const dongFilter = document.getElementById('dongFilter');
        const categoryFilter = document.getElementById('categoryFilter');

        const dongValue = dongFilter ? dongFilter.value : '';
        const categoryValue = categoryFilter ? categoryFilter.value : '';

        stateManager.setState({
            selectedDong: dongValue,
            selectedCategory: categoryValue
        });

        const state = stateManager.getState();
        searchManager.applyFilters({
            searchQuery: state.searchQuery || '',
            selectedDong: dongValue,
            selectedCategory: categoryValue
        });
    }
}

// 전역 함수들 (레거시 지원)

// 캐시 삭제
window.clearCache = async function () {
    try {
        const confirmed = confirm('저장된 모든 캐시 데이터를 삭제하시겠습니까?');
        if (!confirmed) {
            return;
        }

        await storageManager.clearCache();

        // 기존 데이터베이스도 삭제 (마이그레이션 이전 데이터)
        try {
            await indexedDB.deleteDatabase('EunpyeongStoreDB');
            console.log('기존 캐시 데이터베이스도 삭제했습니다.');
        } catch (error) {
            // 기존 DB가 없어도 무시
        }

        // 상태 초기화
        stateManager.resetState();

        // UI 초기화
        uiManager.showSection('upload');
        uiManager.showUploadStatus('캐시가 삭제되었습니다.', 'success');

        // 파일 입력 초기화
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.value = '';
        }
    } catch (error) {
        ErrorHandler.handle(error);
    }
};

// 지도 컨트롤
window.zoomIn = function () {
    mapManager.zoomIn();
};

window.zoomOut = function () {
    mapManager.zoomOut();
};

window.showCurrentLocation = async function () {
    try {
        await mapManager.showCurrentLocation();

        // 거리 헤더 표시
        uiManager.toggleDistanceHeader(true);

        // 필터 재적용 (거리 계산)
        const state = stateManager.getState();
        searchManager.applyFilters({
            searchQuery: state.searchQuery || '',
            selectedDong: state.selectedDong || '',
            selectedCategory: state.selectedCategory || ''
        });
    } catch (error) {
        ErrorHandler.handle(
            new AppError('현재 위치를 가져올 수 없습니다.', ErrorCodes.LOCATION_NOT_FOUND, {
                originalError: error
            })
        );
    }
};

// 카테고리 드롭다운 토글
window.toggleCategoryDropdown = function () {
    const dropdown = document.getElementById('categoryDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';

        // 외부 클릭 시 닫기
        if (dropdown.style.display === 'block') {
            const closeDropdown = (e) => {
                if (!e.target.closest('.category-filter-wrapper')) {
                    dropdown.style.display = 'none';
                    document.removeEventListener('click', closeDropdown);
                }
            };

            setTimeout(() => {
                document.addEventListener('click', closeDropdown);
            }, 100);
        }
    }
};

// 카테고리 전체 선택
window.toggleAllCategories = function () {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll(
        '#categoryDropdown input[type="checkbox"]:not(#selectAll)'
    );

    if (selectAll && checkboxes) {
        checkboxes.forEach((cb) => {
            cb.checked = selectAll.checked;
        });

        window.updateCategorySelection();
    }
};

// 카테고리 선택 업데이트
window.updateCategorySelection = function () {
    const checkboxes = document.querySelectorAll(
        '#categoryDropdown input[type="checkbox"]:not(#selectAll)'
    );
    const selectedCategories = new Set();

    checkboxes.forEach((cb) => {
        if (cb.checked) {
            selectedCategories.add(cb.value);
        }
    });

    stateManager.setState({ selectedCategories });

    // 현재 상태를 기반으로 필터 적용
    const state = stateManager.getState();
    searchManager.applyFilters({
        searchQuery: state.searchQuery || '',
        selectedDong: state.selectedDong || '',
        selectedCategory: state.selectedCategory || ''
    });

    uiManager.updateCategorySelection();
};

// CSV 내보내기
window.exportToCSV = function () {
    try {
        fileHandler.exportToCSV();
        uiManager.showNotification('CSV 파일로 내보냈습니다.', 'success');
    } catch (error) {
        ErrorHandler.handle(error);
    }
};

// JSON 내보내기
window.exportToJSON = function () {
    try {
        fileHandler.exportToJSON();
        uiManager.showNotification('JSON 파일로 내보냈습니다.', 'success');
    } catch (error) {
        ErrorHandler.handle(error);
    }
};

// 애플리케이션 시작
document.addEventListener('DOMContentLoaded', async () => {
    const app = new App();
    await app.init();

    // 개발 환경에서 디버깅용
    if (window.location.hostname === 'localhost') {
        window.app = app;
        window.modules = {
            stateManager,
            storageManager,
            mapManager,
            uiManager,
            searchManager,
            fileHandler
        };
    }
});

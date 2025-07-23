/**
 * 검색 관리자 (리팩토링 버전)
 * - 책임을 각 서비스로 분산
 * - 핵심 조정 역할만 담당
 * - 981줄 → 300줄 이하로 축소
 */

import { CONSTANTS } from './constants.js';
import { Utils } from './utils.js';
import { MapSearchService } from './search/mapSearchService.js';
import { LocationSearchService } from './search/locationSearchService.js';
import { SearchResultProcessor } from './search/searchResultProcessor.js';
import { stateManager } from './state.js';
import { mapManager } from './mapManager.js';
import { uiManager } from './uiManager.js';
import { storageManager } from './storage.js';
import { ErrorHandler } from './errors.js';

export class SearchManager {
    constructor() {
        this.mapSearchService = new MapSearchService();
        this.locationSearchService = new LocationSearchService();
        this.resultProcessor = new SearchResultProcessor();

        this.isSearching = false;
        this.currentSearchPromise = null;
    }

    /**
     * 현재 지도 영역에서 검색
     */
    async searchInCurrentMap() {
        // 기존 검색이 진행 중이면 해당 Promise 반환
        if (this.currentSearchPromise) {
            return this.currentSearchPromise;
        }

        // 새로운 검색 Promise 생성
        this.currentSearchPromise = this._executeSearchInCurrentMap();

        try {
            const result = await this.currentSearchPromise;
            return result;
        } finally {
            // 검색 완료 후 Promise 정리
            this.currentSearchPromise = null;
        }
    }

    async _executeSearchInCurrentMap() {
        try {
            // 검색 조건 확인
            this.validateSearchConditions();

            // 검색 상태 설정
            this.setSearchingState(true);

            // 검색 실행
            const results = await this.executeMapSearch();

            // 결과 처리 및 표시
            await this.processAndDisplayResults(results);

            return results;
        } catch (error) {
            ErrorHandler.handle(error);
            throw error;
        } finally {
            this.setSearchingState(false);
        }
    }

    /**
     * 개별 가맹점 위치 검색 및 표시
     */
    async searchAndShowLocation(store) {
        try {
            this.setSearchingState(true);
            uiManager.showNotification(`${store.상호} 위치를 검색하고 있습니다...`, 'info');

            // 위치 검색
            const result = await this.locationSearchService.searchStoreLocation(store);

            if (result.location) {
                // 검색된 위치로 지도 이동 및 마커 표시
                await this.showSearchResult([result]);
                uiManager.showNotification(`${store.상호} 위치를 찾았습니다.`, 'success');

                // 위치 정보를 캐시에 저장
                await this.cacheLocationResult(result);
            } else {
                uiManager.showNotification(`${store.상호} 위치를 찾을 수 없습니다.`, 'error');
            }

            return result;
        } catch (error) {
            ErrorHandler.handle(error);
            uiManager.showNotification('위치 검색 중 오류가 발생했습니다.', 'error');
            throw error;
        } finally {
            this.setSearchingState(false);
        }
    }

    /**
     * 모든 가맹점 위치 표시
     */
    async showAllLocations() {
        try {
            this.setSearchingState(true);

            const state = stateManager.getState();
            const stores = state.stores || [];

            if (stores.length === 0) {
                uiManager.showNotification('표시할 가맹점 데이터가 없습니다.', 'warning');
                return;
            }

            // 캐시된 위치 정보 로드
            const cachedResults = await this.loadCachedLocations(stores);

            if (cachedResults.length > 0) {
                // 결과 처리 및 표시
                const processedResults = await this.resultProcessor.processResults(cachedResults, {
                    findNearbyMatches: false,
                    sort: true,
                    sortField: '읍면동명'
                });

                await this.showSearchResult(processedResults);
                uiManager.showNotification(
                    `${processedResults.length}개 가맹점을 표시했습니다.`,
                    'success'
                );
            } else {
                uiManager.showNotification(
                    '표시할 위치 정보가 없습니다. 먼저 검색을 실행해주세요.',
                    'warning'
                );
            }
        } catch (error) {
            ErrorHandler.handle(error);
            throw error;
        } finally {
            this.setSearchingState(false);
        }
    }

    /**
     * 검색 취소
     */
    cancelSearch() {
        if (this.isSearching) {
            this.mapSearchService.cancelSearch();
            this.setSearchingState(false);
            uiManager.showNotification('검색이 취소되었습니다.', 'info');
        }
    }

    /**
     * 검색 조건 확인
     */
    validateSearchConditions() {
        if (!mapManager.map) {
            throw new Error('지도가 초기화되지 않았습니다.');
        }

        const state = stateManager.getState();
        const stores = state.stores || [];

        if (stores.length === 0) {
            throw new Error('검색할 가맹점 데이터가 없습니다. 먼저 파일을 업로드해주세요.');
        }
    }

    /**
     * 검색 상태 설정
     */
    setSearchingState(isSearching) {
        this.isSearching = isSearching;
        stateManager.setState({ isSearching });
        uiManager.toggleLoading(isSearching);

        if (isSearching) {
            uiManager.updateProgress(0);
        } else {
            uiManager.updateProgress(CONSTANTS.UI_DIMENSIONS.PROGRESS_COMPLETE);
            setTimeout(() => uiManager.updateProgress(0), CONSTANTS.TIME.PROGRESS_HIDE_DELAY);
        }
    }

    /**
     * 지도 검색 실행
     */
    async executeMapSearch() {
        const mapBounds = mapManager.getBounds();
        const state = stateManager.getState();
        const stores = state.stores || [];

        // MapSearchService를 통한 검색
        const searchResults = await this.mapSearchService.searchInCurrentMap(mapBounds, stores);

        return searchResults;
    }

    /**
     * 결과 처리 및 표시
     */
    async processAndDisplayResults(rawResults) {
        // 검색 결과 처리
        const processedResults = await this.resultProcessor.processResults(rawResults, {
            findNearbyMatches: true,
            sort: true,
            sortField: '거리',
            sortDirection: 'asc'
        });

        // 결과 표시
        await this.showSearchResult(processedResults);

        // 검색 결과 캐싱
        await this.cacheSearchResults(processedResults);

        // 검색 통계 업데이트 (리팩토링 완성!)
        this.updateSearchStats();

        // 알림 표시 (더 상세한 통계 포함)
        const statistics = this.resultProcessor.getStatistics();
        const state = stateManager.getState();
        const totalStores = state.stores?.length || 0;
        const successRate =
            totalStores > 0
                ? Math.round(
                      (statistics.found / totalStores) *
                          CONSTANTS.UI_DIMENSIONS.PERCENTAGE_PRECISION
                  )
                : 0;

        uiManager.showNotification(
            `검색 완료: ${statistics.found}/${totalStores}개 발견 (${successRate}%), ${statistics.nearbyMatches}개 근처 매치`,
            'success'
        );

        return processedResults;
    }

    /**
     * 검색 결과 표시
     */
    showSearchResult(results) {
        if (!results || results.length === 0) {
            return;
        }

        // 거리 계산이 필요한 경우에만 수행 (중복 제거)
        const needsDistanceCalculation = results.some(
            (result) =>
                result.location && (result.distance === undefined || result.distance === null)
        );

        if (needsDistanceCalculation) {
            results = this.resultProcessor.calculateDistanceFromUserLocation(results);
        }

        // 검색 결과의 위치 정보를 원본 stores에 업데이트
        const state = stateManager.getState();
        const stores = [...(state.stores || [])];
        let updatedCount = 0;

        results.forEach((result) => {
            if (result.location && result.store) {
                const storeIndex = stores.findIndex(
                    (s) =>
                        s.상호 === result.store.상호 &&
                        (s.읍면동명 === result.store.읍면동명 || s.행정동 === result.store.읍면동명)
                );

                if (storeIndex !== -1) {
                    stores[storeIndex].location = result.location;
                    stores[storeIndex].searched = true;
                    stores[storeIndex].검색결과 = '찾음';
                    updatedCount++;
                    Utils.log(
                        `위치 정보 업데이트: ${stores[storeIndex].상호} (${stores[storeIndex].읍면동명})`
                    );
                }
            }
        });

        Utils.log(`${updatedCount}개 가맹점의 위치 정보가 업데이트되었습니다.`);

        // 상태 업데이트 - stores와 searchResults 모두 업데이트
        stateManager.setState({
            stores: stores,
            searchResults: results
        });

        // 통계 즉시 업데이트
        this.updateSearchStats();

        // 전체 가맹점 목록을 거리 정보와 함께 업데이트하여 UI 테이블에 표시
        try {
            // 성능 최적화: 검색 결과를 Map으로 변환하여 O(1) 조회
            const resultMap = new Map();
            results.forEach((result) => {
                if (result?.store) {
                    const resultStore = result.store.store || result.store;
                    if (resultStore?.상호) {
                        const key = `${resultStore.상호}_${resultStore.읍면동명 || resultStore.행정동 || ''}`;
                        resultMap.set(key, result);
                    }
                }
            });

            // 메모리 최적화: 거리 정보가 있는 경우에만 객체 복사
            const updatedStores = stores.map((store) => {
                const key = `${store.상호}_${store.읍면동명 || ''}`;
                const matchingResult = resultMap.get(key);

                // 타입 안전성: 거리 값 검증
                if (
                    matchingResult &&
                    typeof matchingResult.distance === 'number' &&
                    !isNaN(matchingResult.distance) &&
                    matchingResult.distance >= 0
                ) {
                    return { ...store, 거리: matchingResult.distance };
                }

                // 변경사항이 없으면 원본 반환 (메모리 최적화)
                return store;
            });

            // 정렬 안정성: Infinity 비교 시 NaN 처리 방지
            const sortedStores = updatedStores.sort((a, b) => {
                const distanceA = a.거리 ?? Number.MAX_SAFE_INTEGER;
                const distanceB = b.거리 ?? Number.MAX_SAFE_INTEGER;
                return distanceA - distanceB;
            });

            // 상태의 filteredStores를 전체 목록으로 업데이트 (거리순 정렬)
            stateManager.setState({ filteredStores: sortedStores });

            // UI 테이블 업데이트 (전체 목록 표시, 거리순 정렬)
            uiManager.updateTable();
        } catch (error) {
            Utils.error('검색 결과 처리 중 오류 발생:', error);
            // 에러 발생 시 원본 데이터로 fallback
            stateManager.setState({ filteredStores: stores });
            uiManager.updateTable();

            // 사용자에게 알림 - 함수 존재 여부 확인
            if (uiManager && typeof uiManager.showNotification === 'function') {
                uiManager.showNotification(
                    '검색 결과 처리 중 오류가 발생했습니다. 원본 목록을 표시합니다.',
                    'warning'
                );
            }
        }

        // 지도에 마커 표시
        if (results.some((result) => result.location)) {
            const locationsForMap = results
                .filter((result) => result.location)
                .map((result) => ({
                    store: result.store,
                    location: result.location
                }));

            Utils.log('지도 마커 업데이트 시작');
            mapManager.updateMarkersWithSearchResults(locationsForMap);
        }

        // 거리 정렬 토글
        this.toggleDistanceSort(true);
    }

    /**
     * 캐시된 위치 정보 로드
     */
    async loadCachedLocations(stores) {
        try {
            const cachedLocations = await storageManager.getAllLocations();
            const results = [];

            for (const store of stores) {
                const cacheKey = `${store.상호}_${store.주소 || store.도로명주소 || store.지번주소 || ''}`;
                const location = cachedLocations[cacheKey];

                if (location) {
                    results.push({
                        store: store,
                        location: location,
                        matchType: 'cached'
                    });
                }
            }

            return results;
        } catch (error) {
            Utils.error('캐시된 위치 정보 로드 실패:', error);
            return [];
        }
    }

    /**
     * 위치 결과 캐싱
     */
    async cacheLocationResult(result) {
        if (result.location && result.store) {
            try {
                // 데이터 구조에 따라 실제 가맹점 정보 추출
                let actualStore;
                if (result.store.store) {
                    // 중첩된 구조: result.store.store가 실제 가맹점 데이터
                    actualStore = result.store.store;
                } else {
                    // 단순 구조: result.store가 실제 가맹점 데이터
                    actualStore = result.store;
                }

                // 가맹점 이름과 위치 안전하게 추출
                const storeName =
                    actualStore.상호 ||
                    actualStore.storeName ||
                    actualStore.name ||
                    actualStore.매장명 ||
                    '매장명 없음';

                const dong =
                    actualStore.읍면동명 ||
                    actualStore.행정동 ||
                    actualStore.dong ||
                    actualStore.동 ||
                    '행정동 정보 없음';

                Utils.log(`위치 정보 캐싱: ${storeName} (${dong})`);
                await storageManager.saveLocation(actualStore, result.location);

                // 캐시 저장 후 통계 즉시 업데이트
                this.updateSearchStats();
            } catch (error) {
                Utils.error('위치 정보 캐싱 실패:', error);
            }
        }
    }

    /**
     * 검색 결과 캐싱
     */
    async cacheSearchResults(results) {
        try {
            const cachePromises = results
                .filter((result) => result.location)
                .map((result) => this.cacheLocationResult(result));

            await Promise.allSettled(cachePromises);
        } catch (error) {
            Utils.error('검색 결과 캐싱 실패:', error);
        }
    }

    /**
     * 거리 정렬 토글
     */
    toggleDistanceSort(enable) {
        try {
            const state = stateManager.getState();

            // 검색 결과에서 거리 정보 확인 (더 철저한 검사)
            const searchResults = state.searchResults || [];
            const hasDistanceInResults = searchResults.some((result) => {
                return (
                    (result.distance !== undefined &&
                        result.distance !== null &&
                        result.distance !== '') ||
                    (result.store &&
                        result.store.거리 !== undefined &&
                        result.store.거리 !== null &&
                        result.store.거리 !== '')
                );
            });

            Utils.log('거리 정렬 토글 - 현재 상태:', {
                enable,
                searchResultsCount: searchResults.length,
                hasDistanceInResults,
                firstResult: searchResults[0]
            });

            // enable이 undefined일 때는 사용자가 헤더를 클릭한 것으로 간주
            if (enable === undefined) {
                // 거리 정보가 있으면 정렬 방향만 토글
                if (hasDistanceInResults) {
                    const currentSortField = state.sortField;
                    const currentSortDirection = state.sortDirection;

                    Utils.log('현재 정렬 상태:', { currentSortField, currentSortDirection });

                    // 현재 거리로 정렬 중이면 방향 토글, 아니면 거리 오름차순으로 설정
                    const newDirection =
                        currentSortField === '거리' && currentSortDirection === 'asc'
                            ? 'desc'
                            : 'asc';

                    Utils.log('새로운 정렬 방향:', newDirection);

                    stateManager.setState({
                        sortField: '거리',
                        sortDirection: newDirection
                    });

                    // 현재 검색 결과를 새로운 정렬로 다시 표시
                    this.applySorting('거리', newDirection);

                    Utils.log(`거리순 정렬: ${newDirection === 'asc' ? '가까운 순' : '먼 순'}`);
                } else {
                    // 거리 정보가 없으면 사용자에게 안내
                    Utils.log('거리 정보가 없어서 정렬할 수 없습니다.');
                    uiManager.showNotification(
                        '거리순 정렬을 하려면 먼저 "현재위치 보기" 버튼을 클릭하여 위치를 설정하고 "현 지도에서 검색"을 실행해주세요.',
                        'info'
                    );
                }
            } else if (hasDistanceInResults && enable) {
                // enable이 true일 때는 거리 헤더 표시
                uiManager.toggleDistanceHeader(true);
                stateManager.setState({
                    sortField: '거리',
                    sortDirection: 'asc'
                });
            } else if (enable === false) {
                // enable이 false일 때만 헤더 숨기기
                uiManager.toggleDistanceHeader(false);
            }
        } catch (error) {
            Utils.error('거리 정렬 토글 중 오류 발생:', error);
            uiManager.showNotification('거리 정렬 설정 중 오류가 발생했습니다.', 'error');
        }
    }

    /**
     * 필터 적용
     */
    applyFilters(filters) {
        Utils.log('SearchManager.applyFilters 호출됨:', filters);

        try {
            let results = this.resultProcessor.getLastResults();

            // 검색 결과가 없으면 전체 데이터에서 필터링 시도
            if (results.length === 0) {
                Utils.log('검색 결과가 없어서 전체 데이터에서 필터링 시도');
                const allStores = stateManager.getState().stores;

                if (allStores && allStores.length > 0) {
                    // 전체 가맹점 데이터를 검색 결과 형태로 변환
                    results = allStores.map((store) => ({
                        store: { store: store },
                        location: null,
                        distance: null
                    }));
                    Utils.log('전체 데이터를 검색 결과 형태로 변환:', results.length);
                } else {
                    Utils.log('전체 데이터도 없습니다. 파일을 먼저 업로드하세요.');
                    uiManager.showNotification(
                        '먼저 엑셀 파일을 업로드하거나 검색을 실행하세요.',
                        'warning'
                    );
                    return;
                }
            }

            Utils.log('필터링 전 결과 수:', results.length);
            const filteredResults = this.resultProcessor.applyFilters(results, filters);
            Utils.log('필터링 후 결과 수:', filteredResults.length);

            // 상태 업데이트
            stateManager.setState({
                searchResults: filteredResults,
                filteredStores: filteredResults.map((r) => r.store.store || r.store)
            });

            // UI 업데이트 - 가맹점 목록 표시
            if (filteredResults.length > 0) {
                uiManager.updateTable();

                // 필터링된 결과 중 위치 정보가 있는 것들만 지도에 표시
                const locationsForMap = filteredResults
                    .filter((result) => result.location)
                    .map((result) => ({
                        store: result.store,
                        location: result.location
                    }));

                if (locationsForMap.length > 0) {
                    Utils.log('필터링된 결과로 지도 마커 업데이트:', locationsForMap.length);
                    mapManager.updateMarkersWithSearchResults(locationsForMap);
                } else {
                    Utils.log('위치 정보가 있는 필터링 결과가 없어 마커 지우기');
                    mapManager.clearMarkers();
                }
            } else {
                uiManager.showNotification('필터 조건에 맞는 가맹점이 없습니다.', 'info');
                mapManager.clearMarkers();
            }
        } catch (error) {
            Utils.error('필터 적용 중 오류 발생:', error);
            uiManager.showNotification('필터 적용 중 오류가 발생했습니다.', 'error');

            // 에러 발생 시 기본 상태로 복구
            const state = stateManager.getState();
            if (state.stores && state.stores.length > 0) {
                stateManager.setState({ filteredStores: state.stores });
                uiManager.updateTable();
            }
        }
    }

    /**
     * 정렬 적용
     */
    applySorting(sortField, sortDirection) {
        const state = stateManager.getState();
        const results = state.searchResults || [];

        if (results.length === 0) {
            Utils.log('정렬할 검색 결과가 없습니다.');
            return;
        }

        Utils.log('정렬 시작:', { sortField, sortDirection, resultsCount: results.length });

        const sortedResults = this.resultProcessor.applySorting(results, sortField, sortDirection);
        stateManager.setState({ searchResults: sortedResults });

        // UI 테이블 업데이트를 위한 데이터 구조 변환
        const sortedStoresForTable = sortedResults
            .map((result) => {
                let storeData;
                if (result.store && result.store.store) {
                    storeData = { ...result.store.store };
                } else if (result.store) {
                    storeData = { ...result.store };
                } else {
                    Utils.warn('잘못된 결과 구조:', result);
                    return null;
                }

                // 거리 정보 처리 (우선순위에 따른 통합)
                if (result.distance !== undefined && result.distance !== null) {
                    storeData.거리 = result.distance;
                } else if (result.store && result.store.거리 !== undefined) {
                    storeData.거리 = result.store.거리;
                } else {
                    storeData.거리 = null;
                }

                return storeData;
            })
            .filter((store) => store !== null);

        // 상태 및 UI 업데이트
        stateManager.setState({
            filteredStores: sortedStoresForTable,
            hasDistance: sortedStoresForTable.some((s) => s.거리 !== null)
        });

        uiManager.updateTable();
    }

    /**
     * 통계 정보 가져오기
     */
    getStatistics() {
        return this.resultProcessor.getStatistics();
    }

    /**
     * 검색 결과 내보내기
     */
    exportResults(format = 'json', options = {}) {
        return this.resultProcessor.exportResults(format, options);
    }

    /**
     * 단일 가맹점 위치 검색 (구 searchSingleStore)
     */
    async searchSingleStore(store) {
        try {
            return await this.locationSearchService.searchStoreLocation(store);
        } catch (error) {
            ErrorHandler.handle(error);
            return null;
        }
    }

    /**
     * 개별 가맹점 위치 표시 (전체 목록 보존)
     */
    async showSingleStoreLocation(result) {
        if (!result || !result.location) {
            Utils.log('표시할 가맹점 위치 결과가 없습니다.');
            return;
        }

        try {
            const state = stateManager.getState();

            // 상태 업데이트를 한 번에 처리 (메모리 최적화)
            const updateStoreLocation = (stores) => {
                return stores.map((store) => {
                    if (
                        store.상호 === result.store.상호 &&
                        (store.읍면동명 === result.store.읍면동명 ||
                            store.행정동 === result.store.읍면동명)
                    ) {
                        return {
                            ...store,
                            location: result.location,
                            searched: true,
                            검색결과: '찾음',
                            거리: result.distance
                        };
                    }
                    return store;
                });
            };

            // 상태 업데이트
            stateManager.setState({
                stores: updateStoreLocation(state.stores || []),
                filteredStores: updateStoreLocation(state.filteredStores || [])
            });

            // UI 테이블 업데이트 (전체 목록 유지)
            uiManager.updateTable();

            // 지도에 해당 가맹점만 표시
            const locationForMap = [
                {
                    store: result.store,
                    location: result.location
                }
            ];

            Utils.log('개별 가맹점 지도 마커 표시');
            mapManager.updateMarkersWithSearchResults(locationForMap);

            // 위치 정보를 캐시에 저장
            await this.cacheLocationResult(result);

            // 통계 업데이트
            this.updateSearchStats();
        } catch (error) {
            Utils.error('개별 가맹점 위치 표시 중 오류:', error);
            uiManager.showNotification('위치 표시 중 오류가 발생했습니다.', 'error');
        }
    }

    /**
     * 검색 통계 업데이트
     */
    updateSearchStats() {
        const state = stateManager.getState();
        const stores = state.stores || [];

        // 실제 위치 정보가 있는 가맹점 수 계산 (더 엄격한 검증)
        const foundCount = stores.filter((s) => {
            return (
                s.location &&
                typeof s.location.lat === 'number' &&
                typeof s.location.lng === 'number' &&
                !isNaN(s.location.lat) &&
                !isNaN(s.location.lng)
            );
        }).length;

        // 행정동 수 계산 (빈 값 제외)
        const uniqueDongs = [...new Set(stores.map((s) => s.읍면동명).filter(Boolean))].sort();

        // 카테고리 정보 추출 및 업데이트
        const categories = new Map();
        stores.forEach((store) => {
            if (store.표준산업분류명) {
                const category = store.표준산업분류명.trim();
                if (!categories.has(category)) {
                    categories.set(category, category);
                }
            }
        });

        // 상태에 카테고리 정보 저장
        stateManager.setState({ categories });

        // 카테고리 정보를 캐시에도 저장
        this.saveCategoriesAsync(categories);

        // 통계 객체 생성
        const stats = {
            total: stores.length,
            dongs: uniqueDongs.length,
            found: foundCount,
            notFound: stores.length - foundCount
        };

        Utils.log(
            `통계 업데이트: 전체 ${stats.total}개, 찾음 ${stats.found}개, 행정동 ${stats.dongs}개, 카테고리 ${categories.size}개`
        );

        // 상태 업데이트
        stateManager.setState({ stats });

        // UI에 통계 표시
        uiManager.updateStats(stats);

        // 필터 옵션 업데이트 (카테고리 포함)
        const categoriesArray = Array.from(categories.keys()).sort();
        uiManager.updateFilterOptions(uniqueDongs, categoriesArray);

        return stats;
    }

    // 카테고리 정보를 비동기로 캐시에 저장
    async saveCategoriesAsync(categories) {
        try {
            await storageManager.saveCategories(categories);
        } catch (error) {
            Utils.warn('카테고리 저장 실패:', error);
        }
    }

    /**
     * 상태 초기화
     */
    reset() {
        this.cancelSearch();
        this.resultProcessor.reset();
        this.locationSearchService.clearCache();
        stateManager.setState({
            searchResults: [],
            searchStatistics: null,
            isSearching: false
        });
    }
}

// 싱글톤 인스턴스
export const searchManager = new SearchManager();

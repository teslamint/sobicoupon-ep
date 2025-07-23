/**
 * 검색 결과 처리 서비스
 * - 검색 결과 정렬 및 필터링
 * - 근처 매치 찾기
 * - 결과 통계 생성
 */

import { Utils } from '../utils.js';
import { stateManager } from '../state.js';

export class SearchResultProcessor {
    constructor() {
        this.lastResults = [];
        this.statistics = {
            totalSearched: 0,
            found: 0,
            notFound: 0,
            nearbyMatches: 0
        };
    }

    /**
     * 검색 결과 처리 및 최적화
     */
    async processResults(searchResults, options = {}) {
        try {
            // 기본 결과 정리
            let processedResults = this.cleanResults(searchResults);

            // 중복 제거
            processedResults = this.removeDuplicates(processedResults);

            // 사용자 위치 기준 거리 계산
            processedResults = this.calculateDistanceFromUserLocation(processedResults);

            // 근처 매치 찾기
            if (options.findNearbyMatches !== false) {
                processedResults = await this.findNearbyMatches(processedResults);
            }

            // 정렬 적용
            if (options.sort !== false) {
                processedResults = this.applySorting(
                    processedResults,
                    options.sortField,
                    options.sortDirection
                );
            }

            // 필터 적용
            if (options.filters) {
                processedResults = this.applyFilters(processedResults, options.filters);
            }

            // 통계 업데이트
            this.updateStatistics(processedResults);

            // 결과 저장
            this.lastResults = processedResults;

            return processedResults;
        } catch (error) {
            Utils.error('검색 결과 처리 중 오류:', error);
            throw error;
        }
    }

    /**
     * 결과 정리 및 정규화
     */
    cleanResults(results) {
        return results
            .map((item) => {
                const cleanedItem = {
                    store: this.cleanStoreData(item.store),
                    location: item.location,
                    place: item.place,
                    matchType: item.matchType || 'unknown',
                    similarity: item.similarity || 0,
                    distance: item.distance || null
                };

                // 추가 메타데이터
                cleanedItem.store.searched = true;
                cleanedItem.store.searchedAt = new Date().toISOString();

                return cleanedItem;
            })
            .filter((item) => item.store && item.location);
    }

    /**
     * 가맹점 데이터 정리
     */
    cleanStoreData(store) {
        const cleaned = { ...store };

        // 문자열 필드 정리
        const stringFields = [
            '상호',
            '주소',
            '도로명주소',
            '지번주소',
            '표준산업분류명',
            '카테고리'
        ];
        stringFields.forEach((field) => {
            if (cleaned[field] && typeof cleaned[field] === 'string') {
                cleaned[field] = cleaned[field].trim().replace(/\s+/g, ' ');
            }
        });

        // 숫자 필드 정리
        if (cleaned.거리 !== undefined) {
            cleaned.거리 = Math.round(parseFloat(cleaned.거리) || 0);
        }

        return cleaned;
    }

    /**
     * 중복 제거 (고급 버전)
     */
    removeDuplicates(results) {
        const duplicateMap = new Map();
        const finalResults = [];

        for (const item of results) {
            const key = this.generateDeduplicationKey(item);

            if (!duplicateMap.has(key)) {
                duplicateMap.set(key, item);
                finalResults.push(item);
            } else {
                // 기존 항목과 비교하여 더 좋은 매치 선택
                const existing = duplicateMap.get(key);
                if (this.isBetterMatch(item, existing)) {
                    const index = finalResults.indexOf(existing);
                    if (index !== -1) {
                        finalResults[index] = item;
                        duplicateMap.set(key, item);
                    }
                }
            }
        }

        return finalResults;
    }

    /**
     * 중복 제거용 키 생성
     */
    generateDeduplicationKey(item) {
        const storeName = Utils.normalizeStoreName(item.store.상호);
        const lat = item.location.lat.toFixed(6);
        const lng = item.location.lng.toFixed(6);
        return `${storeName}_${lat}_${lng}`;
    }

    /**
     * 더 나은 매치인지 판단
     */
    isBetterMatch(newItem, existingItem) {
        // 매치 타입 우선순위
        const matchTypePriority = { exact: 3, similar: 2, nearby: 1, unknown: 0 };
        const newPriority = matchTypePriority[newItem.matchType] || 0;
        const existingPriority = matchTypePriority[existingItem.matchType] || 0;

        if (newPriority !== existingPriority) {
            return newPriority > existingPriority;
        }

        // 유사도 비교
        if (newItem.similarity !== existingItem.similarity) {
            return (newItem.similarity || 0) > (existingItem.similarity || 0);
        }

        // 거리 비교 (가까운 것이 더 좋음)
        const newDistance = newItem.distance || newItem.store.거리 || Infinity;
        const existingDistance = existingItem.distance || existingItem.store.거리 || Infinity;

        return newDistance < existingDistance;
    }

    /**
     * 근처 매치 찾기
     */
    async findNearbyMatches(results) {
        const state = stateManager.getState();
        const allStores = state.stores || [];
        const unmatchedStores = allStores.filter(
            (store) => !results.some((result) => result.store.인덱스 === store.인덱스)
        );

        const nearbyMatches = [];
        const NEARBY_THRESHOLD = 50; // 50미터 이내

        for (const unmatchedStore of unmatchedStores) {
            for (const result of results) {
                const distance = this.calculateStoreDistance(unmatchedStore, result);

                if (distance <= NEARBY_THRESHOLD) {
                    // 이름 유사도 확인
                    const similarity = this.calculateNameSimilarity(
                        unmatchedStore.상호,
                        result.store.상호
                    );

                    if (similarity >= 0.6) {
                        // 60% 이상 유사
                        nearbyMatches.push({
                            store: {
                                ...unmatchedStore,
                                거리: Math.round(distance),
                                nearbyMatch: true
                            },
                            location: result.location,
                            place: result.place,
                            matchType: 'nearby',
                            similarity: similarity,
                            distance: distance,
                            originalMatch: result.store.상호
                        });
                        break; // 첫 번째 매치만 사용
                    }
                }
            }
        }

        return [...results, ...nearbyMatches];
    }

    /**
     * 가맹점 간 거리 계산
     */
    calculateStoreDistance(store1, resultItem) {
        // store1은 주소 정보만 있고, resultItem은 좌표 정보가 있음
        // 주소 기반 대략적 거리를 계산하거나, 좌표가 있는 경우 정확한 거리 계산

        if (store1.location && resultItem.location) {
            return Utils.calculateDistance(
                store1.location.lat,
                store1.location.lng,
                resultItem.location.lat,
                resultItem.location.lng
            );
        }

        // 주소 기반 근사 계산 (매우 단순한 방식)
        const addr1 = store1.도로명주소 || store1.지번주소 || store1.주소 || '';
        const addr2 =
            resultItem.store.도로명주소 || resultItem.store.지번주소 || resultItem.store.주소 || '';

        if (addr1 && addr2) {
            // 같은 동/구/시인지 확인
            const addr1Parts = addr1.split(' ');
            const addr2Parts = addr2.split(' ');

            const commonParts = addr1Parts.filter((part) =>
                addr2Parts.some((addr2Part) => part.includes(addr2Part) || addr2Part.includes(part))
            );

            // 공통 주소 부분이 많을수록 가까운 것으로 추정
            return Math.max(0, 100 - commonParts.length * 20);
        }

        return Infinity; // 주소 정보가 없으면 매우 먼 것으로 처리
    }

    /**
     * 사용자 위치 기준 거리 계산
     */
    calculateDistanceFromUserLocation(results) {
        const userLocation = mapManager.getCurrentLocation();
        if (!userLocation) {
            Utils.warn('사용자 위치 정보가 없어서 거리를 계산할 수 없습니다.');
            return results;
        }

        return results.map((result) => {
            if (result.location && result.location.lat && result.location.lng) {
                const distance = Utils.calculateDistance(
                    userLocation.lat,
                    userLocation.lng,
                    result.location.lat,
                    result.location.lng
                );

                return {
                    ...result,
                    distance: Math.round(distance),
                    store: {
                        ...result.store,
                        거리: Math.round(distance) + 'm'
                    }
                };
            }

            return {
                ...result,
                distance: null,
                store: {
                    ...result.store,
                    거리: null
                }
            };
        });
    }

    /**
     * 이름 유사도 계산
     */
    calculateNameSimilarity(name1, name2) {
        const normalized1 = Utils.normalizeStoreName(name1);
        const normalized2 = Utils.normalizeStoreName(name2);

        if (normalized1 === normalized2) return 1.0;

        const distance = this.levenshteinDistance(normalized1, normalized2);
        const maxLength = Math.max(normalized1.length, normalized2.length);

        return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
    }

    /**
     * Levenshtein Distance 계산
     */
    levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1)
            .fill(null)
            .map(() => Array(str1.length + 1).fill(null));

        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + cost
                );
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * 정렬 적용
     */
    applySorting(results, sortField = '거리', sortDirection = 'asc') {
        return results.sort((a, b) => {
            let aValue, bValue;

            switch (sortField) {
                case '거리':
                    aValue = a.store.거리 || a.distance || Infinity;
                    bValue = b.store.거리 || b.distance || Infinity;
                    break;
                case '상호':
                    aValue = a.store.상호 || '';
                    bValue = b.store.상호 || '';
                    break;
                case '읍면동명':
                    aValue = a.store.읍면동명 || '';
                    bValue = b.store.읍면동명 || '';
                    break;
                case 'similarity':
                    aValue = a.similarity || 0;
                    bValue = b.similarity || 0;
                    break;
                default:
                    aValue = a.store[sortField] || '';
                    bValue = b.store[sortField] || '';
            }

            // 문자열과 숫자 처리
            const comparison =
                typeof aValue === 'string' ? aValue.localeCompare(bValue) : aValue - bValue;

            return sortDirection === 'desc' ? -comparison : comparison;
        });
    }

    /**
     * 필터 적용
     */
    applyFilters(results, filters) {
        let filtered = results;

        Utils.log('필터 적용 시작:', filters);
        Utils.log('필터링 전 결과 수:', results.length);

        // 검색어 필터
        if (filters.searchQuery && filters.searchQuery.trim()) {
            const query = filters.searchQuery.trim().toLowerCase();
            filtered = filtered.filter((item) => {
                const store = item.store.store || item.store; // 중첩 구조 처리
                const storeName = (store.상호 || '').toLowerCase();
                const category = (store.표준산업분류명 || store.카테고리 || '').toLowerCase();
                const dong = (store.읍면동명 || store.행정동 || '').toLowerCase();

                return (
                    storeName.includes(query) || category.includes(query) || dong.includes(query)
                );
            });
            Utils.log(`검색어 필터 적용 후: ${filtered.length}개`);
        }

        // 동 필터 (selectedDong 매개변수 처리)
        if (filters.selectedDong && filters.selectedDong.trim()) {
            const dongFilter = filters.selectedDong.trim();
            filtered = filtered.filter((item) => {
                const store = item.store.store || item.store; // 중첩 구조 처리
                const storeDong = store.읍면동명 || store.행정동 || '';
                const match = storeDong === dongFilter;
                if (!match) {
                    Utils.log(`동 필터 제외: ${store.상호} (${storeDong} !== ${dongFilter})`);
                }
                return match;
            });
            Utils.log(`동 필터 적용 후: ${filtered.length}개 (필터: ${dongFilter})`);
        }

        // 레거시 dong 매개변수도 지원
        if (filters.dong && filters.dong.trim()) {
            const dongFilter = filters.dong.trim();
            filtered = filtered.filter((item) => {
                const store = item.store.store || item.store;
                const storeDong = store.읍면동명 || store.행정동 || '';
                return storeDong === dongFilter;
            });
            Utils.log(`레거시 동 필터 적용 후: ${filtered.length}개`);
        }

        // 카테고리 필터 (selectedCategory 매개변수 처리)
        if (filters.selectedCategory && filters.selectedCategory.trim()) {
            const categoryFilter = filters.selectedCategory.trim();
            filtered = filtered.filter((item) => {
                const store = item.store.store || item.store;
                const storeCategory = store.표준산업분류명 || store.카테고리 || '';
                const match = storeCategory.includes(categoryFilter);
                if (!match) {
                    Utils.log(
                        `카테고리 필터 제외: ${store.상호} (${storeCategory} !== ${categoryFilter})`
                    );
                }
                return match;
            });
            Utils.log(`카테고리 필터 적용 후: ${filtered.length}개 (필터: ${categoryFilter})`);
        }

        // 다중 카테고리 필터 (레거시)
        if (filters.categories && filters.categories.length > 0) {
            filtered = filtered.filter((item) => {
                const store = item.store.store || item.store;
                const storeCategory = store.표준산업분류명 || store.카테고리 || '';
                return filters.categories.some((cat) => storeCategory.includes(cat));
            });
            Utils.log(`다중 카테고리 필터 적용 후: ${filtered.length}개`);
        }

        // 거리 필터
        if (filters.maxDistance) {
            filtered = filtered.filter((item) => {
                const store = item.store.store || item.store;
                const distance = store.거리 || item.distance;
                return distance !== undefined && distance <= filters.maxDistance;
            });
            Utils.log(`거리 필터 적용 후: ${filtered.length}개`);
        }

        // 검색 상태 필터
        if (filters.searchStatus) {
            filtered = filtered.filter((item) => {
                switch (filters.searchStatus) {
                    case 'found':
                        return item.location;
                    case 'not-found':
                        return !item.location;
                    case 'nearby':
                        return item.store.nearbyMatch;
                    default:
                        return true;
                }
            });
            Utils.log(`검색 상태 필터 적용 후: ${filtered.length}개`);
        }

        Utils.log('최종 필터링 결과:', filtered.length);
        return filtered;
    }

    /**
     * 통계 업데이트
     */
    updateStatistics(results) {
        this.statistics = {
            totalSearched: results.length,
            found: results.filter((item) => item.location).length,
            notFound: results.filter((item) => !item.location).length,
            nearbyMatches: results.filter((item) => item.store.nearbyMatch).length
        };

        // 상태 관리자에 통계 업데이트
        stateManager.setState({ searchStatistics: this.statistics });
    }

    /**
     * 검색 결과 내보내기
     */
    exportResults(format = 'json', options = {}) {
        const results = this.lastResults;

        switch (format.toLowerCase()) {
            case 'csv':
                return this.exportToCSV(results, options);
            case 'json':
                return this.exportToJSON(results, options);
            case 'geojson':
                return this.exportToGeoJSON(results, options);
            default:
                throw new Error(`지원하지 않는 형식: ${format}`);
        }
    }

    /**
     * CSV로 내보내기
     */
    exportToCSV(results, options) {
        const headers = [
            '상호',
            '주소',
            '읍면동명',
            '카테고리',
            '위도',
            '경도',
            '거리',
            '매치타입',
            '유사도'
        ];

        const rows = results.map((item) => [
            item.store.상호 || '',
            item.store.도로명주소 || item.store.지번주소 || item.store.주소 || '',
            item.store.읍면동명 || '',
            item.store.표준산업분류명 || item.store.카테고리 || '',
            item.location ? item.location.lat : '',
            item.location ? item.location.lng : '',
            item.store.거리 || '',
            item.matchType || '',
            item.similarity || ''
        ]);

        return [headers, ...rows]
            .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');
    }

    /**
     * JSON으로 내보내기
     */
    exportToJSON(results, options) {
        const exportData = {
            timestamp: new Date().toISOString(),
            statistics: this.statistics,
            results: results.map((item) => ({
                store: item.store,
                location: item.location,
                matchType: item.matchType,
                similarity: item.similarity
            }))
        };

        return JSON.stringify(exportData, null, options.pretty ? 2 : 0);
    }

    /**
     * GeoJSON으로 내보내기
     */
    exportToGeoJSON(results, options) {
        const features = results
            .filter((item) => item.location)
            .map((item) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [item.location.lng, item.location.lat]
                },
                properties: {
                    name: item.store.상호,
                    address: item.store.도로명주소 || item.store.지번주소 || item.store.주소,
                    category: item.store.표준산업분류명 || item.store.카테고리,
                    dong: item.store.읍면동명,
                    distance: item.store.거리,
                    matchType: item.matchType,
                    similarity: item.similarity
                }
            }));

        return JSON.stringify(
            {
                type: 'FeatureCollection',
                features: features
            },
            null,
            options.pretty ? 2 : 0
        );
    }

    /**
     * 통계 가져오기
     */
    getStatistics() {
        return { ...this.statistics };
    }

    /**
     * 마지막 결과 가져오기
     */
    getLastResults() {
        return [...this.lastResults];
    }

    /**
     * 결과 초기화
     */
    reset() {
        this.lastResults = [];
        this.statistics = {
            totalSearched: 0,
            found: 0,
            notFound: 0,
            nearbyMatches: 0
        };
    }
}

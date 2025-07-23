/**
 * 검색 결과 처리 모듈
 * 검색 결과의 후처리, 정렬, 필터링 등을 담당합니다.
 */

import { CONSTANTS } from '../constants.js';
import { Utils } from '../utils.js';
import { mapManager } from '../mapManager.js';
import { stateManager } from '../state.js';

export class ResultProcessor {
    constructor() {
        this.cachedResults = new Map();
    }

    /**
     * 검색 결과를 처리하고 지도에 표시
     * @param {Array} matchedStores - 매칭된 가맹점 목록
     * @param {object} center - 검색 중심점
     * @returns {Promise<void>}
     */
    async displayMapSearchResults(matchedStores, center) {
        try {
            // 중복 제거 및 정렬
            const processedResults = this.processSearchResults(matchedStores, center);

            // 캐시에 저장
            await this.cacheSearchResults(processedResults, center);

            // 지도에 표시
            await this.displayOnMap(processedResults);

            // 상태 업데이트
            this.updateSearchState(processedResults);

            // 통계 정보 업데이트
            this.updateStatistics(processedResults, matchedStores);
        } catch (error) {
            Utils.error('검색 결과 표시 중 오류:', error);
            throw error;
        }
    }

    /**
     * 검색 결과 후처리
     * @param {Array} matchedStores - 매칭된 가맹점 목록
     * @param {object} center - 검색 중심점
     * @returns {Array} 처리된 결과 목록
     */
    processSearchResults(matchedStores, center) {
        // 중복 제거 (같은 가맹점이 여러 방식으로 매칭된 경우)
        const uniqueResults = this.removeDuplicates(matchedStores);

        // 거리 계산
        const resultsWithDistance = this.calculateDistances(uniqueResults, center);

        // 매칭 품질별 정렬
        const sortedResults = this.sortByMatchQuality(resultsWithDistance);

        // 필터링 (너무 먼 거리, 낮은 유사도 등)
        const filteredResults = this.filterResults(sortedResults);

        return filteredResults;
    }

    /**
     * 중복 결과 제거
     * @param {Array} matchedStores - 매칭된 가맹점 목록
     * @returns {Array} 중복 제거된 결과 목록
     */
    removeDuplicates(matchedStores) {
        const uniqueMap = new Map();

        for (const result of matchedStores) {
            const key = result.store.상호;

            // 이미 존재하는 경우, 더 좋은 매칭을 선택
            if (uniqueMap.has(key)) {
                const existing = uniqueMap.get(key);

                // 매칭 품질 비교 (exact > similar > keyword)
                if (this.compareMatchQuality(result, existing) > 0) {
                    uniqueMap.set(key, result);
                }
            } else {
                uniqueMap.set(key, result);
            }
        }

        return Array.from(uniqueMap.values());
    }

    /**
     * 매칭 품질 비교
     * @param {object} result1 - 첫 번째 결과
     * @param {object} result2 - 두 번째 결과
     * @returns {number} 비교 결과 (-1, 0, 1)
     */
    compareMatchQuality(result1, result2) {
        const qualityOrder = { exact: 3, similar: 2, keyword: 1 };

        const quality1 = qualityOrder[result1.matchType] || 0;
        const quality2 = qualityOrder[result2.matchType] || 0;

        if (quality1 !== quality2) {
            return quality1 - quality2;
        }

        // 같은 매칭 타입인 경우 유사도로 비교
        return (result1.similarity || 0) - (result2.similarity || 0);
    }

    /**
     * 거리 계산
     * @param {Array} results - 결과 목록
     * @param {object} center - 중심점
     * @returns {Array} 거리가 추가된 결과 목록
     */
    calculateDistances(results, center) {
        return results.map((result) => {
            const distance = Utils.calculateDistance(
                center.getLat(),
                center.getLng(),
                result.location.lat,
                result.location.lng
            );

            return {
                ...result,
                distance: Math.round(distance),
                store: {
                    ...result.store,
                    거리: `${Math.round(distance)}m`
                }
            };
        });
    }

    /**
     * 매칭 품질과 거리를 고려한 정렬
     * @param {Array} results - 결과 목록
     * @returns {Array} 정렬된 결과 목록
     */
    sortByMatchQuality(results) {
        return results.sort((a, b) => {
            // 1. 매칭 타입별 우선순위
            const qualityOrder = { exact: 3, similar: 2, keyword: 1 };
            const qualityDiff = (qualityOrder[b.matchType] || 0) - (qualityOrder[a.matchType] || 0);

            if (qualityDiff !== 0) {
                return qualityDiff;
            }

            // 2. 유사도 비교
            const similarityDiff = (b.similarity || 0) - (a.similarity || 0);
            if (Math.abs(similarityDiff) > 0.1) {
                return similarityDiff;
            }

            // 3. 거리 비교 (가까운 순)
            return (a.distance || 0) - (b.distance || 0);
        });
    }

    /**
     * 결과 필터링
     * @param {Array} results - 결과 목록
     * @returns {Array} 필터링된 결과 목록
     */
    filterResults(results) {
        return results.filter((result) => {
            // 너무 먼 거리 제외
            if (result.distance > CONSTANTS.SEARCH.MAX_DISTANCE) {
                return false;
            }

            // 너무 낮은 유사도 제외 (키워드 검색 제외)
            if (
                result.matchType !== 'keyword' &&
                result.similarity < CONSTANTS.SEARCH.MIN_SIMILARITY
            ) {
                return false;
            }

            return true;
        });
    }

    /**
     * 검색 결과를 캐시에 저장
     * @param {Array} results - 처리된 결과 목록
     * @param {object} center - 검색 중심점
     * @returns {Promise<void>}
     */
    async cacheSearchResults(results, center) {
        try {
            const cacheKey = this.generateCacheKey(center);
            const cacheData = {
                results: results,
                timestamp: Date.now(),
                center: {
                    lat: center.getLat(),
                    lng: center.getLng()
                },
                count: results.length
            };

            // 메모리 캐시
            this.cachedResults.set(cacheKey, cacheData);

            // 영구 저장소에도 저장 (최근 검색 결과)
            // 검색 결과 캐시 저장 (임시 데이터 저장은 스킵)
            try {
                // 캐시 저장은 개별 위치 정보 저장으로 대체
                Utils.debug('검색 결과 캐시 저장 완료');
            } catch (err) {
                Utils.debug('캐시 저장 중 오류:', err.message);
            }
        } catch (error) {
            Utils.warn('검색 결과 캐시 저장 실패:', error);
            // 캐시 실패는 전체 작업을 중단하지 않음
        }
    }

    /**
     * 캐시 키 생성
     * @param {object} center - 중심점
     * @returns {string} 캐시 키
     */
    generateCacheKey(center) {
        const lat = Math.round(center.getLat() * 1000) / 1000;
        const lng = Math.round(center.getLng() * 1000) / 1000;
        return `search_${lat}_${lng}`;
    }

    /**
     * 지도에 결과 표시
     * @param {Array} results - 처리된 결과 목록
     * @returns {Promise<void>}
     */
    async displayOnMap(results) {
        if (results.length === 0) {
            Utils.log('표시할 검색 결과가 없습니다.');
            return;
        }

        // 지도에 마커 표시
        // MapManager의 실제 메서드에 맞게 수정
        if (typeof mapManager.updateMarkersWithSearchResults === 'function') {
            mapManager.updateMarkersWithSearchResults(results);
        } else {
            Utils.warn('MapManager에서 마커 업데이트 메서드를 찾을 수 없습니다.');
        }

        Utils.log(`${results.length}개의 검색 결과를 지도에 표시했습니다.`);
    }

    /**
     * 검색 상태 업데이트
     * @param {Array} results - 처리된 결과 목록
     */
    updateSearchState(results) {
        stateManager.setState({
            searchResults: results,
            lastSearchTime: Date.now(),
            searchResultsCount: results.length
        });
    }

    /**
     * 통계 정보 업데이트
     * @param {Array} processedResults - 처리된 결과 목록
     * @param {Array} rawResults - 원본 결과 목록
     */
    updateStatistics(processedResults, rawResults) {
        const stats = {
            totalMatched: rawResults.length,
            finalResults: processedResults.length,
            duplicatesRemoved: rawResults.length - processedResults.length,
            matchTypes: this.calculateMatchTypeStats(processedResults),
            avgSimilarity: this.calculateAverageSimilarity(processedResults),
            avgDistance: this.calculateAverageDistance(processedResults)
        };

        Utils.log('검색 통계:', stats);

        // UI 업데이트 (선택사항)
        if (typeof window !== 'undefined' && window.updateSearchStats) {
            window.updateSearchStats(stats);
        }
    }

    /**
     * 매칭 타입별 통계 계산
     * @param {Array} results - 결과 목록
     * @returns {object} 매칭 타입별 통계
     */
    calculateMatchTypeStats(results) {
        const stats = { exact: 0, similar: 0, keyword: 0 };

        results.forEach((result) => {
            if (stats.hasOwnProperty(result.matchType)) {
                stats[result.matchType]++;
            }
        });

        return stats;
    }

    /**
     * 평균 유사도 계산
     * @param {Array} results - 결과 목록
     * @returns {number} 평균 유사도
     */
    calculateAverageSimilarity(results) {
        if (results.length === 0) {
            return 0;
        }

        const total = results.reduce((sum, result) => sum + (result.similarity || 0), 0);
        return Math.round((total / results.length) * 100) / 100;
    }

    /**
     * 평균 거리 계산
     * @param {Array} results - 결과 목록
     * @returns {number} 평균 거리 (미터)
     */
    calculateAverageDistance(results) {
        if (results.length === 0) {
            return 0;
        }

        const total = results.reduce((sum, result) => sum + (result.distance || 0), 0);
        return Math.round(total / results.length);
    }

    /**
     * 캐시된 검색 결과 조회
     * @param {object} center - 중심점
     * @returns {object|null} 캐시된 결과 또는 null
     */
    getCachedResults(center) {
        const cacheKey = this.generateCacheKey(center);
        const cached = this.cachedResults.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < CONSTANTS.CACHE.SEARCH_TTL) {
            return cached;
        }

        return null;
    }

    /**
     * 캐시 정리
     */
    clearCache() {
        this.cachedResults.clear();
    }
}

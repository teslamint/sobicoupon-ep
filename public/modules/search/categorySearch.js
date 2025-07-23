/**
 * 카테고리 기반 검색 모듈
 * 카카오맵 API를 사용하여 카테고리별 장소 검색을 수행합니다.
 */

import { CONSTANTS } from '../constants.js';
import { Utils } from '../utils.js';
import { AppError, ErrorCodes } from '../errors.js';

export class CategorySearchService {
    constructor() {
        this.abortController = null;
        this.searchQueue = [];
        this.isSearching = false;
    }

    /**
     * 카테고리별 검색 실행
     * @param {object} center - 검색 중심점 (lat, lng)
     * @param {number} radius - 검색 반경 (미터)
     * @param {object} bounds - 지도 영역
     * @param {Array} normalizedStoreNames - 정규화된 상호명 목록
     * @returns {Promise<Array>} 매칭된 가맹점 목록
     */
    async searchByCategories(center, radius, bounds, normalizedStoreNames) {
        const matchedStores = [];
        let searchProgress = 0;
        const totalSearches = CONSTANTS.SEARCH.CATEGORIES.length;

        this.abortController = new AbortController();

        try {
            for (const category of CONSTANTS.SEARCH.CATEGORIES) {
                if (this.abortController.signal.aborted) {
                    break;
                }

                try {
                    Utils.log(`카테고리 검색 중: ${category.name}`);

                    const categoryResults = await this.searchCategory(
                        center,
                        radius,
                        category,
                        normalizedStoreNames,
                        bounds
                    );

                    matchedStores.push(...categoryResults);
                    searchProgress++;

                    // 진행률 업데이트
                    const progressPercent = Math.round((searchProgress / totalSearches) * 100);
                    this.updateSearchProgress(progressPercent);

                    // API 호출 간격 조절
                    await Utils.delay(CONSTANTS.API.DELAY);
                } catch (error) {
                    Utils.warn(`카테고리 ${category.name} 검색 실패:`, error);
                    // 개별 카테고리 실패는 전체 검색을 중단하지 않음
                }
            }

            return matchedStores;
        } catch (error) {
            if (error.name === 'AbortError') {
                Utils.log('카테고리 검색이 취소되었습니다.');
                return [];
            }
            throw new AppError('카테고리 검색 중 오류가 발생했습니다.', ErrorCodes.SEARCH_ERROR, {
                originalError: error
            });
        }
    }

    /**
     * 단일 카테고리 검색
     * @param {object} center - 검색 중심점
     * @param {number} radius - 검색 반경
     * @param {object} category - 검색 카테고리
     * @param {Array} normalizedStoreNames - 정규화된 상호명 목록
     * @param {object} bounds - 지도 영역
     * @returns {Promise<Array>} 해당 카테고리에서 매칭된 가맹점 목록
     */
    async searchCategory(center, radius, category, normalizedStoreNames, bounds) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(
                    new AppError(`카테고리 ${category.name} 검색 시간 초과`, ErrorCodes.API_TIMEOUT)
                );
            }, CONSTANTS.API.TIMEOUT);

            const ps = new kakao.maps.services.Places();

            ps.categorySearch(
                category.code,
                (data, status, pagination) => {
                    clearTimeout(timeoutId);

                    if (status === kakao.maps.services.Status.OK) {
                        const matches = this.matchStoresWithPlaces(
                            data,
                            normalizedStoreNames,
                            bounds,
                            category.name
                        );

                        // 페이지네이션 처리 (필요시)
                        if (
                            matches.length < CONSTANTS.SEARCH.MIN_RESULTS_PER_CATEGORY &&
                            pagination &&
                            pagination.hasNextPage
                        ) {
                            pagination.nextPage();
                            return; // 다음 페이지 검색
                        }

                        resolve(matches);
                    } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
                        resolve([]);
                    } else {
                        reject(
                            new AppError(
                                `카테고리 ${category.name} 검색 실패`,
                                ErrorCodes.MAP_SEARCH_ERROR,
                                { status, category: category.code }
                            )
                        );
                    }
                },
                {
                    location: new kakao.maps.LatLng(center.getLat(), center.getLng()),
                    radius: Math.min(radius, CONSTANTS.SEARCH.MAX_RADIUS),
                    size: CONSTANTS.SEARCH.PAGE_SIZE
                }
            );
        });
    }

    /**
     * 검색된 장소와 엑셀 가맹점 데이터를 매칭
     * @param {Array} places - 카카오맵에서 검색된 장소 목록
     * @param {Array} normalizedStoreNames - 정규화된 상호명 목록
     * @param {object} bounds - 지도 영역
     * @param {string} categoryName - 카테고리명
     * @returns {Array} 매칭된 가맹점 목록
     */
    matchStoresWithPlaces(places, normalizedStoreNames, bounds, categoryName) {
        const matches = [];
        const usedStores = new Set();

        for (const place of places) {
            // 지도 영역 내부 확인
            if (!this.isPlaceInBounds(place, bounds)) {
                continue;
            }

            const placeNameNormalized = Utils.normalizeStoreName(place.place_name);

            // 정확한 이름 매칭 시도
            const exactMatch = normalizedStoreNames.find(
                (item) =>
                    !usedStores.has(item.original.상호) && item.normalized === placeNameNormalized
            );

            if (exactMatch) {
                matches.push({
                    store: exactMatch.original,
                    location: {
                        lat: parseFloat(place.y),
                        lng: parseFloat(place.x),
                        roadAddress: place.road_address_name,
                        jibunAddress: place.address_name
                    },
                    place: place,
                    matchType: 'exact',
                    categoryName: categoryName,
                    similarity: 1.0
                });
                usedStores.add(exactMatch.original.상호);
                continue;
            }

            // 유사한 이름 매칭 시도
            const similarMatch = this.findSimilarMatch(
                placeNameNormalized,
                normalizedStoreNames,
                usedStores
            );

            if (similarMatch) {
                matches.push({
                    store: similarMatch.store.original,
                    location: {
                        lat: parseFloat(place.y),
                        lng: parseFloat(place.x),
                        roadAddress: place.road_address_name,
                        jibunAddress: place.address_name
                    },
                    place: place,
                    matchType: 'similar',
                    categoryName: categoryName,
                    similarity: similarMatch.similarity
                });
                usedStores.add(similarMatch.store.original.상호);
            }
        }

        return matches;
    }

    /**
     * 유사한 상호명 매칭
     * @param {string} placeName - 검색된 장소명
     * @param {Array} normalizedStoreNames - 정규화된 상호명 목록
     * @param {Set} usedStores - 이미 매칭된 상호명 집합
     * @returns {object|null} 매칭된 상호 정보 또는 null
     */
    findSimilarMatch(placeName, normalizedStoreNames, usedStores) {
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const item of normalizedStoreNames) {
            if (usedStores.has(item.original.상호)) {
                continue;
            }

            const similarity = Utils.calculateSimilarity(placeName, item.normalized);

            if (
                similarity >= CONSTANTS.SEARCH.SIMILARITY_THRESHOLD &&
                similarity > bestSimilarity
            ) {
                bestMatch = { store: item, similarity };
                bestSimilarity = similarity;
            }
        }

        return bestMatch;
    }

    /**
     * 장소가 지도 영역 내부에 있는지 확인
     * @param {object} place - 카카오맵 장소 객체
     * @param {object} bounds - 지도 영역
     * @returns {boolean} 영역 내부 여부
     */
    isPlaceInBounds(place, bounds) {
        const lat = parseFloat(place.y);
        const lng = parseFloat(place.x);

        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        return lat >= sw.getLat() && lat <= ne.getLat() && lng >= sw.getLng() && lng <= ne.getLng();
    }

    /**
     * 검색 진행률 업데이트
     * @param {number} percent - 진행률 (0-100)
     */
    updateSearchProgress(percent) {
        // UI 업데이트 로직은 별도 모듈에서 처리
        if (typeof window !== 'undefined' && window.updateSearchProgress) {
            window.updateSearchProgress(percent);
        }
    }

    /**
     * 검색 취소
     */
    cancelSearch() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.isSearching = false;
    }

    /**
     * 리소스 정리
     */
    cleanup() {
        this.cancelSearch();
        this.searchQueue = [];
    }
}

/**
 * 키워드 기반 검색 모듈
 * 카테고리 검색에서 매칭되지 않은 가맹점을 키워드로 검색합니다.
 */

import { CONSTANTS } from '../constants.js';
import { Utils } from '../utils.js';
import { AppError, ErrorCodes } from '../errors.js';

export class KeywordSearchService {
    constructor() {
        this.abortController = null;
        this.isSearching = false;
    }

    /**
     * 키워드 기반 검색 실행
     * @param {object} center - 검색 중심점
     * @param {number} radius - 검색 반경
     * @param {object} bounds - 지도 영역
     * @param {Array} allStores - 전체 가맹점 목록
     * @param {Array} matchedStores - 이미 매칭된 가맹점 목록
     * @returns {Promise<Array>} 추가로 매칭된 가맹점 목록
     */
    async searchByKeywords(center, radius, bounds, allStores, matchedStores) {
        const matchedStoreNames = new Set(matchedStores.map((item) => item.store.상호));
        const unmatchedStores = allStores.filter((store) => !matchedStoreNames.has(store.상호));

        if (unmatchedStores.length === 0) {
            return [];
        }

        Utils.log(`키워드 검색 시작: ${unmatchedStores.length}개 가맹점 대상`);

        const additionalMatches = [];
        const searchBatch = Math.min(unmatchedStores.length, CONSTANTS.SEARCH.KEYWORD_SEARCH_COUNT);

        this.abortController = new AbortController();

        try {
            // 무작위로 선택된 가맹점들을 키워드로 검색
            const selectedStores = Utils.shuffleArray([...unmatchedStores]).slice(0, searchBatch);

            for (let i = 0; i < selectedStores.length; i++) {
                if (this.abortController.signal.aborted) {
                    break;
                }

                const store = selectedStores[i];

                try {
                    const keywordResults = await this.searchStoreByKeyword(
                        store,
                        center,
                        radius,
                        bounds
                    );

                    if (keywordResults.length > 0) {
                        additionalMatches.push(...keywordResults);
                        Utils.log(`키워드 검색 성공: ${store.상호}`);
                    }

                    // 진행률 업데이트
                    const progress = Math.round(((i + 1) / selectedStores.length) * 100);
                    this.updateKeywordSearchProgress(progress);

                    // API 호출 간격 조절
                    await Utils.delay(CONSTANTS.API.DELAY * 1.5); // 키워드 검색은 더 긴 간격
                } catch (error) {
                    Utils.warn(`키워드 검색 실패 (${store.상호}):`, error);
                    // 개별 실패는 전체 검색을 중단하지 않음
                }
            }

            return additionalMatches;
        } catch (error) {
            if (error.name === 'AbortError') {
                Utils.log('키워드 검색이 취소되었습니다.');
                return [];
            }
            throw new AppError('키워드 검색 중 오류가 발생했습니다.', ErrorCodes.SEARCH_ERROR, {
                originalError: error
            });
        }
    }

    /**
     * 단일 가맹점을 키워드로 검색
     * @param {object} store - 가맹점 정보
     * @param {object} center - 검색 중심점
     * @param {number} radius - 검색 반경
     * @param {object} bounds - 지도 영역
     * @returns {Promise<Array>} 매칭된 결과 목록
     */
    async searchStoreByKeyword(store, center, radius, bounds) {
        const searchKeywords = this.generateSearchKeywords(store);
        const matches = [];

        for (const keyword of searchKeywords) {
            if (this.abortController.signal.aborted) {
                break;
            }

            try {
                const keywordMatches = await this.performKeywordSearch(
                    keyword,
                    center,
                    radius,
                    bounds,
                    store
                );

                if (keywordMatches.length > 0) {
                    matches.push(...keywordMatches);
                    break; // 첫 번째 성공한 키워드로 매칭되면 중단
                }

                // 키워드 간 짧은 간격
                await Utils.delay(200);
            } catch (error) {
                Utils.warn(`키워드 "${keyword}" 검색 실패:`, error);
            }
        }

        return matches;
    }

    /**
     * 가맹점 정보에서 검색 키워드 생성
     * @param {object} store - 가맹점 정보
     * @returns {Array} 검색 키워드 목록
     */
    generateSearchKeywords(store) {
        const keywords = [];

        // 상호명
        if (store.상호) {
            keywords.push(store.상호.trim());

            // 상호명에서 괄호 제거
            const cleanName = store.상호.replace(/[()（）]/g, '').trim();
            if (cleanName !== store.상호) {
                keywords.push(cleanName);
            }

            // 상호명에서 '점' 제거
            const withoutBranch = store.상호.replace(/점$/, '').trim();
            if (withoutBranch !== store.상호) {
                keywords.push(withoutBranch);
            }
        }

        // 업종명 + 읍면동명 조합
        if (store.표준산업분류명 && store.읍면동명) {
            keywords.push(`${store.표준산업분류명} ${store.읍면동명}`);
        }

        // 상호명 + 읍면동명 조합
        if (store.상호 && store.읍면동명) {
            keywords.push(`${store.상호} ${store.읍면동명}`);
        }

        return keywords.filter((k) => k && k.length >= 2); // 최소 2글자 이상
    }

    /**
     * 카카오맵 키워드 검색 실행
     * @param {string} keyword - 검색 키워드
     * @param {object} center - 검색 중심점
     * @param {number} radius - 검색 반경
     * @param {object} bounds - 지도 영역
     * @param {object} targetStore - 대상 가맹점
     * @returns {Promise<Array>} 매칭된 결과 목록
     */
    async performKeywordSearch(keyword, center, radius, bounds, targetStore) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new AppError(`키워드 "${keyword}" 검색 시간 초과`, ErrorCodes.API_TIMEOUT));
            }, CONSTANTS.API.TIMEOUT);

            const ps = new kakao.maps.services.Places();

            ps.keywordSearch(
                keyword,
                (data, status) => {
                    clearTimeout(timeoutId);

                    if (status === kakao.maps.services.Status.OK) {
                        const matches = this.matchKeywordResults(
                            data,
                            targetStore,
                            bounds,
                            keyword
                        );
                        resolve(matches);
                    } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
                        resolve([]);
                    } else {
                        reject(
                            new AppError(
                                `키워드 "${keyword}" 검색 실패`,
                                ErrorCodes.MAP_SEARCH_ERROR,
                                { status, keyword }
                            )
                        );
                    }
                },
                {
                    location: new kakao.maps.LatLng(center.getLat(), center.getLng()),
                    radius: Math.min(radius, CONSTANTS.SEARCH.MAX_RADIUS),
                    size: 5 // 키워드 검색은 소량만
                }
            );
        });
    }

    /**
     * 키워드 검색 결과를 대상 가맹점과 매칭
     * @param {Array} places - 검색된 장소 목록
     * @param {object} targetStore - 대상 가맹점
     * @param {object} bounds - 지도 영역
     * @param {string} keyword - 사용된 키워드
     * @returns {Array} 매칭된 결과 목록
     */
    matchKeywordResults(places, targetStore, bounds, keyword) {
        const matches = [];
        const targetNameNormalized = Utils.normalizeStoreName(targetStore.상호);

        for (const place of places) {
            // 지도 영역 내부 확인
            if (!this.isPlaceInBounds(place, bounds)) {
                continue;
            }

            const placeNameNormalized = Utils.normalizeStoreName(place.place_name);
            const similarity = Utils.calculateSimilarity(targetNameNormalized, placeNameNormalized);

            // 키워드 검색은 더 엄격한 유사도 기준 적용
            if (similarity >= CONSTANTS.SEARCH.KEYWORD_SIMILARITY_THRESHOLD) {
                matches.push({
                    store: targetStore,
                    location: {
                        lat: parseFloat(place.y),
                        lng: parseFloat(place.x),
                        roadAddress: place.road_address_name,
                        jibunAddress: place.address_name
                    },
                    place: place,
                    matchType: 'keyword',
                    keyword: keyword,
                    similarity: similarity
                });

                // 키워드 검색에서는 첫 번째 매칭만 사용
                break;
            }
        }

        return matches;
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
     * 키워드 검색 진행률 업데이트
     * @param {number} percent - 진행률 (0-100)
     */
    updateKeywordSearchProgress(percent) {
        // UI 업데이트 로직은 별도 모듈에서 처리
        if (typeof window !== 'undefined' && window.updateKeywordSearchProgress) {
            window.updateKeywordSearchProgress(percent);
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
    }
}

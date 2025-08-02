/**
 * 위치 검색 서비스
 * - 개별 가맹점 위치 검색
 * - 키워드 기반 검색
 * - 주소 기반 위치 확인
 */

import { Utils } from '../utils.js';

export class LocationSearchService {
    constructor() {
        this.searchCache = new Map();
        this.rateLimiter = {
            requests: 0,
            lastReset: Date.now(),
            maxRequests: 10, // 초당 최대 요청 수
            window: 1000 // 1초
        };
    }

    /**
     * 단일 가맹점 위치 검색
     */
    async searchStoreLocation(store) {
        // 캐시 확인
        const cacheKey = this.generateCacheKey(store);
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey);
        }

        // Rate limiting 확인
        await this.checkRateLimit();

        try {
            const result = await this.performLocationSearch(store);

            // 결과 캐싱 (성공한 경우만)
            if (result && result.location) {
                this.searchCache.set(cacheKey, result);
                // 캐시 크기 제한 (1000개까지)
                if (this.searchCache.size > 1000) {
                    const firstKey = this.searchCache.keys().next().value;
                    this.searchCache.delete(firstKey);
                }
            }

            return result;
        } catch (error) {
            Utils.error(`가맹점 위치 검색 실패 (${store.상호}):`, error);
            return { store, location: null, error: error.message };
        }
    }

    /**
     * 키워드 검색
     */
    async searchByKeywords(keywords, bounds) {
        const searchResults = [];

        for (const keyword of keywords) {
            if (!keyword.trim()) continue;

            try {
                const results = await this.searchKeyword(keyword.trim(), bounds);
                searchResults.push(...results);

                // API 호출 간격 조절
                await new Promise((resolve) => setTimeout(resolve, 200));
            } catch (error) {
                Utils.warn(`키워드 검색 실패 (${keyword}):`, error);
            }
        }

        return this.removeDuplicates(searchResults);
    }

    /**
     * 실제 위치 검색 수행
     */
    async performLocationSearch(store) {
        return new Promise((resolve, reject) => {
            const ps = new kakao.maps.services.Places();

            // 검색 키워드 생성
            const searchKeywords = this.generateSearchKeywords(store);

            let attempts = 0;
            const maxAttempts = searchKeywords.length;

            const tryNextKeyword = () => {
                if (attempts >= maxAttempts) {
                    resolve({ store, location: null });
                    return;
                }

                const keyword = searchKeywords[attempts++];

                ps.keywordSearch(
                    keyword,
                    (data, status) => {
                        if (status === kakao.maps.services.Status.OK && data.length > 0) {
                            const bestMatch = this.selectBestMatch(data, store);
                            if (bestMatch) {
                                resolve({
                                    store,
                                    location: {
                                        lat: parseFloat(bestMatch.y),
                                        lng: parseFloat(bestMatch.x)
                                    },
                                    place: bestMatch,
                                    keyword: keyword
                                });
                                return;
                            }
                        }

                        // 다음 키워드로 시도
                        setTimeout(tryNextKeyword, 100);
                    },
                    {
                        size: 5,
                        page: 1
                    }
                );
            };

            tryNextKeyword();
        });
    }

    /**
     * 단일 키워드 검색
     */
    async searchKeyword(keyword, bounds) {
        return new Promise((resolve, reject) => {
            const ps = new kakao.maps.services.Places();

            const options = {
                size: 15,
                page: 1
            };

            // 지도 영역이 제공된 경우 해당 영역으로 제한
            if (bounds) {
                const center = bounds.getCenter();
                const sw = bounds.getSouthWest();
                const radius = Utils.calculateDistance(
                    center.getLat(),
                    center.getLng(),
                    sw.getLat(),
                    sw.getLng()
                );

                options.location = center;
                options.radius = Math.min(radius, 2000);
            }

            ps.keywordSearch(
                keyword,
                (data, status) => {
                    if (status === kakao.maps.services.Status.OK) {
                        const results = data.map((place) => ({
                            store: {
                                상호: place.place_name,
                                주소: place.address_name,
                                카테고리: place.category_name
                            },
                            location: {
                                lat: parseFloat(place.y),
                                lng: parseFloat(place.x)
                            },
                            place: place
                        }));
                        resolve(results);
                    } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
                        resolve([]);
                    } else {
                        reject(new Error(`키워드 검색 실패: ${status}`));
                    }
                },
                options
            );
        });
    }

    /**
     * 검색 키워드 생성
     */
    generateSearchKeywords(store) {
        const keywords = [];

        // 기본 상호명
        if (store.상호) {
            keywords.push(store.상호);

            // 상호명에서 특수문자 제거
            const cleanName = store.상호.replace(/[^\w가-힣\s]/g, '').trim();
            if (cleanName !== store.상호) {
                keywords.push(cleanName);
            }
        }

        // 주소와 함께 검색
        const addresses = [store.도로명주소, store.지번주소, store.주소].filter(Boolean);
        for (const address of addresses) {
            if (store.상호) {
                keywords.push(`${store.상호} ${address}`);
            }
        }

        // 동 이름과 함께 검색
        if (store.읍면동명 && store.상호) {
            keywords.push(`${store.상호} ${store.읍면동명}`);
        }

        // 중복 제거 및 정렬 (짧은 키워드를 우선)
        return [...new Set(keywords)].sort((a, b) => a.length - b.length);
    }

    /**
     * 최적의 매치 선택
     */
    selectBestMatch(searchResults, targetStore) {
        if (!searchResults || searchResults.length === 0) {
            return null;
        }

        const targetName = Utils.normalizeStoreName(targetStore.상호);
        let bestMatch = null;
        let bestScore = 0;

        for (const place of searchResults) {
            const placeName = Utils.normalizeStoreName(place.place_name);
            let score = 0;

            // 이름 유사도 (가장 중요한 요소)
            const nameSimilarity = this.calculateSimilarity(targetName, placeName);
            score += nameSimilarity * 0.7;

            // 주소 매칭
            if (this.hasAddressMatch(targetStore, place)) {
                score += 0.2;
            }

            // 카테고리 매칭
            if (this.hasCategoryMatch(targetStore, place)) {
                score += 0.1;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = place;
            }
        }

        // 최소 임계값 확인 (70% 이상 유사도)
        return bestScore >= 0.7 ? bestMatch : null;
    }

    /**
     * 주소 매칭 확인
     */
    hasAddressMatch(store, place) {
        const storeAddresses = [store.도로명주소, store.지번주소, store.주소].filter(Boolean);

        const placeAddress = place.address_name || place.road_address_name || '';

        return storeAddresses.some((addr) => {
            const normalizedStoreAddr = Utils.normalizeAddress(addr);
            const normalizedPlaceAddr = Utils.normalizeAddress(placeAddress);

            return (
                normalizedStoreAddr.includes(normalizedPlaceAddr) ||
                normalizedPlaceAddr.includes(normalizedStoreAddr)
            );
        });
    }

    /**
     * 카테고리 매칭 확인
     */
    hasCategoryMatch(store, place) {
        const storeCategory = store.표준산업분류명 || store.카테고리 || '';
        const placeCategory = place.category_name || '';

        if (!storeCategory || !placeCategory) {
            return false;
        }

        // 카테고리 키워드 매칭
        const storeCategoryWords = storeCategory.split(/[\s,>]/);
        const placeCategoryWords = placeCategory.split(/[\s,>]/);

        return storeCategoryWords.some((storeWord) =>
            placeCategoryWords.some(
                (placeWord) => storeWord.includes(placeWord) || placeWord.includes(storeWord)
            )
        );
    }

    /**
     * 문자열 유사도 계산
     */
    calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;

        const distance = this.levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);
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
     * 캐시 키 생성
     */
    generateCacheKey(store) {
        return `${store.상호}_${store.주소 || store.도로명주소 || store.지번주소 || ''}`;
    }

    /**
     * Rate limiting 확인
     */
    async checkRateLimit() {
        const now = Date.now();

        // 시간 윈도우 리셋
        if (now - this.rateLimiter.lastReset >= this.rateLimiter.window) {
            this.rateLimiter.requests = 0;
            this.rateLimiter.lastReset = now;
        }

        // 요청 제한 확인
        if (this.rateLimiter.requests >= this.rateLimiter.maxRequests) {
            const waitTime = this.rateLimiter.window - (now - this.rateLimiter.lastReset);
            if (waitTime > 0) {
                await new Promise((resolve) => setTimeout(resolve, waitTime));
            }
        }

        this.rateLimiter.requests++;
    }

    /**
     * 중복 제거
     */
    removeDuplicates(results) {
        const seen = new Set();
        return results.filter((item) => {
            const key = `${item.store.상호}_${item.location.lat}_${item.location.lng}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * 캐시 클리어
     */
    clearCache() {
        this.searchCache.clear();
    }
}

/**
 * 지도 기반 검색 서비스
 * - 현재 지도 영역 내 가맹점 검색
 * - 카테고리별 검색
 * - 공간 인덱싱 및 최적화
 */

import { Utils } from '../utils.js';
import { stateManager } from '../state.js';

export class MapSearchService {
    constructor() {
        this.searchCancelToken = null;
        this.currentSearchId = 0;
    }

    /**
     * 현재 지도 영역에서 검색
     */
    async searchInCurrentMap(mapBounds, stores) {
        const searchId = ++this.currentSearchId;
        this.searchCancelToken = { cancelled: false, searchId };

        try {
            // 카카오맵 API 상태 확인
            if (!window.kakao || !window.kakao.maps || !window.kakao.maps.services) {
                Utils.error('카카오맵 API가 제대로 로드되지 않았습니다.');
                throw new Error('카카오맵 API 로드 실패');
            }

            // 검색 매개변수 계산
            const searchParams = this.calculateSearchParameters(mapBounds);

            // 카테고리별 검색 실행
            const results = await this.searchByCategories(searchParams, stores);
            Utils.log(`검색 완료: ${results?.length || 0}개 결과 발견`);

            // 검색이 취소되었는지 확인
            if (this.searchCancelToken.cancelled || this.searchCancelToken.searchId !== searchId) {
                Utils.log('검색이 취소되었습니다.');
                return [];
            }

            return results;
        } catch (error) {
            Utils.error('지도 검색 중 오류:', error);
            throw error;
        }
    }

    /**
     * 검색 매개변수 계산
     */
    calculateSearchParameters(bounds) {
        // bounds 객체 유효성 검사
        if (!bounds) {
            Utils.error('Bounds object is null or undefined');
            throw new Error('유효하지 않은 지도 영역 정보입니다.');
        }

        let center, sw, ne;

        // 카카오맵 API의 두 가지 bounds 형태 처리
        if (typeof bounds.getCenter === 'function') {
            // 표준 LatLngBounds 객체
            center = bounds.getCenter();
            sw = bounds.getSouthWest();
            ne = bounds.getNorthEast();
        } else if (
            bounds.ha !== undefined &&
            bounds.qa !== undefined &&
            bounds.oa !== undefined &&
            bounds.pa !== undefined
        ) {
            // 내부 구조체 형태 (ha: 서쪽 경도, qa: 남쪽 위도, oa: 동쪽 경도, pa: 북쪽 위도)
            Utils.log('Using internal bounds structure');
            const westLng = bounds.ha;
            const southLat = bounds.qa;
            const eastLng = bounds.oa;
            const northLat = bounds.pa;

            center = {
                getLat: () => (southLat + northLat) / 2,
                getLng: () => (westLng + eastLng) / 2
            };

            sw = {
                getLat: () => southLat,
                getLng: () => westLng
            };

            ne = {
                getLat: () => northLat,
                getLng: () => eastLng
            };
        } else {
            Utils.error('Unrecognized bounds object format:', bounds);
            throw new Error('지원하지 않는 지도 영역 정보 형태입니다.');
        }

        // 메서드 존재 확인
        if (!center || typeof center.getLat !== 'function' || typeof center.getLng !== 'function') {
            Utils.error('Invalid center object:', center);
            throw new Error('지도 중심점 정보를 가져올 수 없습니다.');
        }

        if (!sw || typeof sw.getLat !== 'function' || typeof sw.getLng !== 'function') {
            Utils.error('Invalid southwest corner:', sw);
            throw new Error('지도 남서쪽 모서리 정보를 가져올 수 없습니다.');
        }

        if (!ne || typeof ne.getLat !== 'function' || typeof ne.getLng !== 'function') {
            Utils.error('Invalid northeast corner:', ne);
            throw new Error('지도 북동쪽 모서리 정보를 가져올 수 없습니다.');
        }

        // 검색 반경 계산 (미터)
        const radius = Utils.calculateDistance(
            center.getLat(),
            center.getLng(),
            sw.getLat(),
            sw.getLng()
        );

        return {
            center: {
                lat: center.getLat(),
                lng: center.getLng()
            },
            bounds: {
                sw: { lat: sw.getLat(), lng: sw.getLng() },
                ne: { lat: ne.getLat(), lng: ne.getLng() }
            },
            radius: Math.min(radius, 2000) // 최대 2km로 제한
        };
    }

    /**
     * 카테고리별 검색 (키워드 + 카테고리 조합)
     */
    async searchByCategories(searchParams, stores) {
        // 키워드 검색으로 안정적인 결과 확보
        const searchTerms = [
            { keyword: '편의점', type: 'convenience' },
            { keyword: '음식점', type: 'restaurant' },
            { keyword: '카페', type: 'cafe' },
            { keyword: '병원', type: 'hospital' },
            { keyword: '약국', type: 'pharmacy' },
            { keyword: '미용실', type: 'beauty' },
            { keyword: '학원', type: 'academy' }
        ];

        const searchResults = [];
        let processedCount = 0;

        // 배치 처리로 API 호출 최적화
        const batchSize = 3;
        for (let i = 0; i < searchTerms.length; i += batchSize) {
            const batch = searchTerms.slice(i, i + batchSize);

            const batchPromises = batch.map((term) =>
                this.searchKeyword(term.keyword, searchParams, stores)
            );

            const batchResults = await Promise.allSettled(batchPromises);

            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    searchResults.push(...result.value);
                } else {
                    Utils.warn(`키워드 "${batch[index].keyword}" 검색 실패:`, result.reason);
                }
            });

            processedCount += batch.length;

            // 진행률 업데이트
            const progress = Math.round((processedCount / searchTerms.length) * 100);
            this.updateProgress(progress);

            // API 요청 제한을 위한 지연
            if (i + batchSize < searchTerms.length) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }

        return this.removeDuplicates(searchResults);
    }

    /**
     * 키워드 검색
     */
    async searchKeyword(keyword, searchParams, stores) {
        return new Promise((resolve, reject) => {
            if (this.searchCancelToken?.cancelled) {
                Utils.log(`키워드 "${keyword}" 검색 취소`);
                resolve([]);
                return;
            }

            Utils.log(
                `키워드 "${keyword}" 검색 시작 (중심: ${searchParams.center.lat}, ${searchParams.center.lng}, 반경: ${searchParams.radius}m)`
            );

            const ps = new kakao.maps.services.Places();
            const options = {
                location: new kakao.maps.LatLng(searchParams.center.lat, searchParams.center.lng),
                radius: searchParams.radius,
                size: 15
            };

            ps.keywordSearch(
                keyword,
                (data, status) => {
                    Utils.log(
                        `키워드 "${keyword}" 검색 결과: ${status}, 데이터 수: ${data?.length || 0}`
                    );

                    if (status === kakao.maps.services.Status.OK) {
                        const results = this.processSearchResults(data, stores, searchParams);
                        Utils.log(`키워드 "${keyword}" 매칭 결과: ${results.length}개`);
                        resolve(results);
                    } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
                        Utils.log(`키워드 "${keyword}": 검색 결과 없음`);
                        resolve([]);
                    } else {
                        Utils.error(`키워드 "${keyword}" 검색 실패: ${status}`);
                        reject(new Error(`키워드 검색 실패: ${status}`));
                    }
                },
                options
            );
        });
    }

    /**
     * 검색 결과 처리
     */
    processSearchResults(kakaoResults, stores, searchParams) {
        const results = [];

        for (const place of kakaoResults) {
            // 검색 취소 확인
            if (this.searchCancelToken?.cancelled) {
                break;
            }

            // 매칭되는 가맹점 찾기
            const matchedStores = this.findMatchingStores(place, stores);

            for (const store of matchedStores) {
                // 카카오 검색 결과 위치
                const kakaoLat = parseFloat(place.y);
                const kakaoLng = parseFloat(place.x);

                // 거리 계산 - 현재 위치가 있으면 현재 위치 기준, 없으면 지도 중심점 기준
                const currentLocation = stateManager.getState().currentLocation;
                let distanceFromUser = null;

                if (currentLocation) {
                    // 사용자 현재 위치와의 거리 계산
                    distanceFromUser = Utils.calculateDistance(
                        currentLocation.lat,
                        currentLocation.lng,
                        kakaoLat,
                        kakaoLng
                    );
                    Utils.log(`${store.상호}: 현재 위치로부터 ${distanceFromUser.toFixed(0)}m`);
                }

                // 지도 중심점과의 거리 (검색 반경 확인용)
                const distance = Utils.calculateDistance(
                    searchParams.center.lat,
                    searchParams.center.lng,
                    kakaoLat,
                    kakaoLng
                );

                // 카카오 API에서 카테고리 정보 추출
                const enhancedStore = this.enhanceStoreWithKakaoData(store, place);

                // 가맹점이 이미 정확한 위치 정보를 가지고 있는지 확인
                let finalLocation = { lat: kakaoLat, lng: kakaoLng };

                // 정확한 매칭(exact)이고 가맹점에 이미 위치 정보가 있다면 원본 위치 사용
                if (
                    store.matchType === 'exact' &&
                    store.location &&
                    store.location.lat &&
                    store.location.lng
                ) {
                    // 원본 위치와 카카오 위치의 거리 확인
                    const locationDistance = Utils.calculateDistance(
                        store.location.lat,
                        store.location.lng,
                        kakaoLat,
                        kakaoLng
                    );

                    // 500미터 이내라면 원본 위치 사용 (더 정확할 가능성)
                    if (locationDistance <= 500) {
                        finalLocation = {
                            lat: store.location.lat,
                            lng: store.location.lng,
                            roadAddress: store.location.roadAddress,
                            jibunAddress: store.location.jibunAddress
                        };
                        Utils.log(
                            `원본 위치 사용: ${store.상호} (거리차: ${locationDistance.toFixed(0)}m)`
                        );

                        // 원본 위치 기준으로 거리 다시 계산
                        if (currentLocation) {
                            distanceFromUser = Utils.calculateDistance(
                                currentLocation.lat,
                                currentLocation.lng,
                                store.location.lat,
                                store.location.lng
                            );
                            Utils.log(
                                `${store.상호}: 원본 위치 기준 현재 위치로부터 ${distanceFromUser.toFixed(0)}m`
                            );
                        }
                    }
                }

                results.push({
                    store: {
                        ...enhancedStore,
                        거리: distanceFromUser !== null ? distanceFromUser : distance // 현재 위치가 있으면 사용자 거리, 없으면 지도 중심점 거리
                    },
                    location: finalLocation,
                    place: place
                });
            }
        }

        return results;
    }

    /**
     * 카카오 API 데이터로 가맹점 정보 향상
     */
    enhanceStoreWithKakaoData(store, place) {
        const enhancedStore = { ...store };

        // 카카오 API에서 카테고리 정보 추출
        let category = '기타';

        if (place.category_name) {
            // 카테고리 체인을 분석해서 가장 구체적인 카테고리 추출
            const categories = place.category_name.split(' > ');
            const lastCategory = categories[categories.length - 1];
            category = this.mapKakaoCategory(lastCategory);

            Utils.log(`카테고리 매핑: "${place.category_name}" -> "${category}"`);
        }

        // place_name에서 추가 카테고리 힌트 추출
        if (category === '기타' && place.place_name) {
            const extractedCategory = this.extractCategoryFromName(place.place_name);
            if (extractedCategory !== '기타') {
                category = extractedCategory;
                Utils.log(`상호명에서 카테고리 추출: "${place.place_name}" -> "${category}"`);
            }
        }

        // 여러 필드에 카테고리 정보 저장 (mapManager.js에서 확인하는 모든 필드)
        enhancedStore.카테고리 = category;
        enhancedStore.category = category;
        enhancedStore.업종 = category;
        enhancedStore.표준산업분류명 = category;

        return enhancedStore;
    }

    /**
     * 카카오 카테고리를 한국어 카테고리로 매핑
     */
    mapKakaoCategory(kakaoCategory) {
        const categoryMap = {
            // 음식점 관련
            한식: '음식점',
            중식: '음식점',
            일식: '음식점',
            양식: '음식점',
            아시아음식: '음식점',
            패스트푸드: '음식점',
            치킨: '음식점',
            피자: '음식점',
            분식: '음식점',
            '족발,보쌈': '음식점',
            '찜,탕': '음식점',
            구이: '음식점',
            회: '음식점',
            뷔페: '음식점',
            도시락: '음식점',
            레스토랑: '음식점',

            // 카페/디저트
            카페: '카페',
            커피전문점: '카페',
            디저트: '카페',
            아이스크림: '카페',
            베이커리: '제과점',
            제과점: '제과점',

            // 편의점/마트
            편의점: '편의점',
            대형마트: '마트',
            슈퍼마켓: '마트',
            마트: '마트',

            // 의료/건강
            병원: '병원',
            의원: '병원',
            치과: '치과',
            한의원: '한의원',
            약국: '약국',
            동물병원: '동물병원',

            // 미용/뷰티
            미용실: '미용실',
            헤어샵: '미용실',
            네일샵: '네일샵',
            피부관리실: '피부관리실',
            마사지: '마사지',

            // 교육
            학원: '학원',
            어학원: '학원',
            컴퓨터학원: '학원',
            음악학원: '학원',
            미술학원: '학원',
            태권도장: '태권도장',

            // 서비스업
            세탁소: '세탁소',
            사진관: '사진관',
            복사: '복사',
            인쇄: '인쇄',
            수선: '수선',

            // 자동차 관련
            주유소: '주유소',
            정비소: '정비소',
            세차장: '세차장',

            // 기타
            은행: '은행',
            문구점: '문구점',
            꽃집: '꽃집',
            애완용품: '애완용품'
        };

        // 정확한 매치 찾기
        if (categoryMap[kakaoCategory]) {
            return categoryMap[kakaoCategory];
        }

        // 부분 매치 찾기
        for (const [key, value] of Object.entries(categoryMap)) {
            if (kakaoCategory.includes(key) || key.includes(kakaoCategory)) {
                return value;
            }
        }

        return '기타';
    }

    /**
     * 상호명에서 카테고리 추출
     */
    extractCategoryFromName(placeName) {
        const patterns = [
            {
                pattern: /GS25|CU|세븐|7-?ELEVEN|미니스톱|이마트24|위드미|더샵|바이더웨이/i,
                category: '편의점'
            },
            {
                pattern:
                    /스타벅스|카페|커피|coffee|cafe|빈스|이디야|할리스|파스쿠찌|맥심|탐앤탐스/i,
                category: '카페'
            },
            {
                pattern: /맥도날드|버거킹|KFC|롯데리아|파파이스|맘스터치|크라제버거|서브웨이/i,
                category: '패스트푸드'
            },
            { pattern: /병원|의원|클리닉|센터|메디컬/i, category: '병원' },
            { pattern: /약국|팜/i, category: '약국' },
            { pattern: /치과|덴탈/i, category: '치과' },
            { pattern: /미용실|헤어|살롱|뷰티/i, category: '미용실' },
            { pattern: /학원|교육|아카데미/i, category: '학원' },
            { pattern: /세탁|클리닝/i, category: '세탁소' },
            { pattern: /마트|수퍼|슈퍼|super/i, category: '마트' },
            { pattern: /치킨|닭/i, category: '치킨' },
            { pattern: /피자|pizza/i, category: '피자' },
            { pattern: /은행|bank/i, category: '은행' }
        ];

        for (const { pattern, category } of patterns) {
            if (pattern.test(placeName)) {
                return category;
            }
        }

        return '기타';
    }

    /**
     * 텍스트에서 지역 정보 추출
     */
    extractLocationHints(text) {
        const locationHints = [];
        // 지역명 패턴들
        const locationPatterns = [
            // 역/지하철역 관련
            /(\w+)역/g,
            // 동 단위 - 더 넓은 범위
            /(\w{2,})동/g,
            // 구 단위
            /(\w+)구/g,
            // 은평구 내 세부 지역명들을 더 포괄적으로
            /응암|새절|연신내|불광|구산|진관|대조|역촌|은평|갈현|녹번|홍제|신사|증산|수색|가좌|신촌|서대문|마포/g,
            // 큰 단위 지역
            /서울|경기|인천/g,
            // 로/길 주소에서 지역명 추출
            /(\w+)로/g,
            /(\w+)길/g
        ];

        for (const pattern of locationPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const location = match[1] || match[0];
                if (location && location.length >= 2) {
                    // '로', '길' 등은 너무 일반적이므로 제외
                    if (!['로', '길', '동로', '동길'].includes(location)) {
                        locationHints.push(location);
                    }
                }
            }
        }

        // 중복 제거
        return [...new Set(locationHints)];
    }

    /**
     * 두 지역 힌트 배열이 공통 지역을 가지는지 확인
     */
    hasCommonLocationHints(hints1, hints2) {
        // 둘 다 지역 정보가 없으면 매칭 거부
        if (hints1.length === 0 && hints2.length === 0) {
            Utils.log(`❌ 두 위치 모두 지역 정보 없음`);
            return false;
        }

        // 한쪽만 지역 정보가 없으면 매칭 거부
        if (hints1.length === 0 || hints2.length === 0) {
            Utils.log(`❌ 한쪽 지역 정보 없음: [${hints1.join(', ')}] vs [${hints2.join(', ')}]`);
            return false;
        }

        // 은평구 행정동 리스트 (정확한 동명만 허용)
        const eunpyeongDongs = [
            '응암동',
            '응암1동',
            '응암2동',
            '응암3동',
            '역촌동',
            '녹번동',
            '불광동',
            '불광1동',
            '불광2동',
            '갈현동',
            '갈현1동',
            '갈현2동',
            '구산동',
            '대조동',
            '신사동',
            '증산동',
            '수색동',
            '진관동'
        ];

        // 행정동 정확 매칭 우선 (가장 엄격한 조건)
        const dongPattern = /(\w+동)$/;
        const dong1 = hints1.find(
            (hint) => dongPattern.test(hint) && eunpyeongDongs.includes(hint)
        );
        const dong2 = hints2.find(
            (hint) => dongPattern.test(hint) && eunpyeongDongs.includes(hint)
        );

        if (dong1 && dong2) {
            if (dong1 === dong2) {
                Utils.log(`✅ 행정동 정확 매칭: "${dong1}" === "${dong2}"`);
                return true;
            } else {
                Utils.log(`❌ 행정동 불일치로 매칭 거부: "${dong1}" !== "${dong2}"`);
                return false;
            }
        }

        // 행정동이 없는 경우만 지역명으로 매칭 (더 엄격하게)
        // 단, 둘 다 행정동이 없어야 함
        const hasDong1 = hints1.some((hint) => dongPattern.test(hint));
        const hasDong2 = hints2.some((hint) => dongPattern.test(hint));

        if (hasDong1 || hasDong2) {
            // 한쪽이라도 행정동이 있으면 행정동 매칭만 허용
            Utils.log(`❌ 행정동 정보 불일치: dong1=${hasDong1}, dong2=${hasDong2}`);
            return false;
        }

        // 둘 다 행정동이 없는 경우만 지역명 매칭 허용
        const majorLocationMap = {
            응암: ['응암동', '응암1동', '응암2동', '응암3동'],
            새절: ['응암2동', '응암3동'],
            연신내: ['불광동', '불광1동', '불광2동'],
            불광: ['불광동', '불광1동', '불광2동'],
            구산: ['구산동'],
            진관: ['진관동'],
            대조: ['대조동'],
            역촌: ['역촌동'],
            갈현: ['갈현동', '갈현1동', '갈현2동'],
            녹번: ['녹번동'],
            홍제: ['홍제동'],
            증산: ['증산동'],
            수색: ['수색동'],
            신사: ['신사동']
        };

        // 지역명 매칭 (정확한 매치만)
        for (const hint1 of hints1) {
            for (const hint2 of hints2) {
                // 완전히 동일한 지역명만 허용
                if (hint1 === hint2 && hint1.length >= 2) {
                    // 주요 지역명인지 확인
                    if (majorLocationMap[hint1]) {
                        Utils.log(`✅ 지역명 정확 매칭: "${hint1}" === "${hint2}"`);
                        return true;
                    }
                }
            }
        }

        Utils.log(`❌ 모든 지역 매칭 실패: [${hints1.join(', ')}] vs [${hints2.join(', ')}]`);
        return false;
    }

    /**
     * 매칭되는 가맹점 찾기
     */
    findMatchingStores(place, stores) {
        const matches = [];
        const placeName = Utils.normalizeStoreName(place.place_name);
        const rawPlaceName = place.place_name;
        const kakaoLat = parseFloat(place.y);
        const kakaoLng = parseFloat(place.x);

        Utils.log(`\n=== 카카오 검색결과 매칭 시작 ===`);
        Utils.log(
            `카카오 검색결과: "${rawPlaceName}" -> 정규화: "${placeName}" (위치: ${kakaoLat}, ${kakaoLng})`
        );
        Utils.log(`총 ${stores?.length || 0}개 가맹점과 매칭 시도 중...`);

        if (!stores || stores.length === 0) {
            Utils.warn('매칭할 가맹점 데이터가 없습니다!');
            return matches;
        }

        // 카카오 검색 결과에서 지역 정보 추출
        const kakaoLocationHints = this.extractLocationHints(rawPlaceName);
        Utils.log(`카카오 지역 힌트:`, kakaoLocationHints);

        let checkedCount = 0;
        let filteredByName = 0;
        let filteredByLocation = 0;

        for (const store of stores) {
            checkedCount++;
            const storeName = Utils.normalizeStoreName(store.상호);
            const rawStoreName = store.상호;

            // 이름 유사도 확인
            let nameMatch = false;
            let matchType = '';
            let similarity = 0;

            // 정확한 매치
            if (storeName === placeName) {
                nameMatch = true;
                matchType = 'exact';
                similarity = 1.0;
            }
            // 부분 매치 (포함 관계)
            else if (storeName.includes(placeName) || placeName.includes(storeName)) {
                nameMatch = true;
                matchType = 'partial';
                similarity = 0.9;
            }
            // 유사 매치 (Levenshtein distance 사용)
            else {
                const calcSimilarity = this.calculateSimilarity(storeName, placeName);
                if (calcSimilarity >= 0.7) {
                    nameMatch = true;
                    matchType = 'similar';
                    similarity = calcSimilarity;
                } else {
                    // 디버깅: 이름 매칭 실패 사례를 몇 개만 출력
                    if (checkedCount <= 5 || similarity >= 0.5) {
                        Utils.log(
                            `이름 매칭 실패: "${storeName}" <-> "${placeName}" (유사도: ${calcSimilarity.toFixed(2)})`
                        );
                    }
                }
            }

            // 이름이 매칭되지 않으면 건너뛰기
            if (!nameMatch) {
                filteredByName++;
                continue;
            }

            Utils.log(
                `\n--- 이름 매칭 성공: "${rawStoreName}" (${matchType}, 유사도: ${similarity.toFixed(2)}) ---`
            );

            // 지리적/행정구역 근접성 확인 - 모든 매치에 적용
            let isLocationValid = true;

            // 가맹점 행정동 정보
            const storeLocation = store.읍면동명 || store.행정동 || '';
            Utils.log(`가맹점 행정동: "${storeLocation}"`);

            // 가맹점에서 지역 정보 추출 (상호명 + 행정동)
            const storeLocationHints = this.extractLocationHints(
                rawStoreName + ' ' + storeLocation
            );
            Utils.log(`가맹점 지역 힌트: [${storeLocationHints.join(', ')}]`);

            // 지역 정보 매칭 확인 - 정확한 매치도 포함하여 모든 경우에 적용
            const hasCommonLocation = this.hasCommonLocationHints(
                kakaoLocationHints,
                storeLocationHints
            );
            Utils.log(`지역 매칭 결과: ${hasCommonLocation}`);

            if (!hasCommonLocation) {
                Utils.log(
                    `❌ 지역 불일치로 제외: "${rawStoreName}" (${storeLocation}) <-> "${rawPlaceName}"`
                );
                filteredByLocation++;
                isLocationValid = false;
            } else {
                Utils.log(`✅ 지역 매칭 성공!`);

                // 추가 검증: 행정동이 다른데 너무 가까운 거리인 경우 의심스러운 매칭으로 간주
                const kakaoLat = parseFloat(place.y);
                const kakaoLng = parseFloat(place.x);

                // 기존 매칭 결과들과 거리 비교
                const suspiciousDistance = 50; // 50m 이내
                for (const existingMatch of matches) {
                    // 안전한 속성 접근
                    const existingStore = existingMatch.store || existingMatch;
                    const existingDong = existingStore.읍면동명 || existingStore.행정동 || '';

                    if (
                        existingDong !== storeLocation &&
                        existingDong &&
                        storeLocation &&
                        existingMatch.location &&
                        existingMatch.location.lat &&
                        existingMatch.location.lng
                    ) {
                        const distance = Utils.calculateDistance(
                            kakaoLat,
                            kakaoLng,
                            parseFloat(String(existingMatch.location.lat)),
                            parseFloat(String(existingMatch.location.lng))
                        );

                        if (distance < suspiciousDistance) {
                            const existingStoreName =
                                existingStore.상호 || existingStore.name || '알 수 없음';

                            Utils.log(`🚨 의심스러운 근접 매칭 감지:`);
                            Utils.log(`  새로운: ${rawStoreName} (${storeLocation})`);
                            Utils.log(`  기존: ${existingStoreName} (${existingDong})`);
                            Utils.log(`  거리: ${distance.toFixed(1)}m`);
                            Utils.log(`  → 더 정확한 행정동 정보가 있는 것을 선택`);

                            // 행정동 정보가 더 구체적인 것을 선택
                            if (storeLocation.length > existingDong.length) {
                                Utils.log(`  → 새로운 매칭 채택 (더 구체적인 행정동)`);
                                // 기존 매칭을 제거하고 새것을 추가할 예정
                                const removeIndex = matches.findIndex((m) => m === existingMatch);
                                if (removeIndex !== -1) {
                                    matches.splice(removeIndex, 1);
                                }
                            } else {
                                Utils.log(`  → 기존 매칭 유지, 새 매칭 제외`);
                                isLocationValid = false;
                                break;
                            }
                        }
                    }
                }
            }

            if (!isLocationValid) {
                continue;
            }

            Utils.log(`✅ 최종 매치 성공: "${rawStoreName}" <-> "${rawPlaceName}"`);

            matches.push({
                store: store, // store 객체를 명시적으로 포함
                location: {
                    lat: parseFloat(place.y),
                    lng: parseFloat(place.x),
                    roadAddress: place.road_address_name || '',
                    jibunAddress: place.address_name || '',
                    placeName: place.place_name || '',
                    placeUrl: place.place_url || '',
                    category: place.category_name || ''
                },
                matchType: matchType,
                similarity: similarity,
                geoDistance: null // 위치 정보가 없으므로 null
            });
        }

        Utils.log(`\n=== 매칭 완료 ===`);
        Utils.log(`검사한 가맹점: ${checkedCount}개`);
        Utils.log(`이름으로 필터링: ${filteredByName}개`);
        Utils.log(`지역으로 필터링: ${filteredByLocation}개`);
        Utils.log(`최종 매칭 결과: ${matches.length}개 (카카오: "${rawPlaceName}")`);

        // 매칭 점수로 정렬
        return matches.sort((a, b) => {
            // 1. 매치 타입 우선순위
            if (a.matchType === 'exact' && b.matchType !== 'exact') return -1;
            if (a.matchType !== 'exact' && b.matchType === 'exact') return 1;
            if (a.matchType === 'partial' && b.matchType === 'similar') return -1;
            if (a.matchType === 'similar' && b.matchType === 'partial') return 1;

            // 2. 유사도 우선순위
            return (b.similarity || 1) - (a.similarity || 1);
        });
    }

    /**
     * 문자열 유사도 계산
     */
    calculateSimilarity(str1, str2) {
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
                    matrix[j][i - 1] + 1, // deletion
                    matrix[j - 1][i] + 1, // insertion
                    matrix[j - 1][i - 1] + cost // substitution
                );
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * 중복 제거
     */
    removeDuplicates(results) {
        const seen = new Set();
        const locationClusters = new Map(); // 좌표 클러스터 감지

        return results.filter((item) => {
            // 안전한 속성 접근
            const store = item.store || item;
            const dongInfo = store.읍면동명 || store.행정동 || '';
            const storeName = store.상호 || store.name || '';
            const lat = parseFloat(item.location.lat);
            const lng = parseFloat(item.location.lng);

            // 행정동이 다른 경우 엄격한 거리 검사
            const locationKey = `${lat.toFixed(6)}_${lng.toFixed(6)}`; // 좌표 정밀도 6자리 (약 10cm)

            if (locationClusters.has(locationKey)) {
                const existingItems = locationClusters.get(locationKey);

                // 같은 좌표에 다른 행정동의 가맹점이 있는지 확인
                for (const existing of existingItems) {
                    // 안전한 속성 접근
                    const existingStore = existing.store || existing;
                    const existingDong = existingStore.읍면동명 || existingStore.행정동 || '';
                    const existingStoreName = existingStore.상호 || existingStore.name || '';

                    if (dongInfo !== existingDong && dongInfo && existingDong) {
                        Utils.log(`🚨 좌표 클러스터 감지 - 서로 다른 행정동:`);
                        Utils.log(`  기존: ${existingStoreName} (${existingDong})`);
                        Utils.log(`  신규: ${storeName} (${dongInfo})`);
                        Utils.log(`  좌표: ${lat.toFixed(8)}, ${lng.toFixed(8)}`);

                        // 더 구체적인 주소가 있는 것을 선택
                        const existingAddress =
                            existingStore.도로명주소 || existingStore.지번주소 || '';
                        const newAddress = store.도로명주소 || store.지번주소 || '';

                        if (newAddress.length > existingAddress.length) {
                            // 새로운 것이 더 상세하면 기존것을 제거하고 새것을 추가
                            const existingIndex = existingItems.findIndex((e) => e === existing);
                            if (existingIndex !== -1) {
                                existingItems.splice(existingIndex, 1);
                                Utils.log(`  → 더 상세한 주소로 교체: ${storeName}`);
                            }
                        } else {
                            Utils.log(`  → 기존 항목 유지, 새 항목 제거`);
                            return false;
                        }
                    }
                }

                locationClusters.get(locationKey).push(item);
            } else {
                locationClusters.set(locationKey, [item]);
            }

            // 고유키 생성 (상호명 + 좌표 + 행정동)
            const uniqueKey = `${storeName}_${lat.toFixed(8)}_${lng.toFixed(8)}_${dongInfo}`;

            if (seen.has(uniqueKey)) {
                Utils.log(`중복 제거: ${storeName} (${dongInfo})`);
                return false;
            }

            seen.add(uniqueKey);
            return true;
        });
    }

    /**
     * 진행률 업데이트
     */
    updateProgress(progress) {
        // UI 업데이트는 별도 서비스에서 처리
        stateManager.setState({ searchProgress: progress });
    }

    /**
     * 검색 취소
     */
    cancelSearch() {
        if (this.searchCancelToken) {
            this.searchCancelToken.cancelled = true;
        }
    }
}

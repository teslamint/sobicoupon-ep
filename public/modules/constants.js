// 애플리케이션 상수
export const CONSTANTS = {
    // API 설정
    API: {
        DELAY: 500,
        BATCH_SIZE: 50,
        MAX_ATTEMPTS: 50,
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        TIMEOUT: 10000
    },

    // 캐시 설정
    CACHE: {
        DB_NAME: 'StoreLocationCache',
        DB_VERSION: 2, // 버전 업그레이드
        STORE_NAME: 'locations',
        CATEGORY_STORE_NAME: 'categories',
        SEARCH_TTL: 30 * 60 * 1000 // 30분
    },

    // 지도 설정
    MAP: {
        DEFAULT_CENTER: {
            lat: 37.6176, // 은평구 중심
            lng: 126.9227
        },
        DEFAULT_ZOOM: 3, // 더 확대된 레벨로 변경
        CLUSTER_MIN_LEVEL: 3,
        MARKER_IMAGE_SIZE: { width: 24, height: 35 }, // 별 모양 마커에 맞게 조정
        MARKER_IMAGE_OFFSET: { x: 12, y: 35 } // 별 모양 마커의 중심점에 맞게 조정
    },

    // 페이지네이션
    PAGINATION: {
        DEFAULT_PAGE_SIZE: 25,
        PAGE_SIZES: [10, 25, 50, 100]
    },

    // 카테고리 코드
    CATEGORIES: {
        CS2: '편의점',
        FD6: '음식점',
        CE7: '카페',
        HP8: '병원',
        PM9: '약국',
        AC5: '학원',
        PS3: '어린이집, 유치원',
        AT4: '관광명소',
        CT1: '문화시설',
        AG2: '중개업소',
        OL7: '주유소'
    },

    // 검색 설정
    SEARCH: {
        CATEGORIES: [
            { code: 'CS2', name: '편의점' },
            { code: 'FD6', name: '음식점' },
            { code: 'CE7', name: '카페' },
            { code: 'HP8', name: '병원' },
            { code: 'PM9', name: '약국' },
            { code: 'AC5', name: '학원' },
            { code: 'PS3', name: '어린이집, 유치원' },
            { code: 'AT4', name: '관광명소' },
            { code: 'CT1', name: '문화시설' },
            { code: 'AG2', name: '중개업소' },
            { code: 'OL7', name: '주유소' }
        ],
        MAX_RADIUS: 20000, // 20km
        PAGE_SIZE: 15,
        MIN_RESULTS_PER_CATEGORY: 5,
        SIMILARITY_THRESHOLD: 0.6,
        KEYWORD_SIMILARITY_THRESHOLD: 0.8,
        KEYWORD_SEARCH_COUNT: 50,
        MAX_DISTANCE: 10000, // 10km
        MIN_SIMILARITY: 0.5
    },

    // 파일 처리
    FILE: {
        MAX_SIZE: 10 * 1024 * 1024, // 10MB
        ALLOWED_EXTENSIONS: ['.xlsx', '.xls']
    },

    // 지리 계산
    GEO: {
        EARTH_RADIUS: 6371000, // 지구 반지름 (미터)
        DEG_TO_RAD: Math.PI / 180
    },

    // UI 상태
    UI: {
        DEFAULT_PAGE: 1,
        DEFAULT_PAGE_SIZE: 25,
        INITIAL_PROGRESS: 0,
        COMPLETE_PROGRESS: 100,
        DEBOUNCE_DELAY: 300,
        NOTIFICATION_DURATION: 5000
    },

    // 재시도 설정
    RETRY: {
        DEFAULT_ATTEMPTS: 3,
        DEFAULT_DELAY: 1000,
        BACKOFF_MULTIPLIER: 2
    },

    // 시간 관련 상수
    TIME: {
        SHORT_DELAY: 50,
        MEDIUM_DELAY: 100,
        LONG_DELAY: 1000,
        NOTIFICATION_DURATION: 3000,
        UPLOAD_SUCCESS_HIDE_DELAY: 3000,
        PROGRESS_HIDE_DELAY: 1000,
        LOCATION_TIMEOUT: 5000,
        CIRCUIT_BREAKER_TIMEOUT: 30000
    },

    // UI 관련 상수
    UI_DIMENSIONS: {
        COORDINATE_PRECISION: 8,
        LAT_LNG_PRECISION: 6,
        COORDINATE_ROUND_PRECISION: 1000,
        PERCENTAGE_PRECISION: 100,
        PROGRESS_COMPLETE: 100,
        Z_INDEX_HIGH: 10000,
        Z_INDEX_MODAL: 10000
    },

    // 거리 및 그룹핑 상수
    DISTANCE: {
        GROUPING_THRESHOLD: 20, // 20미터
        NEARBY_THRESHOLD: 50, // 50미터
        SUSPICIOUS_DISTANCE: 50, // 50미터
        MAX_SEARCH_DISTANCE: 10000 // 10km
    },

    // 데이터 처리 상수
    DATA: {
        MAX_FIELD_LENGTH: 100,
        MIN_STORE_NAME_LENGTH: 1,
        MAX_STORE_NAME_LENGTH: 100,
        TRUNCATE_LENGTH: 50,
        BATCH_PROGRESS_INTERVAL: 1000,
        MAX_CACHE_SIZE: 1000,
        COORDINATE_PRECISION_DIGITS: 8
    },

    // 애니메이션 관련 상수
    ANIMATION: {
        NOTIFICATION_DURATION: 3000,
        FADE_DURATION: 300,
        RELAYOUT_DELAY: 100
    },

    // 엑셀 컬럼 매핑
    EXCEL_COLUMNS: {
        DONG: '읍면동명',
        CATEGORY: '표준산업분류명',
        NAME: '상호명',
        ADDRESS: '도로명주소',
        OLD_ADDRESS: '지번주소'
    }
};

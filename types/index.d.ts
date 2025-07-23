// 은평구 소비쿠폰 시스템 타입 정의
export interface Store {
    인덱스: number;
    읍면동명: string;
    행정동: string;
    상호: string;
    표준산업분류명: string;
    도로명주소: string;
    지번주소: string;
    상세주소: string;
    location: Location | null;
    searched: boolean;
    검색결과: string;
    distance?: number;
}

export interface Location {
    lat: number;
    lng: number;
    roadAddress?: string;
    jibunAddress?: string;
    category?: string;
    placeName?: string;
    placeUrl?: string;
}

export interface MapState {
    center: { lat: number; lng: number } | null;
    level: number | null;
    markers: Map<string, any>;
    currentLocationMarker: any | null;
    currentLocation: { lat: number; lng: number } | null;
    clusterer: any | null;
}

export interface AppState {
    // 데이터
    stores: Store[];
    filteredStores: Store[];
    locations: Map<string, Location>;
    categories: Map<string, string>;

    // UI 상태
    currentPage: number;
    pageSize: number;
    searchQuery: string;
    selectedDong: string;
    selectedCategory: string;
    selectedCategories: Set<string>;
    sortField: string | null;
    sortDirection: 'asc' | 'desc';
    distanceSortOrder: 'none' | 'asc' | 'desc';

    // 지도 상태
    mapCenter: { lat: number; lng: number } | null;
    mapLevel: number | null;
    markers: Map<string, any>;
    currentLocationMarker: any | null;
    currentLocation: { lat: number; lng: number } | null;
    clusterer: any | null;

    // 로딩 상태
    isLoading: boolean;
    isSearching: boolean;
    searchProgress: number;

    // 통계
    stats: {
        total: number;
        dongs: number;
        found: number;
        notFound: number;
    };
}

export interface SearchFilters {
    searchQuery?: string;
    selectedDong?: string;
    selectedCategory?: string;
    selectedCategories?: Set<string>;
}

export interface FileHandlerResult {
    count: number;
    cached: number;
    errors?: string[];
}

export interface KakaoSearchResult {
    documents: Array<{
        place_name: string;
        category_name: string;
        address_name: string;
        road_address_name: string;
        x: string;
        y: string;
        place_url: string;
        distance?: string;
    }>;
    meta: {
        total_count: number;
        pageable_count: number;
        is_end: boolean;
    };
}

// 전역 객체 타입 확장
declare global {
    interface Window {
        // Kakao API
        kakao: any;
        
        // 애플리케이션 모듈들
        mapManager: any;
        stateManager: any;
        app: any;
        modules: any;
        
        // API 키들
        KAKAO_API_KEY: string;
        KAKAO_API_KEY_OBFUSCATED: string;
        
        // 외부 라이브러리
        XLSX: any;
        
        // 전역 함수들
        clearCache: () => Promise<void>;
        zoomIn: () => void;
        zoomOut: () => void;
        showCurrentLocation: () => Promise<void>;
        toggleCategoryDropdown: () => void;
        toggleAllCategories: () => void;
        updateCategorySelection: () => void;
        exportToCSV: () => void;
        exportToJSON: () => void;
        
        // 진행률 업데이트 함수들
        updateSearchProgress: (progress: number) => void;
        updateKeywordSearchProgress: (progress: number) => void;
        updateSearchStats: (stats: any) => void;
        
        // 마커 상태
        markerClickState: any;
    }
    
    // 전역 변수들
    declare const CONSTANTS: any;
    declare const kakao: any;
    declare const mapManager: any;
    
    // DOM 확장
    interface Element {
        title?: string;
        style?: CSSStyleDeclaration;
        dataset?: DOMStringMap;
        checked?: boolean;
        value?: string;
        disabled?: boolean;
        content?: string;
        indeterminate?: boolean;
    }
    
    interface EventTarget {
        result?: any;
    }
    
    interface Error {
        code?: string | number;
    }
}

export {};
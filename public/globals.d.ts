// 전역 변수 및 함수 선언
declare const CONSTANTS: any;
declare const kakao: any;
declare const mapManager: any;

// 전역 함수들
declare function updateCategorySelection(): void;
declare function toggleFullscreen(): void;
declare function zoomIn(): void;
declare function zoomOut(): void;
declare function showCurrentLocation(): void;
declare function toggleCategoryDropdown(): void;
declare function toggleAllCategories(): void;
declare function clearCache(): void;

// 윈도우 확장
declare global {
    interface Window {
        kakao: any;
        XLSX: any;
        KAKAO_API_KEY: string;
        KAKAO_API_KEY_OBFUSCATED: string;
        app: any;
        modules: any;
        mapManager: any;
        stateManager: any;
        markerClickState: any;
        
        // 진행률 업데이트 함수들
        updateSearchProgress: (progress: number) => void;
        updateKeywordSearchProgress: (progress: number) => void;
        updateSearchStats: (stats: any) => void;
        
        // 전역 함수들
        updateCategorySelection: () => void;
        clearCache: () => void;
        zoomIn: () => void;
        zoomOut: () => void;
        showCurrentLocation: () => void;
        toggleCategoryDropdown: () => void;
        toggleAllCategories: () => void;
        exportToCSV: () => void;
        exportToJSON: () => void;
    }
    
    interface Element {
        title?: string;
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
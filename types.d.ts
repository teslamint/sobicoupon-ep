// 전역 타입 선언
interface Window {
    // 애플리케이션 모듈들
    mapManager: any;
    stateManager: any;
    searchManager: any;
    uiManager: any;
    app: any;
    modules: any;

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
    toggleFullscreen?: () => void;

    // 카카오맵 API
    kakao?: {
        maps: any;
    };

    // 기타 전역 변수
    XLSX?: any;
}

// 서비스 워커 관련 타입
declare const self: ServiceWorkerGlobalScope;

interface ExtendableEvent extends Event {
    waitUntil(promise: Promise<any>): void;
}

interface FetchEvent extends ExtendableEvent {
    request: Request;
    respondWith(response: Promise<Response> | Response): void;
}

// 모듈 타입 선언
declare module '*.js' {
    const content: any;
    export default content;
}
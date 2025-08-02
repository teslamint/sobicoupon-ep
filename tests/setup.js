// Jest 설정 및 전역 모의 객체

// Kakao Maps API 모의
global.kakao = {
    maps: {
        LatLng: jest.fn((lat, lng) => ({ lat, lng, getLat: () => lat, getLng: () => lng })),
        Map: jest.fn(() => ({
            setCenter: jest.fn(),
            setLevel: jest.fn(),
            getCenter: jest.fn(() => ({ getLat: () => 37.5663, getLng: () => 126.9779 })),
            getLevel: jest.fn(() => 3),
            getBounds: jest.fn(() => ({
                getSouthWest: jest.fn(() => ({ getLat: () => 37.5, getLng: () => 126.9 })),
                getNorthEast: jest.fn(() => ({ getLat: () => 37.6, getLng: () => 127.0 }))
            })),
            relayout: jest.fn(),
            setBounds: jest.fn()
        })),
        Marker: jest.fn(() => ({
            setMap: jest.fn(),
            getPosition: jest.fn(() => ({ getLat: () => 37.5, getLng: () => 126.9 }))
        })),
        MarkerImage: jest.fn(),
        MarkerClusterer: jest.fn(() => ({
            addMarkers: jest.fn(),
            clear: jest.fn(),
            setMap: jest.fn()
        })),
        InfoWindow: jest.fn(() => ({
            open: jest.fn(),
            close: jest.fn(),
            setContent: jest.fn(),
            setPosition: jest.fn()
        })),
        CustomOverlay: jest.fn(() => ({
            setMap: jest.fn(),
            getPosition: jest.fn()
        })),
        LatLngBounds: jest.fn(() => ({
            extend: jest.fn()
        })),
        Size: jest.fn((width, height) => ({ width, height })),
        Point: jest.fn((x, y) => ({ x, y })),
        event: {
            addListener: jest.fn(),
            removeListener: jest.fn()
        },
        services: {
            Places: jest.fn(() => ({
                keywordSearch: jest.fn()
            })),
            Status: {
                OK: 'OK',
                ZERO_RESULT: 'ZERO_RESULT',
                ERROR: 'ERROR'
            }
        }
    }
};

// XLSX 모의
global.XLSX = {
    read: jest.fn(() => ({
        SheetNames: ['Sheet1'],
        Sheets: {
            Sheet1: {}
        }
    })),
    utils: {
        sheet_to_json: jest.fn(() => [
            ['읍면동명', '상호명', '표준산업분류명', '도로명주소'],
            ['불광동', '테스트마트', '편의점', '은평구 불광동 123-45'],
            ['녹번동', '테스트카페', '카페', '은평구 녹번동 678-90']
        ])
    }
};

// IndexedDB 모의
const mockObjectStore = {
    put: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
    get: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
    getAll: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
    clear: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
    count: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
    delete: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() })),
    createIndex: jest.fn(),
    index: jest.fn(() => ({
        openCursor: jest.fn(() => ({ onsuccess: jest.fn(), onerror: jest.fn() }))
    }))
};

const mockTransaction = {
    objectStore: jest.fn(() => mockObjectStore)
};

const mockDb = {
    transaction: jest.fn(() => mockTransaction),
    close: jest.fn(),
    objectStoreNames: {
        contains: jest.fn(() => false)
    }
};

global.indexedDB = {
    open: jest.fn(() => ({
        onsuccess: jest.fn(),
        onerror: jest.fn(),
        onupgradeneeded: jest.fn(),
        result: mockDb
    }))
};

// Geolocation 모의
global.navigator.geolocation = {
    getCurrentPosition: jest.fn((success, _error) => {
        success({
            coords: {
                latitude: 37.6176,
                longitude: 126.9227,
                accuracy: 10
            }
        });
    })
};

// localStorage 모의
global.localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};

// FileReader 모의
global.FileReader = jest.fn(() => ({
    readAsArrayBuffer: jest.fn(function () {
        this.onload({ target: { result: new ArrayBuffer(8) } });
    }),
    readAsText: jest.fn(function () {
        this.onload({ target: { result: 'file content' } });
    })
}));

// Blob 모의
global.Blob = jest.fn((content, options) => ({
    size: content[0].length,
    type: options.type
}));

// URL 모의
global.URL = {
    createObjectURL: jest.fn(() => 'blob:mock-url'),
    revokeObjectURL: jest.fn()
};

// requestAnimationFrame 모의
global.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 0));
global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));

// matchMedia 모의
global.matchMedia = jest.fn(() => ({
    matches: false,
    addListener: jest.fn(),
    removeListener: jest.fn()
}));

// IntersectionObserver 모의
global.IntersectionObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn()
}));

// ResizeObserver 모의
global.ResizeObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn()
}));

// Performance 모의
global.performance = {
    now: jest.fn(() => Date.now())
};

// 콘솔 경고 억제 (테스트 출력을 깔끔하게)
global.console = {
    ...console,
    error: jest.fn(),
    warn: jest.fn()
};

// process.env 설정
process.env.NODE_ENV = 'test';

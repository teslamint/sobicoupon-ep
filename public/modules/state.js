// 중앙화된 상태 관리 시스템
import { CONSTANTS } from './constants.js';
import { Utils } from './utils.js';

/**
 * @typedef {import('../../types/index.d.ts').AppState} AppState
 * @typedef {import('../../types/index.d.ts').Store} Store
 */

/**
 * 애플리케이션 상태 관리 클래스
 * @class StateManager
 */
export class StateManager {
    constructor() {
        this.state = {
            // 데이터
            stores: [],
            filteredStores: [],
            locations: new Map(),
            categories: new Map(),

            // UI 상태
            currentPage: CONSTANTS.UI.DEFAULT_PAGE,
            pageSize: CONSTANTS.UI.DEFAULT_PAGE_SIZE,
            searchQuery: '',
            selectedDong: '',
            selectedCategory: '',
            selectedCategories: new Set(),
            sortField: null,
            sortDirection: 'asc',
            distanceSortOrder: 'none', // none, asc, desc

            // 지도 상태
            mapCenter: null,
            mapLevel: null,
            markers: new Map(),
            currentLocationMarker: null,
            currentLocation: null, // { lat, lng }
            clusterer: null,

            // 로딩 상태
            isLoading: false,
            isSearching: false,
            searchProgress: CONSTANTS.UI.INITIAL_PROGRESS,

            // 통계
            stats: {
                total: 0,
                dongs: 0,
                found: 0,
                notFound: 0
            }
        };

        this.observers = new Map();
        this.history = [];
        this.maxHistorySize = 50;
    }

    // 상태 구독
    subscribe(key, callback) {
        if (!this.observers.has(key)) {
            this.observers.set(key, new Set());
        }
        this.observers.get(key).add(callback);

        // 구독 해제 함수 반환
        return () => {
            const callbacks = this.observers.get(key);
            if (callbacks) {
                callbacks.delete(callback);
            }
        };
    }

    // 상태 업데이트
    setState(updates, addToHistory = true) {
        const oldState = { ...this.state };
        const changedKeys = new Set();

        // 상태 업데이트
        Object.entries(updates).forEach(([key, value]) => {
            if (this.state[key] !== value) {
                this.state[key] = value;
                changedKeys.add(key);
            }
        });

        // 히스토리 추가
        if (addToHistory && changedKeys.size > 0) {
            this.addToHistory(oldState, changedKeys);
        }

        // 변경된 키에 대한 옵저버 호출
        changedKeys.forEach((key) => {
            this.notifyObservers(key);
        });
    }

    // 상태 가져오기
    getState(key) {
        return key ? this.state[key] : this.state;
    }

    // 상태 초기화
    resetState(keys = null) {
        if (keys) {
            keys.forEach((key) => {
                if (key in this.state) {
                    this.setState({ [key]: this.getInitialValue(key) });
                }
            });
        } else {
            // 전체 초기화
            this.state = this.getInitialState();
            this.notifyAllObservers();
        }
    }

    // 초기값 가져오기
    getInitialValue(key) {
        const initialValues = {
            stores: [],
            filteredStores: [],
            locations: new Map(),
            categories: new Map(),
            currentPage: 1,
            pageSize: 25,
            searchQuery: '',
            selectedDong: '',
            selectedCategory: '',
            selectedCategories: new Set(),
            sortField: null,
            sortDirection: 'asc',
            distanceSortOrder: 'none',
            mapCenter: null,
            mapLevel: null,
            markers: new Map(),
            currentLocationMarker: null,
            currentLocation: null,
            clusterer: null,
            isLoading: false,
            isSearching: false,
            searchProgress: 0,
            stats: { total: 0, dongs: 0, found: 0, notFound: 0 }
        };

        return initialValues[key];
    }

    // 초기 상태
    getInitialState() {
        return {
            stores: [],
            filteredStores: [],
            locations: new Map(),
            categories: new Map(),
            currentPage: 1,
            pageSize: 25,
            searchQuery: '',
            selectedDong: '',
            selectedCategory: '',
            selectedCategories: new Set(),
            sortField: null,
            sortDirection: 'asc',
            distanceSortOrder: 'none',
            mapCenter: null,
            mapLevel: null,
            markers: new Map(),
            currentLocationMarker: null,
            currentLocation: null,
            clusterer: null,
            isLoading: false,
            isSearching: false,
            searchProgress: 0,
            stats: { total: 0, dongs: 0, found: 0, notFound: 0 }
        };
    }

    // 옵저버 알림
    notifyObservers(key) {
        const callbacks = this.observers.get(key);
        if (callbacks) {
            callbacks.forEach((callback) => {
                try {
                    callback(this.state[key], key);
                } catch (error) {
                    // 옵저버 에러는 무시하고 계속 진행
                }
            });
        }
    }

    // 모든 옵저버에게 알림
    notifyAllObservers() {
        this.observers.forEach((callbacks, key) => {
            callbacks.forEach((callback) => {
                try {
                    callback(this.state[key], key);
                } catch (error) {
                    // 옵저버 에러는 무시하고 계속 진행
                }
            });
        });
    }

    // 히스토리 추가
    addToHistory(oldState, changedKeys) {
        this.history.push({
            timestamp: Date.now(),
            changedKeys: Array.from(changedKeys),
            state: oldState
        });

        // 히스토리 크기 제한
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }

    // 실행 취소
    undo() {
        if (this.history.length === 0) {
            return false;
        }

        const lastEntry = this.history.pop();

        // 이전 상태로 복원
        lastEntry.changedKeys.forEach((key) => {
            this.state[key] = lastEntry.state[key];
        });

        // 옵저버에게 알림
        lastEntry.changedKeys.forEach((key) => {
            this.notifyObservers(key);
        });

        return true;
    }

    // 상태 유효성 검사
    validateState() {
        const errors = [];

        // 페이지 번호 검증
        if (this.state.currentPage < 1) {
            errors.push('Invalid page number');
        }

        // 페이지 크기 검증
        if (![10, 25, 50, 100].includes(this.state.pageSize)) {
            errors.push('Invalid page size');
        }

        // 필터링된 스토어 배열 검증
        if (!Array.isArray(this.state.filteredStores)) {
            errors.push('filteredStores must be an array');
        }

        return errors;
    }

    // 파생 상태 계산
    getComputedState() {
        const { filteredStores, currentPage, pageSize, sortField, sortDirection } = this.state;

        // 정렬
        const sorted = [...filteredStores];
        if (sortField) {
            sorted.sort((a, b) => {
                const aVal = a[sortField];
                const bVal = b[sortField];
                const direction = sortDirection === 'asc' ? 1 : -1;

                if (typeof aVal === 'string') {
                    return aVal.localeCompare(bVal) * direction;
                }
                return (aVal - bVal) * direction;
            });
        }

        // 페이지네이션
        const totalPages = Math.ceil(sorted.length / pageSize);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedStores = sorted.slice(startIndex, endIndex);

        return {
            sortedStores: sorted,
            paginatedStores,
            totalPages,
            startIndex,
            endIndex
        };
    }

    // 상태 직렬화 (저장용)
    serialize() {
        const serializable = { ...this.state };

        // Map과 Set을 배열로 변환 (타입 안전성 보장)
        try {
            // @ts-ignore: Map/Set 변환 타입 경고 무시
            serializable.locations =
                this.state.locations instanceof Map
                    ? Array.from(this.state.locations.entries())
                    : [];

            // @ts-ignore: Map/Set 변환 타입 경고 무시
            serializable.categories =
                this.state.categories instanceof Map
                    ? Array.from(this.state.categories.entries())
                    : [];

            // @ts-ignore: Map/Set 변환 타입 경고 무시
            serializable.selectedCategories =
                this.state.selectedCategories instanceof Set
                    ? Array.from(this.state.selectedCategories)
                    : [];

            // @ts-ignore: Map/Set 변환 타입 경고 무시
            serializable.markers =
                this.state.markers instanceof Map ? Array.from(this.state.markers.keys()) : [];

            // 함수와 DOM 요소 제외
            delete serializable.clusterer;
            delete serializable.currentLocationMarker;

            return JSON.stringify(serializable);
        } catch (error) {
            Utils.warn('상태 직렬화 중 오류:', error);
            return JSON.stringify({});
        }
    }

    // 상태 역직렬화 (복원용)
    deserialize(data) {
        try {
            const parsed = JSON.parse(data);

            // Map과 Set 복원 (타입 안전성 확보)
            if (Array.isArray(parsed.locations)) {
                parsed.locations = new Map(parsed.locations);
            } else {
                parsed.locations = new Map();
            }

            if (Array.isArray(parsed.categories)) {
                parsed.categories = new Map(parsed.categories);
            } else {
                parsed.categories = new Map();
            }

            if (Array.isArray(parsed.selectedCategories)) {
                parsed.selectedCategories = new Set(parsed.selectedCategories);
            } else {
                parsed.selectedCategories = new Set();
            }

            parsed.markers = new Map();

            this.setState(parsed, false);
            return true;
        } catch (error) {
            // 역직렬화 실패는 무시
            return false;
        }
    }
}

// 싱글톤 인스턴스
export const stateManager = new StateManager();

// IndexedDB를 활용한 저장소 관리
import { CONSTANTS } from './constants.js';
import { Utils } from './utils.js';
import { AppError, ErrorCodes } from './errors.js';
import { cacheMigration } from './migration.js';

export class StorageManager {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.migrationCompleted = false;
    }

    // 초기화
    async init() {
        if (this.isInitialized) {
            return;
        }

        try {
            // 마이그레이션 실행
            if (!this.migrationCompleted) {
                try {
                    // 기존 데이터베이스 열어보기
                    await this.openDatabase();

                    // migrated_stores가 없으면 마이그레이션 재실행
                    if (!this.db.objectStoreNames.contains('migrated_stores')) {
                        Utils.log('migrated_stores 스토어가 없어 마이그레이션을 다시 실행합니다.');
                        this.db.close();
                        this.db = null;

                        const migrated = await cacheMigration.migrate();
                        if (migrated) {
                            Utils.log('기존 캐시 데이터를 성공적으로 마이그레이션했습니다.');
                        }
                    }
                    this.migrationCompleted = true;
                } catch (error) {
                    Utils.error('마이그레이션 중 오류 발생:', error);
                    // 마이그레이션 실패해도 계속 진행
                }
            }

            await this.openDatabase();
            this.isInitialized = true;
        } catch (error) {
            throw new AppError('IndexedDB 초기화 실패', ErrorCodes.CACHE_INIT_ERROR, {
                originalError: error
            });
        }
    }

    // 마이그레이션 완료 대기 (레이스 컨디션 방지)
    async waitForMigrationComplete(timeoutMs = 3000) {
        const startTime = Date.now();

        while (!this.migrationCompleted && Date.now() - startTime < timeoutMs) {
            // 마이그레이션이 완료되지 않았다면 잠시 대기
            await new Promise((resolve) => setTimeout(resolve, 100));

            // 데이터베이스가 초기화되었다면 migrated_stores 존재 여부 확인
            if (this.db && this.db.objectStoreNames.contains('migrated_stores')) {
                this.migrationCompleted = true;
                break;
            }
        }

        if (!this.migrationCompleted) {
            Utils.warn('마이그레이션 완료 대기 시간 초과 (3초)');
        }

        return this.migrationCompleted;
    }

    // 데이터베이스 열기
    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(CONSTANTS.CACHE.DB_NAME, CONSTANTS.CACHE.DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // locations 스토어
                if (!db.objectStoreNames.contains(CONSTANTS.CACHE.STORE_NAME)) {
                    const locationStore = db.createObjectStore(CONSTANTS.CACHE.STORE_NAME, {
                        keyPath: 'id'
                    });
                    locationStore.createIndex('store_dong', ['store', 'dong'], { unique: false });
                    locationStore.createIndex('dong', 'dong', { unique: false });
                    locationStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // categories 스토어
                if (!db.objectStoreNames.contains(CONSTANTS.CACHE.CATEGORY_STORE_NAME)) {
                    db.createObjectStore(CONSTANTS.CACHE.CATEGORY_STORE_NAME, { keyPath: 'code' });
                }

                // 마이그레이션된 전체 가맹점 데이터 스토어
                if (!db.objectStoreNames.contains('migrated_stores')) {
                    const storeObjectStore = db.createObjectStore('migrated_stores', {
                        keyPath: 'id'
                    });
                    storeObjectStore.createIndex('dong', 'dong', { unique: false });
                    storeObjectStore.createIndex('store', 'store', { unique: false });
                }
            };
        });
    }

    // 위치 정보 저장
    async saveLocation(storeData, location) {
        if (!this.db) {
            await this.init();
        }

        const transaction = this.db.transaction([CONSTANTS.CACHE.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONSTANTS.CACHE.STORE_NAME);

        const data = {
            id: `${storeData.행정동 || storeData.읍면동명}_${storeData.상호}`,
            store: storeData.상호,
            dong: storeData.행정동 || storeData.읍면동명,
            category: storeData.표준산업분류명,
            address: storeData.도로명주소 || storeData.지번주소,
            location: {
                lat: location.lat,
                lng: location.lng,
                roadAddress: location.roadAddress,
                jibunAddress: location.jibunAddress
            },
            timestamp: Date.now()
        };

        return this.promisifyRequest(store.put(data));
    }

    // 위치 정보 조회
    async getLocation(storeName, dong) {
        if (!this.db) {
            await this.init();
        }

        const transaction = this.db.transaction([CONSTANTS.CACHE.STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONSTANTS.CACHE.STORE_NAME);
        const id = `${dong}_${storeName}`;

        const result = await this.promisifyRequest(store.get(id));
        return result ? result.location : null;
    }

    // 모든 위치 정보 조회
    async getAllLocations() {
        if (!this.db) {
            await this.init();
        }

        const transaction = this.db.transaction([CONSTANTS.CACHE.STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONSTANTS.CACHE.STORE_NAME);

        const results = await this.promisifyRequest(store.getAll());
        const locationMap = new Map();

        results.forEach((item) => {
            locationMap.set(`${item.dong}_${item.store}`, item.location);
        });

        return locationMap;
    }

    // 카테고리 정보 저장
    async saveCategories(categories) {
        if (!this.db) {
            await this.init();
        }

        const transaction = this.db.transaction([CONSTANTS.CACHE.CATEGORY_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONSTANTS.CACHE.CATEGORY_STORE_NAME);

        const promises = [];
        categories.forEach((name, code) => {
            promises.push(this.promisifyRequest(store.put({ code, name })));
        });

        return Promise.all(promises);
    }

    // 카테고리 정보 조회
    async getCategories() {
        if (!this.db) {
            await this.init();
        }

        const transaction = this.db.transaction([CONSTANTS.CACHE.CATEGORY_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONSTANTS.CACHE.CATEGORY_STORE_NAME);

        const results = await this.promisifyRequest(store.getAll());
        const categoryMap = new Map();

        results.forEach((item) => {
            categoryMap.set(item.code, item.name);
        });

        return categoryMap;
    }

    // 캐시 삭제
    async clearCache() {
        if (!this.db) {
            await this.init();
        }

        // 모든 object store 확인
        const storeNames = [];
        if (this.db.objectStoreNames.contains(CONSTANTS.CACHE.STORE_NAME)) {
            storeNames.push(CONSTANTS.CACHE.STORE_NAME);
        }
        if (this.db.objectStoreNames.contains(CONSTANTS.CACHE.CATEGORY_STORE_NAME)) {
            storeNames.push(CONSTANTS.CACHE.CATEGORY_STORE_NAME);
        }
        if (this.db.objectStoreNames.contains('migrated_stores')) {
            storeNames.push('migrated_stores');
        }

        if (storeNames.length === 0) {
            Utils.log('삭제할 캐시 스토어가 없습니다.');
            return;
        }

        const transaction = this.db.transaction(storeNames, 'readwrite');
        const clearPromises = [];

        storeNames.forEach((storeName) => {
            const store = transaction.objectStore(storeName);
            clearPromises.push(this.promisifyRequest(store.clear()));
        });

        await Promise.all(clearPromises);
        Utils.log('모든 캐시 데이터가 삭제되었습니다:', storeNames);
    }

    // Promise로 변환
    promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 마이그레이션된 가맹점 데이터 저장
    async saveMigratedStores(stores) {
        if (!this.db) {
            await this.init();
        }

        try {
            const transaction = this.db.transaction(['migrated_stores'], 'readwrite');
            const store = transaction.objectStore('migrated_stores');

            // 기존 데이터 삭제
            await this.promisifyRequest(store.clear());

            // 배치 저장 (에러 방지를 위해 하나씩 처리)
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < stores.length; i++) {
                try {
                    const storeData = stores[i];

                    // 데이터 검증
                    if (!storeData || typeof storeData !== 'object') {
                        Utils.warn(`인덱스 ${i}: 유효하지 않은 데이터 건너뜀`);
                        errorCount++;
                        continue;
                    }

                    // 안전한 저장을 위한 키 설정
                    const safeStoreData = {
                        ...storeData,
                        id: i // 명시적 키 추가
                    };

                    await this.promisifyRequest(store.put(safeStoreData));
                    successCount++;

                    // 100개마다 진행상황 로그
                    if (i > 0 && i % 1000 === 0) {
                        Utils.log(`저장 진행률: ${i}/${stores.length}`);
                    }
                } catch (itemError) {
                    Utils.warn(`인덱스 ${i} 저장 실패:`, itemError);
                    errorCount++;
                }
            }

            Utils.log(
                `마이그레이션된 가맹점 데이터 저장 완료: 성공 ${successCount}개, 실패 ${errorCount}개`
            );

            if (errorCount > 0 && successCount === 0) {
                throw new Error(`모든 데이터 저장 실패: ${errorCount}개 항목`);
            }
        } catch (error) {
            Utils.error('마이그레이션된 가맹점 데이터 저장 실패:', error);
            throw error;
        }
    }

    // 마이그레이션된 가맹점 데이터 조회
    async getMigratedStores() {
        if (!this.db) {
            await this.init();
        }

        // migrated_stores 스토어가 있는지 확인
        if (!this.db.objectStoreNames.contains('migrated_stores')) {
            Utils.log('migrated_stores 스토어가 없습니다. 재마이그레이션이 필요합니다.');
            return [];
        }

        try {
            const transaction = this.db.transaction(['migrated_stores'], 'readonly');
            const store = transaction.objectStore('migrated_stores');

            const results = await this.promisifyRequest(store.getAll());

            // 안전한 데이터 반환 (undefined 필터링)
            return results.filter((item) => item && typeof item === 'object');
        } catch (error) {
            // 마이그레이션 데이터가 없을 수 있음
            Utils.log('마이그레이션된 가맹점 데이터를 읽을 수 없습니다:', error);
            return [];
        }
    }

    // 데이터베이스 닫기
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
        }
    }
}

// 싱글톤 인스턴스
export const storageManager = new StorageManager();

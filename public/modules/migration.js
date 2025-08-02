// 기존 캐시 데이터 마이그레이션
import { Utils } from './utils.js';

export class CacheMigration {
    constructor() {
        this.oldDBName = 'EunpyeongStoreDB';
        this.oldDBVersion = 2;
        this.newDBName = 'StoreLocationCache';
        this.newDBVersion = 2; // 버전 업그레이드
        this.migrationVersion = 'v2.1.0'; // 마이그레이션 버전 추가
    }

    // 마이그레이션 실행
    async migrate() {
        try {
            Utils.log(`캐시 마이그레이션 시작 (${this.migrationVersion})...`);

            // 마이그레이션 이미 완료되었는지 확인
            if (await this.isMigrationCompleted()) {
                Utils.log('마이그레이션이 이미 완료되었습니다.');
                return true;
            }

            // 기존 데이터베이스 확인 및 데이터 읽기
            const oldData = await this.readOldDataSafely();
            if (!oldData || oldData.stores.length === 0) {
                Utils.log('마이그레이션할 데이터가 없습니다.');
                await this.markMigrationCompleted();
                return false;
            }

            Utils.log(`마이그레이션할 데이터: ${oldData.stores.length}개`);

            // 새 형식으로 변환
            const migrationData = this.transformData(oldData);

            // 새 데이터베이스에 저장
            const result = await this.saveToNewDB(migrationData);

            // 마이그레이션 완료 표시
            await this.markMigrationCompleted();

            Utils.log(
                `캐시 마이그레이션 완료! 총 ${result.totalStores}개 가맹점, ${result.locations}개 위치 정보`
            );
            return true;
        } catch (error) {
            Utils.error('마이그레이션 중 오류:', error);
            // 부분적 마이그레이션이라도 성공했다면 실패로 처리하지 않음
            return false;
        }
    }

    // 마이그레이션 완료 여부 확인
    isMigrationCompleted() {
        try {
            const migrationInfo = localStorage.getItem('cache_migration_info');
            if (!migrationInfo) {
                return false;
            }

            const info = JSON.parse(migrationInfo);
            return info.version === this.migrationVersion && info.completed === true;
        } catch {
            return false;
        }
    }

    // 마이그레이션 완료 표시
    markMigrationCompleted() {
        try {
            const migrationInfo = {
                version: this.migrationVersion,
                completed: true,
                timestamp: Date.now(),
                oldDBName: this.oldDBName,
                newDBName: this.newDBName
            };
            localStorage.setItem('cache_migration_info', JSON.stringify(migrationInfo));
        } catch (error) {
            Utils.warn('마이그레이션 완료 표시 실패:', error);
        }
    }

    // 안전한 기존 데이터 읽기
    async readOldDataSafely() {
        try {
            // 기존 데이터베이스 존재 확인
            const hasOldDB = await this.checkOldDatabaseExists();
            if (!hasOldDB) {
                Utils.log('기존 캐시 데이터베이스가 없습니다.');
                return null;
            }

            // 여러 버전에서 데이터 읽기 시도
            for (let version = this.oldDBVersion; version >= 1; version--) {
                try {
                    const data = await this.readOldDataFromVersion(version);
                    if (data && data.stores.length > 0) {
                        Utils.log(`버전 ${version}에서 ${data.stores.length}개 데이터 발견`);
                        return data;
                    }
                } catch (versionError) {
                    Utils.log(`버전 ${version} 읽기 실패:`, versionError.message);
                }
            }

            return null;
        } catch (error) {
            Utils.error('기존 데이터 읽기 실패:', error);
            return null;
        }
    }

    // 기존 데이터베이스 존재 확인
    async checkOldDatabaseExists() {
        try {
            if (indexedDB.databases) {
                const databases = await indexedDB.databases();
                return databases.some((db) => db.name === this.oldDBName);
            } else {
                // databases() API가 없으면 직접 열어보기
                return new Promise((resolve) => {
                    const testReq = indexedDB.open(this.oldDBName);
                    testReq.onsuccess = () => {
                        testReq.result.close();
                        resolve(true);
                    };
                    testReq.onerror = () => resolve(false);
                    testReq.onblocked = () => resolve(false);
                });
            }
        } catch {
            return false;
        }
    }

    // 특정 버전에서 데이터 읽기
    readOldDataFromVersion(version) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.oldDBName, version);

            request.onsuccess = (event) => {
                const db = event.target.result;

                try {
                    // stores 오브젝트 스토어가 있는지 확인
                    if (!db.objectStoreNames.contains('stores')) {
                        db.close();
                        reject(new Error('stores 오브젝트 스토어가 없습니다'));
                        return;
                    }

                    const transaction = db.transaction(['stores'], 'readonly');
                    const storeObjectStore = transaction.objectStore('stores');
                    const getAllRequest = storeObjectStore.getAll();

                    getAllRequest.onsuccess = () => {
                        const stores = getAllRequest.result || [];
                        db.close();
                        resolve({ stores });
                    };

                    getAllRequest.onerror = () => {
                        db.close();
                        reject(getAllRequest.error);
                    };

                    transaction.onerror = () => {
                        db.close();
                        reject(transaction.error);
                    };
                } catch (error) {
                    db.close();
                    reject(error);
                }
            };

            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('데이터베이스가 차단되었습니다'));
        });
    }

    // 데이터 변환 (개선된 버전)
    transformData(oldData) {
        const locations = new Map();
        const categories = new Map();
        const stores = [];

        let processedCount = 0;
        let locationCount = 0;
        let categoryCount = 0;

        Utils.log(`데이터 변환 시작: ${oldData.stores.length}개 처리 예정`);

        oldData.stores.forEach((store, index) => {
            try {
                // 필수 필드 검증
                if (!store || typeof store !== 'object') {
                    Utils.warn(`인덱스 ${index}: 유효하지 않은 데이터 건너뜀`);
                    return;
                }

                const 행정동 = store.행정동 || store.읍면동명 || store.dong || '';
                const 상호 = store.상호 || store.storeName || store.name || '';

                if (!행정동 || !상호) {
                    Utils.warn(
                        `인덱스 ${index}: 필수 필드 누락 (행정동: ${행정동}, 상호: ${상호})`
                    );
                    return;
                }

                // 모든 가맹점 데이터를 stores 배열에 추가 (개선된 구조)
                const storeData = {
                    id: index,
                    행정동: 행정동,
                    상호: 상호,
                    상세주소: store.상세주소 || store.address || '',
                    원본데이터: store.원본데이터 || store,
                    인덱스: store.인덱스 || index,
                    검색결과: store.검색결과 || 'Unknown',
                    coords: store.coords || null,
                    foundAddress: store.foundAddress || '',
                    category: store.category || store.표준산업분류명 || '',
                    migrationTimestamp: Date.now(),
                    migrationVersion: this.migrationVersion
                };

                stores.push(storeData);
                processedCount++;

                // 위치 정보가 있는 경우만 locations에 추가
                if (this.hasValidCoordinates(store)) {
                    const key = `${행정동}_${상호}`;
                    const coords = this.extractCoordinates(store.coords);

                    if (coords) {
                        const locationData = {
                            lat: coords.lat,
                            lng: coords.lng,
                            roadAddress: store.foundAddress || store.roadAddress || '',
                            jibunAddress:
                                store.상세주소 || store.jibunAddress || store.address || ''
                        };

                        locations.set(key, locationData);
                        locationCount++;
                    }
                }

                // 카테고리 정보 수집 (개선된 로직)
                const categoryInfo = this.extractCategoryInfo(store);
                if (categoryInfo) {
                    categories.set(categoryInfo.code, categoryInfo.name);
                    categoryCount++;
                }

                // 진행 상황 로그 (1000개마다)
                if (processedCount > 0 && processedCount % 1000 === 0) {
                    Utils.log(`변환 진행률: ${processedCount}/${oldData.stores.length}`);
                }
            } catch (itemError) {
                Utils.warn(`인덱스 ${index} 변환 실패:`, itemError);
            }
        });

        Utils.log(
            `데이터 변환 완료: 가맹점 ${processedCount}개, 위치 ${locationCount}개, 카테고리 ${categoryCount}개`
        );

        return {
            locations,
            categories,
            stores,
            stats: {
                total: oldData.stores.length,
                processed: processedCount,
                locations: locationCount,
                categories: categoryCount
            }
        };
    }

    // 유효한 좌표 정보 확인
    hasValidCoordinates(store) {
        if (!store.coords) {
            return false;
        }
        if (!(store.검색결과 === '찾음' || store.검색결과 === 'FOUND')) {
            return false;
        }
        return this.extractCoordinates(store.coords) !== null;
    }

    // 좌표 정보 추출 (여러 형식 지원)
    extractCoordinates(coords) {
        if (!coords || typeof coords !== 'object') {
            return null;
        }

        let lat, lng;

        // 표준 형식 (lat, lng)
        if (typeof coords.lat === 'number' && typeof coords.lng === 'number') {
            lat = coords.lat;
            lng = coords.lng;
        }
        // Kakao Maps 내부 형식 (Ma=lat, La=lng)
        else if (typeof coords.Ma === 'number' && typeof coords.La === 'number') {
            lat = coords.Ma;
            lng = coords.La;
        }
        // 다른 가능한 형식들
        else if (typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
            lat = coords.latitude;
            lng = coords.longitude;
        } else if (typeof coords.y === 'number' && typeof coords.x === 'number') {
            lat = coords.y;
            lng = coords.x;
        } else {
            return null;
        }

        // 유효성 검증 (한국 좌표 범위)
        if (lat < 33 || lat > 43 || lng < 124 || lng > 132) {
            Utils.warn(`좌표 범위 오류: lat=${lat}, lng=${lng}`);
            return null;
        }

        return { lat, lng };
    }

    // 카테고리 정보 추출
    extractCategoryInfo(store) {
        const category = store.category || store.표준산업분류명 || '';
        if (!category) {
            return null;
        }

        const mainCategory = category.split(' > ')[0].trim();
        if (!mainCategory) {
            return null;
        }

        // 카테고리 코드 매핑 (필요시)
        const categoryCode = this.getCategoryCode(mainCategory);

        return {
            code: categoryCode,
            name: mainCategory
        };
    }

    // 카테고리 코드 생성
    getCategoryCode(categoryName) {
        // 간단한 카테고리 코드 매핑
        const categoryMap = {
            음식점: 'FD6',
            편의점: 'CS2',
            카페: 'CE7',
            병원: 'HP8',
            약국: 'PM9',
            학원: 'AC5',
            미용실: 'MT1',
            주유소: 'OL7'
        };

        return categoryMap[categoryName] || categoryName.substring(0, 3).toUpperCase();
    }

    // 새 데이터베이스에 저장
    saveToNewDB(migrationData) {
        const { locations, categories, stores } = migrationData;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.newDBName, this.newDBVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // locations 스토어
                if (!db.objectStoreNames.contains('locations')) {
                    const locationStore = db.createObjectStore('locations', {
                        keyPath: 'id'
                    });
                    locationStore.createIndex('store_dong', ['store', 'dong'], { unique: false });
                    locationStore.createIndex('dong', 'dong', { unique: false });
                    locationStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // categories 스토어
                if (!db.objectStoreNames.contains('categories')) {
                    db.createObjectStore('categories', { keyPath: 'code' });
                }

                // 전체 가맹점 데이터 스토어 (마이그레이션 백업용)
                if (!db.objectStoreNames.contains('migrated_stores')) {
                    const storeObjectStore = db.createObjectStore('migrated_stores', {
                        keyPath: 'id'
                    });
                    storeObjectStore.createIndex('dong', 'dong', { unique: false });
                    storeObjectStore.createIndex('store', 'store', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;

                try {
                    const transaction = db.transaction(
                        ['locations', 'categories', 'migrated_stores'],
                        'readwrite'
                    );
                    const locationStore = transaction.objectStore('locations');
                    const categoryStore = transaction.objectStore('categories');
                    const migratedStore = transaction.objectStore('migrated_stores');

                    // 위치 정보 저장
                    for (const [key, location] of locations) {
                        const [dong, store] = key.split('_');
                        const data = {
                            id: key,
                            store: store,
                            dong: dong,
                            location: location,
                            timestamp: Date.now()
                        };
                        locationStore.put(data);
                    }

                    // 카테고리 정보 저장
                    for (const [code, name] of categories) {
                        categoryStore.put({ code, name });
                    }

                    // 전체 가맹점 데이터 저장
                    stores.forEach((store, index) => {
                        migratedStore.put({
                            id: `migrated_${store.인덱스 || index}`,
                            dong: store.행정동,
                            store: store.상호,
                            address: store.상세주소,
                            data: store,
                            timestamp: Date.now()
                        });
                    });

                    transaction.oncomplete = () => {
                        Utils.log(
                            `총 ${stores.length}개의 가맹점 중 ${locations.size}개의 위치 정보와 ${categories.size}개의 카테고리를 마이그레이션했습니다.`
                        );
                        db.close();
                        resolve({
                            totalStores: stores.length,
                            locations: locations.size,
                            categories: categories.size
                        });
                    };

                    transaction.onerror = () => {
                        db.close();
                        reject(transaction.error);
                    };
                } catch (error) {
                    db.close();
                    reject(error);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    // 기존 데이터베이스 삭제 (선택사항)
    deleteOldDB() {
        return new Promise((resolve, reject) => {
            const deleteReq = indexedDB.deleteDatabase(this.oldDBName);
            deleteReq.onsuccess = () => {
                Utils.log('기존 데이터베이스를 삭제했습니다.');
                resolve();
            };
            deleteReq.onerror = () => reject(deleteReq.error);
        });
    }
}

// 싱글톤 인스턴스
export const cacheMigration = new CacheMigration();

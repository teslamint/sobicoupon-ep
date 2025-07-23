// 기존 캐시 데이터 마이그레이션
import { Utils } from './utils.js';

export class CacheMigration {
    constructor() {
        this.oldDBName = 'EunpyeongStoreDB';
        this.oldDBVersion = 2;
        this.newDBName = 'StoreLocationCache';
        this.newDBVersion = 2; // 버전 업그레이드
    }

    // 마이그레이션 실행
    async migrate() {
        try {
            Utils.log('캐시 마이그레이션 시작...');

            // 기존 데이터베이스 확인 (databases() API가 없을 경우 직접 open 시도)
            let hasOldDB = false;
            if (indexedDB.databases) {
                const databases = await indexedDB.databases();
                hasOldDB = databases.some((db) => db.name === this.oldDBName);
            } else {
                // databases() API가 없으면 직접 열어보기
                try {
                    const testReq = indexedDB.open(this.oldDBName);
                    await new Promise((resolve, _reject) => {
                        testReq.onsuccess = () => {
                            testReq.result.close();
                            hasOldDB = true;
                            resolve();
                        };
                        testReq.onerror = () => {
                            hasOldDB = false;
                            resolve();
                        };
                    });
                } catch (e) {
                    hasOldDB = false;
                }
            }

            if (!hasOldDB) {
                Utils.log('기존 캐시 데이터가 없습니다.');
                return false;
            }

            // 기존 데이터 읽기
            const oldData = await this.readOldData();
            if (!oldData || oldData.stores.length === 0) {
                Utils.log('마이그레이션할 데이터가 없습니다.');
                return false;
            }

            Utils.log(`마이그레이션할 데이터: ${oldData.stores.length}개`);

            // 새 형식으로 변환
            const migrationData = this.transformData(oldData);

            // 새 데이터베이스에 저장
            await this.saveToNewDB(migrationData);

            Utils.log('캐시 마이그레이션 완료!');
            return true;
        } catch (error) {
            Utils.error('마이그레이션 중 오류:', error);
            return false;
        }
    }

    // 기존 데이터 읽기
    readOldData() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.oldDBName, this.oldDBVersion);

            request.onsuccess = (event) => {
                const db = event.target.result;

                try {
                    const transaction = db.transaction(['stores'], 'readonly');
                    const storeObjectStore = transaction.objectStore('stores');

                    const getAllRequest = storeObjectStore.getAll();

                    getAllRequest.onsuccess = () => {
                        const stores = getAllRequest.result;
                        db.close();
                        resolve({ stores });
                    };

                    getAllRequest.onerror = () => {
                        db.close();
                        reject(getAllRequest.error);
                    };
                } catch (error) {
                    db.close();
                    reject(error);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    // 데이터 변환
    transformData(oldData) {
        const locations = new Map();
        const categories = new Map();
        const stores = [];

        oldData.stores.forEach((store) => {
            // 모든 가맹점 데이터를 stores 배열에 추가
            stores.push({
                행정동: store.행정동,
                상호: store.상호,
                상세주소: store.상세주소 || '',
                원본데이터: store.원본데이터 || {},
                인덱스: store.인덱스,
                검색결과: store.검색결과,
                coords: store.coords,
                foundAddress: store.foundAddress,
                category: store.category
            });

            // 위치 정보가 있는 경우만 locations에 추가
            if (store.coords && store.검색결과 === '찾음') {
                // 새로운 키 형식: 읍면동명_상호
                const key = `${store.행정동}_${store.상호}`;

                // 좌표 정보 변환
                let lat, lng;
                if (store.coords.lat !== undefined && store.coords.lng !== undefined) {
                    lat = store.coords.lat;
                    lng = store.coords.lng;
                } else if (store.coords.Ma !== undefined && store.coords.La !== undefined) {
                    // Kakao Maps 내부 형식 (Ma=lat, La=lng)
                    lat = store.coords.Ma;
                    lng = store.coords.La;
                } else {
                    return; // 유효하지 않은 좌표는 건너뜀
                }

                const locationData = {
                    lat: lat,
                    lng: lng,
                    roadAddress: store.foundAddress || '',
                    jibunAddress: store.상세주소 || ''
                };

                locations.set(key, locationData);
            }

            // 카테고리 정보 수집
            if (store.category) {
                const mainCategory = store.category.split(' > ')[0];
                categories.set(mainCategory, mainCategory);
            }
        });

        return { locations, categories, stores };
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

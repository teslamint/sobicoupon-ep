/**
 * StorageManager 모듈 테스트
 */

import { StorageManager, storageManager } from '../public/modules/storage.js';
import { CONSTANTS } from '../public/modules/constants.js';
import { Utils } from '../public/modules/utils.js';
import { AppError } from '../public/modules/errors.js';
import 'fake-indexeddb/auto';

// Polyfill for structuredClone (required by fake-indexeddb)
if (!global.structuredClone) {
    global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Mock Utils
jest.mock('../public/modules/utils.js', () => ({
    Utils: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

// Mock migration module
jest.mock('../public/modules/migration.js', () => ({
    cacheMigration: {
        migrate: jest.fn().mockResolvedValue(true)
    }
}));

describe('StorageManager', () => {
    let storage;
    let testDbName;

    beforeEach(() => {
        // Create a unique database name for each test
        testDbName = `test_db_${Date.now()}_${Math.random()}`;
        
        // Mock CONSTANTS to use test database name
        const originalConstants = CONSTANTS.CACHE.DB_NAME;
        CONSTANTS.CACHE.DB_NAME = testDbName;
        
        // Create a new instance for each test
        storage = new StorageManager();
        
        // Clear all mocks
        jest.clearAllMocks();
    });

    afterEach(async () => {
        // Clean up database connections
        if (storage.db) {
            storage.db.close();
        }
    });

    describe('constructor', () => {
        test('should initialize with default values', () => {
            expect(storage.db).toBeNull();
            expect(storage.isInitialized).toBe(false);
            expect(storage.migrationCompleted).toBe(false);
        });
    });

    describe('init', () => {
        test('should initialize database successfully', async () => {
            await storage.init();
            
            expect(storage.isInitialized).toBe(true);
            expect(storage.db).not.toBeNull();
            expect(storage.db.name).toBe(CONSTANTS.CACHE.DB_NAME);
        });

        test('should not reinitialize if already initialized', async () => {
            await storage.init();
            const firstDb = storage.db;
            
            await storage.init();
            
            expect(storage.db).toBe(firstDb);
        });

        test('should handle migration when migrated_stores does not exist', async () => {
            const { cacheMigration } = require('../public/modules/migration.js');
            
            // Mock the database to not have migrated_stores initially
            const originalOpen = global.indexedDB.open;
            let upgradeNeeded = false;
            
            global.indexedDB.open = jest.fn().mockImplementation((name, version) => {
                const request = {
                    onerror: null,
                    onsuccess: null,
                    onupgradeneeded: null,
                    result: null
                };
                
                setTimeout(() => {
                    if (!upgradeNeeded) {
                        // First call - simulate existing DB without migrated_stores
                        const mockDb = {
                            objectStoreNames: {
                                contains: jest.fn().mockImplementation((storeName) => {
                                    return storeName !== 'migrated_stores'; // migrated_stores doesn't exist
                                })
                            },
                            close: jest.fn()
                        };
                        request.result = mockDb;
                        if (request.onsuccess) request.onsuccess();
                        upgradeNeeded = true;
                    } else {
                        // Second call after migration - simulate normal DB creation
                        const mockDb = {
                            objectStoreNames: {
                                contains: jest.fn().mockReturnValue(true)
                            },
                            transaction: jest.fn().mockReturnValue({
                                objectStore: jest.fn().mockReturnValue({
                                    put: jest.fn().mockReturnValue({ onsuccess: null, onerror: null }),
                                    get: jest.fn().mockReturnValue({ onsuccess: null, onerror: null }),
                                    getAll: jest.fn().mockReturnValue({ onsuccess: null, onerror: null }),
                                    clear: jest.fn().mockReturnValue({ onsuccess: null, onerror: null })
                                })
                            }),
                            close: jest.fn()
                        };
                        request.result = mockDb;
                        if (request.onsuccess) request.onsuccess();
                    }
                }, 0);
                
                return request;
            });
            
            await storage.init();
            
            expect(cacheMigration.migrate).toHaveBeenCalled();
            expect(storage.migrationCompleted).toBe(true);
            
            // Restore original
            global.indexedDB.open = originalOpen;
        });

        test('should throw AppError on database initialization failure', async () => {
            // Mock indexedDB.open to fail
            const originalOpen = global.indexedDB.open;
            global.indexedDB.open = jest.fn().mockImplementation(() => {
                const request = {
                    onerror: null,
                    onsuccess: null,
                    onupgradeneeded: null
                };
                setTimeout(() => {
                    if (request.onerror) {
                        request.error = new Error('Database error');
                        request.onerror();
                    }
                }, 0);
                return request;
            });

            await expect(storage.init()).rejects.toThrow(AppError);
            await expect(storage.init()).rejects.toThrow('IndexedDB 초기화 실패');
            
            // Restore original
            global.indexedDB.open = originalOpen;
        });
    });

    describe('waitForMigrationComplete', () => {
        test('should return true when migration is already completed', async () => {
            storage.migrationCompleted = true;
            
            const result = await storage.waitForMigrationComplete();
            
            expect(result).toBe(true);
        });

        test('should wait for migration to complete', async () => {
            // Simulate migration completing after a delay
            setTimeout(() => {
                storage.migrationCompleted = true;
            }, 50);
            
            const result = await storage.waitForMigrationComplete(1000);
            
            expect(result).toBe(true);
        });

        test('should timeout if migration does not complete', async () => {
            const result = await storage.waitForMigrationComplete(100);
            
            expect(result).toBe(false);
            expect(Utils.warn).toHaveBeenCalledWith('마이그레이션 완료 대기 시간 초과 (3초)');
        });

        test('should detect migration completion through database check', async () => {
            await storage.init();
            storage.migrationCompleted = false;
            
            // Simulate migrated_stores store existing
            const result = await storage.waitForMigrationComplete(1000);
            
            expect(result).toBe(true);
            expect(storage.migrationCompleted).toBe(true);
        });
    });

    describe('openDatabase', () => {
        test('should create object stores on upgrade', async () => {
            await storage.openDatabase();
            
            expect(storage.db.objectStoreNames.contains(CONSTANTS.CACHE.STORE_NAME)).toBe(true);
            expect(storage.db.objectStoreNames.contains(CONSTANTS.CACHE.CATEGORY_STORE_NAME)).toBe(true);
            expect(storage.db.objectStoreNames.contains('migrated_stores')).toBe(true);
        });
    });

    describe('saveLocation', () => {
        beforeEach(async () => {
            await storage.init();
        });

        test('should save location data successfully', async () => {
            const storeData = {
                상호: '테스트 상점',
                행정동: '테스트동',
                표준산업분류명: '음식점',
                도로명주소: '서울시 테스트구 테스트로 123'
            };
            const location = {
                lat: 37.5665,
                lng: 126.9780,
                roadAddress: '서울시 테스트구 테스트로 123',
                jibunAddress: '서울시 테스트구 테스트동 123'
            };

            await storage.saveLocation(storeData, location);

            // Verify data was saved
            const savedLocation = await storage.getLocation('테스트 상점', '테스트동');
            expect(savedLocation).toEqual(location);
        });

        test('should handle store data with 읍면동명 instead of 행정동', async () => {
            const storeData = {
                상호: '테스트 상점2',
                읍면동명: '테스트읍',
                표준산업분류명: '카페',
                지번주소: '서울시 테스트구 테스트읍 456'
            };
            const location = {
                lat: 37.5665,
                lng: 126.9780,
                roadAddress: null,
                jibunAddress: '서울시 테스트구 테스트읍 456'
            };

            await storage.saveLocation(storeData, location);

            const savedLocation = await storage.getLocation('테스트 상점2', '테스트읍');
            expect(savedLocation).toEqual(location);
        });

        test('should initialize database if not already initialized', async () => {
            const newStorage = new StorageManager();
            const storeData = {
                상호: '테스트 상점3',
                행정동: '테스트동3',
                표준산업분류명: '편의점',
                도로명주소: '서울시 테스트구 테스트로 789'
            };
            const location = {
                lat: 37.5665,
                lng: 126.9780,
                roadAddress: '서울시 테스트구 테스트로 789',
                jibunAddress: '서울시 테스트구 테스트동3 789'
            };

            await newStorage.saveLocation(storeData, location);

            expect(newStorage.isInitialized).toBe(true);
            
            // Clean up
            newStorage.close();
        });
    });

    describe('getLocation', () => {
        beforeEach(async () => {
            await storage.init();
        });

        test('should return location data for existing store', async () => {
            const storeData = {
                상호: '기존 상점',
                행정동: '기존동',
                표준산업분류명: '음식점',
                도로명주소: '서울시 기존구 기존로 123'
            };
            const location = {
                lat: 37.5665,
                lng: 126.9780,
                roadAddress: '서울시 기존구 기존로 123',
                jibunAddress: '서울시 기존구 기존동 123'
            };

            await storage.saveLocation(storeData, location);
            const result = await storage.getLocation('기존 상점', '기존동');

            expect(result).toEqual(location);
        });

        test('should return null for non-existing store', async () => {
            const result = await storage.getLocation('없는 상점', '없는동');
            expect(result).toBeNull();
        });

        test('should initialize database if not already initialized', async () => {
            const newStorage = new StorageManager();
            
            const result = await newStorage.getLocation('테스트', '테스트');
            
            expect(newStorage.isInitialized).toBe(true);
            expect(result).toBeNull();
            
            // Clean up
            newStorage.close();
        });
    });

    describe('getAllLocations', () => {
        beforeEach(async () => {
            await storage.init();
        });

        test('should return all stored locations as Map', async () => {
            const testData = [
                {
                    storeData: { 상호: '상점1', 행정동: '동1', 표준산업분류명: '음식점', 도로명주소: '주소1' },
                    location: { lat: 37.1, lng: 126.1, roadAddress: '주소1', jibunAddress: '지번1' }
                },
                {
                    storeData: { 상호: '상점2', 행정동: '동2', 표준산업분류명: '카페', 도로명주소: '주소2' },
                    location: { lat: 37.2, lng: 126.2, roadAddress: '주소2', jibunAddress: '지번2' }
                }
            ];

            // Save test data
            for (const data of testData) {
                await storage.saveLocation(data.storeData, data.location);
            }

            const result = await storage.getAllLocations();

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(2);
            expect(result.get('동1_상점1')).toEqual(testData[0].location);
            expect(result.get('동2_상점2')).toEqual(testData[1].location);
        });

        test('should return empty Map when no locations stored', async () => {
            const result = await storage.getAllLocations();
            
            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);
        });
    });

    describe('saveCategories', () => {
        beforeEach(async () => {
            await storage.init();
        });

        test('should save categories successfully', async () => {
            const categories = new Map([
                ['C001', '음식점'],
                ['C002', '카페'],
                ['C003', '편의점']
            ]);

            await storage.saveCategories(categories);

            const savedCategories = await storage.getCategories();
            expect(savedCategories).toEqual(categories);
        });

        test('should handle empty categories Map', async () => {
            const categories = new Map();

            await storage.saveCategories(categories);

            const savedCategories = await storage.getCategories();
            expect(savedCategories.size).toBe(0);
        });
    });

    describe('getCategories', () => {
        beforeEach(async () => {
            await storage.init();
        });

        test('should return saved categories as Map', async () => {
            const categories = new Map([
                ['C001', '음식점'],
                ['C002', '카페']
            ]);

            await storage.saveCategories(categories);
            const result = await storage.getCategories();

            expect(result).toBeInstanceOf(Map);
            expect(result.get('C001')).toBe('음식점');
            expect(result.get('C002')).toBe('카페');
        });

        test('should return empty Map when no categories stored', async () => {
            const result = await storage.getCategories();
            
            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);
        });
    });

    describe('clearCache', () => {
        beforeEach(async () => {
            await storage.init();
        });

        test('should clear all cache stores', async () => {
            // Add some test data
            const storeData = { 상호: '테스트', 행정동: '테스트동', 표준산업분류명: '음식점', 도로명주소: '주소' };
            const location = { lat: 37.5, lng: 126.9, roadAddress: '주소', jibunAddress: '지번' };
            const categories = new Map([['C001', '음식점']]);

            await storage.saveLocation(storeData, location);
            await storage.saveCategories(categories);

            // Clear cache
            await storage.clearCache();

            // Verify data is cleared
            const locations = await storage.getAllLocations();
            const savedCategories = await storage.getCategories();

            expect(locations.size).toBe(0);
            expect(savedCategories.size).toBe(0);
            expect(Utils.log).toHaveBeenCalledWith(
                '모든 캐시 데이터가 삭제되었습니다:',
                expect.arrayContaining([CONSTANTS.CACHE.STORE_NAME, CONSTANTS.CACHE.CATEGORY_STORE_NAME, 'migrated_stores'])
            );
        });

        test('should handle case when no stores exist', async () => {
            // Create a storage with no object stores
            const newStorage = new StorageManager();
            
            // Mock database with no object stores
            await newStorage.init();
            
            // Mock objectStoreNames to return empty list
            const originalContains = newStorage.db.objectStoreNames.contains;
            newStorage.db.objectStoreNames.contains = jest.fn().mockReturnValue(false);

            await newStorage.clearCache();

            expect(Utils.log).toHaveBeenCalledWith('삭제할 캐시 스토어가 없습니다.');
            
            // Restore
            newStorage.db.objectStoreNames.contains = originalContains;
            newStorage.close();
        });
    });

    describe('saveMigratedStores', () => {
        beforeEach(async () => {
            await storage.init();
        });

        test('should save migrated stores successfully', async () => {
            const stores = [
                { 상호: '상점1', 행정동: '동1', 표준산업분류명: '음식점' },
                { 상호: '상점2', 행정동: '동2', 표준산업분류명: '카페' },
                { 상호: '상점3', 행정동: '동3', 표준산업분류명: '편의점' }
            ];

            await storage.saveMigratedStores(stores);

            const savedStores = await storage.getMigratedStores();
            expect(savedStores).toHaveLength(3);
            expect(savedStores[0]).toMatchObject({ ...stores[0], id: 0 });
            expect(savedStores[1]).toMatchObject({ ...stores[1], id: 1 });
            expect(savedStores[2]).toMatchObject({ ...stores[2], id: 2 });
        });

        test('should handle invalid data in stores array', async () => {
            const stores = [
                { 상호: '유효한상점', 행정동: '동1', 표준산업분류명: '음식점' },
                null, // invalid
                undefined, // invalid
                'invalid string', // invalid
                { 상호: '유효한상점2', 행정동: '동2', 표준산업분류명: '카페' }
            ];

            await storage.saveMigratedStores(stores);

            const savedStores = await storage.getMigratedStores();
            expect(savedStores).toHaveLength(2); // Only valid stores should be saved
            expect(Utils.warn).toHaveBeenCalledTimes(3); // 3 invalid items
        });

        test('should handle empty stores array', async () => {
            await storage.saveMigratedStores([]);

            const savedStores = await storage.getMigratedStores();
            expect(savedStores).toHaveLength(0);
        });

        test('should throw error when all stores fail to save', async () => {
            const stores = [null, undefined, 'invalid'];

            await expect(storage.saveMigratedStores(stores)).rejects.toThrow('모든 데이터 저장 실패');
        });
    });

    describe('getMigratedStores', () => {
        beforeEach(async () => {
            await storage.init();
        });

        test('should return migrated stores', async () => {
            const stores = [
                { 상호: '상점1', 행정동: '동1' },
                { 상호: '상점2', 행정동: '동2' }
            ];

            await storage.saveMigratedStores(stores);
            const result = await storage.getMigratedStores();

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject(stores[0]);
            expect(result[1]).toMatchObject(stores[1]);
        });

        test('should return empty array when no migrated stores exist', async () => {
            const result = await storage.getMigratedStores();
            expect(result).toEqual([]);
        });

        test('should handle missing migrated_stores object store', async () => {
            // Mock database without migrated_stores
            const originalContains = storage.db.objectStoreNames.contains;
            storage.db.objectStoreNames.contains = jest.fn().mockImplementation((name) => {
                if (name === 'migrated_stores') return false;
                return originalContains.call(storage.db.objectStoreNames, name);
            });

            const result = await storage.getMigratedStores();

            expect(result).toEqual([]);
            expect(Utils.log).toHaveBeenCalledWith('migrated_stores 스토어가 없습니다. 재마이그레이션이 필요합니다.');
            
            // Restore
            storage.db.objectStoreNames.contains = originalContains;
        });

        test('should filter out invalid data', async () => {
            // Manually add some invalid data to test filtering
            const transaction = storage.db.transaction(['migrated_stores'], 'readwrite');
            const store = transaction.objectStore('migrated_stores');
            
            await storage.promisifyRequest(store.put({ id: 0, 상호: '유효한상점' }));
            await storage.promisifyRequest(store.put({ id: 1 })); // Missing required fields but still an object
            
            const result = await storage.getMigratedStores();
            
            expect(result).toHaveLength(2); // Both should be returned as they are objects
            expect(result[0]).toMatchObject({ 상호: '유효한상점' });
        });
    });

    describe('close', () => {
        test('should close database connection', async () => {
            await storage.init();
            expect(storage.db).not.toBeNull();
            expect(storage.isInitialized).toBe(true);

            storage.close();

            expect(storage.db).toBeNull();
            expect(storage.isInitialized).toBe(false);
        });

        test('should handle closing when database is not open', () => {
            expect(() => storage.close()).not.toThrow();
        });
    });

    describe('promisifyRequest', () => {
        test('should resolve on successful request', async () => {
            const mockRequest = {
                result: 'test result',
                onsuccess: null,
                onerror: null
            };

            const promise = storage.promisifyRequest(mockRequest);
            
            // Simulate success
            setTimeout(() => {
                if (mockRequest.onsuccess) {
                    mockRequest.onsuccess();
                }
            }, 0);

            const result = await promise;
            expect(result).toBe('test result');
        });

        test('should reject on failed request', async () => {
            const mockRequest = {
                error: new Error('Request failed'),
                onsuccess: null,
                onerror: null
            };

            const promise = storage.promisifyRequest(mockRequest);
            
            // Simulate error
            setTimeout(() => {
                if (mockRequest.onerror) {
                    mockRequest.onerror();
                }
            }, 0);

            await expect(promise).rejects.toThrow('Request failed');
        });
    });

    describe('singleton instance', () => {
        test('should export singleton instance', () => {
            expect(storageManager).toBeInstanceOf(StorageManager);
        });
    });
});
/**
 * 캐시 마이그레이션 테스트
 */

import { cacheMigration } from '../public/modules/migration.js';

// MockIndexedDB 설정
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

global.indexedDB = new FDBFactory();
global.IDBKeyRange = FDBKeyRange;

// LocalStorage Mock
const localStorageMock = {
    store: {},
    getItem: function (key) {
        return this.store[key] || null;
    },
    setItem: function (key, value) {
        this.store[key] = String(value);
    },
    removeItem: function (key) {
        delete this.store[key];
    },
    clear: function () {
        this.store = {};
    }
};

global.localStorage = localStorageMock;

describe('CacheMigration', () => {
    beforeEach(() => {
        // LocalStorage 초기화
        localStorageMock.clear();

        // 콘솔 출력 모킹 (필요시)
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('마이그레이션 상태 관리', () => {
        test('마이그레이션 완료 표시 및 확인', async () => {
            // 초기 상태: 마이그레이션 미완료
            expect(await cacheMigration.isMigrationCompleted()).toBe(false);

            // 마이그레이션 완료 표시
            await cacheMigration.markMigrationCompleted();

            // 완료 상태 확인
            expect(await cacheMigration.isMigrationCompleted()).toBe(true);

            // LocalStorage에 정보 저장 확인
            const migrationInfo = JSON.parse(localStorage.getItem('cache_migration_info'));
            expect(migrationInfo).toEqual({
                version: 'v2.1.0',
                completed: true,
                timestamp: expect.any(Number),
                oldDBName: 'EunpyeongStoreDB',
                newDBName: 'StoreLocationCache'
            });
        });
    });

    describe('좌표 데이터 추출', () => {
        test('표준 형식 좌표 추출', () => {
            const coords = { lat: 37.6541, lng: 126.9197 };
            const result = cacheMigration.extractCoordinates(coords);

            expect(result).toEqual({
                lat: 37.6541,
                lng: 126.9197
            });
        });

        test('Kakao Maps 내부 형식 좌표 추출', () => {
            const coords = { Ma: 37.6541, La: 126.9197 };
            const result = cacheMigration.extractCoordinates(coords);

            expect(result).toEqual({
                lat: 37.6541,
                lng: 126.9197
            });
        });

        test('다양한 좌표 형식 지원', () => {
            // latitude/longitude 형식
            const coords1 = { latitude: 37.6541, longitude: 126.9197 };
            expect(cacheMigration.extractCoordinates(coords1)).toEqual({
                lat: 37.6541,
                lng: 126.9197
            });

            // x/y 형식
            const coords2 = { y: 37.6541, x: 126.9197 };
            expect(cacheMigration.extractCoordinates(coords2)).toEqual({
                lat: 37.6541,
                lng: 126.9197
            });
        });

        test('유효하지 않은 좌표 처리', () => {
            // null 또는 undefined
            expect(cacheMigration.extractCoordinates(null)).toBe(null);
            expect(cacheMigration.extractCoordinates(undefined)).toBe(null);

            // 빈 객체
            expect(cacheMigration.extractCoordinates({})).toBe(null);

            // 범위 밖 좌표 (한국 밖)
            expect(cacheMigration.extractCoordinates({ lat: 0, lng: 0 })).toBe(null);
            expect(cacheMigration.extractCoordinates({ lat: 50, lng: 200 })).toBe(null);
        });
    });

    describe('카테고리 정보 추출', () => {
        test('카테고리 정보 추출 및 코드 매핑', () => {
            const store1 = { category: '음식점 > 한식' };
            const result1 = cacheMigration.extractCategoryInfo(store1);
            expect(result1).toEqual({
                code: 'FD6',
                name: '음식점'
            });

            const store2 = { 표준산업분류명: '편의점' };
            const result2 = cacheMigration.extractCategoryInfo(store2);
            expect(result2).toEqual({
                code: 'CS2',
                name: '편의점'
            });
        });

        test('알려지지 않은 카테고리 처리', () => {
            const store = { category: '특수업종' };
            const result = cacheMigration.extractCategoryInfo(store);
            expect(result).toEqual({
                code: '특수업',
                name: '특수업종'
            });
        });

        test('카테고리 정보가 없는 경우', () => {
            const store = {};
            const result = cacheMigration.extractCategoryInfo(store);
            expect(result).toBe(null);
        });
    });

    describe('유효한 좌표 확인', () => {
        test('찾은 가맹점의 유효한 좌표', () => {
            const store = {
                검색결과: '찾음',
                coords: { lat: 37.6541, lng: 126.9197 }
            };
            expect(cacheMigration.hasValidCoordinates(store)).toBe(true);
        });

        test('찾지 못한 가맹점', () => {
            const store = {
                검색결과: '못찾음',
                coords: { lat: 37.6541, lng: 126.9197 }
            };
            expect(cacheMigration.hasValidCoordinates(store)).toBe(false);
        });

        test('좌표 정보가 없는 경우', () => {
            const store = {
                검색결과: '찾음',
                coords: null
            };
            expect(cacheMigration.hasValidCoordinates(store)).toBe(false);
        });
    });

    describe('데이터 변환', () => {
        test('기본 데이터 변환', () => {
            const oldData = {
                stores: [
                    {
                        행정동: '녹번동',
                        상호: 'GS25녹번점',
                        상세주소: '서울시 은평구 녹번로 1',
                        검색결과: '찾음',
                        coords: { lat: 37.6541, lng: 126.9197 },
                        foundAddress: '서울 은평구 녹번로 1',
                        category: '편의점'
                    },
                    {
                        행정동: '불광동',
                        상호: '맘스터치',
                        상세주소: '서울시 은평구 불광로 2',
                        검색결과: '못찾음',
                        coords: null,
                        category: '음식점 > 패스트푸드'
                    }
                ]
            };

            const result = cacheMigration.transformData(oldData);

            // stores 배열 확인
            expect(result.stores).toHaveLength(2);
            expect(result.stores[0]).toEqual(
                expect.objectContaining({
                    행정동: '녹번동',
                    상호: 'GS25녹번점',
                    상세주소: '서울시 은평구 녹번로 1',
                    검색결과: '찾음'
                })
            );

            // locations Map 확인 (찾은 가맹점만)
            expect(result.locations.size).toBe(1);
            expect(result.locations.get('녹번동_GS25녹번점')).toEqual({
                lat: 37.6541,
                lng: 126.9197,
                roadAddress: '서울 은평구 녹번로 1',
                jibunAddress: '서울시 은평구 녹번로 1'
            });

            // categories Map 확인
            expect(result.categories.size).toBe(2);
            expect(result.categories.get('CS2')).toBe('편의점');
            expect(result.categories.get('FD6')).toBe('음식점');

            // 통계 확인
            expect(result.stats).toEqual({
                total: 2,
                processed: 2,
                locations: 1,
                categories: 2
            });
        });

        test('유효하지 않은 데이터 처리', () => {
            const oldData = {
                stores: [
                    null, // null 데이터
                    {}, // 빈 객체
                    { 행정동: '녹번동' }, // 상호 없음
                    { 상호: 'GS25' }, // 행정동 없음
                    {
                        행정동: '녹번동',
                        상호: 'GS25녹번점',
                        검색결과: '찾음',
                        coords: { lat: 37.6541, lng: 126.9197 }
                    } // 유효한 데이터
                ]
            };

            const result = cacheMigration.transformData(oldData);

            // 유효한 데이터만 처리됨
            expect(result.stores).toHaveLength(1);
            expect(result.stats.processed).toBe(1);
            expect(result.locations.size).toBe(1);
        });
    });

    describe('기존 데이터베이스 확인', () => {
        test('데이터베이스 존재하지 않는 경우', async () => {
            const exists = await cacheMigration.checkOldDatabaseExists();
            expect(exists).toBe(false);
        });
    });

    describe('전체 마이그레이션 프로세스', () => {
        test('데이터가 없는 경우 마이그레이션', async () => {
            // 마이그레이션 상태 초기화
            localStorage.removeItem('cache_migration_info');

            const result = await cacheMigration.migrate();

            // 데이터가 없으므로 false 반환하지만 완료 표시는 됨
            expect(result).toBe(false);
            expect(await cacheMigration.isMigrationCompleted()).toBe(true);
        });

        test('이미 완료된 마이그레이션', async () => {
            // 마이그레이션 완료 표시
            await cacheMigration.markMigrationCompleted();

            const result = await cacheMigration.migrate();
            expect(result).toBe(true);
        });
    });
});

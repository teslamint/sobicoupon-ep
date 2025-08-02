// 파일 처리 및 데이터 파싱
import { Utils } from './utils.js';
import { AppError, ErrorCodes } from './errors.js';
import { stateManager } from './state.js';
import { storageManager } from './storage.js';
import { uiManager } from './uiManager.js';

export class FileHandler {
    constructor() {
        this.workbook = null;
    }

    // 파일 처리
    async handleFile(file) {
        try {
            // 파일 검증
            Utils.validateExcelFile(file);

            // 파일 읽기
            const data = await this.readFile(file);

            // 엑셀 파싱
            const stores = this.parseExcel(data);

            if (!stores || stores.length === 0) {
                throw new AppError('유효한 데이터가 없습니다.', ErrorCodes.FILE_READ_ERROR);
            }

            // 캐시된 위치 정보 로드
            await this.loadCachedLocations(stores);

            // 카테고리 정보 추출 및 저장
            await this.extractAndSaveCategories(stores);

            // 가맹점 데이터를 데이터베이스에 저장 (마이그레이션용)
            await this.saveMigratedStores(stores);

            // 상태 업데이트
            stateManager.setState({
                stores: stores,
                filteredStores: stores,
                currentPage: 1
            });

            // 통계 업데이트
            this.updateStats(stores);

            return {
                success: true,
                count: stores.length,
                cached: stores.filter((s) => s.location).length
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            } else {
                throw new AppError(
                    '파일 처리 중 오류가 발생했습니다.',
                    ErrorCodes.FILE_READ_ERROR,
                    { originalError: error }
                );
            }
        }
    }

    // 파일 읽기
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));

            reader.readAsArrayBuffer(file);
        });
    }

    // 엑셀 파싱
    parseExcel(data) {
        try {
            // XLSX 라이브러리 확인
            if (!window.XLSX) {
                throw new Error('XLSX 라이브러리가 로드되지 않았습니다.');
            }

            // 워크북 읽기
            this.workbook = window.XLSX.read(data, { type: 'array' });

            // 모든 시트를 순회하며 데이터 수집 (기존 방식 지원)
            const stores = [];
            let index = 0;

            this.workbook.SheetNames.forEach((sheetName) => {
                const worksheet = this.workbook.Sheets[sheetName];

                // JSON으로 변환
                const jsonData = window.XLSX.utils.sheet_to_json(worksheet, {
                    header: 1,
                    defval: ''
                });

                if (jsonData.length < 2) {
                    return; // 이 시트는 건너뜀
                }

                // 헤더와 데이터 분리
                const headers = jsonData[0];
                const rows = jsonData.slice(1);

                // 필수 컬럼 확인
                const requiredColumns = this.getRequiredColumns();
                let columnIndexes;

                try {
                    columnIndexes = this.mapColumnIndexes(headers, requiredColumns);
                } catch (error) {
                    Utils.warn(`시트 '${sheetName}' 컬럼 매핑 실패:`, error);
                    return; // 이 시트는 건너뜀
                }

                // 데이터 변환
                let validCount = 0;
                let invalidCount = 0;

                rows.forEach((row) => {
                    try {
                        const store = this.parseRow(row, columnIndexes);
                        if (store) {
                            if (this.validateStore(store)) {
                                // 시트 이름을 행정동으로 사용 (기존 방식과 호환)
                                if (!store.읍면동명 || store.읍면동명 === '') {
                                    store.읍면동명 = sheetName;
                                    store.행정동 = sheetName;
                                }
                                store.인덱스 = index++;
                                stores.push(store);
                                validCount++;
                            } else {
                                invalidCount++;
                                if (invalidCount <= 3) {
                                    // 처음 3개 실패 케이스만 로그
                                    Utils.log('검증 실패한 데이터:', {
                                        상호: store.상호,
                                        주소: store.주소
                                    });
                                }
                            }
                        }
                    } catch {
                        invalidCount++;
                    }
                });

                Utils.log(`시트 '${sheetName}': 유효 ${validCount}개, 무효 ${invalidCount}개`);
            });

            return stores;
        } catch (error) {
            Utils.error('엑셀 파싱 중 오류:', error);
            throw new AppError('엑셀 파일 파싱 실패', ErrorCodes.FILE_READ_ERROR, {
                originalError: error
            });
        }
    }

    // 필수 컬럼 정의
    getRequiredColumns() {
        return {
            dong: ['읍면동명', '행정동', '동'],
            name: ['상호명', '상호', '업체명', '가맹점명'],
            category: ['표준산업분류명', '업종', '분류'],
            address: ['도로명주소', '주소', '소재지'],
            oldAddress: ['지번주소', '구주소', '번지']
        };
    }

    // 컬럼 인덱스 매핑
    mapColumnIndexes(headers, requiredColumns) {
        const indexes = {};

        Object.entries(requiredColumns).forEach(([key, possibleNames]) => {
            const index = headers.findIndex((header) =>
                possibleNames.some((name) => header && header.toString().includes(name))
            );

            // dong과 oldAddress는 선택사항
            if (index === -1 && key !== 'oldAddress' && key !== 'dong' && key !== 'category') {
                throw new Error(`필수 컬럼을 찾을 수 없습니다: ${possibleNames.join(', ')}`);
            }

            indexes[key] = index;
        });

        return indexes;
    }

    // 행 파싱
    parseRow(row, columnIndexes) {
        const store = {
            읍면동명: columnIndexes.dong !== -1 ? this.cleanValue(row[columnIndexes.dong]) : '',
            상호: this.cleanValue(row[columnIndexes.name]),
            표준산업분류명:
                columnIndexes.category !== -1 ? this.cleanValue(row[columnIndexes.category]) : '',
            도로명주소:
                columnIndexes.address !== -1 ? this.cleanValue(row[columnIndexes.address]) : '',
            지번주소:
                columnIndexes.oldAddress !== -1
                    ? this.cleanValue(row[columnIndexes.oldAddress])
                    : '',
            // 기존 app.js와의 호환성을 위한 필드 추가
            행정동: columnIndexes.dong !== -1 ? this.cleanValue(row[columnIndexes.dong]) : '', // 기존 캐시와 호환
            상세주소:
                (columnIndexes.address !== -1 ? this.cleanValue(row[columnIndexes.address]) : '') ||
                (columnIndexes.oldAddress !== -1
                    ? this.cleanValue(row[columnIndexes.oldAddress])
                    : '') ||
                '',
            location: null,
            searched: false
        };

        return store;
    }

    // 값 정리
    cleanValue(value) {
        if (value === null || value === undefined) {
            return '';
        }

        return value
            .toString()
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[\n\r\t]/g, ' ');
    }

    // 가맹점 데이터 검증
    validateStore(store) {
        // 필수 필드 확인
        if (!store.상호 || typeof store.상호 !== 'string') {
            return false;
        }

        // 보안 검증 - 위험한 패턴 차단
        const dangerousPatterns = [
            // 스크립트 공격 패턴
            /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
            /javascript:/gi,
            /vbscript:/gi,
            /on\w+\s*=/gi,

            // SQL Injection 패턴
            /(union\s+select|insert\s+into|update\s+set|delete\s+from|drop\s+table|create\s+table)/gi,

            // XSS 패턴
            /(alert\s*\(|confirm\s*\(|prompt\s*\()/gi,
            /<iframe|<object|<embed|<form/gi,

            // 파일 시스템 접근 패턴
            /(\.\.\/|\.\.\\|file:\/\/)/gi
        ];

        // 검증할 필드들
        const fieldsToValidate = [
            store.상호,
            store.주소,
            store.도로명주소,
            store.지번주소,
            store.표준산업분류명,
            store.카테고리,
            store.읍면동명
        ];

        // 각 필드에 대해 위험한 패턴 검사
        for (const field of fieldsToValidate) {
            if (field && typeof field === 'string') {
                // 길이 제한 (각 필드별 적절한 제한)
                if (field.length > 200) {
                    Utils.warn(`필드 길이가 너무 깁니다: ${field.substring(0, 50)}...`);
                    return false;
                }

                // 위험한 패턴 검사
                for (const pattern of dangerousPatterns) {
                    if (pattern.test(field)) {
                        Utils.warn(`위험한 패턴 발견: ${field.substring(0, 50)}...`);
                        return false;
                    }
                }

                // 위험한 문자만 차단하는 방식으로 변경 (더 관대함)
                // 제어 문자와 정말 위험한 문자만 차단 (괄호, 하이픈, 앰퍼샌드는 허용)
                // eslint-disable-next-line no-control-regex
                const dangerousChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F<>{}|`~]/;
                if (dangerousChars.test(field)) {
                    Utils.warn(`위험한 문자 포함: ${field.substring(0, 50)}...`);
                    return false;
                }
            }
        }

        // 상호명 추가 검증
        const storeName = String(store.상호).trim();
        if (storeName.length < 1 || storeName.length > 100) {
            return false;
        }

        // 은평구 데이터인지 확인 (행정동이 있는 경우만)
        if (store.읍면동명) {
            const validDongs = [
                '녹번동',
                '불광동',
                '갈현동',
                '구산동',
                '대조동',
                '응암동',
                '역촌동',
                '신사동',
                '증산동',
                '수색동',
                '진관동',
                '불광1동',
                '불광2동',
                '갈현1동',
                '갈현2동',
                '응암1동',
                '응암2동',
                '응암3동',
                '신사1동',
                '신사2동'
            ];

            const isValidDong = validDongs.some((dong) => String(store.읍면동명).includes(dong));

            if (!isValidDong) {
                Utils.warn(`알 수 없는 동 이름: ${store.읍면동명}`);
                // 경고만 출력하고 데이터는 허용 (다른 지역 데이터일 수 있음)
            }
        }

        // 주소 필드 검증
        if (store.주소 || store.도로명주소 || store.지번주소) {
            const addresses = [store.주소, store.도로명주소, store.지번주소].filter(Boolean);
            for (const addr of addresses) {
                if (typeof addr === 'string' && addr.length > 500) {
                    Utils.warn(`주소가 너무 깁니다: ${addr.substring(0, 50)}...`);
                    return false;
                }
            }
        }

        return true;
    }

    // 캐시된 위치 정보 로드
    async loadCachedLocations(stores) {
        try {
            const cachedLocations = await storageManager.getAllLocations();

            stores.forEach((store) => {
                const key = `${store.행정동 || store.읍면동명}_${store.상호}`;
                const cachedLocation = cachedLocations.get(key);

                if (cachedLocation) {
                    store.location = cachedLocation;
                    store.searched = true;
                }
            });
        } catch {
            // 캐시 로드 실패는 무시
        }
    }

    // 카테고리 정보 추출 및 저장
    async extractAndSaveCategories(stores) {
        const categories = new Map();

        // 고유 카테고리 추출
        stores.forEach((store) => {
            if (store.표준산업분류명) {
                const category = store.표준산업분류명.trim();
                if (!categories.has(category)) {
                    categories.set(category, category);
                }
            }
        });

        // 상태 업데이트
        stateManager.setState({ categories });

        // 캐시에 저장
        try {
            await storageManager.saveCategories(categories);
        } catch {
            // 카테고리 저장 실패는 무시
        }
    }

    // 통계 업데이트
    updateStats(stores) {
        // 기존 통계 (파일 처리용)
        const fileStats = {
            total: stores.length,
            dongs: new Set(stores.map((s) => s.읍면동명)).size,
            found: stores.filter((s) => s.location).length,
            notFound: stores.filter((s) => s.searched && !s.location).length
        };

        stateManager.setState({ fileStats });

        // UI 통계 카드 업데이트
        uiManager.updateStats(fileStats);

        // 검색 통계는 상태 관리자를 통해 업데이트 (순환 참조 방지)
        // searchManager.updateSearchStats()는 필터 적용 시 자동으로 호출됨
    }

    // 데이터 내보내기 (CSV)
    exportToCSV() {
        const state = stateManager.getState();
        const stores = state.filteredStores;

        if (stores.length === 0) {
            throw new Error('내보낼 데이터가 없습니다.');
        }

        // CSV 헤더
        const headers = [
            '행정동',
            '상호',
            '카테고리',
            '도로명주소',
            '지번주소',
            '위도',
            '경도',
            '검색상태'
        ];

        // CSV 데이터
        const rows = stores.map((store) => [
            store.읍면동명,
            store.상호,
            store.표준산업분류명 || '',
            store.도로명주소 || '',
            store.지번주소 || '',
            store.location ? store.location.lat : '',
            store.location ? store.location.lng : '',
            store.searched ? (store.location ? '검색완료' : '위치없음') : '미검색'
        ]);

        // BOM 추가 (한글 깨짐 방지)
        const BOM = '\uFEFF';
        const csvContent =
            BOM +
            [
                headers.join(','),
                ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
            ].join('\n');

        // 다운로드
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute(
            'download',
            `은평구_소비쿠폰_가맹점_${new Date().toISOString().slice(0, 10)}.csv`
        );
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }

    // 데이터 내보내기 (JSON)
    exportToJSON() {
        const state = stateManager.getState();
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            stats: state.stats,
            stores: state.filteredStores.map((store) => ({
                ...store,
                _searched: store.searched
            }))
        };

        const jsonContent = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute(
            'download',
            `은평구_소비쿠폰_가맹점_${new Date().toISOString().slice(0, 10)}.json`
        );
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }

    // 가맹점 데이터를 데이터베이스에 저장 (마이그레이션용)
    async saveMigratedStores(stores) {
        try {
            Utils.log(`${stores.length}개의 가맹점 데이터를 저장 중...`);

            // 데이터 형식 변환 및 안전한 직렬화
            const migratedData = stores.map((store, index) => {
                // IndexedDB에 안전한 데이터만 추출
                const safeData = {
                    인덱스: Number(store.인덱스) || index,
                    행정동: String(store.읍면동명 || store.행정동 || ''),
                    읍면동명: String(store.읍면동명 || store.행정동 || ''),
                    상호: String(store.상호 || ''),
                    category: String(store.표준산업분류명 || ''),
                    상세주소: String(store.도로명주소 || store.지번주소 || store.상세주소 || ''),
                    foundAddress: String(store.도로명주소 || ''),
                    검색결과: String(store.검색결과 || '미검색')
                };

                // undefined나 null 값을 빈 문자열로 변환
                Object.keys(safeData).forEach((key) => {
                    if (
                        safeData[key] === undefined ||
                        safeData[key] === null ||
                        safeData[key] === 'undefined' ||
                        safeData[key] === 'null'
                    ) {
                        if (key === '인덱스') {
                            safeData[key] = index;
                        } else {
                            safeData[key] = '';
                        }
                    }
                });

                return safeData;
            });

            // 데이터 검증 - 빈 상호명 제거
            const validData = migratedData.filter(
                (store) => store.상호 && store.상호.trim() !== ''
            );

            Utils.log(
                `${validData.length}개의 유효한 데이터를 저장합니다. (${migratedData.length - validData.length}개 필터됨)`
            );

            // storageManager를 통해 저장
            await storageManager.saveMigratedStores(validData);
            Utils.log('가맹점 데이터 저장 완료');
        } catch (error) {
            Utils.error('가맹점 데이터 저장 중 오류:', error);
            // 저장 실패해도 계속 진행 (사용자 경험을 위해)
        }
    }
}

// 싱글톤 인스턴스
export const fileHandler = new FileHandler();

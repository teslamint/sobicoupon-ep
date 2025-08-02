/**
 * 에러 복구 및 재시도 메커니즘
 * 네트워크 오류, API 실패 등에 대한 자동 복구 기능을 제공합니다.
 */

import { CONSTANTS } from './constants.js';
import { Utils } from './utils.js';
import { AppError, ErrorCodes } from './errors.js';

export class RecoveryManager {
    constructor() {
        this.retryQueue = new Map();
        this.failureStats = new Map();
        this.circuitBreakers = new Map();
    }

    /**
     * 재시도 가능한 함수 실행
     * @param {Function} fn - 실행할 함수
     * @param {object} options - 재시도 옵션
     * @returns {Promise} 실행 결과
     */
    async executeWithRetry(fn, options = {}) {
        const config = {
            maxRetries: options.maxRetries || CONSTANTS.API.MAX_RETRIES,
            delay: options.delay || CONSTANTS.API.RETRY_DELAY,
            backoff: options.backoff || 'exponential', // linear, exponential
            timeout: options.timeout || CONSTANTS.API.TIMEOUT,
            retryCondition: options.retryCondition || this.defaultRetryCondition,
            onRetry: options.onRetry,
            identifier: options.identifier || 'unknown'
        };

        // 서킷 브레이커 확인
        if (this.isCircuitOpen(config.identifier)) {
            throw new AppError(
                '서비스가 일시적으로 사용할 수 없습니다.',
                ErrorCodes.SERVICE_UNAVAILABLE,
                { identifier: config.identifier }
            );
        }

        let lastError;
        let attempt = 0;

        while (attempt <= config.maxRetries) {
            try {
                // 타임아웃 래핑
                const result = await this.withTimeout(fn(), config.timeout);

                // 성공 시 통계 업데이트
                this.recordSuccess(config.identifier);
                return result;
            } catch (error) {
                lastError = error;
                attempt++;

                // 재시도 조건 확인
                if (!config.retryCondition(error) || attempt > config.maxRetries) {
                    this.recordFailure(config.identifier, error);
                    break;
                }

                // 재시도 콜백 실행
                if (config.onRetry) {
                    config.onRetry(error, attempt);
                }

                Utils.warn(`재시도 ${attempt}/${config.maxRetries}:`, error.message);

                // 재시도 전 대기
                const delay = this.calculateDelay(config.delay, attempt, config.backoff);
                await Utils.delay(delay);
            }
        }

        // 모든 재시도 실패
        this.recordFailure(config.identifier, lastError);
        throw new AppError(
            `${config.maxRetries}번 재시도 후 실패`,
            ErrorCodes.MAX_RETRIES_EXCEEDED,
            {
                originalError: lastError,
                attempts: attempt,
                identifier: config.identifier
            }
        );
    }

    /**
     * 기본 재시도 조건
     * @param {Error} error - 발생한 에러
     * @returns {boolean} 재시도 여부
     */
    defaultRetryCondition(error) {
        // 네트워크 오류, 타임아웃, 일시적 서버 오류는 재시도
        const retryableErrors = [
            ErrorCodes.API_TIMEOUT,
            ErrorCodes.API_REQUEST_FAILED,
            ErrorCodes.NETWORK_ERROR,
            'NETWORK_ERROR',
            'TIMEOUT',
            'ABORT_ERR'
        ];

        if (error instanceof AppError) {
            return retryableErrors.includes(error.code);
        }

        // 네트워크 관련 일반 에러
        const errorMessage = error.message?.toLowerCase() || '';
        return (
            errorMessage.includes('network') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('fetch') ||
            errorMessage.includes('connection') ||
            error.name === 'NetworkError' ||
            error.name === 'TimeoutError' ||
            error.name === 'AbortError'
        );
    }

    /**
     * 대기 시간 계산
     * @param {number} baseDelay - 기본 대기시간
     * @param {number} attempt - 시도 횟수
     * @param {string} backoff - 백오프 전략
     * @returns {number} 계산된 대기시간
     */
    calculateDelay(baseDelay, attempt, backoff) {
        switch (backoff) {
            case 'linear':
                return baseDelay * attempt;
            case 'exponential':
                return baseDelay * Math.pow(2, attempt - 1);
            default:
                return baseDelay;
        }
    }

    /**
     * 타임아웃 래핑
     * @param {Promise} promise - 래핑할 프로미스
     * @param {number} timeout - 타임아웃 시간 (ms)
     * @returns {Promise} 타임아웃이 적용된 프로미스
     */
    withTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(
                        new AppError('요청 시간이 초과되었습니다.', ErrorCodes.API_TIMEOUT, {
                            timeout
                        })
                    );
                }, timeout);
            })
        ]);
    }

    /**
     * 성공 기록
     * @param {string} identifier - 서비스 식별자
     */
    recordSuccess(identifier) {
        // 서킷 브레이커 리셋
        if (this.circuitBreakers.has(identifier)) {
            const breaker = this.circuitBreakers.get(identifier);
            breaker.failures = 0;
            breaker.lastFailureTime = null;
            breaker.state = 'closed';
        }

        // 성공 통계 업데이트
        if (!this.failureStats.has(identifier)) {
            this.failureStats.set(identifier, { failures: 0, successes: 0 });
        }
        this.failureStats.get(identifier).successes++;
    }

    /**
     * 실패 기록
     * @param {string} identifier - 서비스 식별자
     * @param {Error} error - 발생한 에러
     */
    recordFailure(identifier, error) {
        if (!this.failureStats.has(identifier)) {
            this.failureStats.set(identifier, { failures: 0, successes: 0 });
        }

        const stats = this.failureStats.get(identifier);
        stats.failures++;

        // 서킷 브레이커 업데이트
        this.updateCircuitBreaker(identifier, error);
    }

    /**
     * 서킷 브레이커 업데이트
     * @param {string} identifier - 서비스 식별자
     * @param {Error} _error - 발생한 에러
     */
    updateCircuitBreaker(identifier, _error) {
        if (!this.circuitBreakers.has(identifier)) {
            this.circuitBreakers.set(identifier, {
                failures: 0,
                threshold: 5, // 5번 실패 시 서킷 오픈
                timeout: 60000, // 1분 후 재시도
                lastFailureTime: null,
                state: 'closed' // closed, open, half-open
            });
        }

        const breaker = this.circuitBreakers.get(identifier);
        breaker.failures++;
        breaker.lastFailureTime = Date.now();

        // 임계값 초과 시 서킷 오픈
        if (breaker.failures >= breaker.threshold) {
            breaker.state = 'open';
            Utils.warn(`서킷 브레이커 열림: ${identifier} (${breaker.failures}번 실패)`);
        }
    }

    /**
     * 서킷 브레이커 상태 확인
     * @param {string} identifier - 서비스 식별자
     * @returns {boolean} 서킷 열림 여부
     */
    isCircuitOpen(identifier) {
        const breaker = this.circuitBreakers.get(identifier);
        if (!breaker || breaker.state === 'closed') {
            return false;
        }

        // 타임아웃 후 half-open 상태로 전환
        if (breaker.state === 'open' && Date.now() - breaker.lastFailureTime > breaker.timeout) {
            breaker.state = 'half-open';
            Utils.log(`서킷 브레이커 half-open: ${identifier}`);
            return false;
        }

        return breaker.state === 'open';
    }

    /**
     * 자동 복구 실행
     * @param {Error} error - 발생한 에러
     * @param {object} _context - 컨텍스트 정보 (사용되지 않음)
     * @returns {Promise<boolean>} 복구 성공 여부
     */
    async attemptRecovery(error, _context = {}) {
        Utils.log('자동 복구 시도:', error.message);

        try {
            // 에러 타입별 복구 전략
            switch (error.code) {
                case ErrorCodes.API_KEY_MISSING:
                    return await this.recoverApiKey();

                case ErrorCodes.MAP_INIT_ERROR:
                    return await this.recoverMapInit();

                case ErrorCodes.CACHE_INIT_ERROR:
                    return await this.recoverCache();

                case ErrorCodes.NETWORK_ERROR:
                    return await this.recoverNetwork();

                default:
                    return false;
            }
        } catch (recoveryError) {
            Utils.error('복구 시도 중 오류:', recoveryError);
            return false;
        }
    }

    /**
     * API 키 복구
     */
    recoverApiKey() {
        // 메타 태그에서 API 키 재조회
        const metaKey = document.querySelector('meta[name="kakao-api-key"]');
        if (metaKey && metaKey.content) {
            window.KAKAO_API_KEY = metaKey.content;
            return true;
        }

        // 환경변수 재확인 (브라우저 환경에서는 사용 불가)
        // if (process?.env?.KAKAO_API_KEY) {
        //     window.KAKAO_API_KEY = process.env.KAKAO_API_KEY;
        //     return true;
        // }

        return false;
    }

    /**
     * 지도 초기화 복구
     */
    async recoverMapInit() {
        // 카카오맵 SDK 재로딩
        if (!window.kakao || !window.kakao.maps) {
            await this.reloadKakaoSDK();
            await Utils.delay(1000); // SDK 로딩 대기
        }

        // 지도 컨테이너 재확인
        const container = document.getElementById('map');
        if (!container) {
            Utils.error('지도 컨테이너가 없습니다.');
            return false;
        }

        return window.kakao && window.kakao.maps;
    }

    /**
     * 캐시 복구
     */
    async recoverCache() {
        try {
            // IndexedDB 재초기화
            if ('indexedDB' in window) {
                const request = indexedDB.deleteDatabase(CONSTANTS.CACHE.DB_NAME);
                await new Promise((resolve, reject) => {
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                    request.onblocked = () => reject(new Error('DB blocked'));
                });

                Utils.log('캐시 데이터베이스 재생성됨');
                return true;
            }
        } catch (error) {
            Utils.error('캐시 복구 실패:', error);
        }
        return false;
    }

    /**
     * 네트워크 복구
     */
    recoverNetwork() {
        // 네트워크 상태 확인
        if (navigator.onLine === false) {
            Utils.log('오프라인 상태 - 네트워크 연결 대기');

            return new Promise((resolve) => {
                const checkOnline = () => {
                    if (navigator.onLine) {
                        window.removeEventListener('online', checkOnline);
                        resolve(true);
                    }
                };
                window.addEventListener('online', checkOnline);

                // 30초 후 타임아웃
                setTimeout(() => {
                    window.removeEventListener('online', checkOnline);
                    resolve(false);
                }, 30000);
            });
        }

        return navigator.onLine;
    }

    /**
     * 카카오맵 SDK 재로딩
     */
    reloadKakaoSDK() {
        return new Promise((resolve, reject) => {
            // 기존 스크립트 제거
            const existingScript = document.querySelector('script[src*="dapi.kakao.com"]');
            if (existingScript) {
                existingScript.remove();
            }

            // 새 스크립트 로딩
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${window.KAKAO_API_KEY || '[KAKAO_API_KEY]'}&libraries=services,clusterer`;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('카카오맵 SDK 로딩 실패'));

            document.head.appendChild(script);
        });
    }

    /**
     * 통계 정보 조회
     * @returns {object} 실패/성공 통계
     */
    getStats() {
        const stats = {};
        for (const [identifier, data] of this.failureStats) {
            stats[identifier] = {
                ...data,
                successRate: data.successes / (data.successes + data.failures) || 0
            };
        }
        return stats;
    }

    /**
     * 리소스 정리
     */
    cleanup() {
        this.retryQueue.clear();
        this.failureStats.clear();
        this.circuitBreakers.clear();
    }
}

// 싱글톤 인스턴스
export const recoveryManager = new RecoveryManager();

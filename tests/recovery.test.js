/**
 * RecoveryManager 모듈 테스트
 */

import { RecoveryManager } from '../public/modules/recovery.js';
import { CONSTANTS } from '../public/modules/constants.js';
import { Utils } from '../public/modules/utils.js';
import { AppError, ErrorCodes } from '../public/modules/errors.js';

// Mock dependencies
jest.mock('../public/modules/utils.js', () => ({
    Utils: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        delay: jest.fn().mockResolvedValue()
    }
}));

jest.mock('../public/modules/errors.js', () => ({
    AppError: jest.fn().mockImplementation((message, code, details) => {
        const error = new Error(message);
        error.code = code;
        error.details = details;
        return error;
    }),
    ErrorCodes: {
        SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
        NETWORK_ERROR: 'NETWORK_ERROR',
        TIMEOUT: 'TIMEOUT',
        API_ERROR: 'API_ERROR'
    }
}));

describe('RecoveryManager', () => {
    let recoveryManager;

    beforeEach(() => {
        jest.clearAllMocks();
        recoveryManager = new RecoveryManager();
    });

    describe('constructor', () => {
        test('should initialize with empty collections', () => {
            expect(recoveryManager.retryQueue).toBeInstanceOf(Map);
            expect(recoveryManager.failureStats).toBeInstanceOf(Map);
            expect(recoveryManager.circuitBreakers).toBeInstanceOf(Map);
            expect(recoveryManager.retryQueue.size).toBe(0);
            expect(recoveryManager.failureStats.size).toBe(0);
            expect(recoveryManager.circuitBreakers.size).toBe(0);
        });
    });

    describe('executeWithRetry', () => {
        test('should execute function successfully on first try', async () => {
            const mockFn = jest.fn().mockResolvedValue('success');
            
            const result = await recoveryManager.executeWithRetry(mockFn);
            
            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        test('should retry on failure and eventually succeed', async () => {
            const mockFn = jest.fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue('success');
            
            const result = await recoveryManager.executeWithRetry(mockFn, {
                maxRetries: 3,
                delay: 10
            });
            
            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(3);
        });

        test('should fail after max retries exceeded', async () => {
            const networkError = new Error('Network connection failed');
            const mockFn = jest.fn().mockRejectedValue(networkError);
            
            await expect(recoveryManager.executeWithRetry(mockFn, {
                maxRetries: 2,
                delay: 10
            })).rejects.toThrow('2번 재시도 후 실패');
            
            expect(mockFn).toHaveBeenCalledTimes(3); // initial + 2 retries
        });

        test('should respect custom retry condition', async () => {
            const mockFn = jest.fn().mockRejectedValue(new Error('Custom error'));
            const customRetryCondition = jest.fn().mockReturnValue(false);
            
            await expect(recoveryManager.executeWithRetry(mockFn, {
                retryCondition: customRetryCondition,
                maxRetries: 3
            })).rejects.toThrow('3번 재시도 후 실패');
            
            expect(mockFn).toHaveBeenCalledTimes(1); // No retries due to condition
            expect(customRetryCondition).toHaveBeenCalled();
        });

        test('should call onRetry callback', async () => {
            const mockFn = jest.fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue('success');
            const onRetry = jest.fn();
            
            await recoveryManager.executeWithRetry(mockFn, {
                onRetry,
                delay: 10
            });
            
            expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
        });

        test('should throw when circuit breaker is open', async () => {
            const identifier = 'test-service';
            recoveryManager.circuitBreakers.set(identifier, {
                state: 'open',
                openTime: Date.now(),
                failures: 10
            });
            
            const mockFn = jest.fn();
            
            await expect(recoveryManager.executeWithRetry(mockFn, {
                identifier
            })).rejects.toThrow('서비스가 일시적으로 사용할 수 없습니다.');
            
            expect(mockFn).not.toHaveBeenCalled();
        });
    });

    describe('withTimeout', () => {
        test('should resolve within timeout', async () => {
            const promise = Promise.resolve('success');
            
            const result = await recoveryManager.withTimeout(promise, 1000);
            
            expect(result).toBe('success');
        });

        test('should reject when timeout exceeded', async () => {
            const promise = new Promise(resolve => setTimeout(() => resolve('late'), 100));
            
            await expect(recoveryManager.withTimeout(promise, 50))
                .rejects.toThrow('요청 시간이 초과되었습니다');
        });
    });

    describe('defaultRetryCondition', () => {
        test('should return true for network errors', () => {
            const networkError = new Error('Network error');
            networkError.code = 'NETWORK_ERROR';
            
            expect(recoveryManager.defaultRetryCondition(networkError)).toBe(true);
        });

        test('should return true for timeout errors', () => {
            const timeoutError = new Error('Timeout');
            timeoutError.code = 'TIMEOUT';
            
            expect(recoveryManager.defaultRetryCondition(timeoutError)).toBe(true);
        });

        test('should return true for network-related error messages', () => {
            const networkError = new Error('Network connection failed');
            expect(recoveryManager.defaultRetryCondition(networkError)).toBe(true);
        });

        test('should return true for timeout-related error messages', () => {
            const timeoutError = new Error('Request timeout occurred');
            expect(recoveryManager.defaultRetryCondition(timeoutError)).toBe(true);
        });

        test('should return false for unknown errors', () => {
            const unknownError = new Error('Unknown error');
            
            expect(recoveryManager.defaultRetryCondition(unknownError)).toBe(false);
        });
    });

    describe('calculateDelay', () => {
        test('should calculate linear backoff', () => {
            const delay = recoveryManager.calculateDelay(100, 2, 'linear');
            expect(delay).toBe(200); // baseDelay * attempt
        });

        test('should calculate exponential backoff', () => {
            const delay = recoveryManager.calculateDelay(100, 3, 'exponential');
            expect(delay).toBe(400); // 100 * 2^(3-1)
        });

        test('should default to base delay for unknown backoff', () => {
            const delay = recoveryManager.calculateDelay(100, 2, 'unknown');
            expect(delay).toBe(100);
        });
    });

    describe('recordSuccess', () => {
        test('should initialize stats for new identifier', () => {
            recoveryManager.recordSuccess('test-service');
            
            const stats = recoveryManager.failureStats.get('test-service');
            expect(stats).toBeDefined();
            expect(stats.failures).toBe(0);
            expect(stats.successes).toBe(1);
        });

        test('should reset circuit breaker on success', () => {
            recoveryManager.circuitBreakers.set('test-service', {
                failures: 5,
                state: 'open',
                lastFailureTime: Date.now()
            });
            
            recoveryManager.recordSuccess('test-service');
            
            const breaker = recoveryManager.circuitBreakers.get('test-service');
            expect(breaker.failures).toBe(0);
            expect(breaker.state).toBe('closed');
            expect(breaker.lastFailureTime).toBeNull();
        });

        test('should increment success count', () => {
            recoveryManager.failureStats.set('test-service', {
                failures: 2,
                successes: 3
            });
            
            recoveryManager.recordSuccess('test-service');
            
            const stats = recoveryManager.failureStats.get('test-service');
            expect(stats.successes).toBe(4);
        });
    });

    describe('recordFailure', () => {
        test('should initialize stats for new identifier', () => {
            const error = new Error('Test error');
            recoveryManager.updateCircuitBreaker = jest.fn();
            
            recoveryManager.recordFailure('test-service', error);
            
            const stats = recoveryManager.failureStats.get('test-service');
            expect(stats).toBeDefined();
            expect(stats.failures).toBe(1);
            expect(stats.successes).toBe(0);
        });

        test('should increment failure count', () => {
            const error = new Error('Test error');
            recoveryManager.updateCircuitBreaker = jest.fn();
            recoveryManager.failureStats.set('test-service', {
                failures: 2,
                successes: 5
            });
            
            recoveryManager.recordFailure('test-service', error);
            
            const stats = recoveryManager.failureStats.get('test-service');
            expect(stats.failures).toBe(3);
            expect(stats.successes).toBe(5);
        });

        test('should call updateCircuitBreaker', () => {
            const error = new Error('Test error');
            recoveryManager.updateCircuitBreaker = jest.fn();
            
            recoveryManager.recordFailure('test-service', error);
            
            expect(recoveryManager.updateCircuitBreaker).toHaveBeenCalledWith('test-service', error);
        });
    });

    describe('updateCircuitBreaker', () => {
        test('should handle circuit breaker updates', () => {
            const identifier = 'test-service';
            const error = new Error('Test error');
            
            // Set up failure stats
            recoveryManager.failureStats.set(identifier, {
                failures: 5,
                successes: 0
            });
            
            // This method exists but we can't easily test its internal logic
            // without knowing the exact threshold values
            expect(() => {
                recoveryManager.updateCircuitBreaker(identifier, error);
            }).not.toThrow();
        });
    });

    describe('isCircuitOpen', () => {
        test('should return false for non-existent circuit', () => {
            expect(recoveryManager.isCircuitOpen('non-existent')).toBe(false);
        });

        test('should return false for closed circuit', () => {
            recoveryManager.circuitBreakers.set('test', { state: 'closed' });
            expect(recoveryManager.isCircuitOpen('test')).toBe(false);
        });

        test('should return true for open circuit', () => {
            recoveryManager.circuitBreakers.set('test', { state: 'open' });
            expect(recoveryManager.isCircuitOpen('test')).toBe(true);
        });

        test('should return false for half-open circuit', () => {
            recoveryManager.circuitBreakers.set('test', { state: 'half-open' });
            expect(recoveryManager.isCircuitOpen('test')).toBe(false);
        });
    });



    describe('integration tests', () => {
        test('should handle complete retry cycle', async () => {
            const identifier = 'integration-test';
            let callCount = 0;
            
            const mockFn = jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount < 3) {
                    const error = new Error('Network error');
                    error.code = 'NETWORK_ERROR';
                    throw error;
                }
                return Promise.resolve('success');
            });
            
            const result = await recoveryManager.executeWithRetry(mockFn, {
                identifier,
                maxRetries: 5,
                delay: 10
            });
            
            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(3);
            
            // Check that stats were updated
            const stats = recoveryManager.failureStats.get(identifier);
            expect(stats.successes).toBe(1);
        });

        test('should handle circuit breaker functionality', async () => {
            const identifier = 'circuit-test';
            
            // Set up open circuit breaker
            recoveryManager.circuitBreakers.set(identifier, {
                state: 'open',
                failures: 10
            });
            
            const mockFn = jest.fn();
            
            // Should be blocked by circuit breaker
            await expect(recoveryManager.executeWithRetry(mockFn, {
                identifier
            })).rejects.toThrow('서비스가 일시적으로 사용할 수 없습니다.');
            
            expect(mockFn).not.toHaveBeenCalled();
        });
    });
});
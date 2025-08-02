// 에러 처리 시스템
import { Utils } from './utils.js';

export class AppError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date();
    }
}

export const ErrorCodes = {
    // 파일 관련
    FILE_INVALID_TYPE: 'FILE_INVALID_TYPE',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    FILE_READ_ERROR: 'FILE_READ_ERROR',

    // API 관련
    API_KEY_MISSING: 'API_KEY_MISSING',
    API_REQUEST_FAILED: 'API_REQUEST_FAILED',
    API_TIMEOUT: 'API_TIMEOUT',
    API_RATE_LIMIT: 'API_RATE_LIMIT',

    // 캐시 관련
    CACHE_INIT_ERROR: 'CACHE_INIT_ERROR',
    CACHE_READ_ERROR: 'CACHE_READ_ERROR',
    CACHE_WRITE_ERROR: 'CACHE_WRITE_ERROR',

    // 지도 관련
    MAP_INIT_ERROR: 'MAP_INIT_ERROR',
    MAP_SEARCH_ERROR: 'MAP_SEARCH_ERROR',
    MAP_BOUNDS_ERROR: 'MAP_BOUNDS_ERROR',
    LOCATION_NOT_FOUND: 'LOCATION_NOT_FOUND',

    // 검색 관련
    SEARCH_ERROR: 'SEARCH_ERROR',
    NO_DATA_ERROR: 'NO_DATA_ERROR',

    // 복구 관련
    MAX_RETRIES_EXCEEDED: 'MAX_RETRIES_EXCEEDED',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    NETWORK_ERROR: 'NETWORK_ERROR',

    // 일반
    INVALID_INPUT: 'INVALID_INPUT',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

export class ErrorHandler {
    static handlers = new Map();

    static register(code, handler) {
        this.handlers.set(code, handler);
    }

    static handle(error) {
        Utils.error('Error occurred:', error);

        // AppError 인스턴스인 경우
        if (error instanceof AppError) {
            const handler = this.handlers.get(error.code);
            if (handler) {
                handler(error);
            } else {
                this.showDefaultMessage(error);
            }
        } else {
            // 일반 에러
            this.showDefaultMessage(error);
        }

        // 에러 로깅 (프로덕션에서는 외부 서비스로 전송)
        this.logError(error);
    }

    static showDefaultMessage(error) {
        const message = this.getUserFriendlyMessage(error);
        this.showNotification(message, 'error');
    }

    static getUserFriendlyMessage(error) {
        const messages = {
            [ErrorCodes.FILE_INVALID_TYPE]: '엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.',
            [ErrorCodes.FILE_TOO_LARGE]: '파일 크기가 너무 큽니다. (최대 10MB)',
            [ErrorCodes.API_REQUEST_FAILED]: '요청 처리 중 오류가 발생했습니다.',
            [ErrorCodes.API_TIMEOUT]: '요청 시간이 초과되었습니다.',
            [ErrorCodes.API_RATE_LIMIT]: '너무 많은 요청을 보냈습니다. 잠시 후 다시 시도하세요.',
            [ErrorCodes.CACHE_INIT_ERROR]: '캐시 초기화에 실패했습니다.',
            [ErrorCodes.MAP_INIT_ERROR]: '지도를 불러올 수 없습니다.',
            [ErrorCodes.LOCATION_NOT_FOUND]: '위치를 찾을 수 없습니다.'
        };

        if (error instanceof AppError) {
            return messages[error.code] || error.message;
        }

        return '오류가 발생했습니다. 잠시 후 다시 시도하세요.';
    }

    static showNotification(message, type = 'error') {
        // 기존 알림 제거
        const existingNotification = document.querySelector('.error-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // 새 알림 생성
        const notification = document.createElement('div');
        notification.className = `error-notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'error' ? '#f44336' : '#4CAF50'};
            color: white;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        // 5초 후 자동 제거
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    static logError(error) {
        // 개발 환경에서는 콘솔에만 로깅
        const isDevelopment =
            window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isDevelopment) {
            /* eslint-disable no-console */
            console.group('Error Log');
            Utils.error('Error:', error);
            if (error instanceof AppError) {
                Utils.error('Code:', error.code);
                Utils.error('Details:', error.details);
                Utils.error('Timestamp:', error.timestamp);
            }
            console.trace();
            console.groupEnd();
            /* eslint-enable no-console */
        } else {
            // 프로덕션에서는 외부 에러 추적 서비스로 전송
            // 예: Sentry, LogRocket 등
        }
    }
}

// 기본 에러 핸들러 등록
ErrorHandler.register(ErrorCodes.FILE_INVALID_TYPE, () => {
    const input = document.getElementById('fileInput');
    if (input) {
        input.value = '';
    }
});

ErrorHandler.register(ErrorCodes.API_RATE_LIMIT, () => {
    // Rate limit 에러 시 검색 버튼 일시적으로 비활성화
    const searchBtn = document.getElementById('searchMapBtn');
    if (searchBtn) {
        searchBtn.disabled = true;
        setTimeout(() => {
            searchBtn.disabled = false;
        }, 10000);
    }
});

// CSS 애니메이션 추가
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

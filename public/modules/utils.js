// 유틸리티 함수들
import { CONSTANTS } from './constants.js';

export class Utils {
    // 조건부 로깅 시스템 - 프로덕션에서는 디버그 로그 제거
    static log(message, ...args) {
        if (this.isDebugMode()) {
            console.log(message, ...args); // eslint-disable-line no-console
        }
    }

    static warn(message, ...args) {
        if (this.isDebugMode()) {
            console.warn(message, ...args);
        }
    }

    static error(message, ...args) {
        // 에러는 항상 표시
        console.error(message, ...args);
    }

    static debug(message, ...args) {
        if (this.isDebugMode()) {
            console.debug(message, ...args); // eslint-disable-line no-console
        }
    }

    // 간단한 디버그 모드 체크 (순환 참조 방지)
    static isDebugMode() {
        return (
            typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                window.localStorage.getItem('debug') === 'true')
        );
    }
    // XSS 방지를 위한 HTML 이스케이프
    static escapeHtml(text) {
        if (!text) {
            return '';
        }
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
            ':': '&#58;' // javascript: 패턴 방지
        };
        return String(text).replace(/[&<>"':]/g, (m) => map[m]);
    }

    // 안전한 DOM 요소 생성 (XSS 방지)
    static createSafeElement(tagName, textContent = '', attributes = {}, styles = {}) {
        const element = document.createElement(tagName);

        // textContent 사용으로 XSS 방지
        if (textContent) {
            element.textContent = String(textContent);
        }

        // 속성 안전하게 설정
        Object.entries(attributes).forEach(([key, value]) => {
            // 위험한 속성 차단
            const dangerousAttrs = [
                'onload',
                'onerror',
                'onclick',
                'onmouseover',
                'onfocus',
                'onblur'
            ];
            if (!dangerousAttrs.includes(key.toLowerCase()) && value !== null) {
                element.setAttribute(key, String(value));
            }
        });

        // 스타일 안전하게 설정
        Object.entries(styles).forEach(([property, value]) => {
            if (value !== null) {
                element.style[property] = String(value);
            }
        });

        return element;
    }

    // 안전한 HTML sanitization (더 강력한 XSS 방지)
    static sanitizeHtml(html) {
        if (!html) {
            return '';
        }

        // 위험한 태그 제거
        const dangerousTags =
            /<(script|iframe|object|embed|form|input|textarea|select|button)[^>]*>.*?<\/\1>/gis;
        let sanitized = String(html).replace(dangerousTags, '');

        // 위험한 속성 제거
        const dangerousAttrs = /\s+(on\w+|javascript:|data:|vbscript:|expression\()/gi;
        sanitized = sanitized.replace(dangerousAttrs, ' data-removed');

        // 기본 HTML 이스케이프 적용
        return this.escapeHtml(sanitized);
    }

    // 안전한 innerHTML 대체 함수
    static safeSetInnerHTML(element, content) {
        if (!element) {
            return;
        }

        // 모든 자식 요소 제거
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }

        // content가 있으면 sanitized content를 textContent로 설정
        if (content) {
            element.textContent = this.sanitizeHtml(content);
        }
    }

    // 디바운스 함수
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 상호명 정규화 (개선된 버전)
    static normalizeStoreName(name) {
        if (!name) {
            return '';
        }
        return String(name)
            .trim()
            .replace(/\s+/g, '') // 공백 제거
            .replace(/[^가-힣a-zA-Z0-9]/g, '') // 한글, 영문, 숫자만 허용
            .toLowerCase(); // 소문자 변환
    }

    // 스로틀 함수
    static throttle(func, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    // 파일 검증
    static validateExcelFile(file) {
        const validTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];

        const maxSize = CONSTANTS.FILE.MAX_SIZE;

        if (!validTypes.includes(file.type)) {
            throw new Error('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.');
        }

        if (file.size > maxSize) {
            throw new Error('파일 크기는 10MB를 초과할 수 없습니다.');
        }

        return true;
    }

    // 안전한 JSON 파싱
    static safeJSONParse(str, defaultValue = null) {
        try {
            return JSON.parse(str);
        } catch {
            // JSON 파싱 에러는 무시하고 기본값 반환
            return defaultValue;
        }
    }

    // 주소 정규화
    static normalizeAddress(address) {
        if (!address) {
            return '';
        }

        return address
            .replace(/\s+/g, ' ')
            .replace(/[()]/g, '')
            .replace(/\d+층.*$/, '')
            .trim();
    }

    // 거리 계산 (Haversine formula) - 미터 단위 반환
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = CONSTANTS.GEO.EARTH_RADIUS;
        const degToRad = CONSTANTS.GEO.DEG_TO_RAD;
        const dLat = (lat2 - lat1) * degToRad;
        const dLon = (lon2 - lon1) * degToRad;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * degToRad) *
                Math.cos(lat2 * degToRad) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c); // 미터 단위로 반환
    }

    // 배치 처리
    static async processBatch(items, batchSize, processor, onProgress) {
        const results = [];
        const total = items.length;

        for (let i = 0; i < total; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map((item) => processor(item).catch((err) => ({ error: err, item })))
            );

            results.push(...batchResults);

            if (onProgress) {
                const progress = Math.min(
                    CONSTANTS.UI.COMPLETE_PROGRESS,
                    Math.round(((i + batch.length) / total) * CONSTANTS.UI.COMPLETE_PROGRESS)
                );
                onProgress(progress, i + batch.length, total);
            }
        }

        return results;
    }

    // 재시도 로직
    static async retry(
        fn,
        retries = CONSTANTS.RETRY.DEFAULT_ATTEMPTS,
        delay = CONSTANTS.RETRY.DEFAULT_DELAY
    ) {
        try {
            return await fn();
        } catch (error) {
            if (retries <= 1) {
                throw error;
            }

            await new Promise((resolve) => setTimeout(resolve, delay));
            return this.retry(fn, retries - 1, delay * CONSTANTS.RETRY.BACKOFF_MULTIPLIER);
        }
    }

    // 지연 함수
    static delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // 배열 셔플
    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // 문자열 유사도 계산
    static calculateSimilarity(str1, str2) {
        const distance = this.levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);
        return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
    }

    // Levenshtein Distance 계산
    static levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1)
            .fill(null)
            .map(() => Array(str1.length + 1).fill(null));

        for (let i = 0; i <= str1.length; i++) {
            matrix[0][i] = i;
        }
        for (let j = 0; j <= str2.length; j++) {
            matrix[j][0] = j;
        }

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1, // deletion
                    matrix[j - 1][i] + 1, // insertion
                    matrix[j - 1][i - 1] + cost // substitution
                );
            }
        }

        return matrix[str2.length][str1.length];
    }

    // 깊은 복사
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        if (obj instanceof Array) {
            return obj.map((item) => this.deepClone(item));
        }
        if (obj instanceof Object) {
            const clonedObj = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    clonedObj[key] = this.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    }

    // DocumentFragment를 사용한 효율적인 DOM 조작
    static createFragment(elements) {
        const fragment = document.createDocumentFragment();
        elements.forEach((el) => fragment.appendChild(el));
        return fragment;
    }
}

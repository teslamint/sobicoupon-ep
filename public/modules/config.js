/**
 * 환경 설정 관리 모듈
 * API 키와 환경별 설정을 안전하게 관리합니다.
 */

import { Utils } from './utils.js';

export class Config {
    constructor() {
        this.env = this.detectEnvironment();
        this.apiKeys = this.loadApiKeys();
    }

    /**
     * 현재 환경을 감지합니다.
     */
    detectEnvironment() {
        const hostname = window.location.hostname;

        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'development';
        } else if (hostname.includes('staging') || hostname.includes('test')) {
            return 'staging';
        } else {
            return 'production';
        }
    }

    /**
     * API 키를 안전하게 로드합니다.
     * 실제 운영환경에서는 서버에서 동적으로 주입되어야 합니다.
     */
    loadApiKeys() {
        // API 키 난독화 함수
        const deobfuscateKey = (obfuscatedKey) => {
            if (!obfuscatedKey || obfuscatedKey === '[KAKAO_API_KEY]') {
                return null;
            }

            // 기본 난독화 해제 (Base64 + 간단한 치환)
            try {
                const decoded = atob(obfuscatedKey);
                return decoded
                    .split('')
                    .map((char) => String.fromCharCode(char.charCodeAt(0) ^ 42))
                    .join('');
            } catch {
                // 평문인 경우 그대로 반환 (개발환경용)
                return obfuscatedKey;
            }
        };

        // 환경별 API 키 처리
        let kakaoKey = null;

        if (this.env === 'development') {
            // 개발 환경: 환경변수나 메타태그에서 평문으로 로드
            kakaoKey = window.KAKAO_API_KEY || this.getFromMeta('kakao-api-key');
        } else {
            // 프로덕션 환경: 서버에서 주입된 난독화된 키 사용
            const obfuscatedKey =
                window.KAKAO_API_KEY_OBFUSCATED || this.getFromMeta('kakao-api-key-obfuscated');
            kakaoKey = deobfuscateKey(obfuscatedKey);
        }

        return {
            kakao: kakaoKey
        };
    }

    /**
     * 메타 태그에서 설정값을 가져옵니다.
     */
    getFromMeta(name) {
        const meta = document.querySelector(`meta[name="${name}"]`);
        return meta ? meta.getAttribute('content') : null;
    }

    /**
     * 카카오맵 API 키를 반환합니다.
     */
    getKakaoApiKey() {
        const apiKey = this.apiKeys.kakao;

        if (!apiKey || apiKey === '[KAKAO_API_KEY]') {
            if (this.isDebugMode()) {
                Utils.warn('카카오맵 API 키가 설정되지 않았습니다.');
            }
            return null;
        }

        return apiKey;
    }

    /**
     * 환경별 설정을 반환합니다.
     */
    getConfig() {
        const baseConfig = {
            api: {
                timeout: 10000,
                retryAttempts: 3,
                retryDelay: 1000
            },
            map: {
                defaultZoom: 15,
                maxZoom: 20,
                minZoom: 8
            },
            cache: {
                ttl: 24 * 60 * 60 * 1000, // 24시간
                maxEntries: 1000
            }
        };

        const envConfigs = {
            development: {
                ...baseConfig,
                debug: true,
                api: {
                    ...baseConfig.api,
                    timeout: 30000 // 개발 환경에서는 더 긴 타임아웃
                }
            },
            staging: {
                ...baseConfig,
                debug: true
            },
            production: {
                ...baseConfig,
                debug: false
            }
        };

        return envConfigs[this.env] || baseConfig;
    }

    /**
     * 디버그 모드 여부를 반환합니다.
     */
    isDebugMode() {
        return this.getConfig().debug;
    }
}

// 싱글톤 인스턴스
export const config = new Config();

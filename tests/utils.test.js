import { Utils } from '../public/modules/utils.js';

describe('Utils', () => {
    describe('escapeHtml', () => {
        test('should escape HTML special characters', () => {
            expect(Utils.escapeHtml('<script>alert("XSS")</script>')).toBe(
                '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
            );

            expect(Utils.escapeHtml("Test & 'quotes' <tag>")).toBe(
                'Test &amp; &#039;quotes&#039; &lt;tag&gt;'
            );
        });

        test('should handle empty string', () => {
            expect(Utils.escapeHtml('')).toBe('');
        });
    });

    describe('validateExcelFile', () => {
        test('should accept valid Excel files', () => {
            const validFile = new File([''], 'test.xlsx', {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            expect(() => Utils.validateExcelFile(validFile)).not.toThrow();
        });

        test('should reject invalid file types', () => {
            const invalidFile = new File([''], 'test.txt', {
                type: 'text/plain'
            });

            expect(() => Utils.validateExcelFile(invalidFile)).toThrow(
                '엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.'
            );
        });

        test('should reject files larger than 10MB', () => {
            const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large.xlsx', {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            expect(() => Utils.validateExcelFile(largeFile)).toThrow(
                '파일 크기는 10MB를 초과할 수 없습니다.'
            );
        });
    });

    describe('sanitizeHtml', () => {
        test('should remove dangerous script tags', () => {
            const maliciousHtml = '<script>alert("XSS")</script><p>Safe content</p>';
            const result = Utils.sanitizeHtml(maliciousHtml);
            
            expect(result).not.toContain('<script>');
            expect(result).not.toContain('alert("XSS")');
        });

        test('should remove dangerous iframe tags', () => {
            const maliciousHtml = '<iframe src="javascript:alert(1)"></iframe>';
            const result = Utils.sanitizeHtml(maliciousHtml);
            
            expect(result).not.toContain('<iframe>');
            expect(result).not.toContain('javascript:');
        });

        test('should remove dangerous event handlers', () => {
            const maliciousHtml = '<div onclick="alert(1)">Click me</div>';
            const result = Utils.sanitizeHtml(maliciousHtml);
            
            expect(result).not.toContain('onclick');
            expect(result).toContain('data-removed');
        });

        test('should handle empty or null input', () => {
            expect(Utils.sanitizeHtml('')).toBe('');
            expect(Utils.sanitizeHtml(null)).toBe('');
            expect(Utils.sanitizeHtml(undefined)).toBe('');
        });

        test('should escape remaining HTML after sanitization', () => {
            const html = '<p>Safe paragraph</p>';
            const result = Utils.sanitizeHtml(html);
            
            expect(result).toContain('&lt;p&gt;');
            expect(result).toContain('&lt;/p&gt;');
        });
    });

    describe('safeSetInnerHTML', () => {
        let mockElement;

        beforeEach(() => {
            mockElement = {
                firstChild: null,
                removeChild: jest.fn(),
                textContent: ''
            };
        });

        test('should handle null element gracefully', () => {
            expect(() => Utils.safeSetInnerHTML(null, 'content')).not.toThrow();
        });

        test('should clear existing children', () => {
            const child1 = { nextSibling: null };
            const child2 = { nextSibling: child1 };
            mockElement.firstChild = child2;
            
            let removeCallCount = 0;
            mockElement.removeChild = jest.fn(() => {
                removeCallCount++;
                if (removeCallCount === 1) {
                    mockElement.firstChild = child1;
                } else {
                    mockElement.firstChild = null;
                }
            });

            Utils.safeSetInnerHTML(mockElement, 'new content');

            expect(mockElement.removeChild).toHaveBeenCalledTimes(2);
        });

        test('should set sanitized content as textContent', () => {
            Utils.safeSetInnerHTML(mockElement, '<script>alert("XSS")</script>Safe text');
            
            expect(mockElement.textContent).not.toContain('<script>');
            expect(mockElement.textContent).toContain('Safe text');
        });

        test('should handle empty content', () => {
            Utils.safeSetInnerHTML(mockElement, '');
            expect(mockElement.textContent).toBe('');
        });
    });

    describe('debounce', () => {
        jest.useFakeTimers();

        afterEach(() => {
            jest.clearAllTimers();
        });

        test('should delay function execution', () => {
            const mockFn = jest.fn();
            const debouncedFn = Utils.debounce(mockFn, 100);

            debouncedFn();
            expect(mockFn).not.toHaveBeenCalled();

            jest.advanceTimersByTime(100);
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        test('should cancel previous calls', () => {
            const mockFn = jest.fn();
            const debouncedFn = Utils.debounce(mockFn, 100);

            debouncedFn();
            debouncedFn();
            debouncedFn();

            jest.advanceTimersByTime(100);
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        test('should pass arguments correctly', () => {
            const mockFn = jest.fn();
            const debouncedFn = Utils.debounce(mockFn, 100);

            debouncedFn('arg1', 'arg2');
            jest.advanceTimersByTime(100);

            expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
        });
    });

    describe('throttle', () => {
        jest.useFakeTimers();

        afterEach(() => {
            jest.clearAllTimers();
        });

        test('should limit function execution frequency', () => {
            const mockFn = jest.fn();
            const throttledFn = Utils.throttle(mockFn, 100);

            throttledFn();
            throttledFn();
            throttledFn();

            expect(mockFn).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(100);
            throttledFn();

            expect(mockFn).toHaveBeenCalledTimes(2);
        });

        test('should pass arguments correctly', () => {
            const mockFn = jest.fn();
            const throttledFn = Utils.throttle(mockFn, 100);

            throttledFn('test', 123);
            expect(mockFn).toHaveBeenCalledWith('test', 123);
        });
    });



    describe('normalizeAddress', () => {
        test('should normalize address strings', () => {
            expect(Utils.normalizeAddress('서울시  은평구   불광동')).toBe('서울시 은평구 불광동');

            expect(Utils.normalizeAddress('은평구 불광동 123-45 (2층)')).toBe(
                '은평구 불광동 123-45'
            );

            expect(Utils.normalizeAddress('은평구 불광동 123번지 3층')).toBe(
                '은평구 불광동 123번지'
            );
        });

        test('should handle empty or null values', () => {
            expect(Utils.normalizeAddress('')).toBe('');
            expect(Utils.normalizeAddress(null)).toBe('');
            expect(Utils.normalizeAddress(undefined)).toBe('');
        });
    });

    describe('calculateDistance', () => {
        test('should calculate distance between two points', () => {
            // 서울시청에서 은평구청까지의 거리 (약 7.5km)
            const distance = Utils.calculateDistance(
                37.5663,
                126.9779, // 서울시청
                37.6176,
                126.9227 // 은평구청
            );

            expect(distance).toBeGreaterThan(7000); // 7km 이상
            expect(distance).toBeLessThan(8000); // 8km 미만
        });

        test('should return 0 for same coordinates', () => {
            const distance = Utils.calculateDistance(37.5663, 126.9779, 37.5663, 126.9779);
            expect(distance).toBe(0);
        });
    });

    describe('debounce', () => {
        jest.useFakeTimers();

        test('should debounce function calls', () => {
            const mockFn = jest.fn();
            const debouncedFn = Utils.debounce(mockFn, 100);

            debouncedFn();
            debouncedFn();
            debouncedFn();

            expect(mockFn).not.toHaveBeenCalled();

            jest.advanceTimersByTime(100);

            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        test('should pass arguments to debounced function', () => {
            const mockFn = jest.fn();
            const debouncedFn = Utils.debounce(mockFn, 100);

            debouncedFn('arg1', 'arg2');

            jest.advanceTimersByTime(100);

            expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
        });
    });

    describe('deepClone', () => {
        test('should create deep copy of objects', () => {
            const original = {
                a: 1,
                b: { c: 2, d: [3, 4] },
                e: new Date('2024-01-01')
            };

            const cloned = Utils.deepClone(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned.b).not.toBe(original.b);
            expect(cloned.b.d).not.toBe(original.b.d);
            expect(cloned.e).toEqual(original.e);
            expect(cloned.e).not.toBe(original.e);
        });

        test('should handle primitive values', () => {
            expect(Utils.deepClone(42)).toBe(42);
            expect(Utils.deepClone('string')).toBe('string');
            expect(Utils.deepClone(null)).toBe(null);
            expect(Utils.deepClone(undefined)).toBe(undefined);
        });
    });
});

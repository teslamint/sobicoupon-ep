import { AppError, ErrorCodes, ErrorHandler } from '../public/modules/errors.js';

describe('AppError', () => {
    test('should create error with code and details', () => {
        const error = new AppError('Test error', ErrorCodes.API_REQUEST_FAILED, {
            url: 'https://example.com'
        });

        expect(error.message).toBe('Test error');
        expect(error.code).toBe(ErrorCodes.API_REQUEST_FAILED);
        expect(error.details).toEqual({ url: 'https://example.com' });
        expect(error.timestamp).toBeInstanceOf(Date);
    });

    test('should be instanceof Error', () => {
        const error = new AppError('Test', ErrorCodes.UNKNOWN_ERROR);
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(AppError);
    });
});

describe('ErrorHandler', () => {
    let consoleErrorSpy;
    let mockNotification;

    beforeEach(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'group').mockImplementation();
        jest.spyOn(console, 'groupEnd').mockImplementation();
        jest.spyOn(console, 'trace').mockImplementation();

        // Mock location
        delete window.location;
        window.location = { hostname: 'localhost' };

        // Mock DOM notification
        mockNotification = null;
        document.body.appendChild = jest.fn((element) => {
            if (
                element.className?.includes('error-notification') ||
                element.className?.includes('notification')
            ) {
                mockNotification = element;
            }
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        ErrorHandler.handlers.clear();
    });

    describe('handle', () => {
        test('should handle AppError with registered handler', () => {
            const mockHandler = jest.fn();
            ErrorHandler.register(ErrorCodes.FILE_INVALID_TYPE, mockHandler);

            const error = new AppError('Invalid file', ErrorCodes.FILE_INVALID_TYPE);
            ErrorHandler.handle(error);

            expect(mockHandler).toHaveBeenCalledWith(error);
        });

        test('should show default message for unregistered error codes', () => {
            const error = new AppError('Test error', 'UNREGISTERED_CODE');
            ErrorHandler.handle(error);

            expect(mockNotification).toBeTruthy();
            expect(mockNotification.textContent).toContain('Test error');
        });

        test('should handle regular Error objects', () => {
            const error = new Error('Regular error');
            ErrorHandler.handle(error);

            expect(mockNotification).toBeTruthy();
            expect(mockNotification.textContent).toContain('오류가 발생했습니다');
        });
    });

    describe('getUserFriendlyMessage', () => {
        test('should return appropriate message for known error codes', () => {
            const testCases = [
                {
                    error: new AppError('', ErrorCodes.FILE_INVALID_TYPE),
                    expected: '엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.'
                },
                {
                    error: new AppError('', ErrorCodes.FILE_TOO_LARGE),
                    expected: '파일 크기가 너무 큽니다. (최대 10MB)'
                },
                {
                    error: new AppError('', ErrorCodes.API_TIMEOUT),
                    expected: '요청 시간이 초과되었습니다.'
                }
            ];

            testCases.forEach(({ error, expected }) => {
                const message = ErrorHandler.getUserFriendlyMessage(error);
                expect(message).toBe(expected);
            });
        });

        test('should use error message for unknown codes', () => {
            const error = new AppError('Custom error message', 'UNKNOWN_CODE');
            const message = ErrorHandler.getUserFriendlyMessage(error);
            expect(message).toBe('Custom error message');
        });
    });

    describe('showNotification', () => {
        test('should create notification element with correct styles', () => {
            ErrorHandler.showNotification('Test message', 'error');

            expect(mockNotification).toBeTruthy();
            expect(mockNotification.className).toContain('error-notification');
            expect(mockNotification.className).toContain('error');
            expect(mockNotification.style.position).toBe('fixed');
            expect(mockNotification.style.backgroundColor).toBe('rgb(244, 67, 54)');
        });

        test('should show success notification with green background', () => {
            ErrorHandler.showNotification('Success message', 'success');

            expect(mockNotification.style.backgroundColor).toBe('rgb(76, 175, 80)');
        });

        test('should remove existing notification before showing new one', () => {
            // Create mock existing notification
            const existingNotification = document.createElement('div');
            existingNotification.className = 'error-notification';
            document.querySelector = jest.fn(() => existingNotification);
            existingNotification.remove = jest.fn();

            ErrorHandler.showNotification('New message', 'error');

            expect(existingNotification.remove).toHaveBeenCalled();
        });
    });

    describe('default handlers', () => {
        beforeEach(() => {
            // 핸들러를 다시 등록
            ErrorHandler.register(ErrorCodes.FILE_INVALID_TYPE, () => {
                const input = document.getElementById('fileInput');
                if (input) {
                    input.value = '';
                }
            });

            ErrorHandler.register(ErrorCodes.API_RATE_LIMIT, () => {
                const searchBtn = document.getElementById('searchMapBtn');
                if (searchBtn) {
                    searchBtn.disabled = true;
                    setTimeout(() => {
                        searchBtn.disabled = false;
                    }, 10000);
                }
            });
        });

        test('should clear file input on FILE_INVALID_TYPE error', () => {
            const mockFileInput = { value: 'test.txt' };
            document.getElementById = jest.fn((id) => {
                if (id === 'fileInput') {
                    return mockFileInput;
                }
                return null;
            });

            const error = new AppError('Invalid file', ErrorCodes.FILE_INVALID_TYPE);
            ErrorHandler.handle(error);

            expect(mockFileInput.value).toBe('');
        });

        test('should disable search button on API_RATE_LIMIT error', () => {
            jest.useFakeTimers();

            const mockSearchBtn = { disabled: false };
            document.getElementById = jest.fn((id) => {
                if (id === 'searchMapBtn') {
                    return mockSearchBtn;
                }
                return null;
            });

            const error = new AppError('Rate limited', ErrorCodes.API_RATE_LIMIT);
            ErrorHandler.handle(error);

            expect(mockSearchBtn.disabled).toBe(true);

            // Fast-forward 10 seconds
            jest.advanceTimersByTime(10000);

            expect(mockSearchBtn.disabled).toBe(false);

            jest.useRealTimers();
        });
    });
});

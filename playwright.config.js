const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 60 * 1000,
    expect: {
        timeout: 10000
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: process.env.CI ? 'http://localhost:8787' : 'http://localhost:8787',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        // CI 환경에서 더 관대한 설정
        ...(process.env.CI && {
            actionTimeout: 30000,
            navigationTimeout: 30000
        })
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] }
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] }
        },
        {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] }
        },
        {
            name: 'Mobile Safari',
            use: { ...devices['iPhone 12'] }
        }
    ],

    webServer: process.env.CI
        ? undefined
        : {
              command: 'http-server -p 8787 -c-1 --cors',
              port: 8787,
              reuseExistingServer: !process.env.CI,
              env: {
                  KAKAO_API_KEY: process.env.KAKAO_API_KEY || 'test-key-for-ci'
              }
          }
});

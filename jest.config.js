module.exports = {
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    moduleFileExtensions: ['js'],
    testMatch: ['**/tests/**/*.test.js'],
    collectCoverageFrom: ['public/modules/**/*.js', '!public/modules/**/*.test.js'],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    transform: {
        '^.+\\.js$': [
            'babel-jest',
            {
                presets: [
                    [
                        '@babel/preset-env',
                        {
                            targets: {
                                node: 'current'
                            },
                            modules: 'auto'
                        }
                    ]
                ]
            }
        ]
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },
    testPathIgnorePatterns: ['/node_modules/', '/public/app.js.backup'],
    coverageThreshold: {
        global: {
            branches: 14,
            functions: 23,
            lines: 20,
            statements: 19
        }
    }
};

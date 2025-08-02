import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([
    globalIgnores(['**/node_modules/', '**/dist/', 'public/dist/', '**/*.min.js', '**/coverage/']),
    {
        extends: compat.extends('eslint:recommended', 'plugin:prettier/recommended'),

        languageOptions: {
            globals: {
                ...globals.browser,
                kakao: 'readonly',
                XLSX: 'readonly'
            },

            ecmaVersion: 'latest',
            sourceType: 'module'
        },

        rules: {
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_'
                }
            ],

            'no-console': [
                'warn',
                {
                    allow: ['warn', 'error']
                }
            ],

            eqeqeq: ['error', 'always'],
            curly: ['error', 'all'],
            'prefer-const': 'error',
            'no-var': 'error',
            'prefer-arrow-callback': 'warn',
            'prefer-template': 'warn',
            'no-throw-literal': 'error',
            'prefer-promise-reject-errors': 'error',
            'no-return-await': 'error',
            'require-await': 'error'
        }
    }
]);

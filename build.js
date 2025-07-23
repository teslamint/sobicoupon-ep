const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

// 프론트엔드 빌드 설정
const frontendBuildOptions = {
    entryPoints: ['public/app.js', 'public/app-mobile.js'],
    bundle: false, // ES6 모듈 유지
    outdir: 'dist/public',
    format: 'esm',
    target: 'es2020',
    sourcemap: true,
    minify: false, // 개발 편의를 위해 비활성화
    keepNames: true,
    treeShaking: false, // 모든 export 유지
    splitting: false,
    allowOverwrite: true,
    loader: {
        '.js': 'js'
    },
    define: {
        'process.env.NODE_ENV': '"development"'
    }
};

// Workers 백엔드 빌드 설정
const workersBuildOptions = {
    entryPoints: ['src/index.js'],
    bundle: true, // Workers는 번들링 필요
    outdir: 'dist',
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    minify: false,
    keepNames: true,
    allowOverwrite: true,
    loader: {
        '.js': 'js'
    },
    define: {
        'process.env.NODE_ENV': '"production"'
    },
    external: ['cloudflare:*'] // Cloudflare Workers 내장 모듈 제외
};

// 정적 파일 복사 함수
async function copyStaticFiles() {
    const staticFiles = ['public/styles.css', 'public/favicon.svg', 'public/index.html'];

    // dist/public 디렉터리 생성
    if (!fs.existsSync('dist/public')) {
        fs.mkdirSync('dist/public', { recursive: true });
    }

    // 모듈 디렉터리 복사
    if (fs.existsSync('public/modules')) {
        fs.cpSync('public/modules', 'dist/public/modules', { recursive: true });
    }

    // 정적 파일들 복사
    for (const file of staticFiles) {
        if (fs.existsSync(file)) {
            const filename = path.basename(file);
            fs.copyFileSync(file, `dist/public/${filename}`);
        }
    }

    // index.html에서 빌드된 파일 참조로 수정 및 KAKAO_API_KEY 대체
    const indexPath = 'dist/public/index.html';
    if (fs.existsSync(indexPath)) {
        let indexContent = fs.readFileSync(indexPath, 'utf8');

        // KAKAO_API_KEY 환경변수로 대체
        const kakaoApiKey = process.env.KAKAO_API_KEY || 'test-key-for-ci';
        indexContent = indexContent.replace('[KAKAO_API_KEY]', kakaoApiKey);

        // 원본 파일 참조를 빌드된 파일 참조로 변경
        indexContent = indexContent.replace(
            '<script type="module" src="app.js"></script>',
            '<script type="module" src="app.js"></script>'
        );
        indexContent = indexContent.replace(
            '<script src="app-mobile.js"></script>',
            '<script src="app-mobile.js"></script>'
        );
        fs.writeFileSync(indexPath, indexContent);
    }

    // 모든 JavaScript 모듈 파일의 KAKAO_API_KEY 플레이스홀더 대체
    const modulesDir = 'dist/public/modules';
    if (fs.existsSync(modulesDir)) {
        const moduleFiles = fs.readdirSync(modulesDir).filter((file) => file.endsWith('.js'));
        const kakaoApiKey = process.env.KAKAO_API_KEY || 'test-key-for-ci';

        for (const file of moduleFiles) {
            const filePath = path.join(modulesDir, file);
            let content = fs.readFileSync(filePath, 'utf8');

            // [KAKAO_API_KEY] 플레이스홀더를 실제 API 키로 대체
            if (content.includes('[KAKAO_API_KEY]')) {
                content = content.replace(/\[KAKAO_API_KEY\]/g, kakaoApiKey);
                fs.writeFileSync(filePath, content);
                console.log(`✅ ${file}에서 KAKAO_API_KEY 플레이스홀더 대체 완료`);
            }
        }
    }
}

async function build() {
    try {
        console.log('🔨 빌드 시작...');

        if (isWatch) {
            // Watch 모드에서는 개발용 빌드만
            const ctx = await esbuild.context({
                ...frontendBuildOptions,
                outdir: 'public/dist'
            });
            await ctx.watch();
            console.log('👀 프론트엔드 파일 변경 감시 중...');
        } else {
            // 프론트엔드 빌드
            console.log('📦 프론트엔드 빌드 중...');
            await esbuild.build(frontendBuildOptions);
            console.log('✅ 프론트엔드 빌드 완료!');

            // Workers 백엔드 빌드
            console.log('⚡ Workers 백엔드 빌드 중...');
            await esbuild.build(workersBuildOptions);
            console.log('✅ Workers 백엔드 빌드 완료!');

            // 정적 파일 복사
            console.log('📁 정적 파일 복사 중...');
            await copyStaticFiles();
            console.log('✅ 정적 파일 복사 완료!');

            console.log('🎉 전체 빌드 완료!');
        }
    } catch (error) {
        console.error('❌ 빌드 실패:', error);
        process.exit(1);
    }
}

build();

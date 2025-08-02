// 전체화면 토글 기능
function toggleFullscreen() {
    const mapElement = document.getElementById('map');
    const toggleBtn = document.querySelector('.fullscreen-toggle');

    if (mapElement.classList.contains('fullscreen')) {
        // 전체화면 해제
        mapElement.classList.remove('fullscreen');
        toggleBtn.textContent = '⛶';
        toggleBtn.title = '전체화면';

        // 지도 크기 재조정
        setTimeout(() => {
            if (window.mapManager && window.mapManager.map) {
                window.mapManager.relayout();
            }
        }, 100);
    } else {
        // 전체화면 활성화
        mapElement.classList.add('fullscreen');
        toggleBtn.textContent = '✕';
        toggleBtn.title = '전체화면 닫기';

        // 지도 크기 재조정
        setTimeout(() => {
            if (window.mapManager && window.mapManager.map) {
                window.mapManager.relayout();
            }
        }, 100);
    }
}

// 모바일 감지 및 전체화면 버튼 표시
function checkMobile() {
    const isMobile = window.innerWidth <= 768;
    const fullscreenBtn = document.querySelector('.fullscreen-toggle');

    if (fullscreenBtn) {
        fullscreenBtn.style.display = isMobile ? 'flex' : 'none';
    }
}

// 윈도우 크기 변경 시 모바일 체크
window.addEventListener('resize', checkMobile);

// 초기 로드 시 모바일 체크
document.addEventListener('DOMContentLoaded', () => {
    checkMobile();
});

// 카카오맵 관리
import { CONSTANTS } from './constants.js';
import { Utils } from './utils.js';
import { AppError, ErrorCodes } from './errors.js';
import { stateManager } from './state.js';
import { config } from './config.js';

export class MapManager {
    constructor() {
        this.map = null;
        this.ps = null;
        this.clusterer = null;
        this.infowindow = null;
        this.currentLocationMarker = null;
        this.markers = new Map();
        this.groupedMarkers = new Map();
        this.currentGroupOverlay = null;
        this.isInitialized = false;
        this.isSearchInProgress = false; // 검색 진행 중 플래그

        // 리소스 관리
        this.eventListeners = new Set();
        this.overlays = new Set();
        this.customOverlays = new Set();
        this.cleanupInterval = null;
    }
    /**
     * 메모리 누수 방지를 위한 이벤트 리스너 추적 등록
     */
    addEventListenerTracked(target, event, handler, type = 'dom') {
        // 중복 등록 방지
        const existingListener = Array.from(this.eventListeners).find(
            (item) => item.target === target && item.event === event && item.handler === handler
        );

        if (existingListener) {
            Utils.warn('이미 등록된 이벤트 리스너입니다:', { target, event });
            return existingListener;
        }

        const listenerInfo = {
            target,
            event,
            handler,
            type,
            timestamp: Date.now()
        };

        try {
            if (type === 'kakao') {
                const listener = kakao.maps.event.addListener(target, event, handler);
                listenerInfo.listener = listener;
            } else {
                target.addEventListener(event, handler);
            }

            this.eventListeners.add(listenerInfo);
            return listenerInfo;
        } catch (error) {
            Utils.error('이벤트 리스너 등록 실패:', error);
            return null;
        }
    }

    /**
     * 특정 이벤트 리스너 제거
     */
    removeEventListenerTracked(listenerInfo) {
        if (!listenerInfo || !this.eventListeners.has(listenerInfo)) {
            return false;
        }

        try {
            if (listenerInfo.type === 'kakao' && listenerInfo.listener) {
                kakao.maps.event.removeListener(
                    listenerInfo.target,
                    listenerInfo.event,
                    listenerInfo.listener
                );
            } else if (listenerInfo.target && listenerInfo.event && listenerInfo.handler) {
                listenerInfo.target.removeEventListener(listenerInfo.event, listenerInfo.handler);
            }

            this.eventListeners.delete(listenerInfo);
            return true;
        } catch (error) {
            Utils.warn('이벤트 리스너 제거 실패:', error);
            return false;
        }
    }

    /**
     * 오래된 이벤트 리스너 정리 (메모리 최적화)
     */
    cleanupOldEventListeners(maxAge = 300000) {
        // 5분
        const now = Date.now();
        const oldListeners = Array.from(this.eventListeners).filter(
            (item) => now - item.timestamp > maxAge
        );

        oldListeners.forEach((listener) => {
            this.removeEventListenerTracked(listener);
        });

        if (oldListeners.length > 0) {
            Utils.log(`${oldListeners.length}개의 오래된 이벤트 리스너를 정리했습니다.`);
        }
    }

    // 초기화
    init(containerId) {
        if (this.isInitialized) {
            return;
        }

        try {
            // API 키 확인
            const apiKey = config.getKakaoApiKey();
            if (!apiKey) {
                throw new AppError(
                    '카카오맵 API 키가 설정되지 않았습니다. 관리자에게 문의하세요.',
                    ErrorCodes.API_KEY_MISSING
                );
            }

            // 카카오맵 로드 확인
            if (!window.kakao || !window.kakao.maps) {
                throw new AppError(
                    '카카오맵 API가 로드되지 않았습니다.',
                    ErrorCodes.MAP_INIT_ERROR
                );
            }

            const container = document.getElementById(containerId);
            if (!container) {
                throw new Error('지도 컨테이너를 찾을 수 없습니다.');
            }

            const options = {
                center: new kakao.maps.LatLng(
                    CONSTANTS.MAP.DEFAULT_CENTER.lat,
                    CONSTANTS.MAP.DEFAULT_CENTER.lng
                ),
                level: CONSTANTS.MAP.DEFAULT_ZOOM
            };

            this.map = new kakao.maps.Map(container, options);

            // Services 라이브러리 우회 처리
            if (window.kakao?.maps?.services?.Places) {
                this.ps = new kakao.maps.services.Places();
                console.log('✅ Places 서비스 초기화 완료');
            } else {
                console.warn('⚠️ Places 서비스 없이 지도 초기화 (위치 검색 기능 제한됨)');
                this.ps = null;
            }

            this.infowindow = new kakao.maps.InfoWindow({ zIndex: 10 });

            // 클러스터러 초기화
            this.initClusterer();

            // 이벤트 리스너 설정
            this.setupEventListeners();

            // 상태 저장
            stateManager.setState({
                mapCenter: this.map.getCenter(),
                mapLevel: this.map.getLevel()
            });

            this.isInitialized = true;
            container.style.display = 'block';

            // 지도 크기 재조정
            setTimeout(() => this.relayout(), CONSTANTS.ANIMATION.RELAYOUT_DELAY);

            // 주기적 이벤트 리스너 정리 작업 시작 (5분마다)
            this.cleanupInterval = setInterval(() => {
                this.cleanupOldEventListeners();
            }, CONSTANTS.TIME.CIRCUIT_BREAKER_TIMEOUT);
        } catch (error) {
            throw new AppError('지도 초기화 실패', ErrorCodes.MAP_INIT_ERROR, {
                originalError: error
            });
        }
    }

    // 클러스터러 초기화
    initClusterer() {
        this.clusterer = new kakao.maps.MarkerClusterer({
            map: this.map,
            averageCenter: true,
            minLevel: CONSTANTS.MAP.CLUSTER_MIN_LEVEL,
            disableClickZoom: false,
            styles: [
                {
                    width: '30px',
                    height: '30px',
                    background: 'rgba(102, 126, 234, .8)',
                    borderRadius: '15px',
                    color: '#fff',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    lineHeight: '31px'
                },
                {
                    width: '40px',
                    height: '40px',
                    background: 'rgba(102, 126, 234, .9)',
                    borderRadius: '20px',
                    color: '#fff',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    lineHeight: '40px'
                },
                {
                    width: '50px',
                    height: '50px',
                    background: 'rgba(118, 75, 162, .8)',
                    borderRadius: '25px',
                    color: '#fff',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    lineHeight: '50px'
                },
                {
                    width: '60px',
                    height: '60px',
                    background: 'rgba(102, 126, 234, .8)',
                    borderRadius: '30px',
                    color: '#fff',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    lineHeight: '60px'
                },
                {
                    width: '70px',
                    height: '70px',
                    background: 'rgba(118, 75, 162, .8)',
                    borderRadius: '35px',
                    color: '#fff',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    lineHeight: '70px'
                },
                {
                    width: '80px',
                    height: '80px',
                    background: 'rgba(220, 53, 69, .8)',
                    borderRadius: '40px',
                    color: '#fff',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    lineHeight: '80px'
                }
            ]
        });

        stateManager.setState({ clusterer: this.clusterer });
    }

    // 이벤트 리스너 설정
    setupEventListeners() {
        // 지도 이동/확대 이벤트
        this.addEventListenerTracked(this.map, 'idle', () => {
            stateManager.setState({
                mapCenter: this.map.getCenter(),
                mapLevel: this.map.getLevel()
            });
        });

        // 지도 클릭 이벤트
        this.addEventListenerTracked(this.map, 'click', () => {
            this.closeInfoWindow();
        });
    }

    // 마커 생성
    createMarker(position, data) {
        // 마커 생성 (이벤트 리스너 없이)
        const marker = this.createMarkerWithoutListeners(position, data);

        // 마커 키 생성 (디버깅용)
        const markerKey = `${position.getLat().toFixed(CONSTANTS.UI_DIMENSIONS.COORDINATE_PRECISION)}_${position.getLng().toFixed(CONSTANTS.UI_DIMENSIONS.COORDINATE_PRECISION)}`;

        // 이벤트 리스너 추가
        this.addMarkerListeners(marker, data, markerKey, 'initial');

        return marker;
    }

    // 정보창 표시
    // 정보창 표시
    showInfoWindow(marker, stores) {
        if (!stores || stores.length === 0) {
            Utils.warn('표시할 매장 정보가 없습니다.');
            return;
        }

        if (stores.length === 1) {
            // 단일 매장 정보창
            const storeData = stores[0];
            let actualStore;
            const location = storeData.location;

            // 데이터 구조에 따라 실제 가맹점 정보 추출
            if (storeData.store && storeData.store.store) {
                // 중첩된 구조: storeData.store.store가 실제 가맹점 데이터
                actualStore = storeData.store.store;
            } else if (storeData.store) {
                // 단순 구조: storeData.store가 실제 가맹점 데이터
                actualStore = storeData.store;
            } else {
                // 최상위가 가맹점 데이터
                actualStore = storeData;
            }

            if (!actualStore) {
                Utils.warn('매장 정보가 없습니다:', storeData);
                return;
            }

            // 매장명 안전하게 추출
            const storeName = Utils.escapeHtml(
                actualStore.상호 ||
                    actualStore.storeName ||
                    actualStore.name ||
                    actualStore.매장명 ||
                    '매장명 없음'
            );

            // 카테고리 정보 안전하게 추출
            const category = Utils.escapeHtml(
                actualStore.표준산업분류명 ||
                    actualStore.카테고리 ||
                    actualStore.category ||
                    actualStore.업종 ||
                    actualStore.분류 ||
                    '업종 정보 없음'
            );

            // 행정동 정보 안전하게 추출
            const dong = Utils.escapeHtml(
                actualStore.읍면동명 ||
                    actualStore.행정동 ||
                    actualStore.dong ||
                    actualStore.동 ||
                    '행정동 정보 없음'
            );

            // 주소 정보 처리 - 역지오코딩 사용
            this.getAddressAndShowInfoWindow(marker, location, storeName, category, dong);
        } else {
            this.showGroupedStoresPopup(marker, stores);
        }
    }

    // 역지오코딩을 통한 주소 정보 가져오기 및 정보창 표시
    async getAddressAndShowInfoWindow(marker, location, storeName, category, dong) {
        let address = '주소 없음';

        // 저장된 위치 정보에서 주소 확인
        if (location && (location.roadAddress || location.jibunAddress)) {
            address = location.roadAddress || location.jibunAddress;
            Utils.log('캐시된 주소 사용:', address);
            this.displayInfoWindow(marker, storeName, address, category, dong);
            return;
        }

        // 좌표가 있으면 역지오코딩 시도
        if (location && location.lat && location.lng) {
            try {
                Utils.log('역지오코딩 시도:', location.lat, location.lng);
                address = await this.reverseGeocode(location.lat, location.lng);
                Utils.log('역지오코딩 결과:', address);
            } catch (error) {
                Utils.warn('역지오코딩 실패:', error);
                // 실패 시 기본 주소 사용
                address = '주소 정보 없음';
            }
        }

        this.displayInfoWindow(marker, storeName, address, category, dong);
    }

    // 역지오코딩 수행
    reverseGeocode(lat, lng) {
        return new Promise((resolve, reject) => {
            // Services 라이브러리가 없으면 기본 주소 반환
            if (!window.kakao?.maps?.services?.Geocoder) {
                console.warn('⚠️ Geocoder 서비스를 사용할 수 없습니다. 기본 주소를 사용합니다.');
                resolve('주소 정보 없음 (Geocoder 서비스 제한)');
                return;
            }

            const geocoder = new kakao.maps.services.Geocoder();
            const coord = new kakao.maps.LatLng(lat, lng);

            geocoder.coord2Address(coord.getLng(), coord.getLat(), (result, status) => {
                if (status === kakao.maps.services.Status.OK) {
                    if (result && result.length > 0) {
                        const addressInfo = result[0];

                        // 도로명주소 우선, 없으면 지번주소 사용
                        let address = '주소 정보 없음';
                        if (addressInfo.road_address) {
                            address = addressInfo.road_address.address_name;
                        } else if (addressInfo.address) {
                            address = addressInfo.address.address_name;
                        }

                        resolve(address);
                    } else {
                        reject(new Error('주소 정보를 찾을 수 없습니다.'));
                    }
                } else {
                    reject(new Error(`역지오코딩 실패: ${status}`));
                }
            });
        });
    }

    // 정보창 실제 표시
    displayInfoWindow(marker, storeName, address, category, dong) {
        const content = `
            <div style="padding:12px;min-width:250px;max-width:300px;">
                <h4 style="margin:0 0 8px 0;color:#333;font-size:16px;font-weight:bold;">${storeName}</h4>
                <p style="margin:4px 0;font-size:13px;color:#666;line-height:1.4;">
                    <strong>📍 주소:</strong><br>${Utils.escapeHtml(address)}
                </p>
                <p style="margin:4px 0;font-size:13px;color:#666;">
                    <strong>🏪 업종:</strong> ${category}
                </p>
                <p style="margin:4px 0;font-size:13px;color:#666;">
                    <strong>🏛️ 행정동:</strong> ${dong}
                </p>
            </div>
        `;

        Utils.log('정보창 표시:', { storeName, address, category, dong });

        try {
            this.infowindow.setContent(content);
            this.infowindow.open(this.map, marker);
            Utils.log('정보창 표시 완료');
        } catch (error) {
            Utils.error('정보창 표시 중 오류:', error);
        }
    }

    // 그룹 마커 팝업
    showGroupedStoresPopup(marker, stores) {
        // 기존 그룹 오버레이가 있다면 제거
        if (this.currentGroupOverlay) {
            this.currentGroupOverlay.setMap(null);
            this.currentGroupOverlay = null;
        }

        const position = marker.getPosition();

        // 팝업 생성
        const popup = document.createElement('div');
        popup.className = 'grouped-stores-popup';
        popup.style.width = '300px';

        // 헤더
        const header = document.createElement('div');
        header.className = 'grouped-stores-header';
        // 안전한 DOM 생성으로 헤더 구성
        const countSpan = Utils.createSafeElement('span', `이 위치의 가맹점 ${stores.length}개`);
        const closeSpan = Utils.createSafeElement('span', '×', { class: 'close-popup' });
        closeSpan.className = 'close-popup';

        header.appendChild(countSpan);
        header.appendChild(closeSpan);

        // 목록
        const list = document.createElement('div');
        list.className = 'grouped-stores-list';

        stores.forEach((item) => {
            const storeItem = document.createElement('div');
            storeItem.className = 'grouped-store-item';

            // 데이터 구조 안전하게 추출
            let actualStore;
            let distance = '';

            // 데이터 구조에 따라 실제 가맹점 정보 추출
            if (item.store && item.store.store) {
                // 중첩된 구조: item.store.store가 실제 가맹점 데이터
                actualStore = item.store.store;
                distance = item.store.거리 || '';
            } else if (item.store) {
                // 단순 구조: item.store가 실제 가맹점 데이터
                actualStore = item.store;
                distance = item.store.거리 || '';
            } else {
                // 최상위가 가맹점 데이터
                actualStore = item;
                distance = item.거리 || '';
            }

            // 가맹점 이름 안전하게 추출
            const storeName =
                actualStore.상호 ||
                actualStore.storeName ||
                actualStore.name ||
                actualStore.매장명 ||
                '매장명 없음';

            // 행정동 정보 안전하게 추출
            const dong =
                actualStore.읍면동명 ||
                actualStore.행정동 ||
                actualStore.dong ||
                actualStore.동 ||
                '행정동 정보 없음';

            // 카테고리 정보 안전하게 추출
            const category =
                actualStore.표준산업분류명 ||
                actualStore.카테고리 ||
                actualStore.category ||
                actualStore.업종 ||
                actualStore.분류 ||
                '업종 정보 없음';

            Utils.log(`그룹 팝업 가맹점 정보: ${storeName} (${dong}) - ${category}`);

            // 안전한 DOM 생성 방식으로 교체
            const nameDiv = Utils.createSafeElement(
                'div',
                storeName,
                {},
                {
                    className: 'grouped-store-name'
                }
            );
            nameDiv.className = 'grouped-store-name';

            const infoDiv = Utils.createSafeElement(
                'div',
                '',
                {},
                {
                    className: 'grouped-store-info'
                }
            );
            infoDiv.className = 'grouped-store-info';

            // 정보 텍스트 안전하게 구성
            let infoText = dong;
            if (category !== '업종 정보 없음') {
                infoText += ` · ${category}`;
            }
            if (distance) {
                infoText += ` · ${distance}m`;
            }
            infoDiv.textContent = infoText;

            storeItem.appendChild(nameDiv);
            storeItem.appendChild(infoDiv);

            // 개별 매장 클릭 시 정보창 표시
            const clickHandler = (e) => {
                e.stopPropagation();
                if (this.currentGroupOverlay) {
                    this.currentGroupOverlay.setMap(null);
                    this.currentGroupOverlay = null;
                }

                // 단일 매장 정보창 표시
                this.showInfoWindow(marker, [item]);
            };
            this.addEventListenerSafe(storeItem, 'click', clickHandler);

            list.appendChild(storeItem);
        });

        popup.appendChild(header);
        popup.appendChild(list);

        // 팝업을 커스텀 오버레이로 추가
        this.currentGroupOverlay = new kakao.maps.CustomOverlay({
            position: position,
            content: popup,
            yAnchor: 1.5,
            clickable: true,
            zIndex: CONSTANTS.UI_DIMENSIONS.Z_INDEX_HIGH
        });

        this.addCustomOverlaySafe(this.currentGroupOverlay);
        this.currentGroupOverlay.setMap(this.map);

        // 닫기 버튼 이벤트
        const closeButton = header.querySelector('.close-popup');
        const closeHandler = () => {
            if (this.currentGroupOverlay) {
                this.currentGroupOverlay.setMap(null);
                this.currentGroupOverlay = null;
            }
        };
        this.addEventListenerSafe(closeButton, 'click', closeHandler);

        // 지도 클릭 시 팝업 닫기
        const mapClickHandler = () => {
            if (this.currentGroupOverlay) {
                this.currentGroupOverlay.setMap(null);
                this.currentGroupOverlay = null;
            }
        };
        this.addEventListenerSafe(this.map, 'click', mapClickHandler);
    }

    // 마커 추가
    addMarkers(storeLocations) {
        Utils.log('addMarkers 시작, 위치 데이터:', storeLocations.length);

        // 기존 마커들을 완전히 제거
        this.clearMarkers();

        // 위치별로 그룹화
        const locationGroups = this.groupByLocation(storeLocations);
        Utils.log('그룹화된 위치:', locationGroups.size);

        // 마커 생성
        const markers = [];
        locationGroups.forEach((stores, key) => {
            Utils.log(`마커 생성: ${key} (${stores.length}개 가맹점)`);

            // 그룹 내에서 가장 정확한 위치 정보를 가진 가맹점 선택
            const representativeStore = this.selectRepresentativeLocation(stores);
            const { lat, lng } = representativeStore.location;
            const position = new kakao.maps.LatLng(lat, lng);

            Utils.log(
                `대표 위치 선택: ${representativeStore.store?.상호 || representativeStore.상호} (${lat.toFixed(6)}, ${lng.toFixed(6)})`
            );

            const marker = this.createMarker(position, stores);

            markers.push(marker);
            this.markers.set(key, marker);

            // 그룹화된 마커인 경우 오버레이 추가
            if (stores.length > 1) {
                this.addGroupOverlay(marker, stores.length);
            }
        });

        // 클러스터러에 추가
        Utils.log(`클러스터러에 마커 ${markers.length}개 추가`);
        this.clusterer.addMarkers(markers);

        // 상태 업데이트
        stateManager.setState({ markers: this.markers });

        Utils.log(`마커 생성 완료: 총 ${this.markers.size}개`);
    }

    // 검색 결과로 마커 업데이트 (기존 마커 유지)
    updateMarkersWithSearchResults(searchResults) {
        Utils.log('=== updateMarkersWithSearchResults 시작 ===');
        Utils.log('검색 결과:', searchResults.length);
        Utils.log('기존 마커 수:', this.markers.size);

        // 검색 진행 중 플래그 설정
        this.isSearchInProgress = true;

        try {
            // 검색 결과를 위치별로 그룹화
            const newLocationGroups = this.groupByLocation(searchResults);
            Utils.log('검색 결과 그룹화된 위치:', newLocationGroups.size);

            // 처리 통계
            let updatedCount = 0;
            let createdCount = 0;

            newLocationGroups.forEach((stores, key) => {
                Utils.log(`\n--- 위치 ${key} 처리 시작 (${stores.length}개 가맹점) ---`);

                // 기존 마커 확인
                const existingMarker = this.markers.get(key);

                if (existingMarker) {
                    Utils.log('✓ 기존 마커 발견, 업데이트 진행');

                    // 기존 마커의 모든 이벤트 리스너 완전히 제거
                    this.removeMarkerListeners(existingMarker, key);

                    // 새로운 이벤트 리스너 등록
                    this.addMarkerListeners(existingMarker, stores, key, 'updated');

                    // 마커 타이틀 업데이트
                    existingMarker.setTitle(stores.map((item) => item.store.상호).join(', '));

                    // 그룹 오버레이 업데이트
                    this.updateGroupOverlay(existingMarker, stores.length);

                    updatedCount++;
                } else {
                    Utils.log('✓ 새 마커 생성 필요');

                    // 그룹 내에서 가장 정확한 위치 정보를 가진 가맹점 선택
                    const representativeStore = this.selectRepresentativeLocation(stores);
                    const { lat, lng } = representativeStore.location;
                    const position = new kakao.maps.LatLng(lat, lng);
                    const marker = this.createMarkerWithoutListeners(position, stores);

                    // 이벤트 리스너 추가
                    this.addMarkerListeners(marker, stores, key, 'created');

                    // 마커 등록
                    this.markers.set(key, marker);
                    this.clusterer.addMarker(marker);

                    // 그룹 오버레이 추가
                    if (stores.length > 1) {
                        this.addGroupOverlay(marker, stores.length);
                    }

                    createdCount++;
                }
            });

            // 상태 업데이트
            stateManager.setState({ markers: this.markers });

            Utils.log('=== updateMarkersWithSearchResults 완료 ===');
            Utils.log(
                `업데이트: ${updatedCount}개, 생성: ${createdCount}개, 전체: ${this.markers.size}개`
            );
        } finally {
            // 검색 완료 후 플래그 해제
            this.isSearchInProgress = false;
        }
    }

    // 마커 이벤트 리스너 제거
    removeMarkerListeners(marker, key) {
        Utils.log(`이벤트 리스너 제거: ${key}`);
        try {
            // 모든 이벤트 리스너 완전히 제거
            if (marker._clickListener) {
                kakao.maps.event.removeListener(marker, 'click', marker._clickListener);
                marker._clickListener = null;
            }
            if (marker._mousedownListener) {
                kakao.maps.event.removeListener(marker, 'mousedown', marker._mousedownListener);
                marker._mousedownListener = null;
            }

            // 추가 안전장치: 모든 이벤트 제거
            try {
                kakao.maps.event.removeListener(marker, 'click');
                kakao.maps.event.removeListener(marker, 'mousedown');
            } catch {
                // 이미 제거된 경우 무시
            }
        } catch (error) {
            Utils.warn(`마커 ${key} 이벤트 리스너 제거 중 오류:`, error);
        }
    }

    // 마커 이벤트 리스너 추가
    addMarkerListeners(marker, stores, key, type) {
        Utils.log(`이벤트 리스너 추가: ${key} (${type})`);

        // 전역 클릭 처리 상태 관리
        if (!window.markerClickState) {
            window.markerClickState = new Map();
        }

        const handleMarkerClick = () => {
            const now = Date.now();
            const lastClick = window.markerClickState.get(key);

            // 500ms 이내 중복 클릭 방지
            if (lastClick && now - lastClick < 500) {
                Utils.log(`중복 클릭 무시: ${key} (${now - lastClick}ms 간격)`);
                return;
            }

            window.markerClickState.set(key, now);

            Utils.log(`${type} 마커 클릭 처리: ${key}`);
            this.showInfoWindow(marker, stores);
        };

        // 새 이벤트 리스너 등록 - 추적 시스템 사용
        const clickListener = this.addEventListenerTracked(
            marker,
            'click',
            handleMarkerClick,
            'kakao'
        );

        let mousedownListener = null;
        if (navigator.userAgent.toLowerCase().indexOf('firefox') > -1) {
            mousedownListener = this.addEventListenerTracked(
                marker,
                'mousedown',
                handleMarkerClick,
                'kakao'
            );
        }

        // 리스너 정보 저장
        marker._clickListener = clickListener;
        marker._mousedownListener = mousedownListener;
        marker._markerKey = key; // 디버깅용
    }

    // 이벤트 리스너 없이 마커 생성
    createMarkerWithoutListeners(position, data) {
        const markerImage = new kakao.maps.MarkerImage(
            'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',
            new kakao.maps.Size(
                CONSTANTS.MAP.MARKER_IMAGE_SIZE.width,
                CONSTANTS.MAP.MARKER_IMAGE_SIZE.height
            ),
            {
                offset: new kakao.maps.Point(
                    CONSTANTS.MAP.MARKER_IMAGE_OFFSET.x,
                    CONSTANTS.MAP.MARKER_IMAGE_OFFSET.y
                )
            }
        );

        return new kakao.maps.Marker({
            position: position,
            image: markerImage,
            clickable: true,
            zIndex: 3,
            title: data.map((item) => item.store.상호).join(', ')
        });
    }

    // 그룹 오버레이 업데이트
    updateGroupOverlay(marker, storeCount) {
        // 기존 오버레이 제거
        const existingOverlay = this.groupedMarkers.get(marker);
        if (existingOverlay) {
            existingOverlay.setMap(null);
            this.groupedMarkers.delete(marker);
        }

        // 새 오버레이 추가
        if (storeCount > 1) {
            this.addGroupOverlay(marker, storeCount);
        }
    }

    // 위치별 그룹화 (행정동/도로명주소 기반)
    groupByLocation(storeLocations) {
        const groups = new Map();
        const GROUPING_DISTANCE_METERS = CONSTANTS.DISTANCE.GROUPING_THRESHOLD;

        storeLocations.forEach((item) => {
            const store = item.store || item;
            const location = item.location;

            if (!location || !location.lat || !location.lng) {
                Utils.warn(`위치 정보가 없는 가맹점 건너뜀: ${store.상호}`);
                return;
            }

            const currentLat = parseFloat(location.lat);
            const currentLng = parseFloat(location.lng);

            if (isNaN(currentLat) || isNaN(currentLng)) {
                Utils.warn(
                    `잘못된 위치 정보: ${store.상호} - lat: ${location.lat}, lng: ${location.lng}`
                );
                return;
            }

            let foundGroup = false;
            let groupKey = null;

            // 기존 그룹들과 거리 비교
            for (const [key, groupStores] of groups) {
                const firstStore = groupStores[0];
                const firstLocation = firstStore.location;

                if (!firstLocation) {
                    continue;
                }

                const firstLat = parseFloat(firstLocation.lat);
                const firstLng = parseFloat(firstLocation.lng);

                // 거리 계산 (미터)
                const distance = this.calculateDistance(currentLat, currentLng, firstLat, firstLng);

                Utils.log(
                    `거리 계산: ${store.상호} <-> ${firstStore.store?.상호 || firstStore.상호} = ${distance.toFixed(1)}m`
                );

                if (distance <= GROUPING_DISTANCE_METERS) {
                    // 더 엄격한 조건들 추가
                    const currentDong = store.읍면동명 || store.행정동 || '';
                    const firstDong =
                        firstStore.store?.읍면동명 ||
                        firstStore.store?.행정동 ||
                        firstStore.읍면동명 ||
                        firstStore.행정동 ||
                        '';

                    // 주소 유사성 검사 (도로명 또는 건물명 비교)
                    const currentAddress = location.roadAddress || location.jibunAddress || '';
                    const firstAddress =
                        firstLocation.roadAddress || firstLocation.jibunAddress || '';

                    const addressSimilar = this.isAddressSimilar(currentAddress, firstAddress);

                    // 조건: 같은 행정동 + 주소 유사성 + 매우 가까운 거리
                    if (currentDong === firstDong && addressSimilar) {
                        groupKey = key;
                        foundGroup = true;
                        Utils.log(
                            `✓ 그룹에 추가: ${store.상호} → 그룹 ${key} (거리: ${distance.toFixed(1)}m, 행정동: ${currentDong}, 주소유사: ${addressSimilar})`
                        );
                        break;
                    } else {
                        Utils.log(
                            `✗ 조건 불만족: ${store.상호} - 거리OK(${distance.toFixed(1)}m) 하지만 행정동(${currentDong}≠${firstDong}) 또는 주소불일치`
                        );
                    }
                }
            }

            if (!foundGroup) {
                // 새로운 그룹 생성 (더 정밀한 위치 기반 키)
                groupKey = `${currentLat.toFixed(CONSTANTS.UI_DIMENSIONS.COORDINATE_PRECISION)}_${currentLng.toFixed(CONSTANTS.UI_DIMENSIONS.COORDINATE_PRECISION)}`;
                groups.set(groupKey, []);
                Utils.log(`✓ 새 그룹 생성: ${store.상호} → ${groupKey}`);
            }

            groups.get(groupKey).push(item);
        });

        // 그룹화 결과 로깅
        Utils.log('\n=== 개선된 그룹화 결과 ===');
        groups.forEach((stores, key) => {
            Utils.log(`그룹 "${key}": ${stores.length}개 가맹점`);
            stores.forEach((store) => {
                const storeName = store.store?.상호 || store.상호 || '';
                const dong =
                    store.store?.읍면동명 ||
                    store.store?.행정동 ||
                    store.읍면동명 ||
                    store.행정동 ||
                    '';
                const location = store.location;
                const address = location.roadAddress || location.jibunAddress || '';
                Utils.log(
                    `  - ${storeName} (${dong}) [${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}] ${address.substring(0, 30)}...`
                );
            });
        });

        return groups;
    }

    // 주소 유사성 검사
    isAddressSimilar(address1, address2) {
        if (!address1 || !address2) {
            return false;
        }

        // 주소를 정규화 (공백, 특수문자 제거)
        const normalize = (addr) => addr.replace(/[\s\-()]/g, '').toLowerCase();
        const norm1 = normalize(address1);
        const norm2 = normalize(address2);

        // 완전 일치
        if (norm1 === norm2) {
            return true;
        }

        // 도로명이 같은지 확인
        const roadPattern = /(.+로\d*|.+길\d*)/;
        const road1 = norm1.match(roadPattern)?.[1];
        const road2 = norm2.match(roadPattern)?.[1];

        if (road1 && road2 && road1 === road2) {
            // 같은 도로명이면 건물번호 차이 확인
            const numPattern = /(\d+)/g;
            const nums1 = norm1.match(numPattern)?.map((n) => parseInt(n)) || [];
            const nums2 = norm2.match(numPattern)?.map((n) => parseInt(n)) || [];

            // 건물번호 차이가 10 이하면 같은 건물군으로 간주
            if (nums1.length > 0 && nums2.length > 0) {
                const minDiff = Math.min(
                    ...nums1.map((n1) => Math.min(...nums2.map((n2) => Math.abs(n1 - n2))))
                );
                return minDiff <= 10;
            }

            return true;
        }

        return false;
    }

    // 주소 정리 함수 (그룹화용)
    cleanAddressForGrouping(address) {
        if (!address || typeof address !== 'string') {
            return '';
        }

        let cleanAddress = address.trim();

        // 상세 번지수, 호수, 층수 등 제거
        cleanAddress = cleanAddress
            // 번지수 제거 (예: "123-45" → "")
            .replace(/\s+\d+-?\d*\s*$/, '')
            .replace(/\s+\d+번지?\s*$/, '')
            // 호수, 층수 제거 (예: "101호", "2층" → "")
            .replace(/\s+\d+호\s*$/, '')
            .replace(/\s+\d+층\s*$/, '')
            .replace(/\s+[B]?\d+F?\s*$/, '')
            // 건물명 뒤 상세정보 제거
            .replace(/\s+\d+동\s+\d+호?\s*$/, '')
            .replace(/\s+[A-Z]동\s*$/, '')
            // 괄호 안 상세정보 제거 (예: "(1층)", "(101호)" → "")
            .replace(/\s*\([^)]*\)\s*$/, '')
            // 연속된 공백 정리
            .replace(/\s+/g, ' ')
            .trim();

        // 도로명만 추출 (건물명 앞까지)
        const roadMatch = cleanAddress.match(/^(.+?로\d*)\s/);
        if (roadMatch) {
            cleanAddress = roadMatch[1];
        }

        return cleanAddress;
    }

    /**
     * 두 좌표 간의 거리 계산 (미터 단위)
     * Haversine 공식 사용
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // 지구의 반지름 (미터)
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // 거리 (미터)
    }

    // 대표 위치 선택 (그룹 내에서 가장 정확한 위치 정보를 가진 가맹점)
    selectRepresentativeLocation(stores) {
        if (stores.length === 1) {
            return stores[0];
        }

        // 우선순위 기준으로 정렬
        const sortedStores = [...stores].sort((a, b) => {
            const storeA = a.store || a;
            const storeB = b.store || b;
            const locationA = a.location;
            const locationB = b.location;

            // 1. 도로명주소가 더 상세한 것 우선
            const addressA = storeA.도로명주소 || locationA.roadAddress || '';
            const addressB = storeB.도로명주소 || locationB.roadAddress || '';

            if (addressA.length !== addressB.length) {
                return addressB.length - addressA.length; // 더 긴 주소 우선
            }

            // 2. 카카오 검색에서 찾은 위치 정보가 더 정확함
            const hasKakaoDataA = locationA.placeName || locationA.placeUrl;
            const hasKakaoDataB = locationB.placeName || locationB.placeUrl;

            if (hasKakaoDataA && !hasKakaoDataB) {
                return -1;
            }
            if (!hasKakaoDataA && hasKakaoDataB) {
                return 1;
            }

            // 3. 좌표 정밀도가 더 높은 것 우선 (소수점 자릿수)
            const latPrecisionA = (locationA.lat.toString().split('.')[1] || '').length;
            const latPrecisionB = (locationB.lat.toString().split('.')[1] || '').length;

            if (latPrecisionA !== latPrecisionB) {
                return latPrecisionB - latPrecisionA; // 더 정밀한 좌표 우선
            }

            // 4. 카테고리 정보가 있는 것 우선
            const hasCategoryA = storeA.표준산업분류명 || locationA.category;
            const hasCategoryB = storeB.표준산업분류명 || locationB.category;

            if (hasCategoryA && !hasCategoryB) {
                return -1;
            }
            if (!hasCategoryA && hasCategoryB) {
                return 1;
            }

            return 0;
        });

        const selected = sortedStores[0];
        const storeName = selected.store?.상호 || selected.상호 || '';

        Utils.log('대표 위치 선택 상세:');
        Utils.log(`  선택됨: ${storeName}`);
        Utils.log(`  주소: ${selected.store?.도로명주소 || selected.location?.roadAddress || ''}`);
        Utils.log(
            `  좌표 정밀도: ${(selected.location.lat.toString().split('.')[1] || '').length}자리`
        );

        return selected;
    }

    // 그룹 오버레이 추가
    addGroupOverlay(marker, count) {
        const content = `<div class="grouped-marker-overlay">${count}</div>`;

        const customOverlay = new kakao.maps.CustomOverlay({
            content: content,
            position: marker.getPosition(),
            xAnchor: 0.5,
            yAnchor: 2.8,
            zIndex: 3
        });

        customOverlay.setMap(this.map);
        this.groupedMarkers.set(marker, customOverlay);
    }

    // 마커 제거
    clearMarkers() {
        Utils.log('clearMarkers 시작, 기존 마커:', this.markers.size);

        // 클러스터러 초기화
        if (this.clusterer) {
            this.clusterer.clear();
        }

        // 개별 마커 제거 및 이벤트 리스너 정리
        this.markers.forEach((marker, key) => {
            if (marker) {
                // 이벤트 리스너 제거
                try {
                    if (marker._clickListener) {
                        kakao.maps.event.removeListener(marker._clickListener);
                        marker._clickListener = null;
                    }
                    if (marker._mousedownListener) {
                        kakao.maps.event.removeListener(marker._mousedownListener);
                        marker._mousedownListener = null;
                    }
                } catch (error) {
                    Utils.warn(`마커 ${key} 이벤트 리스너 제거 중 오류:`, error);
                }

                // 마커를 지도에서 제거
                if (marker.setMap) {
                    marker.setMap(null);
                }
            }
        });
        this.markers.clear();

        // 그룹 오버레이 제거
        this.groupedMarkers.forEach((overlay, _marker) => {
            if (overlay && overlay.setMap) {
                overlay.setMap(null);
            }
        });
        this.groupedMarkers.clear();

        // 정보창 닫기
        this.closeInfoWindow();

        Utils.log('clearMarkers 완료');
    }

    // 모든 마커 제거 (외부 호출용)
    clearAllMarkers() {
        this.clearMarkers();
    }

    // 정보창 닫기
    closeInfoWindow() {
        if (this.infowindow) {
            this.infowindow.close();
        }
    }

    // 현재 위치 표시
    showCurrentLocation() {
        if (!navigator.geolocation) {
            throw new Error('브라우저가 위치 정보를 지원하지 않습니다.');
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    const locPosition = new kakao.maps.LatLng(lat, lng);

                    // 기존 마커 제거
                    if (this.currentLocationMarker) {
                        this.currentLocationMarker.setMap(null);
                    }

                    // 새 마커 생성
                    const content = '<div class="current-location-marker"></div>';
                    this.currentLocationMarker = new kakao.maps.CustomOverlay({
                        position: locPosition,
                        content: content,
                        zIndex: 10
                    });

                    this.currentLocationMarker.setMap(this.map);
                    this.map.setCenter(locPosition);
                    this.map.setLevel(3);

                    // 현재 위치 좌표를 state에 저장
                    stateManager.setState({
                        currentLocationMarker: this.currentLocationMarker,
                        currentLocation: { lat, lng }
                    });

                    Utils.log(`현재 위치 저장됨: ${lat}, ${lng}`);
                    resolve(locPosition);
                },
                () => {
                    reject(new Error('위치 정보를 가져올 수 없습니다.'));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                }
            );
        });
    }

    /**
     * 현재 저장된 사용자 위치 반환
     */
    getCurrentLocation() {
        const state = stateManager.getState();
        return state.currentLocation || null;
    }

    // 지도 영역 가져오기
    getBounds() {
        if (!this.map) {
            throw new Error('지도가 초기화되지 않았습니다.');
        }

        const bounds = this.map.getBounds();
        if (!bounds) {
            throw new Error('지도 영역 정보를 가져올 수 없습니다.');
        }

        return bounds;
    }

    // 지도 중심 이동
    setCenter(lat, lng) {
        const position = new kakao.maps.LatLng(lat, lng);
        this.map.setCenter(position);
    }

    // 지도 레벨 설정
    setLevel(level) {
        this.map.setLevel(level);
    }

    // 확대
    zoomIn() {
        const level = this.map.getLevel();
        this.map.setLevel(level - 1);
    }

    // 축소
    zoomOut() {
        const level = this.map.getLevel();
        this.map.setLevel(level + 1);
    }

    // 지도 크기 재조정
    relayout() {
        if (this.map) {
            this.map.relayout();
        }
    }

    // 모든 마커 표시
    showAllMarkers() {
        if (!this.map) {
            Utils.error('지도가 초기화되지 않았습니다.');
            return;
        }

        // 검색 중인 경우 showAllMarkers 무시
        if (this.isSearchInProgress) {
            Utils.log('검색 중이므로 showAllMarkers 건너뛰기');
            return;
        }

        const state = stateManager.getState();
        const stores = state.stores || [];

        // 위치 정보가 있는 가맹점만 필터링하여 형식 맞추기
        const storesWithLocation = stores
            .filter((store) => store.location && store.location.lat && store.location.lng)
            .map((store) => ({
                store: store,
                location: store.location
            }));

        if (storesWithLocation.length === 0) {
            Utils.log('표시할 위치 정보가 없습니다.');
            return;
        }

        Utils.log('showAllMarkers 실행');

        // 기존 마커를 제거하고 새로 추가
        this.addMarkers(storesWithLocation);

        // 모든 마커가 보이도록 지도 영역 조정
        const bounds = new kakao.maps.LatLngBounds();
        storesWithLocation.forEach((item) => {
            bounds.extend(new kakao.maps.LatLng(item.location.lat, item.location.lng));
        });
        this.map.setBounds(bounds);

        Utils.log(`${storesWithLocation.length}개의 마커를 표시했습니다.`);
    }

    // 주소 검색
    searchAddress(keyword) {
        return new Promise((resolve, reject) => {
            // Places 서비스가 없으면 오류 반환
            if (!this.ps) {
                reject(
                    new AppError(
                        'Places 서비스가 사용할 수 없습니다. 위치 검색 기능이 제한됩니다.',
                        ErrorCodes.MAP_SEARCH_ERROR,
                        { reason: 'places_service_unavailable' }
                    )
                );
                return;
            }

            this.ps.keywordSearch(
                keyword,
                (data, status) => {
                    if (status === kakao.maps.services.Status.OK) {
                        resolve(data);
                    } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
                        reject(
                            new AppError('검색 결과가 없습니다.', ErrorCodes.LOCATION_NOT_FOUND, {
                                keyword
                            })
                        );
                    } else {
                        reject(
                            new AppError(
                                '검색 중 오류가 발생했습니다.',
                                ErrorCodes.MAP_SEARCH_ERROR,
                                { status }
                            )
                        );
                    }
                },
                {
                    size: 15,
                    sort: kakao.maps.services.SortBy.ACCURACY
                }
            );
        });
    }

    // 이벤트 리스너 안전 추가
    addEventListenerSafe(target, event, handler) {
        if (target && typeof target.addEventListener === 'function') {
            target.addEventListener(event, handler);
            this.eventListeners.add({ target, event, handler });
            return handler;
        } else if (target && typeof kakao !== 'undefined' && kakao.maps && kakao.maps.event) {
            const listener = this.addEventListenerTracked(target, event, handler, 'kakao');
            this.eventListeners.add({ type: 'kakao', target, event, listener });
            return listener;
        }
        return null;
    }

    // 커스텀 오버레이 안전 추가
    addCustomOverlaySafe(overlay) {
        if (overlay) {
            this.customOverlays.add(overlay);
        }
        return overlay;
    }

    // 모든 리소스 정리
    cleanupResources() {
        // DOM 이벤트 리스너 제거
        this.eventListeners.forEach((item) => {
            try {
                if (item.type === 'kakao' && item.listener) {
                    kakao.maps.event.removeListener(item.target, item.event, item.listener);
                } else if (item.target && item.event && item.handler) {
                    item.target.removeEventListener(item.event, item.handler);
                }
            } catch (error) {
                Utils.warn('이벤트 리스너 제거 중 오류:', error);
            }
        });
        this.eventListeners.clear();

        // 커스텀 오버레이 제거
        this.customOverlays.forEach((overlay) => {
            try {
                if (overlay && typeof overlay.setMap === 'function') {
                    overlay.setMap(null);
                }
            } catch (error) {
                Utils.warn('오버레이 제거 중 오류:', error);
            }
        });
        this.customOverlays.clear();

        // 그룹 오버레이 제거
        if (this.currentGroupOverlay) {
            try {
                this.currentGroupOverlay.setMap(null);
                this.currentGroupOverlay = null;
            } catch (error) {
                Utils.warn('그룹 오버레이 제거 중 오류:', error);
            }
        }
    }

    // 정리
    destroy() {
        // 모든 리소스 정리
        this.cleanupResources();

        // 마커 제거
        this.clearMarkers();

        // 현재 위치 마커 제거
        if (this.currentLocationMarker) {
            this.currentLocationMarker.setMap(null);
            this.currentLocationMarker = null;
        }

        // 정보창 제거
        if (this.infowindow) {
            this.infowindow.close();
            this.infowindow = null;
        }

        // 클러스터러 제거
        if (this.clusterer) {
            this.clusterer.clear();
            this.clusterer = null;
        }

        // 정리 작업 인터벌 해제
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        this.isInitialized = false;
    }
}

// 싱글톤 인스턴스
export const mapManager = new MapManager();

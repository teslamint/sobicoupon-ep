let map;
let markers = [];
let storeData = [];
let filteredData = [];
let geocoder;
let infowindow;
let dongList = new Set();
let categoryList = new Map(); // 카테고리 코드와 이름을 저장
let isSearching = false;
let searchAborted = false;
let sortOrder = 'none'; // 'none', 'asc', 'desc'
let currentPage = 1;
let pageSize = 25;
let currentGroupOverlay = null; // 현재 표시중인 그룹 오버레이
let highlightMarker = null; // 현재 강조 표시된 마커
let currentInfoOverlay = null; // 현재 표시중인 인포 오버레이
let highlightMarkerImage = null; // 강조 마커 이미지
let clusterer = null; // 마커 클러스터러
let db = null; // IndexedDB 인스턴스

// IndexedDB 초기화
function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('EunpyeongStoreDB', 2);

        request.onerror = function() {
            console.error('IndexedDB 열기 실패:', request.error);
            reject(request.error);
        };

        request.onsuccess = function() {
            db = request.result;
            console.log('IndexedDB 연결 성공');
            resolve(db);
        };

        request.onupgradeneeded = function(event) {
            db = event.target.result;

            // 매장 정보 테이블
            if (!db.objectStoreNames.contains('stores')) {
                const storeObjectStore = db.createObjectStore('stores', { keyPath: '인덱스' });
                storeObjectStore.createIndex('행정동', '행정동', { unique: false });
                storeObjectStore.createIndex('상호', '상호', { unique: false });
            }

            // 메타데이터 테이블 (파일 업로드 시간 등)
            if (!db.objectStoreNames.contains('metadata')) {
                db.createObjectStore('metadata', { keyPath: 'key' });
            }
        };
    });
}

// 데이터 저장
async function saveToIndexedDB(data, metadata) {
    if (!db) await initIndexedDB();

    const transaction = db.transaction(['stores', 'metadata'], 'readwrite');
    const storeObjectStore = transaction.objectStore('stores');
    const metaObjectStore = transaction.objectStore('metadata');

    // 기존 데이터 삭제
    await new Promise((resolve, reject) => {
        const clearRequest = storeObjectStore.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
    });

    // 새 데이터 저장
    for (const store of data) {
        storeObjectStore.add(store);
    }

    // 메타데이터 저장
    metaObjectStore.put({
        key: 'lastUpdate',
        timestamp: new Date().toISOString(),
        storeCount: data.length,
        dongCount: metadata.dongCount
    });

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            console.log('IndexedDB에 데이터 저장 완료');
            resolve();
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

// 데이터 불러오기
async function loadFromIndexedDB() {
    if (!db) await initIndexedDB();

    const transaction = db.transaction(['stores', 'metadata'], 'readonly');
    const storeObjectStore = transaction.objectStore('stores');
    const metaObjectStore = transaction.objectStore('metadata');

    // 메타데이터 확인
    const metadata = await new Promise((resolve) => {
        const request = metaObjectStore.get('lastUpdate');
        request.onsuccess = () => resolve(request.result);
    });

    if (!metadata) return null;

    // 모든 매장 데이터 불러오기
    const stores = await new Promise((resolve) => {
        const request = storeObjectStore.getAll();
        request.onsuccess = () => resolve(request.result);
    });

    return { stores, metadata };
}

// 위치 검색 결과 캐싱
async function updateStoreLocation(storeIndex, locationData) {
    if (!db) await initIndexedDB();

    const transaction = db.transaction(['stores'], 'readwrite');
    const objectStore = transaction.objectStore('stores');

    const request = objectStore.get(storeIndex);
    request.onsuccess = function() {
        const store = request.result;
        if (store) {
            store.검색결과 = locationData.검색결과;
            if (locationData.coords) {
                // Kakao Maps 객체를 일반 객체로 변환하여 저장
                const lat = typeof locationData.coords.getLat === 'function' ? locationData.coords.getLat() : locationData.coords.lat;
                const lng = typeof locationData.coords.getLng === 'function' ? locationData.coords.getLng() : locationData.coords.lng;
                store.coords = { lat: lat, lng: lng };
                store.foundAddress = locationData.foundAddress;
            }
            // 카테고리 정보도 저장
            if (locationData.category) {
                store.category = locationData.category;
            }
            objectStore.put(store);
        }
    };
}

// 캐시 삭제 함수
async function clearCache() {
    if (!confirm('저장된 모든 데이터를 삭제하시겠습니까?')) return;

    try {
        if (!db) await initIndexedDB();

        const transaction = db.transaction(['stores', 'metadata'], 'readwrite');
        const storeObjectStore = transaction.objectStore('stores');
        const metaObjectStore = transaction.objectStore('metadata');

        await new Promise((resolve, reject) => {
            storeObjectStore.clear();
            metaObjectStore.clear();

            transaction.oncomplete = () => {
                showStatus('캐시된 데이터가 삭제되었습니다.', 'success');
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });

        // 현재 데이터도 초기화
        storeData = [];
        filteredData = [];
        dongList.clear();
        markers = [];

        // UI 초기화
        document.getElementById('storesList').innerHTML = '';
        document.getElementById('dongFilter').innerHTML = '<option value="">모든 행정동</option>';
        document.getElementById('storesSection').style.display = 'none';
        document.getElementById('uploadSection').style.display = 'block';
        document.getElementById('usageInfo').style.display = 'block';
        document.getElementById('cautionInfo').style.display = 'block';

        // 지도 초기화
        if (map) {
            clearMarkers();
        }

        updateStats();
    } catch (error) {
        console.error('캐시 삭제 실패:', error);
        showStatus('캐시 삭제 중 오류가 발생했습니다.', 'error');
    }
}

// 전역 스코프에 함수 노출
window.clearCache = clearCache;

// 카테고리 드롭다운 관련 함수들
let selectedCategories = [];
let ps; // Places 서비스
let searchMarkers = [];
let currentLocationMarker = null;
let allStoresData = [];
let searchQueue = [];
let highlightedDong = null; // 현재 강조된 행정동
let userLocation = null; // 사용자 위치 정보
let sortedStores = []; // 거리순으로 정렬된 가맹점 목록

function toggleCategoryDropdown() {
    const dropdown = document.getElementById('categoryDropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function updateCategorySelection() {
    const checkboxes = document.querySelectorAll('#categoryDropdown input[type="checkbox"]:not(#selectAll)');
    selectedCategories = [];
    let checkedCount = 0;

    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selectedCategories.push(checkbox.value);
            checkedCount++;
        }
    });

    // 선택된 개수 표시 업데이트
    const selectedCount = document.getElementById('selectedCount');
    const selectAllCheckbox = document.getElementById('selectAll');

    if (checkedCount === 0) {
        selectedCount.textContent = '(선택 안함)';
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (checkedCount === checkboxes.length) {
        selectedCount.textContent = '(전체)';
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectedCount.textContent = `(${checkedCount}개)`;
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

function toggleAllCategories() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('#categoryDropdown input[type="checkbox"]:not(#selectAll)');

    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });

    updateCategorySelection();
}

// 전역 스코프에 함수 노출
window.toggleCategoryDropdown = toggleCategoryDropdown;
window.updateCategorySelection = updateCategorySelection;
window.toggleAllCategories = toggleAllCategories;

// 드롭다운 외부 클릭 시 닫기
// 모바일 친화적 드롭다운 닫기
document.addEventListener('click', function(event) {
    const wrapper = document.querySelector('.category-filter-wrapper');
    const dropdown = document.getElementById('categoryDropdown');

    if (!wrapper.contains(event.target)) {
        dropdown.style.display = 'none';
    }
});

// 모바일 터치 이벤트 지원
document.addEventListener('touchstart', function(event) {
    const wrapper = document.querySelector('.category-filter-wrapper');
    const dropdown = document.getElementById('categoryDropdown');

    if (!wrapper.contains(event.target)) {
        dropdown.style.display = 'none';
    }
});


// 지도 컨트롤 함수들

const MAX_ZOOM_LEVEL = 14;

// 두 좌표 간의 픽셀 거리 계산
function getPixelDistance(pos1, pos2, map) {
    const proj = map.getProjection();
    const point1 = proj.containerPointFromCoords(pos1);
    const point2 = proj.containerPointFromCoords(pos2);

    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;

    return Math.sqrt(dx * dx + dy * dy);
}
const GEOLOCATION_TIMEOUT = 5000; // Geolocation timeout in milliseconds
const MAP_CONTROL_ZINDEX = 1000; // Consistent with CSS z-index for map controls
const CURRENT_LOCATION_ZOOM_LEVEL = 3; // 현재 위치로 이동할 때의 줌 레벨

function zoomIn() {
    const currentLevel = map.getLevel();
    if (currentLevel > 1) {
        map.setLevel(currentLevel - 1);
    }
}

function zoomOut() {
    if (!map) return;
    const currentLevel = map.getLevel();
    if (currentLevel < 14) {
        map.setLevel(currentLevel + 1);
    }
}

function showCurrentLocation() {
    if (!map) return;

    // 위치 정보 지원 여부 확인
    if (!navigator.geolocation) {
        showStatus('브라우저가 위치 정보를 지원하지 않습니다.', 'error');
        return;
    }

    showStatus('현재 위치를 가져오는 중...', 'info');

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const currentPos = new kakao.maps.LatLng(lat, lng);

            // 기존 현재 위치 마커 제거
            if (currentLocationMarker) {
                currentLocationMarker.setMap(null);
            }
            // 현재 위치 마커 SVG 상수
            const CURRENT_LOCATION_SVG = `
                <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="15" cy="15" r="8" fill="#667eea" stroke="white" stroke-width="3"/>
                    <circle cx="15" cy="15" r="15" fill="rgba(102, 126, 234, 0.2)"/>
                </svg>
            `;

            // 현재 위치 마커 생성
            const markerImage = new kakao.maps.MarkerImage(
                'data:image/svg+xml;base64,' + btoa(CURRENT_LOCATION_SVG),
                new kakao.maps.Size(30, 30),
                { offset: new kakao.maps.Point(15, 15) }
            );

            currentLocationMarker = new kakao.maps.Marker({
                position: currentPos,
                map: map,
                image: markerImage,
                zIndex: MAP_CONTROL_ZINDEX
            });

            // 지도 중심 이동
            map.setCenter(currentPos);
            map.setLevel(CURRENT_LOCATION_ZOOM_LEVEL);

            showStatus('현재 위치로 이동했습니다.', 'success');
        },
        function(error) {
            let errorMsg = '위치를 가져올 수 없습니다: ';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg += '위치 정보 접근이 거부되었습니다.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg += '위치 정보를 사용할 수 없습니다.';
                    break;
                case error.TIMEOUT:
                    errorMsg += '위치 정보 요청이 시간 초과되었습니다.';
                    break;
                default:
                    errorMsg += '알 수 없는 오류가 발생했습니다.';
            }
            showStatus(errorMsg, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: GEOLOCATION_TIMEOUT,
            maximumAge: 0
        }
    );
}
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.showCurrentLocation = showCurrentLocation;



// 페이지 로드 시 IndexedDB 초기화 및 캐시된 데이터 확인
window.addEventListener('load', async () => {
    try {
        await initIndexedDB();

        // 먼저 기존 캐시 데이터 확인
        const cachedData = await loadFromIndexedDB();

        if (cachedData && cachedData.stores.length > 0) {
            // 캐시된 데이터가 있으면 자동으로 로드 (확인창 없이)
            storeData = cachedData.stores;

            // 좌표 객체 복원
            storeData.forEach(store => {
                if (store.coords) {
                    // 캐시 파일이 La/Ma 형식을 사용할 수 있음 (Kakao Maps 내부 형식)
                    if (store.coords.La !== undefined && store.coords.Ma !== undefined) {
                        // La/Ma 형식을 lat/lng 형식으로 변환
                        store.coords = new kakao.maps.LatLng(store.coords.Ma, store.coords.La);
                    } else if (store.coords.lat && store.coords.lng) {
                        // 이미 lat/lng 형식인 경우
                        store.coords = new kakao.maps.LatLng(store.coords.lat, store.coords.lng);
                    }
                }
            });

            // 행정동 목록 복원
            dongList.clear();
            // 카테고리 목록 초기화
            categoryList.clear();
            storeData.forEach(store => {
                if (store.행정동) dongList.add(store.행정동);

                // 카테고리 정보 복원
                if (store.category) {
                    const categories = store.category.split(' > ');
                    if (categories.length > 0) {
                        const mainCategory = categories[0];
                        if (!categoryList.has(mainCategory)) {
                            categoryList.set(mainCategory, mainCategory);
                        }
                    }
                }
            });

            updateDongFilter();
            updateCategoryFilter();
            updateStats();
            filteredData = [...storeData];
            displayStores(filteredData, true);

            // UI 업데이트
            document.getElementById('usageInfo').style.display = 'none';
            document.getElementById('cautionInfo').style.display = 'none';
            document.getElementById('uploadSection').style.display = 'none';
            document.getElementById('storesSection').style.display = 'block';

            initializeMap();
            document.getElementById('showAllBtn').disabled = false;

            // 캐시된 위치 데이터를 지도에 자동 표시
            const locationsFound = storeData.filter(store => store.coords).length;
            if (locationsFound > 0) {
                showAllMarkers();
                // 상태 메시지에 캐시 날짜 표시
                const cacheDate = new Date(cachedData.metadata.timestamp);
                const isToday = new Date().toDateString() === cacheDate.toDateString();
                const dateStr = isToday ? '오늘' : cacheDate.toLocaleDateString();

                showStatus(
                    `캐시된 데이터를 자동으로 로드했습니다. (${dateStr} 저장됨) ` +
                    `${dongList.size}개 행정동, ${storeData.length}개 매장 ` +
                    `(${locationsFound}개 위치 표시됨)`,
                    'success'
                );
            } else {
                showStatus(
                    `캐시된 데이터를 자동으로 로드했습니다. ` +
                    `${dongList.size}개 행정동, ${storeData.length}개 매장`,
                    'success'
                );
            }
        } else {
            // 캐시된 데이터가 없으면 기본 안내 표시
            showStatus('데이터를 로드하려면 엑셀 파일을 선택해주세요.', 'info');
        }
    } catch (error) {
        console.error('IndexedDB 초기화 실패:', error);
    }
});

// 파일 입력 이벤트
document.getElementById('fileInput').addEventListener('change', handleFileUpload);
document.getElementById('searchInput').addEventListener('input', filterStores);
document.getElementById('dongFilter').addEventListener('change', filterStores);
document.getElementById('categoryFilter').addEventListener('change', filterStores);
document.getElementById('searchMapBtn').addEventListener('click', searchInCurrentMap);
// document.getElementById('stopSearchBtn').addEventListener('click', stopSearch); // 버튼 제거됨
document.getElementById('showAllBtn').addEventListener('click', showAllMarkers);
document.getElementById('distanceHeader').addEventListener('click', toggleDistanceSort);
document.getElementById('pageSize').addEventListener('change', handlePageSizeChange);

// 현 지도에서 검색
async function searchInCurrentMap() {
    if (!map) {
        alert('먼저 데이터를 로드해주세요.');
        return;
    }

    if (!storeData.length) {
        alert('먼저 엑셀 파일을 업로드해주세요.');
        return;
    }

    const searchBtn = document.getElementById('searchMapBtn');
    searchBtn.disabled = true;
    searchBtn.textContent = '검색 중...';

    // 현재 지도의 중심점과 영역 가져오기
    const center = map.getCenter();
    const bounds = map.getBounds();

    // 지도 영역의 대각선 거리 계산 (검색 반경으로 사용)
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const radius = Math.ceil(getDistance(sw, ne) / 2); // 반경은 대각선의 절반

    showStatus(`현재 지도 영역에서 가맹점을 검색하는 중...`, 'info');

    // 엑셀 데이터의 상호명으로 정규화
    const normalizedStoreNames = storeData.map(store => ({
        original: store,
        normalized: normalizeStoreName(store.상호)
    }));

    // 선택된 카테고리 가져오기
    const categoriesToSearch = selectedCategories.length > 0 ? selectedCategories : ['CS2', 'FD6', 'CE7', 'HP8', 'PM9', 'AC5', 'PS3', 'AT4', 'CT1', 'AG2', 'OL7'];

    // 카테고리별로 검색
    const ps = new kakao.maps.services.Places();
    const matchedStores = [];
    let searchCompleted = 0;

    for (const category of categoriesToSearch) {
        await new Promise((resolve) => {
            ps.categorySearch(category, (data, status, pagination) => {
                if (status === kakao.maps.services.Status.OK) {
                    data.forEach(place => {
                        // 은평구 내 장소인지 확인
                        const address = place.road_address_name || place.address_name || '';
                        if (address.includes('서울특별시 은평구') || address.includes('서울 은평구')) {
                            // 지도 영역 내에 있는지 확인
                            const placePos = new kakao.maps.LatLng(place.y, place.x);
                            if (bounds.contain(placePos)) {
                                const normalizedPlaceName = normalizeStoreName(place.place_name);

                                // 엑셀 데이터와 매칭
                                const matched = normalizedStoreNames.find(store =>
                                    store.normalized === normalizedPlaceName
                                );

                                if (matched) {
                                    const distance = Math.round(getDistance(center, placePos));
                                    matchedStores.push({
                                        store: matched.original,
                                        place: place,
                                        distance: distance
                                    });
                                }
                            }
                        }
                    });

                    // 다음 페이지가 있으면 계속 검색
                    if (pagination.hasNextPage) {
                        pagination.nextPage();
                    } else {
                        searchCompleted++;
                        searchBtn.textContent = `검색 중... (${Math.round(searchCompleted / categoriesToSearch.length * 100)}%)`;
                        resolve();
                    }
                } else {
                    searchCompleted++;
                    resolve();
                }
            }, {
                location: center,
                radius: Math.min(radius, 20000), // 최대 20km
                size: 15,
                page: 1
            });
        });
    }

    // 키워드 검색으로 추가 검색 (엑셀의 상호명으로 직접 검색)
    const searchedStoreNames = new Set(matchedStores.map(m => m.store.상호));
    const unsearchedStores = storeData.filter(store => !searchedStoreNames.has(store.상호));

    // 검색되지 않은 가맹점 중 일부를 키워드로 검색 (최대 20개)
    const keywordSearchStores = unsearchedStores.slice(0, 20);
    for (const store of keywordSearchStores) {
        await new Promise((resolve) => {
            ps.keywordSearch(store.상호, (data, status) => {
                if (status === kakao.maps.services.Status.OK) {
                    const nearbyPlace = data.find(place => {
                        const address = place.road_address_name || place.address_name || '';
                        const isInEunpyeong = address.includes('서울특별시 은평구') || address.includes('서울 은평구');
                        const placePos = new kakao.maps.LatLng(place.y, place.x);
                        return isInEunpyeong && bounds.contain(placePos);
                    });

                    if (nearbyPlace) {
                        const distance = Math.round(getDistance(center, new kakao.maps.LatLng(nearbyPlace.y, nearbyPlace.x)));
                        matchedStores.push({
                            store: store,
                            place: nearbyPlace,
                            distance: distance
                        });
                    }
                }
                resolve();
            }, {
                location: center,
                radius: Math.min(radius, 20000),
                size: 5
            });
        });
    }

    // 매칭 결과 처리
    displayMapSearchResults(matchedStores, center);

    searchBtn.disabled = false;
    searchBtn.textContent = '현 지도에서 검색';

    if (matchedStores.length === 0) {
        showStatus('현재 지도 영역에서 등록된 가맹점을 찾을 수 없습니다.', 'warning');
    } else {
        showStatus(`현재 지도 영역에서 ${matchedStores.length}개의 가맹점을 찾았습니다.`, 'success');
    }
}

// 지도 검색 결과 표시 함수
function displayMapSearchResults(matchedStores, centerLocation) {
    // 거리순으로 정렬
    matchedStores.sort((a, b) => a.distance - b.distance);

    // 가맹점 목록에 거리 정보 추가 및 검색 결과 업데이트
    storeData.forEach(store => {
        const matched = matchedStores.find(m => m.store.인덱스 === store.인덱스);
        if (matched) {
            store.거리 = matched.distance;
            store.검색결과 = '찾음';
            store.coords = new kakao.maps.LatLng(matched.place.y, matched.place.x);
            store.foundAddress = matched.place.road_address_name || matched.place.address_name;
            // 카테고리 정보 저장
            if (matched.place.category_name) {
                store.category = matched.place.category_name;
                // 카테고리를 전역 리스트에 추가
                const categories = matched.place.category_name.split(' > ');
                if (categories.length > 0) {
                    const mainCategory = categories[0];
                    if (!categoryList.has(mainCategory)) {
                        categoryList.set(mainCategory, mainCategory);
                    }
                }
            }
            // IndexedDB에 위치 정보 저장
            updateStoreLocation(store.인덱스, {
                검색결과: store.검색결과,
                coords: store.coords,
                foundAddress: store.foundAddress,
                category: store.category
            });
        } else {
            delete store.거리;
        }
    });

    // 카테고리 필터 업데이트
    updateCategoryFilter();

    // 거리 헤더 표시
    document.getElementById('distanceHeader').style.display = 'table-cell';

    // 매칭된 결과를 상단에 표시
    const matchedIndices = matchedStores.map(m => m.store.인덱스);
    filteredData = [
        ...storeData.filter(store => matchedIndices.includes(store.인덱스)),
        ...storeData.filter(store => !matchedIndices.includes(store.인덱스))
    ];
    displayStores(filteredData, true);

    // 같은 위치의 매장들을 그룹화 (주소 기반)
    const groupedByLocation = {};
    matchedStores.forEach(item => {
        let groupKey;

        // 도로명 주소를 우선 사용
        if (item.place.road_address_name) {
            const match = item.place.road_address_name.match(/^(.+\s\d+)(-\d+)?/);
            if (match) {
                groupKey = match[1]; // 건물번호까지만 사용
            } else {
                // 소수점 5자리로 반올림
                const roundedLat = Math.round(item.place.y * 100000) / 100000;
                const roundedLng = Math.round(item.place.x * 100000) / 100000;
                groupKey = `${roundedLat},${roundedLng}`;
            }
        } else if (item.place.address_name) {
            // 지번 주소에서도 번지까지만 추출
            const match = item.place.address_name.match(/^(.+\s\d+)(-\d+)?/);
            if (match) {
                groupKey = match[1];
            } else {
                const roundedLat = Math.round(item.place.y * 100000) / 100000;
                const roundedLng = Math.round(item.place.x * 100000) / 100000;
                groupKey = `${roundedLat},${roundedLng}`;
            }
        } else {
            // 주소가 없으면 좌표로 그룹화
            const roundedLat = Math.round(item.place.y * 100000) / 100000;
            const roundedLng = Math.round(item.place.x * 100000) / 100000;
            groupKey = `${roundedLat},${roundedLng}`;
        }

        if (!groupedByLocation[groupKey]) {
            groupedByLocation[groupKey] = [];
        }
        groupedByLocation[groupKey].push(item);
    });

    // 그룹화된 위치별로 마커 생성
    const newMarkers = [];
    Object.entries(groupedByLocation).forEach(([key, items]) => {
        const coords = new kakao.maps.LatLng(items[0].place.y, items[0].place.x);

        const marker = new kakao.maps.Marker({
            position: coords
        });

        // 마커에 데이터 저장
        marker.data = items;
        marker.stores = items.map(item => item.store);

        // 같은 위치에 여러 매장이 있는 경우 숫자 표시
        if (items.length > 1) {
            const content = document.createElement('div');
            content.className = 'grouped-marker-overlay';
            content.style.cssText = `
                position: absolute;
                bottom: 10px;
                left: 50%;
                transform: translateX(-50%);
                pointer-events: none;
            `;
            content.innerHTML = items.length;

            const customOverlay = new kakao.maps.CustomOverlay({
                position: coords,
                content: content,
                yAnchor: 1,
                zIndex: 2
            });

            marker.customOverlay = customOverlay;
        }

        // 마커 클릭 이벤트
        kakao.maps.event.addListener(marker, 'click', function() {
            if (currentGroupOverlay) {
                currentGroupOverlay.setMap(null);
                currentGroupOverlay = null;
            }

            if (items.length > 1) {
                showGroupedStoresPopup(items, coords, marker);
            } else {
                const item = items[0];
                const content = `
                    <div style="padding:10px;min-width:250px;">
                        <strong style="font-size:16px;">${item.store.상호}</strong><br>
                        <span style="color:#666;">행정동: ${item.store.행정동}</span><br>
                        ${item.store.category ? `<span style="color:#667eea;">카테고리: ${item.store.category.split(' > ')[0]}</span><br>` : ''}
                        <span style="color:#666;">주소: ${item.place.road_address_name || item.place.address_name}</span><br>
                        <span style="color:#667eea;font-weight:600;">거리: ${item.distance}m</span><br>
                        ${item.place.phone ? `<span style="color:#999;font-size:12px;">전화: ${item.place.phone}</span>` : ''}
                    </div>
                `;
                showInfoWindow(content, coords, marker);
            }
        });

        newMarkers.push(marker);
    });

    // 기존 마커 제거 후 새로운 마커들 추가
    clearMarkers();

    // 클러스터러에 새로운 마커들 추가
    if (clusterer) {
        clusterer.addMarkers(newMarkers);

        // 커스텀 오버레이 표시
        setTimeout(() => {
            newMarkers.forEach(marker => {
                if (marker.customOverlay && marker.getMap()) {
                    marker.customOverlay.setMap(map);
                }
            });
        }, 300);
    } else {
        // 클러스터러가 없으면 맵에 직접 표시
        newMarkers.forEach(marker => {
            marker.setMap(map);
            if (marker.customOverlay) {
                marker.customOverlay.setMap(map);
            }
        });
    }

    // 전역 markers 배열에 추가
    markers.push(...newMarkers);

    // 통계 업데이트
    updateStats();

    // 검색 후 전체 마커 다시 표시 (검색된 것뿐만 아니라 전체)
    // preserveView를 true로 설정하여 현재 줌과 위치 유지
    showAllMarkers(true);
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // 기존 캐시된 데이터 가져오기
            let existingStores = [];
            let existingCoords = new Map();
            let existingStoreKeys = new Set();

            try {
                const cached = await loadFromIndexedDB();
                if (cached) {
                    existingStores = cached.stores || [];
                    // 기존 위치 정보와 가맹점 키를 저장
                    existingStores.forEach(store => {
                        const key = `${store.행정동}_${store.상호}_${store.상세주소}`;
                        existingStoreKeys.add(key);

                        if (store.coords) {
                            existingCoords.set(key, {
                                coords: store.coords,
                                검색결과: store.검색결과,
                                foundAddress: store.foundAddress,
                                category: store.category
                            });
                        }
                    });
                }
            } catch (error) {
                console.log('기존 캐시 데이터 로드 실패:', error);
            }

            storeData = [];
            dongList.clear();
            const newStoreKeys = new Set();

            // 모든 시트를 순회하며 데이터 수집
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet);

                if (jsonData.length > 0) {
                    // 행정동 이름 추가
                    dongList.add(sheetName);

                    // 각 데이터에 행정동 정보 추가
                    jsonData.forEach(row => {
                        // 원본 데이터의 상호명 필드들도 공백 제거
                        const cleanedRow = { ...row };
                        if (cleanedRow.상호 !== undefined && cleanedRow.상호 !== null) {
                            cleanedRow.상호 = String(cleanedRow.상호).trim();
                        }
                        if (cleanedRow.업체명 !== undefined && cleanedRow.업체명 !== null) {
                            cleanedRow.업체명 = String(cleanedRow.업체명).trim();
                        }
                        if (cleanedRow.가맹점명 !== undefined && cleanedRow.가맹점명 !== null) {
                            cleanedRow.가맹점명 = String(cleanedRow.가맹점명).trim();
                        }
                        if (cleanedRow.상세주소 !== undefined && cleanedRow.상세주소 !== null) {
                            cleanedRow.상세주소 = String(cleanedRow.상세주소).trim();
                        }
                        if (cleanedRow.주소 !== undefined && cleanedRow.주소 !== null) {
                            cleanedRow.주소 = String(cleanedRow.주소).trim();
                        }
                        if (cleanedRow.소재지 !== undefined && cleanedRow.소재지 !== null) {
                            cleanedRow.소재지 = String(cleanedRow.소재지).trim();
                        }

                        const newStore = {
                            행정동: sheetName,
                            상호: String(cleanedRow['상호'] || cleanedRow['업체명'] || cleanedRow['가맹점명'] || '').trim(),
                            상세주소: String(cleanedRow['상세주소'] || cleanedRow['주소'] || cleanedRow['소재지'] || '').trim(),
                            원본데이터: cleanedRow,
                            인덱스: storeData.length
                        };

                        // 기존 캐시된 위치 정보가 있는지 확인
                        const key = `${newStore.행정동}_${newStore.상호}_${newStore.상세주소}`;
                        newStoreKeys.add(key);  // 새로운 데이터의 키 추가
                        const cachedLocation = existingCoords.get(key);

                        if (cachedLocation) {
                            // 기존 위치 정보를 병합
                            if (cachedLocation.coords && cachedLocation.coords.lat && cachedLocation.coords.lng) {
                                // 일반 객체를 Kakao Maps 객체로 변환
                                newStore.coords = new kakao.maps.LatLng(cachedLocation.coords.lat, cachedLocation.coords.lng);
                            } else {
                                newStore.coords = cachedLocation.coords;
                            }
                            newStore.검색결과 = cachedLocation.검색결과;
                            newStore.foundAddress = cachedLocation.foundAddress;
                            // 카테고리 정보도 복원
                            if (cachedLocation.category) {
                                newStore.category = cachedLocation.category;
                                // 카테고리를 전역 리스트에 추가
                                const categories = cachedLocation.category.split(' > ');
                                if (categories.length > 0) {
                                    const mainCategory = categories[0];
                                    if (!categoryList.has(mainCategory)) {
                                        categoryList.set(mainCategory, mainCategory);
                                    }
                                }
                            }
                        }

                        storeData.push(newStore);
                    });
                }
            });

            if (storeData.length === 0) {
                showStatus('엑셀 파일에 데이터가 없습니다.', 'error');
                return;
            }

            // 행정동 필터 옵션 추가
            updateDongFilter();
            // 카테고리 필터 옵션 추가
            updateCategoryFilter();

            // 통계 업데이트
            updateStats();

            // 필터된 데이터 초기화
            filteredData = [...storeData];
            displayStores(filteredData, true);

            // 변경사항 분석
            const addedStores = [];
            const removedStores = [];

            // 새로 추가된 가맹점 찾기
            newStoreKeys.forEach(key => {
                if (!existingStoreKeys.has(key)) {
                    const store = storeData.find(s => `${s.행정동}_${s.상호}_${s.상세주소}` === key);
                    if (store) addedStores.push(store);
                }
            });

            // 삭제된 가맹점 찾기
            existingStoreKeys.forEach(key => {
                if (!newStoreKeys.has(key)) {
                    const store = existingStores.find(s => `${s.행정동}_${s.상호}_${s.상세주소}` === key);
                    if (store) removedStores.push(store);
                }
            });

            const mergedCount = storeData.filter(s => s.coords).length;

            // 변경사항 메시지 구성
            let statusMessage = `${dongList.size}개 행정동에서 총 ${storeData.length}개의 가맹점 정보를 로드했습니다.`;

            if (addedStores.length > 0 || removedStores.length > 0) {
                statusMessage += '\n변경사항: ';
                if (addedStores.length > 0) {
                    statusMessage += `신규 ${addedStores.length}개 추가`;
                }
                if (removedStores.length > 0) {
                    if (addedStores.length > 0) statusMessage += ', ';
                    statusMessage += `${removedStores.length}개 삭제`;
                }
            }

            if (mergedCount > 0) {
                statusMessage += `\n(기존 위치 정보 ${mergedCount}개 보존됨)`;
            }

            showStatus(statusMessage, 'success');

            // 변경사항 상세 로그
            if (addedStores.length > 0) {
                console.log('새로 추가된 가맹점:', addedStores.map(s => `${s.행정동} - ${s.상호}`));
            }
            if (removedStores.length > 0) {
                console.log('삭제된 가맹점:', removedStores.map(s => `${s.행정동} - ${s.상호}`));
            }

            // IndexedDB에 데이터 저장
            try {
                await saveToIndexedDB(storeData, { dongCount: dongList.size });
                console.log('엑셀 데이터를 IndexedDB에 저장했습니다.');
            } catch (error) {
                console.error('IndexedDB 저장 실패:', error);
            }

            // 사용 방법 및 주의사항 숨기기
            document.getElementById('usageInfo').style.display = 'none';
            document.getElementById('cautionInfo').style.display = 'none';

            // 데이터 로드 영역 숨기기
            document.getElementById('uploadSection').style.display = 'none';

            // 가맹점 목록 섹션 표시
            document.getElementById('storesSection').style.display = 'block';
            document.getElementById('showAllBtn').disabled = false;

            // 지도 초기화
            initializeMap();

            // 병합된 위치 데이터가 있으면 자동으로 지도에 표시
            if (mergedCount > 0) {
                showAllMarkers();
            }

        } catch (error) {
            showStatus('파일 읽기 중 오류가 발생했습니다: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function updateDongFilter() {
    const select = document.getElementById('dongFilter');
    select.innerHTML = '<option value="">모든 행정동</option>';

    Array.from(dongList).sort().forEach(dong => {
        const option = document.createElement('option');
        option.value = dong;
        option.textContent = dong;
        select.appendChild(option);
    });
}

function updateCategoryFilter() {
    const select = document.getElementById('categoryFilter');
    select.innerHTML = '<option value="">모든 카테고리</option>';

    Array.from(categoryList.keys()).sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
    });
}

function updateStats() {
    document.getElementById('totalStores').textContent = storeData.length;
    document.getElementById('totalDongs').textContent = dongList.size;

    const found = storeData.filter(store => store.검색결과 === '찾음').length;
    const notFound = storeData.filter(store => store.검색결과 === '못찾음').length;

    document.getElementById('foundLocations').textContent = found;
    document.getElementById('notFoundLocations').textContent = notFound;
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('uploadStatus');
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = message;
}

function displayStores(data, resetPage = false) {
    const storesSection = document.getElementById('storesSection');
    storesSection.style.display = 'block';

    if (resetPage) {
        currentPage = 1;
    }

    // 페이징 계산
    const totalItems = data.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const paginatedData = data.slice(startIndex, endIndex);

    const tbody = document.getElementById('storesList');
    tbody.innerHTML = '';

    paginatedData.forEach((store) => {
        const tr = document.createElement('tr');
        tr.className = 'clickable';
        if (store.거리 !== undefined) {
            tr.className += ' nearby-match';
        }
        tr.onclick = () => searchAndShowLocation(store, store.인덱스);

        // 행정동
        const dongTd = document.createElement('td');
        dongTd.innerHTML = `<span class="dong-badge">${store.행정동}</span>`;
        tr.appendChild(dongTd);

        // 상호
        const nameTd = document.createElement('td');
        nameTd.innerHTML = `<span class="store-name">${store.상호 || '-'}</span>`;
        tr.appendChild(nameTd);

        // 카테고리
        const categoryTd = document.createElement('td');
        if (store.category) {
            const mainCategory = store.category.split(' > ')[0];
            categoryTd.innerHTML = `<span style="color: #667eea; font-size: 13px;">${mainCategory}</span>`;
        } else {
            categoryTd.innerHTML = '<span style="color: #999; font-size: 13px;">-</span>';
        }
        tr.appendChild(categoryTd);

        // 상세주소
        const addressTd = document.createElement('td');
        addressTd.textContent = store.상세주소 || '-';
        tr.appendChild(addressTd);

        // 상태
        const statusTd = document.createElement('td');
        let statusClass = '';
        let statusText = '';

        // 검색 결과에 따른 상태 표시
        if (store.검색결과 === '찾음') {
            statusClass = 'found';
            statusText = '위치 찾음';
        } else if (store.검색결과 === '못찾음') {
            statusClass = 'not-found';
            statusText = '위치 못찾음';
        } else {
            statusText = '미검색';
        }

        statusTd.innerHTML = `<span class="status-badge ${statusClass}" id="status-${store.인덱스}">${statusText}</span>`;
        tr.appendChild(statusTd);

        // 거리 (주변 검색 시에만 표시)
        const distanceTd = document.createElement('td');
        distanceTd.style.display = store.거리 !== undefined ? 'table-cell' : 'none';
        if (store.거리 !== undefined) {
            distanceTd.innerHTML = `<span style="color: #667eea; font-weight: 600;">${store.거리}m</span>`;
        }
        tr.appendChild(distanceTd);

        tbody.appendChild(tr);
    });

    // 페이징 UI 업데이트
    updatePaginationUI(totalItems, totalPages, startIndex, endIndex);
}

function filterStores() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const dongFilter = document.getElementById('dongFilter').value;
    const categoryFilter = document.getElementById('categoryFilter').value;

    filteredData = storeData.filter(store => {
        const storeName = String(store.상호 || '').toLowerCase();
        const matchesSearch = !searchTerm || storeName.includes(searchTerm);
        const matchesDong = !dongFilter || store.행정동 === dongFilter;
        const matchesCategory = !categoryFilter || (store.category && store.category.includes(categoryFilter));
        return matchesSearch && matchesDong && matchesCategory;
    });

    displayStores(filteredData, true);
}

function initializeMap() {
    const container = document.getElementById('map');
    container.style.display = 'block';

    const options = {
        center: new kakao.maps.LatLng(37.6017, 126.9295), // 은평구 중심 좌표
        level: 5
    };

    map = new kakao.maps.Map(container, options);
    geocoder = new kakao.maps.services.Geocoder();
    infowindow = new kakao.maps.InfoWindow({
        zIndex: 100,
        removable: true
    });
    // 강조 마커 이미지 초기화
    highlightMarkerImage = new kakao.maps.MarkerImage(
        'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_red.png',
        new kakao.maps.Size(30, 40)
    );

    // 마커 클러스터러 초기화
    clusterer = new kakao.maps.MarkerClusterer({
        map: map,
        averageCenter: true,
        minLevel: 3,  // 줌 레벨 3부터 클러스터링 (더 확대해야 개별 마커 표시)
        gridSize: 60,  // 클러스터링 그리드 크기
        disableClickZoom: true,
        styles: [{
            width : '30px', height : '30px',
            background: 'rgba(102, 126, 234, .8)',
            borderRadius: '15px',
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
            lineHeight: '31px'
        }, {
            width : '35px', height : '35px',
            background: 'rgba(102, 126, 234, .9)',
            borderRadius: '17.5px',
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
            lineHeight: '35px'
        }, {
            width : '40px', height : '40px',
            background: 'rgba(118, 75, 162, .8)',
            borderRadius: '20px',
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
            lineHeight: '40px'
        }, {
            width : '45px', height : '45px',
            background: 'rgba(102, 126, 234, .8)',
            borderRadius: '22.5px',
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
            lineHeight: '45px'
        }, {
            width : '50px', height : '50px',
            background: 'rgba(118, 75, 162, .8)',
            borderRadius: '25px',
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
            lineHeight: '50px'
        }, {
            width : '60px', height : '60px',
            background: 'rgba(220, 53, 69, .8)',
            borderRadius: '30px',
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
            lineHeight: '60px'
        }]
    });

    // 클러스터 클릭 이벤트 추가
    kakao.maps.event.addListener(clusterer, 'clusterclick', function(cluster) {
        console.log('Cluster clicked:', cluster);
        // 클러스터에 포함된 마커들을 가져옴
        const markers = cluster.getMarkers();
        console.log('Markers in cluster:', markers.length);

        // 모든 마커가 같은 위치에 있는지 확인
        if (markers.length > 0) {
            const firstPos = markers[0].getPosition();
            const isSamePosition = markers.every(marker => {
                const pos = marker.getPosition();
                return pos.getLat() === firstPos.getLat() && pos.getLng() === firstPos.getLng();
            });

            // 같은 위치의 마커들이면 그룹화된 팝업 표시
            if (isSamePosition && markers[0].stores && markers[0].stores.length > 1) {
                showGroupedStoresPopup(markers[0].stores, firstPos);
                return false; // 기본 확대 동작 방지
            }
        }
        // 다른 경우는 기본 동작 (확대) 수행
    });
}

function createSearchQuery(store) {
    // 주소가 마스킹되었거나 불완전한 경우
    // "서울 은평구 [행정동] [상호명]" 형식으로 검색
    return `서울 은평구 ${store.행정동} ${store.상호}`;
}

// 검색 성공 시 상태 업데이트
async function updateSearchSuccess(store, statusBadge, place) {
    if (statusBadge) {
        statusBadge.textContent = '위치 찾음';
        statusBadge.className = 'status-badge found';
    }
    store.검색결과 = '찾음';
    store.coords = new kakao.maps.LatLng(place.y, place.x);
    store.foundAddress = place.road_address_name || place.address_name;

    // 카카오맵 카테고리 정보 저장
    if (place.category_name) {
        store.category = place.category_name;
        // 카테고리를 전역 리스트에 추가
        const categories = place.category_name.split(' > ');
        if (categories.length > 0) {
            const mainCategory = categories[0];
            if (!categoryList.has(mainCategory)) {
                categoryList.set(mainCategory, mainCategory);
            }
        }
    }

    // IndexedDB에 위치 정보 저장
    try {
        await updateStoreLocation(store.인덱스, {
            검색결과: store.검색결과,
            coords: store.coords,
            foundAddress: store.foundAddress,
            category: store.category
        });
    } catch (error) {
        console.error('위치 정보 캐싱 실패:', error);
    }
}

// 검색 실패 시 상태 업데이트
async function updateSearchFailure(store, statusBadge) {
    if (statusBadge) {
        statusBadge.textContent = '위치 못찾음';
        statusBadge.className = 'status-badge not-found';
    }
    store.검색결과 = '못찾음';

    // IndexedDB에 검색 실패 정보 저장
    try {
        await updateStoreLocation(store.인덱스, {
            검색결과: store.검색결과
        });
    } catch (error) {
        console.error('검색 실패 정보 캐싱 실패:', error);
    }
}

// 일반 모드에서 마커 생성
function createNormalMarker(coords) {
    // 개별 가맹점 클릭 시에는 기존 마커들을 제거하지 않음
    // clearMarkers 호출을 제거하여 기존 마커들 유지
    const marker = new kakao.maps.Marker({
        map: map,
        position: coords
    });
    markers.push(marker);
    return marker;
}

// 강조 마커 생성 또는 업데이트
function createOrUpdateHighlightMarker(coords) {
    if (!highlightMarker) {
        console.log('Creating highlight marker in search mode');
        highlightMarker = new kakao.maps.Marker({
            map: map,
            position: coords,
            image: highlightMarkerImage,
            zIndex: 10
        });
    } else {
        console.log('Updating highlight marker in search mode');
        highlightMarker.setPosition(coords);
        if (!highlightMarker.getMap()) {
            console.log('Re-adding highlight marker to map');
            highlightMarker.setMap(map);
        }
    }
    return highlightMarker;
}

// 인포 윈도우 컨텐츠 생성
function createInfoContent(store, place) {
    return `
        <div style="padding:10px;min-width:250px;">
            <strong style="font-size:16px;">${store.상호}</strong><br>
            <span style="color:#666;">행정동: ${store.행정동}</span><br>
            ${store.category ? `<span style="color:#667eea;">카테고리: ${store.category.split(' > ')[0]}</span><br>` : ''}
            <span style="color:#666;">주소: ${place ? (place.road_address_name || place.address_name) : store.foundAddress}</span><br>
            ${store.거리 !== undefined ? `<span style="color:#667eea;font-weight:600;">거리: ${store.거리}m</span><br>` : ''}
            ${place && place.phone ? `<span style="color:#999;font-size:12px;">전화: ${place.phone || '정보 없음'}</span>` : ''}
        </div>
    `;
}

// 검색 결과 처리
async function handleSearchResult(data, status, store, statusBadge, resolve) {
    if (status === kakao.maps.services.Status.OK && data.length > 0) {
        const place = data[0];
        await updateSearchSuccess(store, statusBadge, place);

        const coords = store.coords;
        let marker;

        // 개별 검색 시에는 항상 강조 마커 사용
        marker = createOrUpdateHighlightMarker(coords);

        const content = createInfoContent(store, place);
        showInfoWindow(content, coords, marker);

        map.setCenter(coords);
        map.setLevel(3);
    } else {
        await updateSearchFailure(store, statusBadge);
    }

    updateStats();
    resolve();
}

// 전체 검색 시 검색 결과 처리
async function handleBatchSearchResult(data, status, store, statusBadge) {
    if (status === kakao.maps.services.Status.OK && data.length > 0) {
        const place = data[0];
        await updateSearchSuccess(store, statusBadge, place);
    } else {
        await updateSearchFailure(store, statusBadge);
    }
}

// 진행률 업데이트
function updateProgress(completed, total, progressBarFill) {
    const progress = Math.round((completed / total) * 100);
    progressBarFill.style.width = progress + '%';
    progressBarFill.textContent = progress + '%';
}

async function searchAndShowLocation(store, index) {
    console.log('searchAndShowLocation called:', {
        store: store.상호,
        hasCoords: !!store.coords,
        검색결과: store.검색결과
    });

    // 기존 그룹 오버레이가 있다면 닫기
    if (currentGroupOverlay) {
        currentGroupOverlay.setMap(null);
        currentGroupOverlay = null;
    }

    const statusBadge = document.querySelector(`#status-${index}`);

    // 이미 검색된 결과가 있는 경우
    if (store.coords && store.검색결과 === '찾음') {
        // 기존 검색 결과 사용
        const coords = store.coords;

        // 기존 검색 결과 사용 - 강조 마커 생성하고 기존 마커들은 유지
        if (!highlightMarker) {
            highlightMarker = new kakao.maps.Marker({
                map: map,
                position: coords,
                image: highlightMarkerImage,
                zIndex: 10
            });
        } else {
            highlightMarker.setPosition(coords);
            if (!highlightMarker.getMap()) {
                highlightMarker.setMap(map);
            }
        }

        const content = `
            <div style="padding:10px;min-width:250px;">
                <strong style="font-size:16px;">${store.상호}</strong><br>
                <span style="color:#666;">행정동: ${store.행정동}</span><br>
                ${store.category ? `<span style="color:#667eea;">카테고리: ${store.category.split(' > ')[0]}</span><br>` : ''}
                <span style="color:#666;">주소: ${store.foundAddress}</span><br>
                ${store.거리 !== undefined ? `<span style="color:#667eea;font-weight:600;">거리: ${store.거리}m</span><br>` : ''}
            </div>
        `;

        showInfoWindow(content, coords, highlightMarker);

        map.setCenter(coords);
        map.setLevel(3);
        return;
    }

    const searchQuery = createSearchQuery(store);

    // 키워드 검색으로 바로 시작
    const ps = new kakao.maps.services.Places();

    await new Promise((resolve) => {
        ps.keywordSearch(searchQuery, async (data, status) => {
            await handleSearchResult(data, status, store, statusBadge, resolve);
        });
    });
}


function stopSearch() {
    searchAborted = true;
}

function showAllMarkers(preserveView = false) {
    // 지도가 초기화되지 않았으면 리턴
    if (!map || !kakao || !kakao.maps) {
        console.error('지도가 아직 초기화되지 않았습니다.');
        return;
    }

    // 거리 헤더 숨기기
    document.getElementById('distanceHeader').style.display = 'none';
    clearMarkers();

    const bounds = new kakao.maps.LatLngBounds();
    let hasMarkers = false;
    const markersByDong = {};

    // 같은 위치의 매장들을 그룹화 - 소수점 5자리까지만 비교하여 근접한 위치도 그룹화
    const groupedByCoords = {};

    storeData.forEach((store) => {
        if (store.coords) {
            // 캐시된 데이터는 일반 객체로 저장되므로 getLat/getLng 메서드가 없을 수 있음
            const lat = typeof store.coords.getLat === 'function' ? store.coords.getLat() : store.coords.lat;
            const lng = typeof store.coords.getLng === 'function' ? store.coords.getLng() : store.coords.lng;

            // 유효한 좌표인지 확인 (숫자이고 NaN이 아님)
            if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                return; // 유효하지 않은 좌표는 건너뜀
            }

            // 주소 정보를 이용한 그룹화 키 생성
            let groupKey;

            // foundAddress가 있으면 도로명 주소 사용
            if (store.foundAddress) {
                // 도로명 주소에서 건물번호까지 추출 (예: "서울특별시 은평구 연서로 123")
                const match = store.foundAddress.match(/^(.+\s\d+)(-\d+)?/);
                if (match) {
                    groupKey = match[1]; // 건물번호까지만 사용
                } else {
                    // 소수점 5자리로 반올림하여 약 1m 단위로 그룹화
                    const roundedLat = Math.round(lat * 100000) / 100000;
                    const roundedLng = Math.round(lng * 100000) / 100000;
                    groupKey = `${roundedLat},${roundedLng}`;
                }
            } else {
                // 주소 정보가 없으면 좌표로 그룹화 (소수점 5자리)
                const roundedLat = Math.round(lat * 100000) / 100000;
                const roundedLng = Math.round(lng * 100000) / 100000;
                groupKey = `${roundedLat},${roundedLng}`;
            }

            if (!groupedByCoords[groupKey]) {
                groupedByCoords[groupKey] = [];
            }
            groupedByCoords[groupKey].push(store);

            // 행정동별로 마커 그룹화
            if (!markersByDong[store.행정동]) {
                markersByDong[store.행정동] = [];
            }
            markersByDong[store.행정동].push(store);

            // bounds.extend 호출
            const latLng = new kakao.maps.LatLng(lat, lng);
            bounds.extend(latLng);
            hasMarkers = true;
        }
    });

    // 그룹화된 위치별로 마커 생성
    const totalStoresWithCoords = storeData.filter(s => s.coords).length;
    console.log(`Total stores with locations: ${totalStoresWithCoords}`);
    console.log(`Grouped into ${Object.keys(groupedByCoords).length} locations`);

    // 같은 위치에 여러 가맹점이 있는 경우만 표시하여 로그 감소
    const multiStoreLocations = Object.entries(groupedByCoords).filter(([_, stores]) => stores.length > 1);
    console.log(`Locations with multiple stores: ${multiStoreLocations.length}`);

    // 그룹화된 매장 수 통계
    const groupSizes = multiStoreLocations.map(([_, stores]) => stores.length);
    const maxGroupSize = Math.max(...groupSizes);
    console.log(`Largest group has ${maxGroupSize} stores`);

    // 상위 10개 그룹만 표시
    multiStoreLocations.slice(0, 10).forEach(([key, stores]) => {
        console.log(`Location ${key}: ${stores.length} stores -`, stores.map(s => s.상호).join(', '));
    });

    let markersToCluster = [];

    Object.entries(groupedByCoords).forEach(([key, stores]) => {

        // 첫 번째 가맹점의 좌표로 마커 생성
        const firstStore = stores[0];
        const lat = typeof firstStore.coords.getLat === 'function' ? firstStore.coords.getLat() : firstStore.coords.lat;
        const lng = typeof firstStore.coords.getLng === 'function' ? firstStore.coords.getLng() : firstStore.coords.lng;

        // 각 위치에 하나의 마커 생성 (같은 위치의 여러 매장은 하나의 마커로 통합)
        const marker = new kakao.maps.Marker({
            position: new kakao.maps.LatLng(lat, lng)
        });

        // 마커에 데이터 저장
        marker.stores = stores;
        marker.coordKey = key; // 좌표 키 저장 (디버깅용)

        // 같은 위치에 여러 매장이 있는 경우
        if (stores.length > 1) {
            // 커스텀 오버레이로 숫자 표시
            const content = document.createElement('div');
            content.className = 'grouped-marker-overlay';
            content.style.cssText = `
                position: absolute;
                bottom: 10px;
                left: 50%;
                transform: translateX(-50%);
                pointer-events: none;
            `;
            content.innerHTML = stores.length;

            const customOverlay = new kakao.maps.CustomOverlay({
                position: new kakao.maps.LatLng(lat, lng),
                content: content,
                yAnchor: 1,
                zIndex: 2
            });

            marker.customOverlay = customOverlay;
        }

        // 클릭 이벤트
        kakao.maps.event.addListener(marker, 'click', function() {
            console.log('Marker clicked, stores count:', this.stores.length);
            console.log('Stores at this location:', this.stores.map(s => s.상호).join(', '));

            if (currentGroupOverlay) {
                currentGroupOverlay.setMap(null);
                currentGroupOverlay = null;
            }

            // 인포윈도우 닫기
            if (infowindow) {
                infowindow.close();
            }

            if (this.stores.length > 1) {
                const items = this.stores.map(store => ({ store: store }));
                const firstStore = this.stores[0];
                const lat = typeof firstStore.coords.getLat === 'function' ? firstStore.coords.getLat() : firstStore.coords.lat;
                const lng = typeof firstStore.coords.getLng === 'function' ? firstStore.coords.getLng() : firstStore.coords.lng;
                showGroupedStoresPopup(items, new kakao.maps.LatLng(lat, lng), this);
            } else {
                const store = this.stores[0];
                const content = `
                    <div style="padding:10px;min-width:250px;">
                        <strong style="font-size:16px;">${store.상호}</strong><br>
                        <span style="color:#666;">행정동: ${store.행정동}</span><br>
                        ${store.category ? `<span style="color:#667eea;">카테고리: ${store.category.split(' > ')[0]}</span><br>` : ''}
                        <span style="color:#666;">주소: ${store.foundAddress || store.상세주소 || '주소 정보 없음'}</span>
                    </div>
                `;
                showInfoWindow(content, store.coords, this);
            }
        });

        markersToCluster.push(marker);
    });

    // 클러스터러에 마커 추가
    if (clusterer && markersToCluster.length > 0) {
        console.log('Adding markers to clusterer:', markersToCluster.length);

        // 기존 클러스터 제거
        clusterer.clear();

        // 현재 줌 레벨 확인
        const currentLevel = map.getLevel();
        console.log('Current zoom level:', currentLevel, 'Total markers:', markersToCluster.length);

        // 마커 추가
        clusterer.addMarkers(markersToCluster);
        markers = markersToCluster;

        console.log('Clusterer markers added successfully');

        // 클러스터 클릭 이벤트
        kakao.maps.event.addListener(clusterer, 'clusterclick', function(cluster) {
            // 클러스터 클릭 시 확대
            const level = map.getLevel() - 2;
            map.setLevel(level, {anchor: cluster.getCenter()});
        });

        // 클러스터러가 마커를 표시한 후 커스텀 오버레이 표시
        const showCustomOverlays = () => {
            const level = map.getLevel();
            console.log('Showing custom overlays at level:', level);
            markersToCluster.forEach(marker => {
                if (marker.customOverlay) {
                    // 줌 레벨 3 이하에서만 표시하고, 마커가 화면에 있을 때만
                    if (level <= 3 && marker.getMap()) {
                        marker.customOverlay.setMap(map);
                    } else {
                        marker.customOverlay.setMap(null);
                    }
                }
            });
        };
        
        // 클러스터러가 마커를 배치한 후 실행
        setTimeout(showCustomOverlays, 100);
        // 한 번 더 실행하여 확실히 표시
        setTimeout(showCustomOverlays, 500);
    } else {
        console.log('Clusterer not initialized or no markers to add');
    }

    // 줌 레벨 변경 이벤트 리스너 추가
    if (!map.zoomChangeListenerAdded) {
        kakao.maps.event.addListener(map, 'zoom_changed', function() {
            const newLevel = map.getLevel();
            console.log('Zoom changed to level:', newLevel);

            // 커스텀 오버레이 재배치 - 줌 레벨에 따라
            if (newLevel <= 3) { // 줌 레벨 3 이하에서
                setTimeout(() => {
                    markers.forEach(marker => {
                        if (marker.customOverlay) {
                            // 마커가 화면에 표시되어 있을 때만 오버레이 표시
                            if (marker.getMap()) {
                                marker.customOverlay.setMap(map);
                            } else {
                                marker.customOverlay.setMap(null);
                            }
                        }
                    });
                }, 500);
            } else {
                // 클러스터링 레벨에서는 커스텀 오버레이 숨기기
                markers.forEach(marker => {
                    if (marker.customOverlay) {
                        marker.customOverlay.setMap(null);
                    }
                });
            }
        });
        map.zoomChangeListenerAdded = true;
    }


    // preserveView가 false일 때만 알림 표시 (모든 위치 표시 버튼 클릭 시)
    if (hasMarkers && !preserveView) {
        map.setBounds(bounds);

        // 행정동별 통계 표시
        let dongStats = '행정동별 검색 성공 가맹점 수:\n';
        Object.keys(markersByDong).sort().forEach(dong => {
            dongStats += `${dong}: ${markersByDong[dong].length}개\n`;
        });
        console.log(dongStats);
        
        // 초기 로드 시 줌 레벨에 따라 커스텀 오버레이 표시
        setTimeout(() => {
            const level = map.getLevel();
            if (level <= 3) {
                markers.forEach(marker => {
                    if (marker.customOverlay && marker.getMap()) {
                        marker.customOverlay.setMap(map);
                    }
                });
            }
        }, 1000);
    } else if (!preserveView) {
        const totalStores = storeData.length;
        const storesWithoutCoords = storeData.filter(store => !store.coords || !store.coords.lat || !store.coords.lng).length;

        if (storesWithoutCoords === totalStores) {
            alert(`${totalStores}개 가맹점 중 위치 정보가 있는 가맹점이 없습니다.\n"전체 위치 검색"을 실행하여 위치 정보를 검색해주세요.`);
        } else {
            alert('표시할 유효한 위치가 없습니다. 먼저 "전체 위치 검색"을 실행해주세요.');
        }
    }
}


function clearMarkers(preserveHighlight = false) {
    console.log('clearMarkers called:', {
        preserveHighlight
    });

    markers.forEach(marker => marker.setMap(null));
    markers = [];

    // 클러스터러 초기화
    if (clusterer) {
        clusterer.clear();
    }

    // preserveHighlight가 true이고 주변 검색 모드가 활성화된 경우 강조 마커는 유지
    if (!preserveHighlight) {
        // 강조 마커도 제거
        if (highlightMarker) {
            highlightMarker.setMap(null);
            highlightMarker = null;
        }
    }

    infowindow.close();

    // 인포 오버레이도 제거
    if (currentInfoOverlay) {
        currentInfoOverlay.setMap(null);
        currentInfoOverlay = null;
    }
}

function normalizeStoreName(name) {
    if (!name) return '';
    // 문자열로 변환 후 특수문자, 공백 제거 및 소문자 변환
    return String(name).replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();
}

function getDistance(latlng1, latlng2) {
    // 두 좌표 간 거리 계산 (미터 단위)
    const R = 6371000; // 지구 반지름 (미터)
    const dLat = (latlng2.getLat() - latlng1.getLat()) * Math.PI / 180;
    const dLon = (latlng2.getLng() - latlng1.getLng()) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(latlng1.getLat() * Math.PI / 180) * Math.cos(latlng2.getLat() * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}
function toggleDistanceSort() {
    const header = document.getElementById('distanceHeader');

    // 거리 정보가 있는 경우에만 정렬
    const hasDistanceData = filteredData.some(store => store.거리 !== undefined);
    if (!hasDistanceData) {
        alert('주변 가맹점 검색을 먼저 실행해주세요.');
        return;
    }

    // 정렬 순서 변경: none -> asc -> desc -> none
    if (sortOrder === 'none') {
        sortOrder = 'asc';
        header.className = 'sortable asc';
    } else if (sortOrder === 'asc') {
        sortOrder = 'desc';
        header.className = 'sortable desc';
    } else {
        sortOrder = 'none';
        header.className = 'sortable';
    }

    // 정렬 실행
    sortStoresByDistance();
}

function sortStoresByDistance() {
    if (sortOrder === 'none') {
        // 원래 순서로 복원 (매칭된 것이 위로)
        const matchedStores = filteredData.filter(store => store.거리 !== undefined);
        const nonMatchedStores = filteredData.filter(store => store.거리 === undefined);
        filteredData = [...matchedStores, ...nonMatchedStores];
    } else {
        // 거리순 정렬
        filteredData.sort((a, b) => {
            // 거리 정보가 없는 항목은 맨 뒤로
            if (a.거리 === undefined && b.거리 === undefined) return 0;
            if (a.거리 === undefined) return 1;
            if (b.거리 === undefined) return -1;

            // 거리순 정렬
            if (sortOrder === 'asc') {
                return a.거리 - b.거리;
            } else {
                return b.거리 - a.거리;
            }
        });
    }

    // 정렬된 데이터로 목록 다시 표시
    displayStores(filteredData);
}

function updatePaginationUI(totalItems, totalPages, startIndex, endIndex) {
    // 페이징 컨테이너 표시
    const paginationContainer = document.getElementById('paginationContainer');
    if (totalItems > 0) {
        paginationContainer.style.display = 'flex';
    } else {
        paginationContainer.style.display = 'none';
        return;
    }

    // 페이징 정보 업데이트
    const paginationInfo = document.getElementById('paginationInfo');
    paginationInfo.textContent = `${startIndex + 1}-${endIndex} / 총 ${totalItems}개`;

    // 페이지 버튼 생성
    const paginationButtons = document.getElementById('paginationButtons');
    paginationButtons.innerHTML = '';

    // 이전 버튼
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '이전';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => changePage(currentPage - 1);
    paginationButtons.appendChild(prevBtn);

    // 페이지 번호 버튼들
    const maxButtons = 7; // 최대 표시할 버튼 수
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    // 첫 페이지
    if (startPage > 1) {
        const firstBtn = document.createElement('button');
        firstBtn.textContent = '1';
        firstBtn.onclick = () => changePage(1);
        paginationButtons.appendChild(firstBtn);

        if (startPage > 2) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.style.padding = '0 10px';
            paginationButtons.appendChild(dots);
        }
    }

    // 페이지 번호들
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => changePage(i);
        paginationButtons.appendChild(pageBtn);
    }

    // 마지막 페이지
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.style.padding = '0 10px';
            paginationButtons.appendChild(dots);
        }

        const lastBtn = document.createElement('button');
        lastBtn.textContent = totalPages;
        lastBtn.onclick = () => changePage(totalPages);
        paginationButtons.appendChild(lastBtn);
    }

    // 다음 버튼
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '다음';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => changePage(currentPage + 1);
    paginationButtons.appendChild(nextBtn);
}

function changePage(page) {
    currentPage = page;
    displayStores(filteredData);
}

function handlePageSizeChange(e) {
    pageSize = parseInt(e.target.value);
    currentPage = 1;
    displayStores(filteredData);
}

function showGroupedStoresPopup(items, coords, marker) {
    console.log('showGroupedStoresPopup called with', items.length, 'items');

    // 기존 그룹 오버레이가 있다면 제거
    if (currentGroupOverlay) {
        currentGroupOverlay.setMap(null);
        currentGroupOverlay = null;
    }

    // 팝업 생성
    const popup = document.createElement('div');
    popup.className = 'grouped-stores-popup';
    popup.style.width = '300px';

    // 헤더
    const header = document.createElement('div');
    header.className = 'grouped-stores-header';
    header.innerHTML = `
        <span>이 위치의 가맹점 ${items.length}개</span>
        <span class="close-popup">&times;</span>
    `;

    // 목록
    const list = document.createElement('div');
    list.className = 'grouped-stores-list';

    items.forEach(item => {
        const storeItem = document.createElement('div');
        storeItem.className = 'grouped-store-item';
        // item이 store 객체인지 확인 (클러스터에서 오는 경우)
        const store = item.store || item;
        const distance = item.distance || '';

        storeItem.innerHTML = `
            <div class="grouped-store-name">${store.상호}</div>
            <div class="grouped-store-info">
                ${store.행정동}${store.category ? ' · ' + store.category.split(' > ')[0] : ''}${distance ? ' · ' + distance + 'm' : ''}
                ${item.place && item.place.phone ? ' · ' + item.place.phone : ''}
            </div>
        `;

        storeItem.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentGroupOverlay) {
                currentGroupOverlay.setMap(null);
                currentGroupOverlay = null;
            }

            const store = item.store || item;
            let address = store.foundAddress || store.상세주소 || '주소 정보 없음';
            if (item.place) {
                address = item.place.road_address_name || item.place.address_name || address;
            }

            const content = `
                <div style="padding:10px;min-width:250px;">
                    <strong style="font-size:16px;">${store.상호}</strong><br>
                    <span style="color:#666;">행정동: ${store.행정동}</span><br>
                    ${store.category ? `<span style="color:#667eea;">카테고리: ${store.category.split(' > ')[0]}</span><br>` : ''}
                    <span style="color:#666;">주소: ${address}</span><br>
                    ${distance ? `<span style="color:#667eea;font-weight:600;">거리: ${distance}m</span><br>` : ''}
                    ${item.place && item.place.phone ? `<span style="color:#999;font-size:12px;">전화: ${item.place.phone}</span>` : ''}
                </div>
            `;
            showInfoWindow(content, store.coords || coords, marker);
        });

        list.appendChild(storeItem);
    });

    popup.appendChild(header);
    popup.appendChild(list);

    // 팝업을 커스텀 오버레이로 추가
    currentGroupOverlay = new kakao.maps.CustomOverlay({
        position: coords,
        content: popup,
        yAnchor: 1.5,
        clickable: true,
        zIndex: 10000
    });

    currentGroupOverlay.setMap(map);

    // 닫기 버튼 이벤트
    header.querySelector('.close-popup').addEventListener('click', () => {
        if (currentGroupOverlay) {
            currentGroupOverlay.setMap(null);
            currentGroupOverlay = null;
        }
    });

    // 지도 클릭 시 팝업 닫기
    let mapClickListener = null;
    mapClickListener = kakao.maps.event.addListener(map, 'click', function() {
        if (currentGroupOverlay) {
            currentGroupOverlay.setMap(null);
            currentGroupOverlay = null;
        }
        if (mapClickListener) {
            kakao.maps.event.removeListener(mapClickListener);
        }
    });
}

function showInfoWindow(content, position, marker) {
    console.log('showInfoWindow called');
    console.log('Current highlightMarker:', highlightMarker);
    console.log('highlightMarker on map:', highlightMarker ? highlightMarker.getMap() : 'no marker');

    // 기존 인포 오버레이가 있으면 제거
    if (currentInfoOverlay) {
        currentInfoOverlay.setMap(null);
        currentInfoOverlay = null;
    }

    // 기존 인포윈도우가 있다면 닫기
    if (infowindow) {
        infowindow.close();
    }

    // 지도 중심을 해당 위치로 이동
    map.setCenter(position);

    // 커스텀 인포윈도우 생성
    const infoContent = document.createElement('div');
    infoContent.innerHTML = `
        <div style="
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            position: relative;
        ">
            ${content}
            <div style="
                position: absolute;
                bottom: -10px;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 10px solid transparent;
                border-right: 10px solid transparent;
                border-top: 10px solid white;
                filter: drop-shadow(0 2px 2px rgba(0,0,0,0.1));
            "></div>
        </div>
    `;

    // 클릭 이벤트 전파 방지
    infoContent.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    currentInfoOverlay = new kakao.maps.CustomOverlay({
        position: position,
        content: infoContent,
        yAnchor: 1.5,
        clickable: true,  // true로 변경하여 클릭 이벤트 처리
        zIndex: 1000
    });

    currentInfoOverlay.setMap(map);

    // 지도 클릭 시 인포 오버레이만 닫기 (마커는 유지)
    let mapClickListener = null;
    mapClickListener = kakao.maps.event.addListener(map, 'click', function() {
        console.log('Map clicked - closing info overlay');
        if (currentInfoOverlay) {
            currentInfoOverlay.setMap(null);
            currentInfoOverlay = null;
        }
        if (mapClickListener) {
            kakao.maps.event.removeListener(mapClickListener);
        }
    });
}

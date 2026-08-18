/* === 在全域變數區新增 === */
let sideMenuOpen = false;

/* === 替換 initMap() 與 recenterMap() === */
function initMap() {
    if (typeof L === 'undefined') return;
    if (mapInstance) return;
    
    mapInstance = L.map('map', {zoomControl: false}).setView(currentLoc, 15);
    
    const isNightMode = document.body.classList.contains('night-mode');
    currentTileLayer = L.tileLayer(isNightMode ? DARK_TILE : LIGHT_TILE, { maxZoom: 19 }).addTo(mapInstance);
    
    // 定製藍色圓點 Marker，並移除對話框綁定
    const blueDotIcon = L.divIcon({
        className: 'custom-blue-dot',
        html: '<div style="width: 16px; height: 16px; background-color: #007aff; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
    userMarker = L.marker(currentLoc, {icon: blueDotIcon}).addTo(mapInstance);
        
    if ("geolocation" in navigator) {
        geoWatchId = navigator.geolocation.watchPosition(
            (position) => {
                currentLoc = [position.coords.latitude, position.coords.longitude];
                if (userMarker) userMarker.setLatLng(currentLoc);
                
                // 初次定位或離開畫面時進行修正 (避免定位點跑出畫面外)
                if (!hasCenteredMapInit) {
                    recenterMap();
                    hasCenteredMapInit = true;
                } else if (mapInstance) {
                    const bounds = mapInstance.getBounds();
                    if (!bounds.contains(currentLoc)) recenterMap();
                }
            },
            (error) => { console.warn("定位獲取失敗: ", error); },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
    }
}

function recenterMap() {
    if (mapInstance && currentLoc) {
        const zoom = mapInstance.getZoom() || 15;
        const targetPoint = mapInstance.project(currentLoc, zoom);
        // 將視角往下偏移(即定位點移至畫面上半部)，避開下方拖曳面板遮擋
        targetPoint.y -= (window.innerHeight / 4); 
        const targetLatLng = mapInstance.unproject(targetPoint, zoom);
        mapInstance.flyTo(targetLatLng, zoom, { animate: true, duration: 0.5 });
    }
}

/* === 替換 initBottomPanel() (修正最低高度與拖曳面板的捲動問題) === */
function initBottomPanel() {
    const panel = document.getElementById('bottom-panel');
    const header = document.getElementById('panel-drag-handle');
    if (!panel || !header) return;

    let isDraggingPanel = false, startY = 0, initialTranslateY = 0, snapPoints = [], hasMoved = false;

    function updatePanelDimensions() {
        let viewH = window.innerHeight;
        snapPoints = [
            70,             // 最高：讓出頂部 Header 空間
            viewH * 0.5,    // 中間
            viewH - 80      // 最低：確保拖曳把手與回到定位按鈕可見 (原為 120，因導航列已移除改為 80)
        ];
    }

    header.addEventListener('touchstart', (e) => {
        if (!document.body.classList.contains('map-enabled')) return;
        isDraggingPanel = true;
        hasMoved = false;
        updatePanelDimensions(); 
        startY = e.touches[0].clientY;
        const match = panel.style.transform.match(/translateY\(([-\d.]+)px\)/);
        initialTranslateY = match ? parseFloat(match[1]) : snapPoints[1];
        panel.classList.add('dragging');
    }, {passive: true});

    document.addEventListener('touchmove', (e) => {
        if (!isDraggingPanel || !document.body.classList.contains('map-enabled')) return;
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        if (Math.abs(deltaY) > 5) hasMoved = true;
        
        if (e.cancelable) e.preventDefault(); 
        let newY = initialTranslateY + deltaY;
        if (newY < snapPoints[0]) newY = snapPoints[0] - (snapPoints[0] - newY) * 0.2; 
        if (newY > snapPoints[2]) newY = snapPoints[2] + (newY - snapPoints[2]) * 0.2;

        panel.style.transform = `translateY(${newY}px)`;
    }, {passive: false});

    function handlePanelEndOrCancel() {
        if (!isDraggingPanel || !document.body.classList.contains('map-enabled')) return;
        isDraggingPanel = false;
        panel.classList.remove('dragging');

        const match = panel.style.transform.match(/translateY\(([-\d.]+)px\)/);
        let endY = match ? parseFloat(match[1]) : snapPoints[1];
        let closest = snapPoints[0];
        
        if (!hasMoved) closest = snapPoints[0];
        else {
            let minDiff = Math.abs(endY - snapPoints[0]);
            for(let i=1; i<snapPoints.length; i++) {
                let diff = Math.abs(endY - snapPoints[i]);
                if(diff < minDiff) { minDiff = diff; closest = snapPoints[i]; }
            }
        }
        
        panel.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
        panel.style.transform = `translateY(${closest}px)`;
        
        // 核心解法：利用 padding-bottom 動態補足被遮擋的視窗高度，達成內容完美捲動
        const content = document.getElementById('panel-scroll-content');
        if (content) content.style.paddingBottom = `${closest + 80}px`;
        
        if (mapInstance) setTimeout(() => mapInstance.invalidateSize(), 300);
    }

    document.addEventListener('touchend', handlePanelEndOrCancel);
    document.addEventListener('touchcancel', handlePanelEndOrCancel); 

    setTimeout(() => {
        updatePanelDimensions();
        if(document.body.classList.contains('map-enabled') && (!panel.style.transform || panel.style.transform === 'none')) {
            let initY = snapPoints[1];
            panel.style.transform = `translateY(${initY}px)`;
            const content = document.getElementById('panel-scroll-content');
            if (content) content.style.paddingBottom = `${initY + 80}px`;
        }
    }, 300);
    window.addEventListener('resize', updatePanelDimensions);
}

/* === 替換 initSwipeNavigation() (防止地圖互動引發的滑動切換) === */
function initSwipeNavigation() { 
    const appContainer = document.getElementById('app-container'); 
    appContainer.addEventListener('touchstart', (e) => { 
        // 加入 e.target.closest('#map') 避免滿版地圖滑動時觸發換頁
        if (e.target.closest('.swipe-content') || e.target.closest('.record-swipe-content') || e.target.closest('.horizontal-scroll-ignore') || e.target.type === 'range' || e.target.closest('.bottom-panel') || e.target.closest('.map-btn-recenter') || e.target.closest('#map')) return; 
        appTouchStartX = e.changedTouches[0].screenX; appTouchStartY = e.changedTouches[0].screenY; isSwipingApp = true; 
    }, {passive: true}); 
    appContainer.addEventListener('touchmove', (e) => { 
        if (!isSwipingApp) return; 
        if (Math.abs(e.changedTouches[0].screenY - appTouchStartY) > Math.abs(e.changedTouches[0].screenX - appTouchStartX)) isSwipingApp = false; 
    }, {passive: true}); 
    appContainer.addEventListener('touchend', (e) => { 
        if (!isSwipingApp) return; 
        let diffX = e.changedTouches[0].screenX - appTouchStartX; 
        if (diffX < -50) switchView(currentViewIndex < views.length - 1 ? currentViewIndex + 1 : 0, false); 
        else if (diffX > 50) switchView(currentViewIndex > 0 ? currentViewIndex - 1 : views.length - 1, false); 
        isSwipingApp = false; 
    }); 
}

/* === 新增 toggleSideMenu() (側邊選單) === */
function toggleSideMenu() {
    sideMenuOpen = !sideMenuOpen;
    const menu = document.getElementById('side-menu');
    const overlay = document.getElementById('side-menu-overlay');
    if (sideMenuOpen) { menu.classList.add('active'); overlay.classList.add('active'); } 
    else { menu.classList.remove('active'); overlay.classList.remove('active'); }
}

/* === 替換 updateUIState() (更新狀態列配置) === */
function updateUIState() { 
    const unselectedIcons = ['☖', '＄', '♡', '☇', '◑', '⛭'], selectedIcons = ['☗', '＄', '♥\uFE0E', '☈', '◕', '⛯'];
    document.querySelectorAll('.side-nav-item').forEach((el, index) => { 
        el.classList.remove('active'); 
        const iconSpan = el.querySelector('.nav-icon'); 
        if (iconSpan) { iconSpan.innerText = unselectedIcons[index]; iconSpan.style.transform = 'scale(1)'; } 
    }); 
    const activeNav = document.getElementById(`nav-${currentViewIndex}`); 
    if(activeNav) {
        activeNav.classList.add('active'); 
        const activeIconSpan = activeNav.querySelector('.nav-icon');
        if (activeIconSpan) { activeIconSpan.innerText = selectedIcons[currentViewIndex]; if ([2, 4].includes(currentViewIndex)) activeIconSpan.style.transform = 'scale(1.25)'; }
    }

    const title = document.getElementById('header-title'), btnSearch = document.getElementById('btn-search'), btnBack = document.getElementById('btn-back'), btnMenu = document.getElementById('btn-menu'), shiftBadge = document.getElementById('shift-status-badge'), headerCenter = document.querySelector('.header-center');
    
    if (isSearchResultOpen || document.getElementById('view-daily-detail').classList.contains('active')) { 
        btnSearch.style.display = 'none'; btnBack.style.display = 'block'; 
        if(btnMenu) btnMenu.style.display = 'none';
        shiftBadge.style.display = 'none';
        headerCenter.style.pointerEvents = 'none'; headerCenter.style.cursor = 'default'; headerCenter.onclick = null;
        title.innerHTML = document.getElementById('view-daily-detail').classList.contains('active') ? '單日明細' : '查照結果';
    } else { 
        if (currentViewIndex === 0) {
            document.body.classList.add('on-home-view');
            title.innerHTML = `${currentUser} <span style="font-size: 0.8rem; vertical-align: middle;">▾</span>`;
            headerCenter.style.pointerEvents = 'auto'; headerCenter.style.cursor = 'pointer'; headerCenter.onclick = openUserModal;
        } else {
            document.body.classList.remove('on-home-view');
            title.innerHTML = viewTitles[currentViewIndex]; 
            headerCenter.style.pointerEvents = 'none'; headerCenter.style.cursor = 'default'; headerCenter.onclick = null;
        }
        btnSearch.style.display = viewHasSearch[currentViewIndex] ? 'block' : 'none'; 
        btnBack.style.display = 'none'; 
        if(btnMenu) btnMenu.style.display = 'block';
        shiftBadge.style.display = (currentViewIndex === 0) ? 'inline-block' : 'none';
    } 
}

/* === 替換 calculatePunctuality() (實作兩週計算週期) === */
function calculatePunctuality() {
    const buffer = Number(document.getElementById('rate-buffer-time').value) || 0;
    const now = Date.now();
    
    // 定義週期錨點 (2026-08-17 為週一)，每 14 天一個循環
    const anchor = new Date(2026, 7, 17).setHours(0,0,0,0);
    const cycleMs = 14 * 24 * 60 * 60 * 1000;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    
    let startMs = anchor;
    let diff = now - anchor;
    if (diff >= 0) {
        startMs = anchor + Math.floor(diff / cycleMs) * cycleMs;
    } else {
        startMs = anchor - Math.ceil(Math.abs(diff) / cycleMs) * cycleMs;
    }
    
    let endMs = startMs + cycleMs - 1;
    let isWeek2 = (now - startMs) >= weekMs;
    
    // 依據週期過濾歷史資料
    const validRecords = historyRecords.filter(r => 
        r.estimatedTime && r.estimatedTime > 0 && 
        r.timestamp >= startMs && r.timestamp <= endMs
    );
    
    // 更新介面上的週期提示
    const d1 = new Date(startMs), d2 = new Date(endMs);
    const cycleStr = `${d1.getFullYear()}/${d1.getMonth()+1}/${d1.getDate()} - ${d2.getMonth()+1}/${d2.getDate()}`;
    const weekStr = isWeek2 ? '第二週' : '第一週';
    
    let cycleInfoEl = document.getElementById('punctuality-cycle-info');
    if (!cycleInfoEl) {
        cycleInfoEl = document.createElement('div');
        cycleInfoEl.id = 'punctuality-cycle-info';
        cycleInfoEl.style.fontSize = '0.85rem';
        cycleInfoEl.style.color = 'var(--text-muted)';
        cycleInfoEl.style.marginBottom = '10px';
        document.getElementById('card-punctuality').insertBefore(cycleInfoEl, document.getElementById('punctuality-ontime').parentNode.parentNode);
    }
    cycleInfoEl.innerHTML = `週期: <b>${cycleStr}</b> (本週為${weekStr})`;

    if (validRecords.length === 0) {
        document.getElementById('punctuality-ontime').innerText = '--%';
        document.getElementById('punctuality-avg-timeout').innerText = '--%';
        document.getElementById('punctuality-total-timeout').innerText = '--%';
        return;
    }

    let onTimeCount = 0, singleTimeoutRates = [], totalActual = 0, totalEstimatedWithBuffer = 0;

    validRecords.forEach(r => {
        let limit = r.estimatedTime + buffer;
        let actual = r.durationMins;

        if (actual <= limit) {
            onTimeCount++;
            singleTimeoutRates.push(0);
        } else {
            singleTimeoutRates.push((actual - limit) / limit);
        }
        totalActual += actual;
        totalEstimatedWithBuffer += limit;
    });

    const onTimeRate = (onTimeCount / validRecords.length) * 100;
    const avgTimeoutRate = (singleTimeoutRates.reduce((a, b) => a + b, 0) / validRecords.length) * 100;
    let totalTimeoutRate = 0;
    if (totalActual > totalEstimatedWithBuffer && totalEstimatedWithBuffer > 0) {
        totalTimeoutRate = ((totalActual - totalEstimatedWithBuffer) / totalEstimatedWithBuffer) * 100;
    }

    document.getElementById('punctuality-ontime').innerText = onTimeRate.toFixed(1) + '%';
    document.getElementById('punctuality-avg-timeout').innerText = avgTimeoutRate.toFixed(1) + '%';
    document.getElementById('punctuality-total-timeout').innerText = totalTimeoutRate.toFixed(1) + '%';
}

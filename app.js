// ... 原本最上方的變數定義保留 ...

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

function ensureRateViewDOM() {
    const rateView = document.getElementById('view-rate');
    if (!document.getElementById('card-punctuality') && rateView) {
        const cardHtml = `
        <div class="card" id="card-punctuality">
            <h2 style="display:flex; justify-content:space-between; align-items:center;">
                <span>準時率 / 超時率分析</span>
                <button class="btn-icon" onclick="calculatePunctuality()" style="font-size:1.2rem; padding:0;">⟳</button>
            </h2>
            <div class="input-group">
                <label>合理彈性時間 (分鐘)</label>
                <input type="number" id="rate-buffer-time" class="form-control" value="5" oninput="calculatePunctuality()">
            </div>
            
            <div class="summary-block" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border);">
                <div class="summary-item"><span>準時率</span><strong style="color:var(--success);" id="punctuality-ontime">--%</strong></div>
                <div class="summary-item"><span>單筆超時(平均)</span><strong style="color:var(--danger);" id="punctuality-avg-timeout">--%</strong></div>
                <div class="summary-item"><span>總超時率</span><strong style="color:var(--danger);" id="punctuality-total-timeout">--%</strong></div>
            </div>
            
            <p id="rate-period-info" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 15px; line-height: 1.4;">
                * 僅計算本週期內已寫入「預估時間」之訂單。
            </p>
        </div>`;
        rateView.insertAdjacentHTML('afterbegin', cardHtml);
    }
}

// ... 略過不變動的部分 ...

/* ================== 地圖與面板邏輯 ================== */
function initMap() {
    if (typeof L === 'undefined') return;
    if (mapInstance) return;
    
    mapInstance = L.map('map', {zoomControl: false}).setView(currentLoc, 15);
    const isNightMode = document.body.classList.contains('night-mode');
    currentTileLayer = L.tileLayer(isNightMode ? DARK_TILE : LIGHT_TILE, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapInstance);
    
    // 改為藍色脈衝定位點
    const blueDotIcon = L.divIcon({
        className: 'custom-blue-dot',
        html: '<div class="blue-dot"></div><div class="blue-dot-pulse"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    userMarker = L.marker(currentLoc, {icon: blueDotIcon, zIndexOffset: 1000}).addTo(mapInstance);
        
    if ("geolocation" in navigator) {
        geoWatchId = navigator.geolocation.watchPosition(
            (position) => {
                currentLoc = [position.coords.latitude, position.coords.longitude];
                if (userMarker) userMarker.setLatLng(currentLoc);
                if (!hasCenteredMapInit || !mapInstance.getBounds().contains(currentLoc)) {
                    centerMapOffset(currentLoc);
                    hasCenteredMapInit = true;
                }
            },
            (error) => { console.warn("定位獲取失敗: ", error); },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
    }
}

// 將地圖焦點定於畫面偏上半部 (避開底部面板遮擋)
function centerMapOffset(latlng) {
    if (!mapInstance) return;
    const targetPoint = mapInstance.project(latlng, 15);
    // Y 軸向上移 25% 螢幕高度
    targetPoint.y -= (window.innerHeight * 0.25);
    const offsetLatLng = mapInstance.unproject(targetPoint, 15);
    mapInstance.flyTo(offsetLatLng, 15, { animate: true, duration: 0.5 });
}

function recenterMap() {
    if (mapInstance && currentLoc) {
        centerMapOffset(currentLoc);
    }
}

function initBottomPanel() {
    const panel = document.getElementById('bottom-panel');
    const header = document.getElementById('panel-drag-handle');
    if (!panel || !header) return;

    let isDraggingPanel = false, startY = 0, initialTranslateY = 0, panelHeight = 0, snapPoints = [], hasMoved = false;

    function updatePanelDimensions() {
        panelHeight = panel.offsetHeight;
        let viewH = window.innerHeight;
        snapPoints = [
            viewH * 0.33,  // 最高
            viewH * 0.65,  // 中間
            viewH - 100    // 最低：只留頂部把手與一小截，不會低到找不見
        ];
    }

    header.addEventListener('touchstart', (e) => {
        if (!document.body.classList.contains('map-enabled')) return;
        isDraggingPanel = true; hasMoved = false;
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
        isDraggingPanel = false; panel.classList.remove('dragging');
        if (!hasMoved) {
            panel.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
            panel.style.transform = `translateY(${snapPoints[0]}px)`;
        } else {
            const match = panel.style.transform.match(/translateY\(([-\d.]+)px\)/);
            const endY = match ? parseFloat(match[1]) : snapPoints[1];
            let closest = snapPoints[0], minDiff = Math.abs(endY - snapPoints[0]);
            for(let i=1; i<snapPoints.length; i++) {
                let diff = Math.abs(endY - snapPoints[i]);
                if(diff < minDiff) { minDiff = diff; closest = snapPoints[i]; }
            }
            panel.style.transform = `translateY(${closest}px)`;
        }
        if (mapInstance) setTimeout(() => mapInstance.invalidateSize(), 300);
    }

    document.addEventListener('touchend', handlePanelEndOrCancel);
    document.addEventListener('touchcancel', handlePanelEndOrCancel); 

    setTimeout(() => {
        updatePanelDimensions();
        if(document.body.classList.contains('map-enabled') && (!panel.style.transform || panel.style.transform === 'none')) {
            panel.style.transform = `translateY(${snapPoints[1]}px)`;
        }
    }, 300);
    window.addEventListener('resize', updatePanelDimensions);
}

// ... 略過不變動的部分 ...

function initSwipeNavigation() { 
    const appContainer = document.getElementById('app-container'); 
    appContainer.addEventListener('touchstart', (e) => { 
        // 將地圖的 DOM 也過濾掉，避免滑地圖觸發翻頁
        if (e.target.closest('.swipe-content') || e.target.closest('.record-swipe-content') || e.target.closest('.horizontal-scroll-ignore') || e.target.type === 'range' || e.target.closest('.bottom-panel') || e.target.closest('.map-btn-recenter') || e.target.closest('.leaflet-container') || e.target.closest('#map')) return; 
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

function updateUIState() { 
    // Sidebar 選取狀態更新
    document.querySelectorAll('.sidebar .nav-item').forEach((el, index) => el.classList.remove('active')); 
    const activeNav = document.getElementById(`nav-${currentViewIndex}`);
    if(activeNav) activeNav.classList.add('active'); 

    const title = document.getElementById('header-title'), 
          btnSearch = document.getElementById('btn-search'), 
          btnBack = document.getElementById('btn-back'), 
          btnMenu = document.getElementById('btn-menu'),
          shiftBadge = document.getElementById('shift-status-badge'),
          header = document.getElementById('main-header');
    
    // 首頁地圖滿版模式：頭部變為透明
    if (currentViewIndex === 0 && document.body.classList.contains('map-enabled')) {
        header.classList.add('map-transparent');
    } else {
        header.classList.remove('map-transparent');
    }

    if (isSearchResultOpen || document.getElementById('view-daily-detail').classList.contains('active')) { 
        btnSearch.style.display = 'none'; btnBack.style.display = 'block'; btnMenu.style.display = 'none'; shiftBadge.style.display = 'none';
        header.classList.remove('map-transparent'); // 確保內頁強制有背景
        title.style.pointerEvents = 'none'; title.style.cursor = 'default'; title.onclick = null;
        title.innerText = document.getElementById('view-daily-detail').classList.contains('active') ? '單日明細' : '查照結果';
    } else { 
        btnBack.style.display = 'none'; btnMenu.style.display = 'block';
        if (currentViewIndex === 0) {
            title.innerHTML = `${currentUser} <span style="font-size: 0.8rem; vertical-align: middle;">▾</span>`;
            title.style.pointerEvents = 'auto'; title.style.cursor = 'pointer'; title.onclick = openUserModal;
            shiftBadge.style.display = 'inline-block';
        } else {
            title.innerText = viewTitles[currentViewIndex]; title.style.pointerEvents = 'none'; title.style.cursor = 'default'; title.onclick = null;
            shiftBadge.style.display = 'none';
        }
        btnSearch.style.display = viewHasSearch[currentViewIndex] ? 'block' : 'none'; 
    } 
}

/* ================== 準時率 / 取單率邏輯 ================== */
function calculatePunctuality() {
    const buffer = Number(document.getElementById('rate-buffer-time').value) || 0;
    
    // 實作雙週 (14 天) 週期邏輯 (本週為第一週)
    const now = new Date();
    const currentWeekNum = getWeekNumber(now);
    const dayOfWeek = now.getDay() || 7;
    
    let cycleStart = new Date(now);
    cycleStart.setHours(0, 0, 0, 0);
    cycleStart.setDate(now.getDate() - dayOfWeek + 1); // 推至本週一

    // 若週數為偶數，表示此為週期的第二週，將起點推至上週一
    if (currentWeekNum % 2 === 0) {
        cycleStart.setDate(cycleStart.getDate() - 7);
    }

    const cycleEnd = new Date(cycleStart);
    cycleEnd.setDate(cycleEnd.getDate() + 13);
    cycleEnd.setHours(23, 59, 59, 999); // 14天週期結束

    const cycleStartStr = `${cycleStart.getMonth()+1}/${cycleStart.getDate()}`;
    const cycleEndStr = `${cycleEnd.getMonth()+1}/${cycleEnd.getDate()}`;
    
    // 更新說明文字
    const infoText = document.getElementById('rate-period-info');
    if (infoText) infoText.innerText = `* 僅計算本週期 (${cycleStartStr} ~ ${cycleEndStr}) 內已寫入「預估時間」之訂單。`;

    // 篩選雙週期內的紀錄
    const validRecords = historyRecords.filter(r => 
        r.estimatedTime && r.estimatedTime > 0 && 
        r.timestamp >= cycleStart.getTime() && r.timestamp <= cycleEnd.getTime()
    );
    
    if (validRecords.length === 0) {
        document.getElementById('punctuality-ontime').innerText = '--%';
        document.getElementById('punctuality-avg-timeout').innerText = '--%';
        document.getElementById('punctuality-total-timeout').innerText = '--%';
        return;
    }

    let onTimeCount = 0;
    let singleTimeoutRates = [];
    let totalActual = 0;
    let totalEstimatedWithBuffer = 0;

    validRecords.forEach(r => {
        let limit = r.estimatedTime + buffer;
        let actual = r.durationMins;

        if (actual <= limit) {
            onTimeCount++;
            singleTimeoutRates.push(0);
        } else {
            let overRatio = (actual - limit) / limit;
            singleTimeoutRates.push(overRatio);
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

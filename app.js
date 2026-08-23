/* ==============================================================
   全域狀態與資料初始化
   ============================================================== */
let currentUser = localStorage.getItem('app_current_user') || '新使用者';
let usersList = JSON.parse(localStorage.getItem('app_users_list')) || ['新使用者'];
let customStores = JSON.parse(localStorage.getItem('app_custom_stores')) || [];
function getStoreKey(key) { return `${currentUser}_${key}`; }

let activeTimers = [], historyRecords = [], tipRecords = [], costRecords = [], shiftRecords = [], activeShift = null, waitRecords = [], activeWait = null, settings = {};
let viewedWeekStart = new Date(), currentDailyContext = 'income', currentDailyDateObj = new Date();

let sideMenuOpen = false;

// Leaflet 地圖變數
let mapInstance = null;
let currentTileLayer = null;
let userMarker = null;
let currentLoc = [25.0478, 121.5170]; // 預設為台北車站
let geoWatchId = null;
let hasCenteredMapInit = false; 

// 極簡明亮地圖 (淺灰陸地、淺藍水域、少量 POI)
const MAP_TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

/* ================== 日期與時間工具 ================== */
function getDateKey(ts) { const d = new Date(ts); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; }
function formatTime(dateObj) { return `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`; }
function formatDuration(ms) { const totalSecs = Math.floor(ms / 1000); return `${String(Math.floor(totalSecs / 3600)).padStart(2, '0')}:${String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0')}:${String(totalSecs % 60).padStart(2, '0')}`; }
function formatMins(mins) { const h = Math.floor(mins / 60), m = Math.floor(mins % 60); return h > 0 ? `${h}小時 ${m}分鐘` : `${m}分鐘`; }
function fmtMoney(num) { return '$' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } 
function fmtNum(num) { return Number(num).toLocaleString('en-US'); }

/* ================== 動態注入新功能 CSS ================== */
function injectNewStyles() {
    if (document.getElementById('injected-new-styles')) return;
    const style = document.createElement('style');
    style.id = 'injected-new-styles';
    style.innerHTML = `
        .swipe-edit { position: absolute; top: 0; left: -80px; bottom: 0; width: 80px; background: var(--primary); color: var(--btn-text); display: flex; justify-content: center; align-items: center; font-weight: bold; font-size: 1rem; cursor: pointer; z-index: 10; box-shadow: inset -2px 0 5px rgba(0,0,0,0.1); }
        /* 解決非滿版地圖時，各明細最底端被導航列擋住的問題 */
        body:not(.map-enabled) #stats-list, 
        body:not(.map-enabled) #tips-list, 
        body:not(.map-enabled) #costs-list { padding-bottom: 80px; }
        /* 未啟用滿版地圖時，隱藏把手但保留文字區塊 */
        body:not(.map-enabled) .handle-bar-wrapper { display: none !important; }
        body:not(.map-enabled) .panel-header { cursor: default !important; }
        
        /* ===== 未啟用滿版地圖時，隱藏左上角狀態列(漢堡)按鈕 ===== */
        body:not(.map-enabled) #btn-menu { display: none !important; }
        
        /* ===== 保證 Leaflet 地圖在各裝置上絕對能顯示尺寸 ===== */
        body.map-enabled #map {
            display: block !important;
            width: 100vw !important;
            height: 100vh !important;
        }

        /* ===== 啟用滿版地圖時，隱藏底部導航列 ===== */
        body.map-enabled .bottom-nav { display: none !important; }

        /* ===== 左側選單 (狀態列) 樣式 ===== */
        .side-menu-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 2999; opacity: 0; visibility: hidden; transition: opacity 0.3s, visibility 0.3s; backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
        .side-menu-overlay.active { opacity: 1; visibility: visible; }
        
        .side-menu { position: fixed; top: 0; left: -100%; width: 280px; max-width: 80vw; height: 100vh; background: var(--card-bg); z-index: 3000; box-shadow: 4px 0 15px rgba(0,0,0,0.1); transition: left 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); display: flex; flex-direction: column; backdrop-filter: var(--card-backdrop); -webkit-backdrop-filter: var(--card-backdrop); }
        .side-menu.active { left: 0; }
        
        .side-menu-header { padding: 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .side-menu-header h2 { font-size: 1.2rem; color: var(--primary); margin: 0; font-weight: bold; }
        
        .side-menu-content { flex: 1; overflow-y: auto; padding: 10px 0; -webkit-overflow-scrolling: touch; }
        .side-nav-item { display: flex; align-items: center; padding: 15px 20px; color: var(--text-main); text-decoration: none; font-size: 1.05rem; cursor: pointer; transition: background 0.2s, color 0.2s; }
        .side-nav-item:active { background: var(--timer-bg); }
        .side-nav-item .nav-icon { margin-right: 15px; width: 24px; text-align: center; font-size: 1.2rem; }
        .side-nav-item.active { background: var(--timer-bg); color: var(--primary); font-weight: bold; border-left: 4px solid var(--primary); }

        /* ===== 滿版地圖模式下的頂部 Header 透明化 (僅限於首頁) ===== */
        body.map-enabled.on-home-view .header {
            background: transparent !important;
            box-shadow: none !important;
            border-bottom: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            pointer-events: none; 
        }
        body.map-enabled.on-home-view #btn-menu {
            background: var(--card-bg) !important;
            border-radius: 50% !important;
            width: 44px !important;
            height: 44px !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
            pointer-events: auto !important;
        }
        body.map-enabled.on-home-view #btn-back {
            display: none !important; /* 強制隱藏不需要的箭頭 */
        }
        body.map-enabled.on-home-view #header-title-wrapper {
            background: var(--card-bg) !important;
            padding: 8px 20px !important;
            border-radius: 20px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
            pointer-events: auto !important;
        }
        body.map-enabled.on-home-view #btn-search {
            pointer-events: auto !important;
        }
        body.map-enabled.on-home-view #shift-status-badge,
        body.map-enabled.on-home-view #shift-status-badge-right {
            display: none !important; /* 強制隱藏上線色塊 */
        }
    `;
    document.head.appendChild(style);
}

/* ================== 自訂對話框引擎 ================== */
let currentDialogResolve = null;
function showCustomDialog({ type, title, message, defaultValue = '', confirmText = '確認', cancelText = '取消', isDanger = false }) {
    return new Promise((resolve) => {
        currentDialogResolve = resolve;
        const modal = document.getElementById('custom-dialog-modal');
        const titleEl = document.getElementById('custom-dialog-title');
        const msgEl = document.getElementById('custom-dialog-msg');
        const inputGroup = document.getElementById('custom-dialog-input-group');
        const inputEl = document.getElementById('custom-dialog-input');
        const btnsEl = document.getElementById('custom-dialog-btns');

        titleEl.innerText = title;
        msgEl.innerHTML = message.replace(/\n/g, '<br>');
        btnsEl.innerHTML = '';

        if (type === 'prompt') {
            inputGroup.style.display = 'block';
            inputEl.value = defaultValue;
        } else {
            inputGroup.style.display = 'none';
        }

        const handleClose = (value) => {
            closeModal('custom-dialog-modal');
            currentDialogResolve = null;
            resolve(value);
        };

        if (type === 'confirm' || type === 'prompt') {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-outline';
            cancelBtn.innerText = cancelText;
            cancelBtn.onclick = () => handleClose(null);
            cancelBtn.style.flex = '1';
            btnsEl.appendChild(cancelBtn);
        }

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn';
        confirmBtn.innerText = confirmText;
        if (isDanger) {
            confirmBtn.style.backgroundColor = 'var(--danger)';
            confirmBtn.style.borderColor = 'var(--danger)';
            confirmBtn.style.color = 'var(--danger-text)';
        }
        confirmBtn.onclick = () => {
            if (type === 'prompt') {
                handleClose(inputEl.value);
            } else {
                handleClose(true);
            }
        };
        confirmBtn.style.flex = '1';
        btnsEl.appendChild(confirmBtn);

        modal.classList.add('active');

        if (type === 'prompt') {
            inputEl.focus();
            setTimeout(() => {
                inputEl.focus();
                inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
            }, 50);
        }
    });
}

async function appAlert(message, title = '提示') { return await showCustomDialog({ type: 'alert', title, message }); }
async function appConfirm(message, title = '請確認', isDanger = false) { return await showCustomDialog({ type: 'confirm', title, message, isDanger }); }
async function appPrompt(message, defaultValue = '', title = '請輸入') { return await showCustomDialog({ type: 'prompt', title, message, defaultValue }); }

/* ================== 載入初始化 ================== */
function loadSettingsForCurrentUser() {
    let saved = localStorage.getItem(getStoreKey('order_settings'));
    if (saved) { settings = JSON.parse(saved); } 
    else {
        let globalSaved = localStorage.getItem('order_settings');
        if (globalSaved) { settings = JSON.parse(globalSaved); if(settings.theme && !settings.colorTheme) { settings.colorTheme = settings.theme; settings.effectTheme = 'none'; delete settings.theme; } } 
        else { settings = { colorTheme: 'pink', effectTheme: 'none', fontSize: '16px', customPrimary: '#ff7597', autoNightMode: false }; }
    }
    if(settings.matrixText1 === undefined) settings.matrixText1 = '01'; if(settings.matrixText2 === undefined) settings.matrixText2 = ''; if(settings.matrixText3 === undefined) settings.matrixText3 = '';
    if(settings.customCardEnable === undefined) settings.customCardEnable = false; if(settings.customCardBg === undefined) settings.customCardBg = '#ffffff'; if(settings.customCardOpacity === undefined) settings.customCardOpacity = 85;
    if(settings.enableMap === undefined) settings.enableMap = true; 
    if(settings.confirmDelivery === undefined) settings.confirmDelivery = false; 
}

window.onload = function() {
    injectNewStyles();
    if (currentUser === '新使用者' && !localStorage.getItem(getStoreKey('order_history_records')) && localStorage.getItem('order_history_records')) {
        ['order_active_timers', 'order_history_records', 'order_tips', 'order_costs'].forEach(k => { localStorage.setItem(getStoreKey(k), localStorage.getItem(k) || '[]'); });
    }
    initWeeklyView(); 
    loadSettingsForCurrentUser(); 
    loadData(); 
    
    initMap();
    initBottomPanel();

    applySettings(); 
    updateUIState();
    
    setInterval(updateTimersDisplay, 1000); 
    setInterval(applyNightMode, 60000);
    toggleMileageInput(); 
    initSwipeNavigation(); 
    switchView(0, true);
};

/* ================== 地圖、即時路況與面板邏輯 ================== */
let trafficLayer = null;
let isFetchingTraffic = false;

function initMap() {
    if (typeof L === 'undefined') { console.warn('無法載入地圖資源'); return; }
    if (mapInstance) return;
    
    mapInstance = L.map('map', {zoomControl: false}).setView(currentLoc, 15);
    // 日夜模式皆用同一個圖層，夜間會藉由 style.css 內的 filter 翻轉顏色，確保道路清楚、水域仍是藍色
    currentTileLayer = L.tileLayer(MAP_TILE, { maxZoom: 19 }).addTo(mapInstance);
    
    // 初始化假路況圖層
    trafficLayer = L.layerGroup().addTo(mapInstance);
    
    // 視線擴散的藍色圓點 (改為梯形/鈍角的照射範圍)
    const blueDotIcon = L.divIcon({
        className: 'custom-blue-dot',
        html: `<div id="map-dir-marker" style="width: 18px; height: 18px; background-color: #007aff; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.4); position: relative; transition: transform 0.2s ease-out; display: flex; justify-content: center; align-items: center;">
                  <!-- 梯形擴散光暈 -->
                  <div style="position: absolute; bottom: 50%; left: 50%; transform: translateX(-50%); width: 220px; height: 100px; background: radial-gradient(circle at bottom center, rgba(0, 122, 255, 0.4) 0%, rgba(0, 122, 255, 0) 70%); clip-path: polygon(50% 100%, 0% 0%, 100% 0%); transform-origin: bottom center;"></div>
               </div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });
    userMarker = L.marker(currentLoc, {icon: blueDotIcon}).addTo(mapInstance);
        
    if ("geolocation" in navigator) {
        geoWatchId = navigator.geolocation.watchPosition(
            (position) => {
                currentLoc = [position.coords.latitude, position.coords.longitude];
                if (userMarker) {
                    userMarker.setLatLng(currentLoc);
                    if (position.coords.heading !== null && !isNaN(position.coords.heading)) {
                        const markerDiv = document.getElementById('map-dir-marker');
                        if (markerDiv) markerDiv.style.transform = `rotate(${position.coords.heading}deg)`;
                    }
                }
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

    // 地圖移動後觸發擷取假路況
    mapInstance.on('moveend', () => {
        clearTimeout(window.trafficTimer);
        window.trafficTimer = setTimeout(loadFakeTraffic, 800);
    });
    setTimeout(loadFakeTraffic, 1000);
    
    // 確保地圖尺寸完全刷新，避免白畫面/灰畫面問題
    setTimeout(() => { if (mapInstance) mapInstance.invalidateSize(); }, 500);
}

// 動態讀取 OSM 道路產生逼真且美觀的綠/黃/紅路況
function loadFakeTraffic() {
    if (!document.body.classList.contains('map-enabled') || !mapInstance) return;
    if (mapInstance.getZoom() < 13) {
        trafficLayer.clearLayers();
        return;
    }
    if (isFetchingTraffic) return;
    isFetchingTraffic = true;
    
    const bounds = mapInstance.getBounds();
    const s = bounds.getSouth() - 0.01;
    const n = bounds.getNorth() + 0.01;
    const w = bounds.getWest() - 0.01;
    const e = bounds.getEast() + 0.01;
    
    // 向真實地圖庫要主要道路資料
    const query = `[out:json][timeout:5];(way["highway"~"primary|secondary"](${s},${w},${n},${e}););out geom;`;
    
    fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
    }).then(res => res.json()).then(data => {
        trafficLayer.clearLayers();
        data.elements.forEach(el => {
            if (el.type === 'way' && el.geometry) {
                const latlngs = el.geometry.map(g => [g.lat, g.lon]);
                const rand = Math.random();
                let color = '#22c55e'; // 綠色路況 (佔多數，美觀舒適)
                if (rand > 0.8) color = '#eab308'; // 黃色
                if (rand > 0.95) color = '#ef4444'; // 紅色
                
                // 背景線 (負責形成邊線顏色)
                L.polyline(latlngs, {
                    color: color,
                    weight: 6,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round',
                    className: 'fake-traffic-line-bg'
                }).addTo(trafficLayer);

                // 前景線 (負責實體軌道鏤空白線)
                L.polyline(latlngs, {
                    color: '#ffffff', 
                    weight: 2,
                    opacity: 1,
                    lineCap: 'round',
                    lineJoin: 'round',
                    className: 'fake-traffic-line-fg'
                }).addTo(trafficLayer);
            }
        });
        isFetchingTraffic = false;
    }).catch(() => {
        isFetchingTraffic = false; // 失敗則默默忽略
    });
}

function recenterMap() {
    if (mapInstance && currentLoc) {
        const zoom = mapInstance.getZoom() || 15;
        const targetPoint = mapInstance.project(currentLoc, zoom);
        // 將中心點往下偏移1/4螢幕高度，這樣定位藍點就會跑在畫面「上半部」而不被下方拖曳區蓋住
        targetPoint.y += (window.innerHeight / 4); 
        const targetLatLng = mapInstance.unproject(targetPoint, zoom);
        mapInstance.flyTo(targetLatLng, zoom, { animate: true, duration: 0.5 });
    }
}

function initBottomPanel() {
    const panel = document.getElementById('bottom-panel');
    const header = document.getElementById('panel-drag-handle');
    if (!panel || !header) return;

    let isDraggingPanel = false, startY = 0, initialTranslateY = 0, snapPoints = [], hasMoved = false;

    function updatePanelDimensions() {
        let viewH = window.innerHeight;
        snapPoints = [
            70,             // 最高
            viewH * 0.5,    // 中間
            viewH - 160     // 最低：稍微拉高，確保「提示那排字」能完全露出
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
        
        const content = document.getElementById('panel-scroll-content');
        if (content) content.style.paddingBottom = `${closest + 40}px`;
        
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
            if (content) content.style.paddingBottom = `${initY + 40}px`;
        }
    }, 300);
    window.addEventListener('resize', updatePanelDimensions);
}

function getLuminance(r, g, b) { return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function hexToRgb(hex) { hex = hex.replace('#', ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); const num = parseInt(hex, 16); return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }; }

function applySettings() {
    document.documentElement.style.cssText = ''; document.body.style.removeProperty('--card-bg'); document.body.style.removeProperty('--timer-bg'); document.documentElement.style.fontSize = settings.fontSize;
    document.getElementById('auto-night-toggle').checked = settings.autoNightMode || false; document.getElementById('color-theme-select').value = settings.colorTheme; document.getElementById('effect-theme-select').value = settings.effectTheme;
    document.getElementById('custom-matrix-text-1').value = settings.matrixText1 || ''; document.getElementById('custom-matrix-text-2').value = settings.matrixText2 || ''; document.getElementById('custom-matrix-text-3').value = settings.matrixText3 || '';
    document.getElementById('custom-matrix-input-group').style.display = (settings.effectTheme === 'canvas-matrix-custom') ? 'block' : 'none';
    document.getElementById('custom-card-toggle').checked = settings.customCardEnable; document.getElementById('custom-card-panel').style.display = settings.customCardEnable ? 'block' : 'none';
    document.getElementById('picker-card-bg').value = settings.customCardBg; document.getElementById('picker-card-opacity').value = settings.customCardOpacity; document.getElementById('card-opacity-val').innerText = settings.customCardOpacity;
    
    document.getElementById('setting-map-toggle').checked = settings.enableMap !== false;
    document.getElementById('setting-confirm-delivery').checked = settings.confirmDelivery || false;

    if (settings.colorTheme === 'custom') {
        document.body.setAttribute('data-color-theme', 'custom');
        const pColor = settings.customPrimary || '#ff7597', rgb = hexToRgb(pColor), lum = getLuminance(rgb.r, rgb.g, rgb.b), btnText = lum > 0.6 ? '#000000' : '#ffffff', autoBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`;
        document.documentElement.style.setProperty('--primary', pColor); document.documentElement.style.setProperty('--primary-hover', pColor); document.documentElement.style.setProperty('--btn-text', btnText); document.documentElement.style.setProperty('--page-bg', autoBg); document.documentElement.style.setProperty('--bg', autoBg); document.documentElement.style.setProperty('--border', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`); document.documentElement.style.setProperty('--card-bg', '#ffffff'); document.documentElement.style.setProperty('--timer-bg', '#f8fafc'); document.documentElement.style.setProperty('--danger', `rgba(${Math.max(0, rgb.r-60)}, ${Math.max(0, rgb.g-60)}, ${Math.max(0, rgb.b-60)}, 1)`);
        document.getElementById('custom-theme-panel').style.display = 'block'; document.getElementById('picker-primary').value = pColor;
    } else { document.body.setAttribute('data-color-theme', settings.colorTheme); document.getElementById('custom-theme-panel').style.display = 'none'; }

    document.body.setAttribute('data-effect-theme', settings.effectTheme);
    if (settings.effectTheme.startsWith('canvas-')) setTimeout(() => startCanvasEngine(settings.effectTheme), 50); else stopCanvasEngine();
    document.querySelectorAll('.btn, .btn-preset').forEach(btn => btn.style.setProperty('--btn-texture-opacity', settings.effectTheme.startsWith('texture-') ? '0.4' : '0'));
    
    if (settings.customCardEnable) {
        const cardRgb = hexToRgb(settings.customCardBg || '#ffffff'), op = (settings.customCardOpacity !== undefined ? settings.customCardOpacity : 85) / 100, opTimer = Math.max(0, op - 0.15); 
        document.body.style.setProperty('--card-bg', `rgba(${cardRgb.r}, ${cardRgb.g}, ${cardRgb.b}, ${op})`, 'important'); document.body.style.setProperty('--timer-bg', `rgba(${cardRgb.r}, ${cardRgb.g}, ${cardRgb.b}, ${opTimer})`, 'important');
    }
    
    // 依據是否開啟地圖，切換打卡區塊顯示位置
    if (settings.enableMap !== false) {
        document.body.classList.add('map-enabled');
        const sideShift = document.getElementById('side-menu-shift-section');
        if (sideShift) sideShift.style.display = 'block';
        const bottomShift = document.getElementById('bottom-panel-shift-card');
        if (bottomShift) bottomShift.style.display = 'none';

        if (mapInstance) { 
            setTimeout(() => mapInstance.invalidateSize(), 300); 
            const panel = document.getElementById('bottom-panel');
            if (panel && (!panel.style.transform || panel.style.transform === 'none')) {
                const snapMiddle = window.innerHeight * 0.5;
                panel.style.transform = `translateY(${snapMiddle}px)`;
            }
        }
    } else {
        document.body.classList.remove('map-enabled');
        const sideShift = document.getElementById('side-menu-shift-section');
        if (sideShift) sideShift.style.display = 'none';
        const bottomShift = document.getElementById('bottom-panel-shift-card');
        if (bottomShift) bottomShift.style.display = 'block';

        const panel = document.getElementById('bottom-panel');
        if (panel) panel.style.transform = 'none';
    }
    applyNightMode();
}

function changeTheme() { settings.colorTheme = document.getElementById('color-theme-select').value; settings.effectTheme = document.getElementById('effect-theme-select').value; saveSettings(); applySettings(); }
function applyPremiumPreset(colorTheme, effectTheme) { settings.colorTheme = colorTheme; settings.effectTheme = effectTheme; settings.customCardEnable = false; saveSettings(); applySettings(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
function applyCustomPalette() { settings.colorTheme = 'custom'; settings.customPrimary = document.getElementById('picker-primary').value; saveSettings(); applySettings(); }
function saveMatrixText() { settings.matrixText1 = document.getElementById('custom-matrix-text-1').value; settings.matrixText2 = document.getElementById('custom-matrix-text-2').value; settings.matrixText3 = document.getElementById('custom-matrix-text-3').value; saveSettings(); applySettings(); }
function toggleCustomCard() { settings.customCardEnable = document.getElementById('custom-card-toggle').checked; saveSettings(); applySettings(); }
function updateCustomCard() { settings.customCardBg = document.getElementById('picker-card-bg').value; settings.customCardOpacity = document.getElementById('picker-card-opacity').value; document.getElementById('card-opacity-val').innerText = settings.customCardOpacity; saveSettings(); applySettings(); }
function setFontSize(size) { settings.fontSize = size; saveSettings(); applySettings(); }
function saveSettings() { localStorage.setItem(getStoreKey('order_settings'), JSON.stringify(settings)); }
function applyNightMode() { 
    const hour = new Date().getHours(); 
    const isNight = settings.autoNightMode && (hour >= 18 || hour < 6);
    if (isNight) document.body.classList.add('night-mode'); 
    else document.body.classList.remove('night-mode'); 
}
function toggleAutoNight() { settings.autoNightMode = document.getElementById('auto-night-toggle').checked; saveSettings(); applyNightMode(); }
function toggleMapSetting() { 
    settings.enableMap = document.getElementById('setting-map-toggle').checked; 
    saveSettings(); 
    applySettings(); 
    updateUIState(); 
    updateShiftUI(); 
}
function toggleConfirmDelivery() { settings.confirmDelivery = document.getElementById('setting-confirm-delivery').checked; saveSettings(); applySettings(); }

/* ================== UI 摺疊互動 ================== */
function toggleCollapse(header) {
    header.classList.toggle('collapsed');
    const wrap = header.nextElementSibling;
    if(wrap && wrap.classList.contains('collapsible-wrap')) wrap.classList.toggle('collapsed');
}

/* ================== 單號專用 Modal ================== */
let pendingOrderAction = null;
function openOrderNumberModal(title, defaultValue, callback) {
    document.getElementById('order-modal-title').innerText = title;
    const input = document.getElementById('order-number-input');
    input.value = defaultValue;
    pendingOrderAction = callback;
    document.getElementById('order-number-modal').classList.add('active');
    input.focus();
    setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 50);
    input.onkeypress = function(e) { if (e.key === 'Enter') confirmOrderNumber(); };
}
function confirmOrderNumber() {
    const val = document.getElementById('order-number-input').value.trim();
    if (val !== '') { closeModal('order-number-modal'); if (pendingOrderAction) { pendingOrderAction(val); pendingOrderAction = null; } }
}

/* ================== 每週油耗與圖表 ================== */
function calculateWeeklyFuel(startTs, endTs) {
    const allFuel = costRecords.filter(r => r.type === '加油' && r.mileage && Number(r.mileage) > 0).sort((a,b) => a.timestamp - b.timestamp);
    const weeklyFuel = allFuel.filter(r => r.timestamp >= startTs && r.timestamp <= endTs);
    if (weeklyFuel.length === 0) return null;
    const maxRecord = weeklyFuel[weeklyFuel.length - 1], firstThisWeek = weeklyFuel[0], prevRecords = allFuel.filter(r => r.timestamp < firstThisWeek.timestamp), prevRecord = prevRecords.length > 0 ? prevRecords[prevRecords.length - 1] : null;
    let distance = 0, fuelMoney = 0;
    if (prevRecord) { distance = maxRecord.mileage - prevRecord.mileage; fuelMoney = weeklyFuel.reduce((sum, r) => sum + r.amount, 0); } else if (weeklyFuel.length > 1) { distance = maxRecord.mileage - firstThisWeek.mileage; fuelMoney = weeklyFuel.slice(1).reduce((sum, r) => sum + r.amount, 0); } else return null;
    if (distance <= 0 || fuelMoney <= 0) return null; return { distance, fuelMoney, kmPerCost: (distance / fuelMoney).toFixed(2) };
}

function initWeeklyView() { const now = new Date(), day = now.getDay() || 7; now.setHours(0, 0, 0, 0); viewedWeekStart = new Date(now); viewedWeekStart.setDate(now.getDate() - day + 1); }
function prevWeek() { const sInput = document.getElementById('cost-search-input'); if(sInput) sInput.value = ''; viewedWeekStart.setDate(viewedWeekStart.getDate() - 7); renderWeeklyData(); }
function nextWeek() { const sInput = document.getElementById('cost-search-input'); if(sInput) sInput.value = ''; viewedWeekStart.setDate(viewedWeekStart.getDate() + 7); renderWeeklyData(); }
function getWeekNumber(d) { const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay()||7)); return Math.ceil(( ( (date - new Date(Date.UTC(date.getUTCFullYear(),0,1))) / 86400000) + 1)/7); }

function renderWeeklyChart(containerId, records, type) {
    const container = document.getElementById(containerId); if (!container) return;
    let dailyTotals = [0, 0, 0, 0, 0, 0, 0], dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
    records.forEach(r => { let dayIdx = new Date(r.timestamp).getDay() - 1; if (dayIdx === -1) dayIdx = 6; dailyTotals[dayIdx] += r.amount; });
    const maxAmt = Math.max(...dailyTotals, 1); let html = '';
    for (let i = 0; i < 7; i++) { let heightPct = Math.max((dailyTotals[i] / maxAmt) * 100, dailyTotals[i] > 0 ? 5 : 0); html += `<div class="chart-bar-wrap"><div class="chart-val">${dailyTotals[i] > 0 ? fmtNum(dailyTotals[i]) : ''}</div><div class="chart-bar ${type}" style="height: ${heightPct}%;"></div><div class="chart-label">${dayLabels[i]}</div></div>`; }
    container.innerHTML = html;
}

function filterCostRecords() {
    const keyword = document.getElementById('cost-search-input').value.trim().toLowerCase(); if (!keyword) { renderWeeklyData(); return; }
    const filtered = costRecords.filter(r => (r.type && r.type.toLowerCase().includes(keyword)) || (r.memo && r.memo.toLowerCase().includes(keyword)) || (r.mileage && String(r.mileage).includes(keyword)) );
    document.getElementById('weekly-date-range-costs').innerText = '搜尋結果'; document.getElementById('weekly-week-number-costs').innerText = `關鍵字: ${keyword}`; document.getElementById('weekly-total-amount-costs').innerText = fmtMoney(filtered.reduce((s,r)=>s+r.amount, 0));
    document.getElementById('weekly-fuel-consumption').style.display = 'none'; document.getElementById('weekly-chart-costs').innerHTML = ''; renderCosts(filtered, 'costs-list');
}

function renderWeeklyData() {
    const startStr = `${viewedWeekStart.getMonth() + 1}月${viewedWeekStart.getDate()}日週${['日','一','二','三','四','五','六'][viewedWeekStart.getDay()]}`;
    const end = new Date(viewedWeekStart); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
    const endStr = `${end.getMonth() + 1}月${end.getDate()}日週${['日','一','二','三','四','五','六'][end.getDay()]}`;
    const rangeText = `${startStr} - ${endStr}`, weekText = `第${getWeekNumber(viewedWeekStart)}週 ${viewedWeekStart.getFullYear()}`;

    ['', '-tips', '-costs'].forEach(suffix => {
        if (document.getElementById('weekly-date-range' + suffix)) document.getElementById('weekly-date-range' + suffix).innerText = rangeText;
        if (document.getElementById('weekly-week-number' + suffix)) document.getElementById('weekly-week-number' + suffix).innerText = weekText;
    });

    const startTs = viewedWeekStart.getTime(), endTs = end.getTime();
    const weeklyRecords = historyRecords.filter(r => r.timestamp >= startTs && r.timestamp <= endTs);
    document.getElementById('weekly-total-amount').innerText = fmtMoney(weeklyRecords.reduce((sum, r) => sum + r.amount, 0));
    document.getElementById('weekly-online-hours').innerText = `上線時數: ${formatMins(shiftRecords.filter(r => r.timestamp >= startTs && r.timestamp <= endTs).reduce((s, r) => s + r.durationMins, 0))}`;
    renderStats(weeklyRecords, 'stats-list'); renderWeeklyChart('weekly-chart-income', weeklyRecords, 'income');

    const weeklyTips = tipRecords.filter(r => r.timestamp >= startTs && r.timestamp <= endTs);
    document.getElementById('weekly-total-amount-tips').innerText = fmtMoney(weeklyTips.reduce((sum, r) => sum + r.amount, 0));
    renderTips(weeklyTips, 'tips-list'); renderWeeklyChart('weekly-chart-tips', weeklyTips, 'tip');

    const weeklyCosts = costRecords.filter(r => r.timestamp >= startTs && r.timestamp <= endTs);
    document.getElementById('weekly-total-amount-costs').innerText = fmtMoney(weeklyCosts.reduce((sum, r) => sum + r.amount, 0));
    const fuelInfo = calculateWeeklyFuel(startTs, endTs);
    document.getElementById('weekly-fuel-consumption').style.display = fuelInfo ? 'block' : 'none'; if (fuelInfo) document.getElementById('fuel-consumption-val').innerText = `${fuelInfo.distance}km / $${fuelInfo.fuelMoney} (約 ${fuelInfo.kmPerCost} km/$)`;
    renderCosts(weeklyCosts, 'costs-list'); renderWeeklyChart('weekly-chart-costs', weeklyCosts, 'cost');
}

/* ================== Canvas 動態色彩渲染引擎 ================== */
let canvasAnimationId = null;
function stopCanvasEngine() { if(canvasAnimationId) cancelAnimationFrame(canvasAnimationId); document.getElementById('dynamic-canvas').style.display = 'none'; }
function startCanvasEngine(themeType) {
    stopCanvasEngine(); const canvas = document.getElementById('dynamic-canvas'), ctx = canvas.getContext('2d'); canvas.style.display = 'block';
    let w = canvas.width = window.innerWidth, h = canvas.height = window.innerHeight; window.onresize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    const rgb = hexToRgb(getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#38bdf8'), primaryRgbStr = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

    if (themeType === 'canvas-ocean') {
        let bubbles = Array.from({length: 40}, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 4 + 1, speedY: Math.random() * 1.5 + 0.5, wobble: Math.random() * Math.PI * 2, wobbleSpeed: Math.random() * 0.05 }));
        let rays = Array.from({length: 5}, (_, i) => ({ x: (w / 5) * i, width: Math.random() * 100 + 50, angle: Math.random() * 0.2 - 0.1, alpha: Math.random() * 0.08 + 0.02 }));
        let time = 0;
        function draw() {
            ctx.clearRect(0, 0, w, h); time += 0.01; let bgGrad = ctx.createLinearGradient(0, 0, 0, h); bgGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`); bgGrad.addColorStop(1, `rgba(0, 10, 25, 0.85)`); ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'screen';
            rays.forEach((r, i) => { let sway = Math.sin(time + i) * 60; ctx.beginPath(); ctx.moveTo(r.x + sway, 0); ctx.lineTo(r.x + r.width + sway, 0); ctx.lineTo(r.x + r.width + sway + h * Math.sin(r.angle), h); ctx.lineTo(r.x + sway + h * Math.sin(r.angle), h); let rayGrad = ctx.createLinearGradient(0, 0, 0, h); rayGrad.addColorStop(0, `rgba(255, 255, 255, ${r.alpha})`); rayGrad.addColorStop(1, `rgba(255, 255, 255, 0)`); ctx.fillStyle = rayGrad; ctx.fill(); });
            ctx.globalCompositeOperation = 'source-over';
            bubbles.forEach(b => { b.y -= b.speedY; b.wobble += b.wobbleSpeed; let bx = b.x + Math.sin(b.wobble) * 20; if (b.y < -10) { b.y = h + 10; b.x = Math.random() * w; } ctx.beginPath(); ctx.arc(bx, b.y, b.r, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`; ctx.fillStyle = `rgba(255, 255, 255, 0.1)`; ctx.stroke(); ctx.fill(); });
            canvasAnimationId = requestAnimationFrame(draw);
        } draw();
    } else if (themeType === 'canvas-matrix-custom') {
        let lines = [settings.matrixText1, settings.matrixText2, settings.matrixText3].filter(t => t && t.trim() !== ''); if (lines.length === 0) lines = ["0", "1"]; let charArray = lines.join('').split(''); const fontSize = 16, columns = Math.floor(w / fontSize) + 1;
        let streams = Array.from({length: columns}, (_, i) => ({ x: i * fontSize, y: Math.random() * -h, speed: Math.random() * 2 + 2, chars: Array.from({length: Math.floor(Math.random()*15 + 10)}, () => charArray[Math.floor(Math.random() * charArray.length)]) }));
        function draw() {
            ctx.clearRect(0,0,w,h); ctx.font = `bold ${fontSize}px monospace`;
            streams.forEach(s => { s.y += s.speed; if (s.y > h + 300) { s.y = Math.random() * -200; s.speed = Math.random() * 2 + 2; } for(let j=0; j<s.chars.length; j++) { let charY = s.y - (j * fontSize); if (charY > h || charY < 0) continue; if (Math.random() < 0.05) s.chars[j] = charArray[Math.floor(Math.random() * charArray.length)]; ctx.fillStyle = (j === 0) ? `rgba(255,255,255,1)` : `rgba(${primaryRgbStr}, ${1 - (j / s.chars.length)})`; ctx.fillText(s.chars[j], s.x, charY); } });
            canvasAnimationId = requestAnimationFrame(draw);
        } draw();
    } else if (themeType === 'canvas-stars') {
        let stars = Array.from({length: 150}, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.5, alpha: Math.random(), speed: (Math.random() * 0.03) + 0.005 })), meteors = [];
        function draw() {
            ctx.clearRect(0, 0, w, h);
            stars.forEach(s => { s.alpha += s.speed; if (s.alpha > 1 || s.alpha < 0) s.speed *= -1; ctx.globalAlpha = Math.abs(s.alpha); ctx.fillStyle = `rgba(255, 255, 255, 0.8)`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1; if (Math.random() < 0.02) meteors.push({ x: Math.random() * w, y: 0, len: Math.random() * 60 + 20, speed: Math.random() * 10 + 5, angle: Math.PI / 4 + (Math.random() * 0.2 - 0.1) }); ctx.lineWidth = 1.5;
            for (let i = meteors.length - 1; i >= 0; i--) { let m = meteors[i], grad = ctx.createLinearGradient(m.x, m.y, m.x - m.len * Math.cos(m.angle), m.y - m.len * Math.sin(m.angle)); grad.addColorStop(0, `rgba(255, 255, 255, 1)`); grad.addColorStop(0.2, `rgba(${primaryRgbStr}, 0.8)`); grad.addColorStop(1, `rgba(${primaryRgbStr}, 0)`); ctx.strokeStyle = grad; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.len * Math.cos(m.angle), m.y - m.len * Math.sin(m.angle)); ctx.stroke(); m.x += m.speed * Math.cos(m.angle); m.y += m.speed * Math.sin(m.angle); if (m.y > h + m.len || m.x > w + m.len) meteors.splice(i, 1); }
            canvasAnimationId = requestAnimationFrame(draw);
        } draw();
    } else if (themeType === 'canvas-particles') {
        let pts = Array.from({length: 60}, () => ({ x: Math.random()*w, y: Math.random()*h, vx: (Math.random()-0.5)*1.5, vy: (Math.random()-0.5)*1.5 }));
        function draw() { ctx.clearRect(0,0,w,h); ctx.fillStyle = `rgba(${primaryRgbStr}, 1)`; ctx.strokeStyle = `rgba(${primaryRgbStr}, 0.2)`; pts.forEach(p => { p.x += p.vx; p.y += p.vy; if(p.x<0 || p.x>w) p.vx*=-1; if(p.y<0 || p.y>h) p.vy*=-1; ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2); ctx.fill(); }); for(let i=0; i<pts.length; i++){ for(let j=i+1; j<pts.length; j++){ let d = Math.hypot(pts[i].x-pts[j].x, pts[i].y-pts[j].y); if(d < 120) { ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke(); } } } canvasAnimationId = requestAnimationFrame(draw); } draw();
    } else if (themeType === 'canvas-beams') {
        let rot = 0; function draw() { ctx.clearRect(0,0,w,h); ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(rot += 0.002); ctx.globalCompositeOperation = 'lighter'; for(let i=0; i<6; i++) { ctx.rotate((Math.PI*2)/6); let grad = ctx.createLinearGradient(0, 0, w, 0); grad.addColorStop(0, 'transparent'); grad.addColorStop(0.5, `rgba(${primaryRgbStr}, 0.04)`); grad.addColorStop(1, 'rgba(255,255,255, 0.02)'); ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w, -200); ctx.lineTo(w, 200); ctx.fill(); } ctx.restore(); canvasAnimationId = requestAnimationFrame(draw); } draw();
    }
}

/* ==============================================================
    視圖切換與使用者管理邏輯
    ============================================================== */
function loadData() { 
    activeTimers = JSON.parse(localStorage.getItem(getStoreKey('order_active_timers'))) || []; 
    historyRecords = JSON.parse(localStorage.getItem(getStoreKey('order_history_records'))) || []; 
    tipRecords = JSON.parse(localStorage.getItem(getStoreKey('order_tips'))) || []; 
    costRecords = JSON.parse(localStorage.getItem(getStoreKey('order_costs'))) || []; 
    activeShift = JSON.parse(localStorage.getItem(getStoreKey('order_active_shift'))) || null;
    shiftRecords = JSON.parse(localStorage.getItem(getStoreKey('order_shifts'))) || [];
    activeWait = JSON.parse(localStorage.getItem(getStoreKey('order_active_wait'))) || null;
    waitRecords = JSON.parse(localStorage.getItem(getStoreKey('order_waits'))) || [];
    renderActiveTimers(); updateShiftUI(); initWeeklyView(); renderWeeklyData(); 
}

let currentViewIndex = 0, isSearchResultOpen = false; 
const views = ['home', 'income', 'tips', 'costs', 'rate', 'settings']; 
const viewTitles = ['新使用者', '收入', '小費', '成本', '取單率', '設定']; 
const viewHasSearch = [false, true, true, true, false, false]; 

function switchView(index, isInstant = false) { 
    document.querySelectorAll('.date-card.active').forEach(c => c.classList.remove('active')); 
    const dailyDetail = document.getElementById('view-daily-detail');
    if (dailyDetail.classList.contains('active')) { dailyDetail.style.transition = 'none'; dailyDetail.classList.remove('active'); void dailyDetail.offsetWidth; dailyDetail.style.transition = 'transform 0.3s ease-out'; }
    if (isSearchResultOpen) { const sr = document.getElementById('view-search-result'); sr.style.transition = 'none'; sr.classList.remove('active'); void sr.offsetWidth; sr.style.transition = 'transform 0.3s ease-out'; isSearchResultOpen = false; }
    if (currentViewIndex === index && !isInstant) return updateUIState();

    const oldIndex = currentViewIndex; currentViewIndex = index;
    let direction = 'right'; 
    if (oldIndex === 0 && index === views.length - 1 && !isInstant) direction = 'left'; 
    else if (oldIndex === views.length - 1 && index === 0 && !isInstant) direction = 'right'; 
    else if (index < oldIndex && !isInstant) direction = 'left';

    views.forEach((v, i) => {
        const el = document.getElementById(`view-${v}`);
        if (isInstant) { el.style.transition = 'none'; el.style.transform = i === index ? 'translateX(0)' : 'translateX(100vw)'; el.style.visibility = i === index ? 'visible' : 'hidden'; } 
        else if (i === index) { el.style.transition = 'none'; el.style.transform = direction === 'right' ? 'translateX(100vw)' : 'translateX(-100vw)'; el.style.visibility = 'visible'; void el.offsetWidth; el.style.transition = 'transform 0.3s ease-out'; el.style.transform = 'translateX(0)'; } 
        else if (i === oldIndex) { el.style.transition = 'transform 0.3s ease-out'; el.style.transform = direction === 'right' ? 'translateX(-100vw)' : 'translateX(100vw)'; setTimeout(() => { if (currentViewIndex !== i) el.style.visibility = 'hidden'; }, 300); } 
        else { el.style.transition = 'none'; el.style.visibility = 'hidden'; }
    });
    
    if([1, 2, 3].includes(index)) { initWeeklyView(); renderWeeklyData(); }
    if(index === 4) { calculatePunctuality(); }
    
    if (index === 0 && document.body.classList.contains('map-enabled') && mapInstance) {
        setTimeout(() => mapInstance.invalidateSize(), 350);
    }
    
    updateUIState(); 
}

let appTouchStartX = 0, appTouchStartY = 0, isSwipingApp = false;
function initSwipeNavigation() { 
    const appContainer = document.getElementById('app-container'); 
    appContainer.addEventListener('touchstart', (e) => { 
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

function toggleSideMenu() {
    sideMenuOpen = !sideMenuOpen;
    const menu = document.getElementById('side-menu');
    const overlay = document.getElementById('side-menu-overlay');
    if (sideMenuOpen) { menu.classList.add('active'); overlay.classList.add('active'); } 
    else { menu.classList.remove('active'); overlay.classList.remove('active'); }
}

function updateUIState() { 
    const unselectedIcons = ['☖', '＄', '♡', '☇', '◑', '⛭'], selectedIcons = ['☗', '＄', '♥\uFE0E', '☈', '◕', '⛯'];
    
    // 底部導航同步
    document.querySelectorAll('.bottom-nav .nav-item').forEach((el, index) => { 
        el.classList.remove('active'); 
        const iconSpan = el.querySelector('.nav-icon'); 
        if (iconSpan) { iconSpan.innerText = unselectedIcons[index]; iconSpan.style.transform = 'scale(1)'; } 
    }); 
    const activeNavBottom = document.getElementById(`nav-${currentViewIndex}`); 
    if(activeNavBottom) {
        activeNavBottom.classList.add('active'); 
        const activeIconSpan = activeNavBottom.querySelector('.nav-icon');
        if (activeIconSpan) { activeIconSpan.innerText = selectedIcons[currentViewIndex]; if ([2, 4].includes(currentViewIndex)) activeIconSpan.style.transform = 'scale(1.25)'; }
    }

    // 側邊選單同步
    document.querySelectorAll('.side-nav-item').forEach((el, index) => { 
        el.classList.remove('active'); 
        const iconSpan = el.querySelector('.nav-icon'); 
        if (iconSpan) { iconSpan.innerText = unselectedIcons[index]; iconSpan.style.transform = 'scale(1)'; } 
    }); 
    const activeNavSide = document.getElementById(`side-nav-${currentViewIndex}`); 
    if(activeNavSide) {
        activeNavSide.classList.add('active'); 
        const activeIconSpan = activeNavSide.querySelector('.nav-icon');
        if (activeIconSpan) { activeIconSpan.innerText = selectedIcons[currentViewIndex]; if ([2, 4].includes(currentViewIndex)) activeIconSpan.style.transform = 'scale(1.25)'; }
    }

    const title = document.getElementById('header-title');
    const titleWrapper = document.getElementById('header-title-wrapper');
    const btnSearch = document.getElementById('btn-search');
    const btnBack = document.getElementById('btn-back');
    const btnMenu = document.getElementById('btn-menu');
    const shiftBadge = document.getElementById('shift-status-badge');
    const shiftBadgeRight = document.getElementById('shift-status-badge-right');

    if (isSearchResultOpen || document.getElementById('view-daily-detail').classList.contains('active')) { 
        // 進入細節畫面時，移除透明化效果
        document.body.classList.remove('on-home-view');
        btnSearch.style.display = 'none'; btnBack.style.display = 'block'; 
        if(btnMenu) btnMenu.style.display = 'none';
        shiftBadge.style.display = 'none';
        if(shiftBadgeRight) shiftBadgeRight.style.display = 'none';
        titleWrapper.style.pointerEvents = 'none'; titleWrapper.style.cursor = 'default'; titleWrapper.onclick = null;
        title.innerHTML = document.getElementById('view-daily-detail').classList.contains('active') ? '單日明細' : '查照結果';
    } else { 
        if (currentViewIndex === 0) {
            document.body.classList.add('on-home-view');
            title.innerHTML = `${currentUser} <span style="font-size: 0.8rem; vertical-align: middle;">▾</span>`;
            titleWrapper.style.pointerEvents = 'auto'; titleWrapper.style.cursor = 'pointer'; titleWrapper.onclick = openUserModal;
            if (activeShift) updateShiftUI();
        } else {
            // 切換至其他大分頁時，移除透明化效果
            document.body.classList.remove('on-home-view');
            title.innerHTML = viewTitles[currentViewIndex]; 
            titleWrapper.style.pointerEvents = 'none'; titleWrapper.style.cursor = 'default'; titleWrapper.onclick = null;
            shiftBadge.style.display = 'none';
            if(shiftBadgeRight) shiftBadgeRight.style.display = 'none';
        }
        btnSearch.style.display = viewHasSearch[currentViewIndex] ? 'block' : 'none'; 
        btnBack.style.display = 'none'; 
        if(btnMenu) btnMenu.style.display = 'block';
    } 
}

function handleBack() { if(document.getElementById('view-daily-detail').classList.contains('active')) closeDailyDetail(); else if (isSearchResultOpen) { document.getElementById('view-search-result').classList.remove('active'); isSearchResultOpen = false; updateUIState(); } }

function openUserModal() {
    const container = document.getElementById('user-list-container'); container.innerHTML = '';
    usersList.forEach(u => {
        const btn = document.createElement('button'); btn.className = (u === currentUser) ? 'btn' : 'btn-outline';
        btn.style.width = '100%'; btn.style.padding = '12px'; btn.innerText = u; btn.onclick = () => switchUser(u); container.appendChild(btn);
    });
    document.getElementById('user-modal').classList.add('active');
}

function switchUser(name) {
    currentUser = name; localStorage.setItem('app_current_user', currentUser);
    loadSettingsForCurrentUser(); applySettings(); loadData(); updateUIState(); closeModal('user-modal');
}

async function addUser() { const name = await appPrompt('請輸入新使用者名稱：', '', '新增使用者'); if (name && name.trim() !== '') { if (usersList.includes(name.trim())) return await appAlert('該使用者已存在！', '錯誤'); usersList.push(name.trim()); localStorage.setItem('app_users_list', JSON.stringify(usersList)); switchUser(name.trim()); } }
async function renameUser() { const newName = await appPrompt('請輸入新的名稱：', currentUser, '重新命名'); if (newName && newName.trim() !== '' && newName !== currentUser) { if (usersList.includes(newName.trim())) return await appAlert('該名稱已存在！', '錯誤'); const oldPrefix = `${currentUser}_`, newPrefix = `${newName.trim()}_`; ['order_active_timers', 'order_history_records', 'order_tips', 'order_costs', 'order_settings', 'order_last_weather', 'order_active_shift', 'order_shifts', 'order_active_wait', 'order_waits'].forEach(key => { const data = localStorage.getItem(oldPrefix + key); if (data) { localStorage.setItem(newPrefix + key, data); localStorage.removeItem(oldPrefix + key); } }); usersList[usersList.indexOf(currentUser)] = newName.trim(); localStorage.setItem('app_users_list', JSON.stringify(usersList)); currentUser = newName.trim(); localStorage.setItem('app_current_user', currentUser); updateUIState(); await appAlert('重新命名成功！', '成功'); } }

/* ================== 計時器與打卡邏輯 ================== */
function toggleShift() {
    const now = Date.now();
    if (activeShift) {
        const diffMins = Math.round((now - activeShift.startTime) / 60000);
        if (diffMins >= 0) { shiftRecords.push({ id: 'shift_' + now, dateKey: getDateKey(activeShift.startTime), startTime: activeShift.startTime, endTime: now, durationMins: diffMins, timestamp: now }); localStorage.setItem(getStoreKey('order_shifts'), JSON.stringify(shiftRecords)); }
        activeShift = null; localStorage.setItem(getStoreKey('order_active_shift'), JSON.stringify(null)); if(activeWait) checkWaitState();
    } else { activeShift = { startTime: now }; localStorage.setItem(getStoreKey('order_active_shift'), JSON.stringify(activeShift)); }
    updateShiftUI(); checkWaitState(); renderWeeklyData();
}

function updateShiftUI() {
    const btns = document.querySelectorAll('.btn-shift-toggle-class');
    const durations = document.querySelectorAll('.shift-current-duration-class');
    const badgeCenter = document.getElementById('shift-status-badge');
    const badgeRight = document.getElementById('shift-status-badge-right');
    const startBtns = document.querySelectorAll('.btn-start');
    
    const isMapEnabled = document.body.classList.contains('map-enabled');

    if (activeShift) {
        btns.forEach(btn => { btn.innerHTML = '時段結束'; btn.style.background = 'transparent'; btn.style.border = '2px solid var(--danger)'; btn.style.color = 'var(--danger)'; });
        
        if (currentViewIndex === 0) {
            if (isMapEnabled) {
                // 滿版地圖模式下，強制隱藏所有上線色塊 (維持畫面乾淨)
                badgeCenter.style.display = 'none';
                if (badgeRight) badgeRight.style.display = 'none';
            } else {
                // 無滿版地圖：放右上角
                badgeCenter.style.display = 'none';
                if (badgeRight) badgeRight.style.display = 'inline-block';
            }
        }
        durations.forEach(el => el.style.display = 'block'); 
        startBtns.forEach(b => { b.disabled = false; b.style.opacity = '1'; b.style.cursor = 'pointer'; });
    } else {
        btns.forEach(btn => { btn.innerHTML = '時段開始'; btn.style.background = 'var(--primary)'; btn.style.border = 'none'; btn.style.color = 'var(--btn-text)'; });
        badgeCenter.style.display = 'none';
        if (badgeRight) badgeRight.style.display = 'none';
        
        badgeCenter.innerText = '未上線'; badgeCenter.style.background = 'var(--timer-bg)'; badgeCenter.style.color = 'var(--text-main)'; badgeCenter.style.border = '1px solid var(--border)';

        durations.forEach(el => el.style.display = 'none'); 
        startBtns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; b.style.cursor = 'not-allowed'; });
    }
    updateActiveOrdersTitle();
}

function checkWaitState() {
    const now = Date.now(), isWaiting = (activeShift !== null) && (activeTimers.length === 0);
    if (isWaiting && !activeWait) { activeWait = { startTime: now }; localStorage.setItem(getStoreKey('order_active_wait'), JSON.stringify(activeWait)); } 
    else if (!isWaiting && activeWait) { const diffMins = Math.round((now - activeWait.startTime) / 60000); if (diffMins >= 0) { waitRecords.push({ id: 'wait_' + now, dateKey: getDateKey(activeWait.startTime), durationMins: diffMins, timestamp: now }); localStorage.setItem(getStoreKey('order_waits'), JSON.stringify(waitRecords)); } activeWait = null; localStorage.setItem(getStoreKey('order_active_wait'), JSON.stringify(null)); }
    const waitContainer = document.getElementById('wait-time-container');
    if (activeWait) { waitContainer.style.display = 'block'; document.getElementById('wait-current-duration').innerText = formatDuration(now - activeWait.startTime); } else { waitContainer.style.display = 'none'; }
}

async function startTimers(count) { if (!activeShift) return await appAlert('請先點擊「時段開始」進入上線狀態，才能開始接單！'); const now = Date.now(); for (let i = 0; i < count; i++) activeTimers.push({ id: 'timer_' + now + '_' + Math.random().toString(36).substr(2, 5), startTime: now }); localStorage.setItem(getStoreKey('order_active_timers'), JSON.stringify(activeTimers)); renderActiveTimers(); checkWaitState(); }

async function stopTimer(id) { 
    closeAllSwipes();
    if (settings.confirmDelivery) {
        const confirmed = await appConfirm('確定要完成配送並結算此訂單嗎？', '配送確認');
        if (!confirmed) return;
    }
    const index = activeTimers.findIndex(t => t.id === id); if (index === -1) return; 
    const timer = activeTimers[index], endTime = Date.now(), diffMins = Math.max(1, Math.round((endTime - timer.startTime) / 60000)); 
    const billableMins = Math.max(diffMins, timer.estimatedTime || 0);
    let amount = (billableMins / 60) * RATE_PER_HOUR; if (amount < MIN_AMOUNT) amount = MIN_AMOUNT; 
    const endDateObj = new Date(endTime); 
    historyRecords.push({ id: timer.id, dateKey: getDateKey(endTime), year: endDateObj.getFullYear(), month: endDateObj.getMonth() + 1, day: endDateObj.getDate(), dayOfWeek: DAYS_MAP[endDateObj.getDay()], startTimeStr: formatTime(new Date(timer.startTime)), endTimeStr: formatTime(endDateObj), durationMins: diffMins, estimatedTime: timer.estimatedTime || 0, amount: Number(amount.toFixed(2)), timestamp: endTime, storeName: timer.storeName || '', orderNumber: timer.orderNumber || '' }); 
    activeTimers.splice(index, 1); 
    localStorage.setItem(getStoreKey('order_active_timers'), JSON.stringify(activeTimers)); 
    localStorage.setItem(getStoreKey('order_history_records'), JSON.stringify(historyRecords)); 
    renderActiveTimers(); renderWeeklyData(); checkWaitState(); 
    if (currentViewIndex === 4) calculatePunctuality();
}

function cancelTimer(id) { closeAllSwipes(); const index = activeTimers.findIndex(t => t.id === id); if (index > -1) { activeTimers.splice(index, 1); localStorage.setItem(getStoreKey('order_active_timers'), JSON.stringify(activeTimers)); renderActiveTimers(); checkWaitState(); } }

/* ================== 店家搜尋與綁定邏輯 ================== */
function incrementOrderNumber(str) {
    if (!str) return '1'; const match = str.match(/(\d+)$/);
    if (match) { const numLen = match[1].length; const nextNum = parseInt(match[1], 10) + 1; return str.slice(0, -numLen) + String(nextNum).padStart(numLen, '0'); }
    return str + '1';
}

function openStoreModal(id) { document.getElementById('store-target-id').value = id; const kwInput = document.getElementById('store-keyword'); kwInput.value = ''; document.getElementById('store-result-list').innerHTML = ''; document.getElementById('store-modal').classList.add('active'); kwInput.focus(); setTimeout(() => { kwInput.focus(); }, 50); }
function handleTimerTitleClick(id) { const timer = activeTimers.find(t => t.id === id); if (!timer) return; if (timer.storeName) { document.getElementById('timer-action-title').innerText = timer.storeName; document.getElementById('timer-action-id').value = id; document.getElementById('timer-action-modal').classList.add('active'); } else { openStoreModal(id); } }
function editOrderNumber() { const id = document.getElementById('timer-action-id').value, timer = activeTimers.find(t => t.id === id); if(timer) { closeModal('timer-action-modal'); openOrderNumberModal('修改單號', timer.orderNumber || '', function(newNum) { timer.orderNumber = newNum; localStorage.setItem(getStoreKey('order_active_timers'), JSON.stringify(activeTimers)); renderActiveTimers(); }); } }
function cloneTimer() { const id = document.getElementById('timer-action-id').value, timer = activeTimers.find(t => t.id === id); if(timer) { closeModal('timer-action-modal'); const nextNum = incrementOrderNumber(timer.orderNumber); openOrderNumberModal(`為【${timer.storeName}】新增訂單`, nextNum, function(orderNum) { const now = Date.now(); activeTimers.push({ id: 'timer_' + now + '_' + Math.random().toString(36).substr(2, 5), startTime: now, storeName: timer.storeName, orderNumber: orderNum }); localStorage.setItem(getStoreKey('order_active_timers'), JSON.stringify(activeTimers)); renderActiveTimers(); checkWaitState(); }); } }
function rebindTimer() { const id = document.getElementById('timer-action-id').value; closeModal('timer-action-modal'); openStoreModal(id); }

async function addCustomStore() { const kw = document.getElementById('store-keyword').value.trim(); const name = await appPrompt('請輸入新店家名稱：', kw, '新增自訂店家'); if (name && name.trim() !== '') { customStores.push({ code: '自訂', name: name.trim() }); localStorage.setItem('app_custom_stores', JSON.stringify(customStores)); searchStore(); selectStore(name.trim()); } }
function searchStore() {
    const keyword = document.getElementById('store-keyword').value.trim().toLowerCase(), listEl = document.getElementById('store-result-list'); listEl.innerHTML = '';
    if (!keyword) return; const allStores = STORE_LIST.concat(customStores); const results = allStores.filter(s => s.code.toLowerCase().includes(keyword) || s.name.toLowerCase().includes(keyword));
    if (results.length === 0) return listEl.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted);">無符合的店家，請點擊上方 [新增]</div>';
    results.forEach(s => {
        const div = document.createElement('div'); div.style.padding = '12px'; div.style.borderBottom = '1px solid var(--border)'; div.style.cursor = 'pointer'; div.style.color = 'var(--text-main)';
        div.innerHTML = `<span style="font-size:0.8rem; background:var(--primary); color:var(--btn-text); padding:2px 6px; border-radius:4px; margin-right:8px; box-shadow:0 1px 2px rgba(0,0,0,0.1);">${s.code}</span><strong>${s.name}</strong>`;
        div.onclick = () => selectStore(s.name); listEl.appendChild(div);
    });
}
function selectStore(storeName) {
    const id = document.getElementById('store-target-id').value, timer = activeTimers.find(t => t.id === id); if (!timer) return;
    closeModal('store-modal'); 
    openOrderNumberModal(`已選擇：${storeName}\n請輸入訂單號碼`, '', async function(orderNum) {
        timer.storeName = storeName; timer.orderNumber = orderNum; 
        const unboundTimers = activeTimers.filter(t => !t.storeName && t.id !== id);
        if (unboundTimers.length > 0) { if (await appConfirm(`您還有 ${unboundTimers.length} 個未綁定的計時器。\n是否要自動套用【${storeName}】並自動遞增單號？`, '自動綁定')) { let currentNum = timer.orderNumber; unboundTimers.forEach(ut => { currentNum = incrementOrderNumber(currentNum); ut.storeName = storeName; ut.orderNumber = currentNum; }); } }
        localStorage.setItem(getStoreKey('order_active_timers'), JSON.stringify(activeTimers)); renderActiveTimers(); 
    });
}

/* ================== 預估時間與刪除紀錄邏輯 ================== */
async function setEstimatedTime(id) { closeAllSwipes(); const timer = activeTimers.find(t => t.id === id); if (!timer) return; const val = await appPrompt('請輸入預估時間 (分鐘):', timer.estimatedTime || '', '設定預估時間'); if (val !== null && val.trim() !== '') { const num = parseInt(val, 10); if (!isNaN(num) && num >= 0) { timer.estimatedTime = num; localStorage.setItem(getStoreKey('order_active_timers'), JSON.stringify(activeTimers)); renderActiveTimers(); } else { await appAlert('請輸入有效的數字', '錯誤'); } } }
async function editHistoryEstimatedTime(id) { closeAllSwipes(); const record = historyRecords.find(r => r.id === id); if (!record) return; const val = await appPrompt('請輸入預估時間 (分鐘):', record.estimatedTime || '', '設定預估時間'); if (val !== null && val.trim() !== '') { const num = parseInt(val, 10); if (!isNaN(num) && num >= 0) { record.estimatedTime = num; const billableMins = Math.max(record.durationMins, num); let amount = (billableMins / 60) * RATE_PER_HOUR; if (amount < MIN_AMOUNT) amount = MIN_AMOUNT; record.amount = Number(amount.toFixed(2)); localStorage.setItem(getStoreKey('order_history_records'), JSON.stringify(historyRecords)); renderWeeklyData(); if(document.getElementById('view-daily-detail').classList.contains('active')) renderDailyDetail(); if (currentViewIndex === 4) calculatePunctuality(); } else { await appAlert('請輸入有效的數字', '錯誤'); } } }
async function deleteHistoryRecord(id) { closeAllSwipes(); if(await appConfirm('確定刪除這筆收入紀錄嗎？', '刪除確認', true)) { historyRecords = historyRecords.filter(t => t.id !== id); localStorage.setItem(getStoreKey('order_history_records'), JSON.stringify(historyRecords)); renderWeeklyData(); if(document.getElementById('view-daily-detail').classList.contains('active')) renderDailyDetail(); if (currentViewIndex === 4) calculatePunctuality(); } }

/* ================== 卡片拖曳排序邏輯 ================== */
let pressTimer = null, isDraggingItem = false, dragTarget = null, placeholder = null, initialClientY = 0, currentTouchY = 0; 
let itemSwipeStartX = 0, itemSwipeStartY = 0, itemSwipeCurrentX = 0, itemSwipingEl = null, openItemSwipeEl = null, itemSwipeDirection = null;

function closeAllSwipes() { if (openItemSwipeEl) { openItemSwipeEl.style.transition = 'transform 0.3s ease'; openItemSwipeEl.style.transform = 'translateX(0px)'; openItemSwipeEl = null; } }
function forceCleanupDrag() { isDraggingItem = false; clearTimeout(pressTimer); closeAllSwipes(); document.querySelectorAll('.drag-placeholder').forEach(el => el.remove()); const list = document.getElementById('active-timers-list'); document.querySelectorAll('.active-timer-container.dragging').forEach(el => { el.classList.remove('dragging'); el.style.position = ''; el.style.top = ''; el.style.left = ''; el.style.width = ''; el.style.margin = ''; el.style.zIndex = ''; el.style.transform = ''; if (el.parentNode === document.body && list) { list.appendChild(el); } }); if (!document.body.classList.contains('map-enabled')) { document.getElementById('view-home').style.overflowY = ''; } else { const panelScroll = document.getElementById('panel-scroll-content'); if (panelScroll) panelScroll.style.overflowY = ''; } dragTarget = null; placeholder = null; }

document.addEventListener('visibilitychange', () => { if (document.hidden) { forceCleanupDrag(); renderActiveTimers(); } }); window.addEventListener('pagehide', () => { forceCleanupDrag(); }); window.addEventListener('blur', () => { forceCleanupDrag(); });

function handleItemTouchStart(e) { 
    if (isDraggingItem) { forceCleanupDrag(); renderActiveTimers(); return; }
    clearTimeout(pressTimer);
    if (openItemSwipeEl && openItemSwipeEl !== e.currentTarget) { openItemSwipeEl.style.transform = 'translateX(0px)'; openItemSwipeEl = null; } 
    const clientX = e.touches ? e.touches[0].clientX : e.clientX; currentTouchY = e.touches ? e.touches[0].clientY : e.clientY;
    itemSwipeStartX = clientX; itemSwipeStartY = currentTouchY; itemSwipingEl = e.currentTarget; itemSwipingEl.style.transition = 'none'; itemSwipeCurrentX = window.getComputedStyle(itemSwipingEl).transform !== 'none' ? parseInt(window.getComputedStyle(itemSwipingEl).transform.split(',')[4]) || 0 : 0; itemSwipeDirection = null; 

    const isClickable = e.target.closest('button') || e.target.closest('.swipe-delete') || e.target.closest('.swipe-edit') || e.target.tagName.toLowerCase() === 'h3';
    if (!isClickable && e.currentTarget.closest('.active-timer-container')) {
        dragTarget = e.currentTarget.closest('.active-timer-container');
        pressTimer = setTimeout(() => {
            if (isDraggingItem) return;
            isDraggingItem = true;
            if (navigator.vibrate) navigator.vibrate(50);
            if (!document.body.classList.contains('map-enabled')) { document.getElementById('view-home').style.overflowY = 'hidden'; } else { document.getElementById('panel-scroll-content').style.overflowY = 'hidden'; }
            initialClientY = currentTouchY;
            const rect = dragTarget.getBoundingClientRect();
            document.querySelectorAll('.drag-placeholder').forEach(el => el.remove());
            placeholder = document.createElement('div'); placeholder.className = 'drag-placeholder'; placeholder.style.height = rect.height + 'px';
            dragTarget.parentNode.insertBefore(placeholder, dragTarget);
            dragTarget.style.position = 'fixed'; dragTarget.style.top = rect.top + 'px'; dragTarget.style.left = rect.left + 'px'; dragTarget.style.width = rect.width + 'px'; dragTarget.style.margin = '0'; dragTarget.style.zIndex = '5000'; dragTarget.classList.add('dragging');
            document.body.appendChild(dragTarget);
        }, 200); 
    }
}

function handleItemTouchMove(e) { 
    const clientX = e.touches ? e.touches[0].clientX : e.clientX; currentTouchY = e.touches ? e.touches[0].clientY : e.clientY;
    let diffX = clientX - itemSwipeStartX; let diffY = currentTouchY - itemSwipeStartY; 
    if (!isDraggingItem) {
        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) clearTimeout(pressTimer);
        if (!itemSwipeDirection) { if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 5) itemSwipeDirection = 'horizontal'; else if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) itemSwipeDirection = 'vertical'; } 
        if (itemSwipeDirection === 'vertical') return; 
        if (itemSwipeDirection === 'horizontal') { 
            if (e.cancelable) e.preventDefault(); 
            let moveX = itemSwipeCurrentX + diffX; 
            let hasRightAction = itemSwipingEl.querySelector('.swipe-edit') !== null, hasLeftAction = itemSwipingEl.querySelector('.swipe-delete') !== null;
            if (!hasRightAction && moveX > 0) moveX = 0; if (!hasLeftAction && moveX < 0) moveX = 0;
            if (moveX > 90) moveX = 90; if (moveX < -90) moveX = -90; 
            itemSwipingEl.style.transform = `translateX(${moveX}px)`; 
        } 
    } else {
        if (e.cancelable) e.preventDefault(); 
        const deltaY = currentTouchY - initialClientY; dragTarget.style.transform = `translateY(${deltaY}px) scale(1.02)`;
        const list = document.getElementById('active-timers-list'), siblings = [...list.querySelectorAll('.active-timer-container:not(.dragging)')];
        let nextSibling = siblings.find(sibling => { const box = sibling.getBoundingClientRect(); return currentTouchY < box.top + box.height / 2; });
        if (placeholder) { if (nextSibling) list.insertBefore(placeholder, nextSibling); else list.appendChild(placeholder); }
    }
}

function handleItemTouchEnd(e) { 
    clearTimeout(pressTimer);
    if (isDraggingItem) {
        isDraggingItem = false;
        if (!document.body.classList.contains('map-enabled')) { document.getElementById('view-home').style.overflowY = ''; } else { const panelScroll = document.getElementById('panel-scroll-content'); if (panelScroll) panelScroll.style.overflowY = ''; }
        if (dragTarget && placeholder && placeholder.parentNode) { placeholder.parentNode.insertBefore(dragTarget, placeholder); } else if (dragTarget) { const list = document.getElementById('active-timers-list'); if (list && dragTarget.parentNode !== list) list.appendChild(dragTarget); }
        if (dragTarget) { dragTarget.classList.remove('dragging'); dragTarget.style.position = ''; dragTarget.style.top = ''; dragTarget.style.left = ''; dragTarget.style.width = ''; dragTarget.style.margin = ''; dragTarget.style.zIndex = ''; dragTarget.style.transform = ''; }
        document.querySelectorAll('.drag-placeholder').forEach(el => el.remove()); placeholder = null;
        if (navigator.vibrate) navigator.vibrate(20);
        const list = document.getElementById('active-timers-list');
        if (list) { const newOrderIds = [...list.querySelectorAll('.active-timer-container')].map(el => el.getAttribute('data-id')); if (newOrderIds.length === activeTimers.length) { activeTimers.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id)); localStorage.setItem(getStoreKey('order_active_timers'), JSON.stringify(activeTimers)); } }
        dragTarget = null; return;
    }
    if (!itemSwipingEl || itemSwipeDirection === 'vertical') return; 
    itemSwipingEl.style.transition = 'transform 0.3s ease'; 
    let currentX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX; 
    let finalX = itemSwipeCurrentX + (currentX - itemSwipeStartX); 
    let hasRightAction = itemSwipingEl.querySelector('.swipe-edit') !== null, hasLeftAction = itemSwipingEl.querySelector('.swipe-delete') !== null;
    if (hasLeftAction && finalX < -40) { itemSwipingEl.style.transform = `translateX(-80px)`; openItemSwipeEl = itemSwipingEl; } else if (hasRightAction && finalX > 40) { itemSwipingEl.style.transform = `translateX(80px)`; openItemSwipeEl = itemSwipingEl; } else { itemSwipingEl.style.transform = `translateX(0px)`; if (openItemSwipeEl === itemSwipingEl) openItemSwipeEl = null; } 
    itemSwipingEl = null; 
}

function openOrderQuantityModal() {
    document.getElementById('order-quantity-modal').classList.add('active');
}

function updateActiveOrdersTitle() {
    const titleEl = document.getElementById('active-orders-title');
    if (!titleEl) return;
    
    if (!activeShift || activeTimers.length === 0) {
        titleEl.innerText = '目前沒有訂單...';
        titleEl.style.color = 'inherit';
    } else {
        titleEl.innerText = '進行中的訂單';
        titleEl.style.color = 'inherit';
    }
}

function renderActiveTimers() {
    forceCleanupDrag();
    const listEl = document.getElementById('active-timers-list'); 
    document.getElementById('active-count').innerText = `${activeTimers.length} 個進行中`;
    if (activeTimers.length === 0) {
        listEl.innerHTML = '<div class="empty-state">目前沒有進行中的訂單</div>';
        updateActiveOrdersTitle();
        return;
    }
    let html = '';
    activeTimers.forEach((timer, idx) => {
        const titleStr = timer.storeName ? `${timer.storeName} #${timer.orderNumber}` : `訂單計時 #${idx + 1}`;
        const estStr = timer.estimatedTime ? `<span style="white-space:nowrap; color:var(--primary); font-size:0.85rem; margin-left:8px; border:1px solid var(--primary); padding:1px 4px; border-radius:4px;">預估 ${timer.estimatedTime}m</span>` : '';
        html += `<div class="swipe-container active-timer-container" data-id="${timer.id}"><div class="swipe-content active-timer-content" onmousedown="handleItemTouchStart(event)" ontouchstart="handleItemTouchStart(event)" onmousemove="handleItemTouchMove(event)" ontouchmove="handleItemTouchMove(event)" onmouseup="handleItemTouchEnd(event)" ontouchend="handleItemTouchEnd(event)" ontouchcancel="handleItemTouchEnd(event)" onmouseleave="handleItemTouchEnd(event)"><div class="swipe-edit" style="background:var(--success);" onclick="setEstimatedTime('${timer.id}')">預估</div><div class="timer-info"><h3 onclick="handleTimerTitleClick('${timer.id}')">${titleStr} ${estStr}</h3><p>開始時間：${formatTime(new Date(timer.startTime))}</p><div class="timer-duration" id="duration_${timer.id}">00:00:00</div></div><button class="btn-stop" onclick="stopTimer('${timer.id}')">配送</button><div class="swipe-delete" onclick="cancelTimer('${timer.id}')">刪除</div></div></div>`;
    });
    listEl.innerHTML = html; 
    updateTimersDisplay();
    updateActiveOrdersTitle();
}

function updateTimersDisplay() {
    const now = Date.now();
    activeTimers.forEach(timer => { const el = document.getElementById(`duration_${timer.id}`); if (el) el.innerText = formatDuration(now - timer.startTime); });
    if (activeShift) { const shiftEls = document.querySelectorAll('.shift-current-duration-class'); shiftEls.forEach(el => el.innerText = formatDuration(now - activeShift.startTime)); } checkWaitState();
}

/* ================== 修改訂單(收入)金額邏輯 ================== */
async function editIncomeAmount(id) {
    const record = historyRecords.find(r => r.id === id); if (!record) return;
    const newAmtStr = await appPrompt(`請輸入新的訂單金額\n(原金額: $${record.amount})：`, record.amount, '修改訂單金額');
    if (newAmtStr !== null && newAmtStr.trim() !== '') {
        const numAmt = Number(newAmtStr); if (isNaN(numAmt) || numAmt < 0) { return await appAlert('請輸入有效的數字', '輸入錯誤'); }
        record.amount = numAmt; localStorage.setItem(getStoreKey('order_history_records'), JSON.stringify(historyRecords)); renderWeeklyData(); 
        if(document.getElementById('view-daily-detail').classList.contains('active')) { renderDailyDetail(); }
    }
}

/* ================== 小費與成本紀錄邏輯 ================== */
async function deleteTip(id) { closeAllSwipes(); if(await appConfirm('確定刪除這筆小費紀錄嗎？', '刪除確認', true)) { tipRecords = tipRecords.filter(t => t.id !== id); localStorage.setItem(getStoreKey('order_tips'), JSON.stringify(tipRecords)); renderWeeklyData(); if(document.getElementById('view-daily-detail').classList.contains('active')) renderDailyDetail(); } } 
async function deleteCost(id) { closeAllSwipes(); if(await appConfirm('確定刪除這筆成本紀錄嗎？', '刪除確認', true)) { costRecords = costRecords.filter(t => t.id !== id); localStorage.setItem(getStoreKey('order_costs'), JSON.stringify(costRecords)); renderWeeklyData(); if(document.getElementById('view-daily-detail').classList.contains('active')) renderDailyDetail(); } }

async function saveTip() { const amt = Number(document.getElementById('tip-amount').value); if(!amt || amt <= 0) return await appAlert('請輸入有效金額', '輸入錯誤'); const now = Date.now(), d = new Date(now); tipRecords.push({ id: 'tip_' + now, dateKey: getDateKey(now), year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), dayOfWeek: DAYS_MAP[d.getDay()], amount: amt, method: document.getElementById('tip-method').value, timestamp: now, timeStr: formatTime(d) }); localStorage.setItem(getStoreKey('order_tips'), JSON.stringify(tipRecords)); document.getElementById('tip-amount').value = ''; renderWeeklyData(); await appAlert('小費紀錄成功！', '成功'); }
async function saveCost() { const amt = Number(document.getElementById('cost-amount').value); if(!amt || amt <= 0) return await appAlert('請輸入有效金額', '輸入錯誤'); const now = Date.now(), d = new Date(now); costRecords.push({ id: 'cost_' + now, dateKey: getDateKey(now), year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), dayOfWeek: DAYS_MAP[d.getDay()], amount: amt, type: document.getElementById('cost-type').value, memo: document.getElementById('cost-memo').value, mileage: document.getElementById('cost-mileage').value, timestamp: now, timeStr: formatTime(d) }); localStorage.setItem(getStoreKey('order_costs'), JSON.stringify(costRecords)); document.getElementById('cost-amount').value = ''; document.getElementById('cost-memo').value = ''; document.getElementById('cost-mileage').value = ''; renderWeeklyData(); await appAlert('成本紀錄成功！', '成功'); }
function toggleMileageInput() { const type = document.getElementById('cost-type').value; document.getElementById('mileage-group').style.display = (type === '保養維修' || type === '加油') ? 'block' : 'none'; } function toggleEditMileage() { const type = document.getElementById('edit-cost-type').value; document.getElementById('edit-mileage-group').style.display = (type === '保養維修' || type === '加油') ? 'block' : 'none'; }

/* ================== 共用群組渲染函數 ================== */
function groupDataByDate(records) { const grouped = {}; records.forEach(rec => { if (!grouped[rec.dateKey]) grouped[rec.dateKey] = { dateKey: rec.dateKey, title: `${rec.year}年${rec.month}月${rec.day}日`, totalAmount: 0, records: [] }; grouped[rec.dateKey].records.push(rec); grouped[rec.dateKey].totalAmount += rec.amount; }); return grouped; }
function renderRecordGroup(data, containerId, emptyMsg, context, itemLabel, amountPrefix = '', amountColor = 'var(--success)') {
    const container = document.getElementById(containerId);
    if (data.length === 0) return container.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    let html = '';
    Object.values(groupDataByDate(data)).sort((a,b)=>new Date(b.dateKey)-new Date(a.dateKey)).forEach(group => {
        html += `<div class="date-card" onclick="openDailyDetail('${context}', '${group.dateKey}')"><div class="date-header"><div><div class="date-title">${group.title}</div><div class="date-subtitle">${group.records.length} ${itemLabel}</div></div><div class="date-total"><div class="date-amount" style="color:${amountColor};">${amountPrefix}${fmtMoney(group.totalAmount)}</div><div class="date-arrow">查看明細 〉</div></div></div></div>`;
    });
    container.innerHTML = html;
}
function renderTips(data = tipRecords, containerId = 'tips-list') { renderRecordGroup(data, containerId, '此區間尚無小費紀錄', 'tip', '筆小費'); }
function renderCosts(data = costRecords, containerId = 'costs-list') { renderRecordGroup(data, containerId, '此區間尚無成本紀錄', 'cost', '筆成本', '支出 ', 'var(--text-main)'); }
function renderStats(data = historyRecords, containerId = 'stats-list') { renderRecordGroup(data, containerId, '此區間尚無收入紀錄', 'income', '張訂單'); }

/* ================== 單日明細 Modal 邏輯 ================== */
function openDailyDetail(context, dateKey) { currentDailyContext = context; currentDailyDateObj = new Date(dateKey); document.getElementById('view-daily-detail').classList.add('active'); updateUIState(); renderDailyDetail(); }
function closeDailyDetail() { document.getElementById('view-daily-detail').classList.remove('active'); updateUIState(); }
function prevDailyDetail() { currentDailyDateObj.setDate(currentDailyDateObj.getDate() - 1); renderDailyDetail(); }
function nextDailyDetail() { currentDailyDateObj.setDate(currentDailyDateObj.getDate() + 1); renderDailyDetail(); }

function renderDailyDetail() {
    const dateKey = getDateKey(currentDailyDateObj.getTime());
    document.getElementById('daily-detail-date').innerText = `${currentDailyDateObj.getMonth() + 1}月${currentDailyDateObj.getDate()}日 ${DAYS_MAP[currentDailyDateObj.getDay()]}`;
    document.getElementById('daily-detail-week').innerText = `第${getWeekNumber(currentDailyDateObj)}週 ${currentDailyDateObj.getFullYear()}`;
    
    const listContainer = document.getElementById('daily-detail-list'), statsGrid = document.getElementById('daily-detail-stats-grid');
    let html = '';
    
    if (currentDailyContext === 'income') {
        document.getElementById('daily-detail-type-label').innerText = '報酬 (當日總額)';
        const dailyRecords = historyRecords.filter(r => r.dateKey === dateKey).sort((a,b)=>b.timestamp - a.timestamp);
        document.getElementById('daily-detail-amount').innerText = fmtMoney(dailyRecords.reduce((s,r)=>s+r.amount,0));
        document.getElementById('daily-detail-amount').style.color = 'var(--success)';
        
        let totalShiftMins = shiftRecords.filter(r => r.dateKey === dateKey).reduce((s,r) => s + r.durationMins, 0) + (activeShift && getDateKey(activeShift.startTime) === dateKey ? Math.floor((Date.now() - activeShift.startTime) / 60000) : 0);
        const dailyWaits = waitRecords.filter(r => r.dateKey === dateKey);
        let totalWaitMins = dailyWaits.reduce((s,r) => s + r.durationMins, 0), maxWaitMins = dailyWaits.length > 0 ? Math.max(...dailyWaits.map(r=>r.durationMins)) : 0;
        if (activeWait && getDateKey(activeWait.startTime) === dateKey) { const currWait = Math.floor((Date.now() - activeWait.startTime) / 60000); totalWaitMins += currWait; maxWaitMins = Math.max(maxWaitMins, currWait); }

        statsGrid.style.display = 'grid';
        document.getElementById('daily-detail-online-hours').innerText = formatMins(totalShiftMins);
        document.getElementById('daily-detail-wait-total').innerText = formatMins(totalWaitMins);
        document.getElementById('daily-detail-wait-max').innerText = formatMins(maxWaitMins);

        if (dailyRecords.length === 0) html = '<div class="empty-state">今日無收入紀錄</div>';
        else dailyRecords.forEach(r => {
            const titleStr = r.storeName ? `<div style="font-weight:bold; color:var(--primary); margin-bottom:4px; font-size:1rem; word-break:break-word;">${r.storeName} #${r.orderNumber}</div>` : '';
            html += `<div class="swipe-container record-swipe-container" data-id="${r.id}"><div class="swipe-content record-swipe-content" ontouchstart="handleItemTouchStart(event)" ontouchmove="handleItemTouchMove(event)" ontouchend="handleItemTouchEnd(event)" ontouchcancel="handleItemTouchEnd(event)"><div class="swipe-edit" style="background:var(--success);" onclick="editHistoryEstimatedTime('${r.id}')">預估</div><div class="record-info" onclick="editIncomeAmount('${r.id}')" style="cursor:pointer;">${titleStr}<div class="record-time" style="color:var(--text-main);">${r.startTimeStr} - ${r.endTimeStr}</div><div class="record-desc" style="color:var(--text-muted);">實際 ${r.durationMins} 分鐘 ${r.estimatedTime ? ` / 預估 ${r.estimatedTime} 分鐘` : ''}</div></div><div class="record-amount" onclick="editIncomeAmount('${r.id}')" style="cursor:pointer;">${fmtMoney(r.amount)}</div><div class="swipe-delete" onclick="deleteHistoryRecord('${r.id}')">刪除</div></div></div>`;
        });
    } else if (currentDailyContext === 'tip') {
        document.getElementById('daily-detail-type-label').innerText = '小費總額';
        const dailyRecords = tipRecords.filter(r => r.dateKey === dateKey).sort((a,b)=>b.timestamp - a.timestamp);
        document.getElementById('daily-detail-amount').innerText = fmtMoney(dailyRecords.reduce((s,r)=>s+r.amount,0));
        document.getElementById('daily-detail-amount').style.color = 'var(--success)';
        statsGrid.style.display = 'none';

        if (dailyRecords.length === 0) html = '<div class="empty-state">今日無小費紀錄</div>';
        else dailyRecords.forEach(r => html += `<div class="swipe-container record-swipe-container"><div class="swipe-content record-swipe-content" ontouchstart="handleItemTouchStart(event)" ontouchmove="handleItemTouchMove(event)" ontouchend="handleItemTouchEnd(event)" ontouchcancel="handleItemTouchEnd(event)"><div class="swipe-edit" onclick="openEdit('tip', '${r.id}')">編輯</div><div class="record-info"><div class="record-time">${r.timeStr}</div><div class="record-desc">支付方式: ${r.method}</div></div><div class="record-amount">${fmtMoney(r.amount)}</div><div class="swipe-delete" onclick="deleteTip('${r.id}')">刪除</div></div></div>`);
    } else if (currentDailyContext === 'cost') {
        document.getElementById('daily-detail-type-label').innerText = '成本支出總額';
        const dailyRecords = costRecords.filter(r => r.dateKey === dateKey).sort((a,b)=>b.timestamp - a.timestamp);
        document.getElementById('daily-detail-amount').innerText = fmtMoney(dailyRecords.reduce((s,r)=>s+r.amount,0));
        document.getElementById('daily-detail-amount').style.color = 'var(--text-main)';
        statsGrid.style.display = 'none';

        if (dailyRecords.length === 0) html = '<div class="empty-state">今日無成本紀錄</div>';
        else dailyRecords.forEach(r => { let tags = `<span class="tag">${r.type}</span>`; if((r.type === '保養維修' || r.type === '加油') && r.mileage) tags += `<span class="tag">里程:${fmtNum(r.mileage)}</span>`; html += `<div class="swipe-container record-swipe-container"><div class="swipe-content record-swipe-content" ontouchstart="handleItemTouchStart(event)" ontouchmove="handleItemTouchMove(event)" ontouchend="handleItemTouchEnd(event)" ontouchcancel="handleItemTouchEnd(event)"><div class="swipe-edit" onclick="openEdit('cost', '${r.id}')">編輯</div><div class="record-info"><div class="record-time">${r.timeStr} ${tags}</div><div class="record-desc">${r.memo || '無備註'}</div></div><div class="record-amount" style="color:var(--text-main);">- ${fmtMoney(r.amount)}</div><div class="swipe-delete" onclick="deleteCost('${r.id}')">刪除</div></div></div>`; });
    }
    listContainer.innerHTML = html;
}

/* ================== 編輯與查詢邏輯 ================== */
function openEdit(category, id) { closeAllSwipes(); document.getElementById('edit-modal').classList.add('active'); document.getElementById('edit-id').value = id; document.getElementById('edit-category').value = category; if (category === 'tip') { document.getElementById('edit-modal-title').innerText = '編輯小費'; document.getElementById('edit-tip-fields').style.display = 'block'; document.getElementById('edit-cost-fields').style.display = 'none'; const record = tipRecords.find(t => t.id === id); document.getElementById('edit-amount').value = record.amount; document.getElementById('edit-tip-method').value = record.method; } else { document.getElementById('edit-modal-title').innerText = '編輯成本'; document.getElementById('edit-tip-fields').style.display = 'none'; document.getElementById('edit-cost-fields').style.display = 'block'; const record = costRecords.find(t => t.id === id); document.getElementById('edit-amount').value = record.amount; document.getElementById('edit-cost-type').value = record.type; document.getElementById('edit-cost-memo').value = record.memo || ''; toggleEditMileage(); if(record.type === '保養維修' || record.type === '加油') document.getElementById('edit-cost-mileage').value = record.mileage || ''; } }
async function saveEdit() { const id = document.getElementById('edit-id').value, category = document.getElementById('edit-category').value, amount = Number(document.getElementById('edit-amount').value); if (!amount || amount <= 0) return await appAlert('請輸入有效金額', '輸入錯誤'); if (category === 'tip') { const idx = tipRecords.findIndex(t => t.id === id); if(idx > -1) { tipRecords[idx].amount = amount; tipRecords[idx].method = document.getElementById('edit-tip-method').value; localStorage.setItem(getStoreKey('order_tips'), JSON.stringify(tipRecords)); renderWeeklyData(); if(document.getElementById('view-daily-detail').classList.contains('active')) renderDailyDetail(); } } else { const idx = costRecords.findIndex(t => t.id === id); if(idx > -1) { const type = document.getElementById('edit-cost-type').value; costRecords[idx].amount = amount; costRecords[idx].type = type; costRecords[idx].memo = document.getElementById('edit-cost-memo').value; costRecords[idx].mileage = (type === '保養維修' || type === '加油') ? document.getElementById('edit-cost-mileage').value : ''; localStorage.setItem(getStoreKey('order_costs'), JSON.stringify(costRecords)); renderWeeklyData(); if(document.getElementById('view-daily-detail').classList.contains('active')) renderDailyDetail(); } } closeModal('edit-modal'); }

let currentCalDate = new Date(), calSelStart = null, calSelEnd = null;
function openFilterModal() { calSelStart = null; calSelEnd = null; renderCalendar(); document.getElementById('filter-modal').classList.add('active'); } function closeModal(id) { document.getElementById(id).classList.remove('active'); } function calPrevMonth() { currentCalDate.setMonth(currentCalDate.getMonth() - 1); renderCalendar(); } function calNextMonth() { currentCalDate.setMonth(currentCalDate.getMonth() + 1); renderCalendar(); }
function renderCalendar() { const y = currentCalDate.getFullYear(), m = currentCalDate.getMonth(); document.getElementById('cal-month-year').innerText = `${y}年${m + 1}月`; const firstDay = new Date(y, m, 1).getDay(), daysInMonth = new Date(y, m + 1, 0).getDate(), grid = document.getElementById('cal-days'); grid.innerHTML = ''; for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="cal-day empty"></div>`; for (let i = 1; i <= daysInMonth; i++) { const dayTime = new Date(y, m, i, 0, 0, 0).getTime(); let classes = 'cal-day'; if (calSelStart === dayTime || calSelEnd === dayTime) classes += ' selected'; if (calSelStart && calSelEnd && dayTime > calSelStart && dayTime < calSelEnd) classes += ' in-range'; grid.innerHTML += `<div class="${classes}" onclick="selectCalDate(${y}, ${m}, ${i})">${i}</div>`; } document.getElementById('cal-selection-text').innerText = !calSelStart ? '請點選開始日期' : (!calSelEnd ? '請點選結束日期 (單日請直接按確認)' : '已選擇範圍，請點擊確認查詢'); }
function selectCalDate(y, m, d) { const t = new Date(y, m, d, 0, 0, 0).getTime(); if (!calSelStart || (calSelStart && calSelEnd)) { calSelStart = t; calSelEnd = null; } else { if (t >= calSelStart) calSelEnd = t; else { calSelStart = t; calSelEnd = null; } } renderCalendar(); }
async function applyFilter() { if (!calSelStart) return await appAlert('請先選擇日期', '操作錯誤'); const sTime = calSelStart, eTime = (calSelEnd || calSelStart) + 86399999; const fInc = historyRecords.filter(r => r.timestamp >= sTime && r.timestamp <= eTime), fTip = tipRecords.filter(r => r.timestamp >= sTime && r.timestamp <= eTime), fCost = costRecords.filter(r => r.timestamp >= sTime && r.timestamp <= eTime); document.getElementById('search-total-income').innerText = fmtMoney(fInc.reduce((s, r)=>s+r.amount,0)); document.getElementById('search-total-tips').innerText = fmtMoney(fTip.reduce((s, r)=>s+r.amount,0)); document.getElementById('search-total-costs').innerText = '-' + fmtMoney(fCost.reduce((s, r)=>s+r.amount,0)); const sd = new Date(sTime), ed = new Date(eTime), sStr = `${sd.getFullYear()}/${sd.getMonth()+1}/${sd.getDate()}`, eStr = `${ed.getFullYear()}/${ed.getMonth()+1}/${ed.getDate()}`; document.getElementById('search-date-range').innerText = sStr === eStr ? sStr : `${sStr} ~ ${eStr}`; renderStats(fInc, 'search-income-list'); renderTips(fTip, 'search-tips-list'); renderCosts(fCost, 'search-costs-list'); closeModal('filter-modal'); isSearchResultOpen = true; document.getElementById('view-search-result').classList.add('active'); updateUIState(); }

/* ================== 準時率 / 兩週週期計算邏輯 ================== */
function calculatePunctuality() {
    const buffer = Number(document.getElementById('rate-buffer-time').value) || 0;
    const now = Date.now();
    
    const anchor = new Date(2026, 7, 17).setHours(0,0,0,0);
    const cycleMs = 14 * 24 * 60 * 60 * 1000;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    
    let startMs = anchor;
    let diff = now - anchor;
    if (diff >= 0) { startMs = anchor + Math.floor(diff / cycleMs) * cycleMs; } else { startMs = anchor - Math.ceil(Math.abs(diff) / cycleMs) * cycleMs; }
    let endMs = startMs + cycleMs - 1;
    let isWeek2 = (now - startMs) >= weekMs;
    
    const validRecords = historyRecords.filter(r => r.estimatedTime && r.estimatedTime > 0 && r.timestamp >= startMs && r.timestamp <= endMs);
    
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
    cycleInfoEl.innerHTML = `週期: <b style="color:var(--primary);">${cycleStr}</b> (目前為${weekStr})`;

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
        if (actual <= limit) { onTimeCount++; singleTimeoutRates.push(0); } else { singleTimeoutRates.push((actual - limit) / limit); }
        totalActual += actual; totalEstimatedWithBuffer += limit;
    });

    const onTimeRate = (onTimeCount / validRecords.length) * 100;
    const avgTimeoutRate = (singleTimeoutRates.reduce((a, b) => a + b, 0) / validRecords.length) * 100;
    let totalTimeoutRate = 0;
    if (totalActual > totalEstimatedWithBuffer && totalEstimatedWithBuffer > 0) { totalTimeoutRate = ((totalActual - totalEstimatedWithBuffer) / totalEstimatedWithBuffer) * 100; }

    document.getElementById('punctuality-ontime').innerText = onTimeRate.toFixed(1) + '%';
    document.getElementById('punctuality-avg-timeout').innerText = avgTimeoutRate.toFixed(1) + '%';
    document.getElementById('punctuality-total-timeout').innerText = totalTimeoutRate.toFixed(1) + '%';
}

function calculateRateTotal() { const total = Number(document.getElementById('rate-input-total').value), box = document.getElementById('rate-result-total'); if(total && total > 0) { box.style.display = 'block'; document.getElementById('rate-number-reject').innerText = Math.floor(total * 0.2); } else box.style.display = 'none'; }
function calculateRateCurrent() { const pct = Number(document.getElementById('rate-current-pct').value), total = Number(document.getElementById('rate-current-total').value), box = document.getElementById('rate-result-current'); if(pct && total && pct > 0 && total > 0) { box.style.display = 'block'; document.getElementById('rate-current-ans').innerText = Math.max(0, total - Math.round(total * (pct / 100))); } else box.style.display = 'none'; }

function exportData() { const data = {}; for(let i=0; i<localStorage.length; i++){ const key = localStorage.key(i); if(key.includes('order_') || key.includes('app_')) data[key] = localStorage.getItem(key); } const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'), d = new Date(); a.href = url; a.download = `訂單統計備份_${d.getFullYear()}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getDate().toString().padStart(2,'0')}.json`; a.click(); URL.revokeObjectURL(url); }
function importData(event) { const file = event.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = async function(e) { try { const data = JSON.parse(e.target.result); let valid = false; Object.keys(data).forEach(k => { if(k.includes('order_') || k.includes('app_')) { localStorage.setItem(k, data[k]); valid = true; } }); if(valid) { await appAlert('資料匯入成功！即將重新載入頁面。', '匯入成功'); location.reload(); } else await appAlert('無效的備份檔案格式。', '匯入失敗'); } catch(err) { await appAlert('匯入失敗：檔案損毀或格式錯誤。', '錯誤'); } }; reader.readAsText(file); }
async function clearAllData() { if (await appConfirm(`確定要清除 [${currentUser}] 的所有紀錄嗎？\n（此動作無法復原）`, '警告', true)) { activeTimers = []; historyRecords = []; tipRecords = []; costRecords = []; shiftRecords = []; activeShift = null; waitRecords = []; activeWait = null; ['order_active_timers', 'order_history_records', 'order_tips', 'order_costs', 'order_shifts', 'order_active_shift', 'order_waits', 'order_active_wait'].forEach(k => localStorage.setItem(getStoreKey(k), k.includes('active') ? 'null' : '[]')); renderActiveTimers(); renderWeeklyData(); updateShiftUI(); checkWaitState(); await appAlert('清理完成', '成功'); } }

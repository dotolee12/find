/**
 * Giloa (New대동여지도) - 실시간 동기화 및 성능 최적화 통합본
 */

// ── 1. 설정 및 상수 ──────────────────────────────────
const STORAGE_KEY          = "giloa-layer-final";
const FOG_ENABLED_KEY      = "giloa-fog-enabled";
const FOG_ALPHA            = 0.82;
const FOG_RADIUS_M         = 18;
const MIN_MOVE_M           = 15;
const MAX_ACCURACY_M       = 25;
const STAY_ACCURACY_FACTOR = 0.6;
const MAX_STAY_RADIUS_M    = 36;
const SAVE_DELAY_MS        = 1000;
const MERGE_DISTANCE_M     = 6;
const MERGE_TIME_GAP_MS    = 2 * 60 * 1000;
const MAX_PATH_POINTS      = 8000;

const FULL_VISIBILITY_HOURS = 0;
const MIN_VISIBILITY_HOURS  = 24;
const MIN_PATH_VISIBILITY   = 0.4;

const AGE_COLORS = [
    { day: 365, color: "rgba(126,112,96,0.24)" }, // 1년 이상 (퇴적층)
    { day: 180, color: "rgba(130,92,55,0.20)" },  // 6개월
    { day: 90,  color: "rgba(214,176,55,0.18)" }, // 3개월
    { day: 30,  color: "rgba(60,170,80,0.18)" },  // 1개월
    { day: 3,   color: "rgba(173,255,120,0.16)" } // 3일
];

// ── 2. 상태 변수 ────────────────────────────────────
let isRecording   = false;
let isFogEnabled  = true;
let isHudExpanded = false;
let currentPos    = null;
let pathCoordinates = [];
let memories      = [];
let photos        = [];
let totalDistance = 0;
let playerMarker  = null;
let watchId       = null;
let saveTimer     = null;
let rafId         = null;
let mapRect       = { left: 0, top: 0 };

const memoryMarkers = new Map();
const photoMarkers  = new Map();
const gpxLayers     = [];

// ── 3. DOM & Canvas 초기화 ──────────────────────────
const recBtn       = document.getElementById("rec-btn");
const recStatusBox = document.getElementById("rec-status-box");
const fogCanvas    = document.getElementById("fog-canvas");
const ageCanvas    = document.getElementById("age-canvas");
const stayCanvas   = document.getElementById("stay-canvas");
const fogCtx       = fogCanvas.getContext("2d", { alpha: true });
const ageCtx       = ageCanvas.getContext("2d");
const stayCtx      = stayCanvas.getContext("2d");

const map = L.map("map", { 
    zoomControl: false, 
    attributionControl: false,
    preferCanvas: true 
}).setView([37.5665, 126.978], 16);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png").addTo(map);

map.createPane("memoryPane").style.zIndex = "500";
map.createPane("gpxPane").style.zIndex = "450";

// ── 4. 렌더링 엔진 (실시간 동기화 포함) ──────────────────
function resizeCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    [fogCanvas, ageCanvas, stayCanvas].forEach(c => {
        c.width  = w;
        c.height = h;
    });
    const rect = map.getContainer().getBoundingClientRect();
    mapRect = { left: rect.left, top: rect.top };
    scheduleRender();
}

window.addEventListener("resize", resizeCanvas);
map.on("move zoom moveend zoomend", scheduleRender);

function scheduleRender() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => { 
        rafId = null; 
        render(); 
    });
}

function render() {
    const bounds = map.getBounds().pad(0.1);
    const visiblePoints = pathCoordinates
        .map((pt, i) => ({ ...pt, index: i }))
        .filter(pt => bounds.contains([pt.lat, pt.lng]));

    const mpp = calcMpp();
    renderFog(visiblePoints, mpp);
    renderAgeTint(visiblePoints, mpp);
    renderStayTint(visiblePoints, mpp);

    // [중요] 렌더링 직후 현재 위치에 구멍을 한 번 더 뚫어 파란 점과의 동기화 보장
    if (currentPos && isRecording) punchFogAtLocation(currentPos, 10);
}

function calcMpp() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    return map.distance(center, map.unproject(map.project(center, zoom).add([10, 0]), zoom)) / 10 || 1;
}

function latlngToFixed(latlng) {
    const pt = map.latLngToContainerPoint(latlng);
    return { x: pt.x + mapRect.left, y: pt.y + mapRect.top };
}

function renderFog(points, mpp) {
    fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
    if (!isFogEnabled) return;

    fogCtx.fillStyle = `rgba(8,10,18,${FOG_ALPHA})`;
    fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
    if (points.length === 0 && !currentPos) return;

    const now = Date.now();
    const baseR = (FOG_RADIUS_M / mpp);

    fogCtx.save();
    fogCtx.globalCompositeOperation = "destination-out";
    fogCtx.lineCap = fogCtx.lineJoin = "round";

    points.forEach((pt) => {
        const h = (now - pt.startTime) / 3600000;
        fogCtx.globalAlpha = getPathVisibility(h);
        
        const stayMin = (pt.endTime - pt.startTime) / 60000;
        const r = stayMin >= 10 ? baseR * (1 + Math.min(stayMin / 180, 1)) : baseR;
        const pos = latlngToFixed([pt.lat, pt.lng]);

        fogCtx.beginPath(); 
        fogCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2); 
        fogCtx.fill();

        if (pt.index > 0) {
            const prev = pathCoordinates[pt.index - 1];
            const ppos = latlngToFixed([prev.lat, prev.lng]);
            fogCtx.beginPath();
            fogCtx.lineWidth = r * 1.8;
            fogCtx.moveTo(ppos.x, ppos.y); 
            fogCtx.lineTo(pos.x, pos.y); 
            fogCtx.stroke();
        }
    });
    fogCtx.restore();
}

function getPathVisibility(h) {
    if (h <= FULL_VISIBILITY_HOURS) return 1;
    if (h >= MIN_VISIBILITY_HOURS)  return MIN_PATH_VISIBILITY;
    return 1 - (1 - MIN_PATH_VISIBILITY) * (h / MIN_VISIBILITY_HOURS);
}

// ── 5. GPS 트래킹 & 실시간 동기화 ────────────────────
function handlePosition(position) {
    const acc = position.coords.accuracy || Infinity;
    const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
    currentPos = latlng;

    // 마커 이동
    if (!playerMarker) {
        playerMarker = L.marker(latlng, {
            icon: L.divIcon({ className: "player-marker", iconSize: [20, 20] })
        }).addTo(map);
        map.setView(latlng, 16);
    } else {
        playerMarker.setLatLng(latlng);
    }

    if (!isRecording) return;
    if (acc > MAX_ACCURACY_M) {
        recStatusBox.textContent = `GPS 신호 약함 (${Math.round(acc)}m)`;
        return;
    }
    recStatusBox.textContent = "기록 중";

    // [핵심] 파란 점 위치에 즉시 안개 구멍 뚫기 (실시간 동기화)
    punchFogAtLocation(latlng, acc);

    const now = Date.now();
    if (pathCoordinates.length === 0) {
        pathCoordinates.push(mkPt(latlng, now));
    } else {
        const last = pathCoordinates[pathCoordinates.length - 1];
        const dist = latlng.distanceTo([last.lat, last.lng]);
        const thresh = Math.max(MIN_MOVE_M, Math.min(MAX_STAY_RADIUS_M, acc * STAY_ACCURACY_FACTOR));

        if (dist <= thresh) {
            last.endTime = now;
            last.visits = (last.visits || 1) + 1;
            last.lat += (latlng.lat - last.lat) * 0.2;
            last.lng += (latlng.lng - last.lng) * 0.2;
        } else {
            totalDistance += dist;
            pathCoordinates.push(mkPt(latlng, now));
            if (pathCoordinates.length > MAX_PATH_POINTS) compactPathData();
        }
    }
    
    updateStats();
    scheduleSave();
    // 부드러운 화면 갱신을 위해 렌더링 호출
    scheduleRender();
}

function punchFogAtLocation(latlng, accuracy) {
    if (!isFogEnabled) return;
    const pos = latlngToFixed(latlng);
    const mpp = calcMpp();
    const r = (FOG_RADIUS_M / mpp) * (accuracy < 15 ? 1.0 : 1.1);

    fogCtx.save();
    fogCtx.globalCompositeOperation = "destination-out";
    fogCtx.beginPath();
    fogCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    fogCtx.fill();
    fogCtx.restore();
}

// ── 6. 기타 렌더링 및 유틸리티 ────────────────────────
function renderAgeTint(points, mpp) {
    ageCtx.clearRect(0, 0, ageCanvas.width, ageCanvas.height);
    if (points.length === 0) return;
    const now = Date.now();
    const baseR = (FOG_RADIUS_M / mpp);

    ageCtx.save();
    ageCtx.globalCompositeOperation = "screen";
    points.forEach((pt) => {
        const d = (now - pt.startTime) / 86400000;
        const colorEntry = AGE_COLORS.find(c => d >= c.day);
        const color = colorEntry ? colorEntry.color : (d >= 3 ? AGE_COLORS[AGE_COLORS.length-1].color : null);
        if (!color) return;

        const pos = latlngToFixed([pt.lat, pt.lng]);
        const r = baseR * ( (pt.endTime-pt.startTime)/60000 >= 10 ? 1.5 : 1 );
        ageCtx.fillStyle = color;
        ageCtx.beginPath(); ageCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2); ageCtx.fill();
    });
    ageCtx.restore();
}

function renderStayTint(points, mpp) {
    stayCtx.clearRect(0, 0, stayCanvas.width, stayCanvas.height);
    points.forEach(pt => {
        const stayMin = (pt.endTime - pt.startTime) / 60000;
        if (stayMin < 10) return;
        const pos = latlngToFixed([pt.lat, pt.lng]);
        const r = (FOG_RADIUS_M / mpp) * (stayMin >= 180 ? 2.5 : 1 + (stayMin-10)/170);
        const grad = stayCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r);
        grad.addColorStop(0, "rgba(255,220,100,0.2)"); grad.addColorStop(1, "rgba(255,220,100,0)");
        stayCtx.fillStyle = grad;
        stayCtx.beginPath(); stayCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2); stayCtx.fill();
    });
}

function updateStats() {
    const distEl = document.getElementById("dist-val");
    if (distEl) distEl.innerHTML = `${(totalDistance/1000).toFixed(2)}<span>km</span>`;
}

function mkPt(ll, ts) { return { lat: ll.lat, lng: ll.lng, startTime: ts, endTime: ts, visits: 1 }; }

function compactPathData() {
    if (pathCoordinates.length <= 4000) return;
    const merged = [];
    for (const pt of pathCoordinates) {
        const last = merged[merged.length - 1];
        if (!last) { merged.push({ ...pt }); continue; }
        const d = L.latLng(pt.lat, pt.lng).distanceTo([last.lat, last.lng]);
        if (d <= MERGE_DISTANCE_M && (pt.startTime - last.endTime) <= MERGE_TIME_GAP_MS) {
            last.endTime = pt.endTime;
            last.visits += pt.visits;
        } else { merged.push({ ...pt }); }
    }
    pathCoordinates = merged.slice(-MAX_PATH_POINTS);
}

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistState, SAVE_DELAY_MS);
}

function persistState() {
    try {
        const data = { pathCoordinates, memories, photos, totalDistance };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { console.error("Save failed", e); }
}

function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
        const s = JSON.parse(raw);
        pathCoordinates = s.pathCoordinates || [];
        memories = s.memories || [];
        photos = s.photos || [];
        totalDistance = s.totalDistance || 0;
    } catch (e) { console.error("Load failed", e); }
}

function startTracking() {
    if (!navigator.geolocation) return alert("GPS 미지원");
    watchId = navigator.geolocation.watchPosition(handlePosition, null, {
        enableHighAccuracy: true, maximumAge: 0, timeout: 10000
    });
}

function init() {
    loadState();
    resizeCanvas();
    startTracking(); // 시작 시 위치 추적 활성화
    scheduleRender();
}

map.whenReady(init);

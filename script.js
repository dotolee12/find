const STORAGE_KEY = "giloa-v8";
const FOG_ALPHA = 0.8;
const FOG_RADIUS_M = 18;
const START_ALPHA = 1.0;
const FINAL_ALPHA = 0.4;
const DECAY_RATE_PER_HOUR = (1.0 - 0.4) / 24; // 24시간 동안 1.0 -> 0.4 감소

// 숙성 시간 상수
const ONE_MONTH_HRS = 24 * 30;
const SIX_MONTHS_HRS = ONE_MONTH_HRS * 6;
const ONE_YEAR_HRS = 24 * 365;
const THREE_YEARS_HRS = ONE_YEAR_HRS * 3;

let isRecording = false;
let currentPos = null;
let pathCoordinates = []; // {lat, lng, startTime, endTime}
let memories = [];        // {id, lat, lng, name, startTime, isManual}
let memoryMarkers = new Map();
let watchId = null;

const map = L.map("map", { zoomControl: false, attributionControl: false }).setView([37.5665, 126.9780], 16);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png").addTo(map);

const fogCanvas = document.getElementById("fog-canvas");
const ageCanvas = document.getElementById("age-canvas");
const stayCanvas = document.getElementById("stay-canvas");
const fogCtx = fogCanvas.getContext("2d");
const ageCtx = ageCanvas.getContext("2d");
const stayCtx = stayCanvas.getContext("2d");

// --- 핵심 로직: 농도 및 숙성 색상 ---
function getAgeColor(startTime) {
    const now = Date.now();
    const hoursAgo = (now - startTime) / 3600000;
    
    // 1. 농도: 24시간 동안 1.0 -> 0.4, 이후 0.4 고정
    let alpha = START_ALPHA - (hoursAgo * DECAY_RATE_PER_HOUR);
    alpha = Math.max(FINAL_ALPHA, alpha);

    // 2. 색상: 하루(24시간) 기준 숙성 단계
    if (hoursAgo < 1) return `rgba(255, 255, 255, ${alpha})`; // 1시간 내: 흰색
    if (hoursAgo < 24) return `rgba(60, 220, 80, ${alpha})`;  // 하루 내: 생생한 초록

    // 하루 이후부터 색상 숙성
    if (hoursAgo >= THREE_YEARS_HRS) return `rgba(139, 69, 19, 0.4)`; // 갈색
    if (hoursAgo >= ONE_YEAR_HRS) return `rgba(255, 215, 0, 0.4)`;    // 노란색
    if (hoursAgo >= SIX_MONTHS_HRS) return `rgba(0, 100, 0, 0.4)`;   // 진초록
    if (hoursAgo >= ONE_MONTH_HRS) return `rgba(173, 255, 47, 0.4)`;  // 연두색
    return `rgba(34, 139, 34, 0.4)`; // 기본 초록
}

function getStayRadiusMeters(stayMin) {
    if (stayMin < 10) return FOG_RADIUS_M;
    let dynamicRadius = 18 + (stayMin - 10) * 0.1;
    return Math.min(30, dynamicRadius); // 최대 30m 제한
}

// --- 마커 및 오버레이 관리 ---
function createOverlayMarker(data) {
    const layer = document.getElementById("overlay-layer");
    const el = document.createElement("div");
    el.className = "overlay-marker";
    
    // 아이콘 결정
    const stayMin = data.startTime ? (data.endTime - data.startTime)/60000 : 0;
    if (data.isManual) el.innerText = "★";
    else if (stayMin >= 60) el.innerText = "🏠";
    else if (stayMin >= 30) el.innerText = "☕";
    else el.innerText = "📍";

    el.onclick = (e) => {
        e.stopPropagation();
        showMemoryInfo(data, stayMin);
    };

    layer.appendChild(el);
    memoryMarkers.set(data.id || ("stay_"+data.startTime), el);
}

function updateOverlayMarkers() {
    const now = Date.now();
    memoryMarkers.forEach((el, id) => {
        const m = memories.find(m => m.id === id) || pathCoordinates.find(p => ("stay_"+p.startTime) === id);
        if (!m) return;
        const pos = map.latLngToContainerPoint([m.lat, m.lng]);
        el.style.left = pos.x + "px";
        el.style.top = pos.y + "px";
        
        // 투명도 동기화
        const hoursAgo = (now - (m.startTime || m.time)) / 3600000;
        el.style.opacity = Math.max(FINAL_ALPHA, START_ALPHA - (hoursAgo * DECAY_RATE_PER_HOUR));
    });
}

function showMemoryInfo(m, stayMin) {
    const box = document.getElementById("memory-info-box");
    box.innerHTML = `<strong>${m.name || '머문 장소'}</strong><br>${stayMin > 0 ? stayMin.toFixed(0)+'분 체류' : m.dateString}`;
    box.style.display = "block";
    setTimeout(() => box.style.display = "none", 3000);
}

// --- 렌더링 엔진 ---
function render() {
    const width = window.innerWidth, height = window.innerHeight;
    [fogCtx, ageCtx, stayCtx].forEach(ctx => ctx.clearRect(0, 0, width, height));

    if (pathCoordinates.length === 0) return;

    // 안개 제거 (항상 100%)
    fogCtx.save();
    fogCtx.fillStyle = `rgba(8, 10, 18, ${FOG_ALPHA})`;
    fogCtx.fillRect(0, 0, width, height);
    fogCtx.globalCompositeOperation = "destination-out";
    pathCoordinates.forEach(p => {
        const pos = map.latLngToContainerPoint([p.lat, p.lng]);
        fogCtx.beginPath();
        fogCtx.arc(pos.x, pos.y, getMetersToPixels(FOG_RADIUS_M), 0, Math.PI*2);
        fogCtx.fill();
    });
    fogCtx.restore();

    // 이동 흔적 및 체류지 렌더링
    pathCoordinates.forEach(p => {
        const pos = map.latLngToContainerPoint([p.lat, p.lng]);
        const ageColor = getAgeColor(p.startTime);
        const stayMin = (p.endTime - p.startTime) / 60000;
        
        // 이동 선/원
        ageCtx.fillStyle = ageColor;
        ageCtx.beginPath();
        ageCtx.arc(pos.x, pos.y, getMetersToPixels(FOG_RADIUS_M), 0, Math.PI*2);
        ageCtx.fill();

        // 체류지 원 (최대 30m)
        if (stayMin >= 10) {
            const radius = getMetersToPixels(getStayRadiusMeters(stayMin));
            const grad = stayCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
            grad.addColorStop(0, ageColor); 
            grad.addColorStop(1, "rgba(0,0,0,0)");
            stayCtx.fillStyle = grad;
            stayCtx.beginPath();
            stayCtx.arc(pos.x, pos.y, radius, 0, Math.PI*2);
            stayCtx.fill();
        }
    });
    updateOverlayMarkers();
}

function getMetersToPixels(meters) {
    const center = map.getCenter();
    const res = map.containerPointToLatLng([100, 100]).distanceTo(map.containerPointToLatLng([100, 101]));
    return meters / res;
}

// --- 시스템 제어 ---
function toggleRecording() {
    isRecording = !isRecording;
    document.getElementById("rec-btn").classList.toggle("recording", isRecording);
    if (isRecording) {
        watchId = navigator.geolocation.watchPosition(pos => {
            const { latitude: lat, longitude: lng } = pos.coords;
            currentPos = { lat, lng };
            const now = Date.now();
            pathCoordinates.push({ lat, lng, startTime: now, endTime: now });
            render();
            save();
        }, null, { enableHighAccuracy: true });
    } else {
        navigator.geolocation.clearWatch(watchId);
    }
}

function addMemory() {
    if (!currentPos) return;
    const name = prompt("이름:");
    if (!name) return;
    const m = { id: Date.now().toString(), ...currentPos, name, startTime: Date.now(), isManual: true };
    memories.push(m);
    createOverlayMarker(m);
    save();
}

function centerMap() { if (currentPos) map.panTo(currentPos); }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ pathCoordinates, memories })); }
function load() {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    pathCoordinates = data.pathCoordinates || [];
    memories = data.memories || [];
    memories.forEach(createOverlayMarker);
    render();
}

window.addEventListener("resize", () => {
    fogCanvas.width = ageCanvas.width = stayCanvas.width = window.innerWidth;
    fogCanvas.height = ageCanvas.height = stayCanvas.height = window.innerHeight;
    render();
});
map.on("move zoom", render);
load();

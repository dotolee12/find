/**
 * Giloa (나의 대동여지도) — 통합 완성본
 * 새 렌더링 엔진(문서6) + 전체 기능(문서3) + 새 UI(탭/GPX/사진목록)
 */

// ── 1. 설정 상수 ──────────────────────────────────────────────
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
    { day: 365, color: "rgba(180,80,220,0.28)"  },
    { day: 180, color: "rgba(255,120,60,0.28)"  },
    { day: 90,  color: "rgba(255,200,50,0.26)"  },
    { day: 30,  color: "rgba(80,200,120,0.24)"  },
    { day: 3,   color: "rgba(100,220,255,0.22)" }
];

// ── 2. 상태 변수 ─────────────────────────────────────────────
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

// ── 3. DOM 요소 ───────────────────────────────────────────────
const recBtn       = document.getElementById("rec-btn");
const recStatusBox = document.getElementById("rec-status-box");
const fogCanvas    = document.getElementById("fog-canvas");
const ageCanvas    = document.getElementById("age-canvas");
const stayCanvas   = document.getElementById("stay-canvas");
const fogCtx       = fogCanvas.getContext("2d", { alpha: true });
const ageCtx       = ageCanvas.getContext("2d");
const stayCtx      = stayCanvas.getContext("2d");

// ── 4. 지도 초기화 ────────────────────────────────────────────
const map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true
}).setView([37.5665, 126.978], 16);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png").addTo(map);

map.createPane("memoryPane").style.zIndex = "500";
map.createPane("gpxPane").style.zIndex    = "450";

// ── 5. 캔버스 리사이즈 & 렌더링 루프 ─────────────────────────
function resizeCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    [fogCanvas, ageCanvas, stayCanvas].forEach(c => {
        c.width  = w;
        c.height = h;
    });
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
    const bounds = map.getBounds().pad(0.15);
    const visiblePoints = pathCoordinates
        .map((pt, i) => ({ ...pt, index: i }))
        .filter(pt => bounds.contains([pt.lat, pt.lng]));

    const mpp = calcMpp();
    renderFog(visiblePoints, mpp);
    renderAgeTint(visiblePoints, mpp);
    renderStayTint(visiblePoints, mpp);

    if (currentPos && isFogEnabled && isRecording) punchFogAtLocation(currentPos, 10);
}

function calcMpp() {
    const center = map.getCenter();
    const zoom   = map.getZoom();
    return map.distance(center,
        map.unproject(map.project(center, zoom).add([10, 0]), zoom)) / 10 || 1;
}

function latlngToFixed(latlng) {
    const pt = map.latLngToContainerPoint(latlng);
    return { x: pt.x, y: pt.y };
}

// ── 6. 안개 렌더링 ────────────────────────────────────────────
function renderFog(points, mpp) {
    fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
    if (!isFogEnabled) return;

    fogCtx.fillStyle = `rgba(8,10,18,${FOG_ALPHA})`;
    fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
    if (points.length === 0) return;

    const now   = Date.now();
    const baseR = FOG_RADIUS_M / mpp;

    fogCtx.save();
    fogCtx.lineCap = fogCtx.lineJoin = "round";

    fogCtx.globalCompositeOperation = "destination-out";
    points.forEach((pt, arrIdx) => {
        if (arrIdx === 0) return;
        const h   = (now - pt.startTime) / 3600000;
        const vis = getPathVisibility(h);
        const prev = pathCoordinates[pt.index - 1];
        if (!prev) return;
        const ppos = latlngToFixed([prev.lat, prev.lng]);
        const pos  = latlngToFixed([pt.lat, pt.lng]);

        fogCtx.globalAlpha = vis * 0.38;
        fogCtx.lineWidth   = baseR * 3.2;
        fogCtx.beginPath();
        fogCtx.moveTo(ppos.x, ppos.y);
        fogCtx.lineTo(pos.x, pos.y);
        fogCtx.stroke();
    });

    points.forEach((pt, arrIdx) => {
        if (arrIdx === 0) return;
        const h   = (now - pt.startTime) / 3600000;
        const vis = getPathVisibility(h);
        const prev = pathCoordinates[pt.index - 1];
        if (!prev) return;
        const ppos = latlngToFixed([prev.lat, prev.lng]);
        const pos  = latlngToFixed([pt.lat, pt.lng]);

        fogCtx.globalAlpha = vis;
        fogCtx.lineWidth   = baseR * 1.5;
        fogCtx.beginPath();
        fogCtx.moveTo(ppos.x, ppos.y);
        fogCtx.lineTo(pos.x, pos.y);
        fogCtx.stroke();
    });

    points.forEach(pt => {
        const h   = (now - pt.startTime) / 3600000;
        const stayMin = (pt.endTime - pt.startTime) / 60000;
        const r   = stayMin >= 10
            ? baseR * (1 + Math.min(stayMin / 180, 1))
            : baseR;
        const pos = latlngToFixed([pt.lat, pt.lng]);

        fogCtx.globalAlpha = getPathVisibility(h);
        fogCtx.beginPath();
        fogCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        fogCtx.fill();
    });

    fogCtx.restore();
}

function punchFogAtLocation(latlng, accuracy) {
    if (!isFogEnabled) return;
    const pos  = latlngToFixed(latlng);
    const mpp  = calcMpp();
    const r    = (FOG_RADIUS_M / mpp) * (accuracy < 15 ? 1.0 : 1.1);
    fogCtx.save();
    fogCtx.globalCompositeOperation = "destination-out";
    fogCtx.globalAlpha = 1;
    fogCtx.beginPath();
    fogCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    fogCtx.fill();
    fogCtx.restore();
}

function getPathVisibility(h) {
    if (h <= FULL_VISIBILITY_HOURS) return 1;
    if (h >= MIN_VISIBILITY_HOURS)  return MIN_PATH_VISIBILITY;
    return 1 - (1 - MIN_PATH_VISIBILITY) * (h / MIN_VISIBILITY_HOURS);
}

// ── 7. 나이 색상 & 머문 시간 레이어 ───────────────────────────
function renderAgeTint(points, mpp) {
    ageCtx.clearRect(0, 0, ageCanvas.width, ageCanvas.height);
    if (points.length === 0) return;
    const now   = Date.now();
    const baseR = FOG_RADIUS_M / mpp;

    ageCtx.save();
    ageCtx.globalCompositeOperation = "screen";
    points.forEach(pt => {
        const d     = (now - pt.startTime) / 86400000;
        const entry = AGE_COLORS.find(c => d >= c.day);
        if (!entry) return;
        const pos = latlngToFixed([pt.lat, pt.lng]);
        const r   = baseR * ((pt.endTime - pt.startTime) / 60000 >= 10 ? 1.5 : 1);
        ageCtx.fillStyle = entry.color;
        ageCtx.beginPath();
        ageCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ageCtx.fill();
    });
    ageCtx.restore();
}

function renderStayTint(points, mpp) {
    stayCtx.clearRect(0, 0, stayCanvas.width, stayCanvas.height);
    const baseR = FOG_RADIUS_M / mpp;
    points.forEach(pt => {
        const stayMin = (pt.endTime - pt.startTime) / 60000;
        if (stayMin < 10) return;
        const pos  = latlngToFixed([pt.lat, pt.lng]);
        const r    = baseR * (stayMin >= 180 ? 2.5 : 1 + (stayMin - 10) / 170);
        const grad = stayCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r);
        grad.addColorStop(0, "rgba(255,220,100,0.2)");
        grad.addColorStop(1, "rgba(255,220,100,0)");
        stayCtx.fillStyle = grad;
        stayCtx.beginPath();
        stayCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        stayCtx.fill();
    });
}

// ── 8. GPS 추적 ───────────────────────────────────────────────
function startTracking() {
    if (!navigator.geolocation) { alert("GPS 미지원"); return; }
    watchId = navigator.geolocation.watchPosition(
        handlePosition,
        handleLocationError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
}

function stopTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

function handlePosition(position) {
    const acc    = position.coords.accuracy || Infinity;
    const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
    currentPos   = latlng;

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
    if (isFogEnabled) punchFogAtLocation(latlng, acc);

    const now = Date.now();
    if (pathCoordinates.length === 0) {
        pathCoordinates.push(mkPt(latlng, now));
    } else {
        const last   = pathCoordinates[pathCoordinates.length - 1];
        const dist   = latlng.distanceTo([last.lat, last.lng]);
        const thresh = Math.max(MIN_MOVE_M, Math.min(MAX_STAY_RADIUS_M, acc * STAY_ACCURACY_FACTOR));

        if (dist <= thresh) {
            last.endTime = now;
            last.visits  = (last.visits || 1) + 1;
            last.lat    += (latlng.lat - last.lat) * 0.2;
            last.lng    += (latlng.lng - last.lng) * 0.2;
        } else {
            totalDistance += dist;
            pathCoordinates.push(mkPt(latlng, now));
            if (pathCoordinates.length > MAX_PATH_POINTS) compactPathData();
        }
    }

    updateStats();
    scheduleSave();
    scheduleRender();
}

function handleLocationError(err) {
    const msgs = {
        1: "위치 권한이 거부되었습니다.",
        2: "현재 위치를 확인할 수 없습니다.",
        3: "위치 요청 시간이 초과되었습니다."
    };
    console.warn(msgs[err.code] || "위치 오류");
}

function mkPt(ll, ts) {
    return { lat: ll.lat, lng: ll.lng, startTime: ts, endTime: ts, visits: 1 };
}

// ── 9. 기록 토글 ──────────────────────────────────────────────
function toggleRecording() {
    isRecording = !isRecording;
    syncRecordingUI();
    if (isRecording) {
        if (!watchId) startTracking();
        if (!isFogEnabled) {
            isFogEnabled = true;
            localStorage.setItem(FOG_ENABLED_KEY, "true");
            syncFogButton();
        }
    } else {
        compactPathData();
        scheduleSave();
        isFogEnabled = false;
        localStorage.setItem(FOG_ENABLED_KEY, "false");
        syncFogButton();
    }
    scheduleRender();
}

function syncRecordingUI() {
    recBtn.classList.toggle("recording", isRecording);
    recStatusBox.textContent = isRecording ? "기록 중" : "대기 중";
    recStatusBox.classList.toggle("recording", isRecording);
}

// ── 10. 안개 토글 ─────────────────────────────────────────────
function toggleFog() {
    isFogEnabled = !isFogEnabled;
    localStorage.setItem(FOG_ENABLED_KEY, String(isFogEnabled));
    syncFogButton();
    scheduleRender();
}

function syncFogButton() {
    const btn = document.getElementById("fog-toggle-btn");
    if (!btn) return;
    btn.classList.toggle("on",  isFogEnabled);
    btn.classList.toggle("off", !isFogEnabled);
}

// ── 11. 기억 마킹 ─────────────────────────────────────────────
function addMemory() {
    if (!currentPos) { alert("위치 정보를 수신 중입니다."); return; }
    const input = prompt("이 장소의 이름을 입력하세요:", "새로운 발견");
    if (input === null) return;

    const now  = new Date();
    const data = {
        id:         String(now.getTime()),
        lat:        currentPos.lat,
        lng:        currentPos.lng,
        name:       escapeHtml(input.trim() || "기억의 지점"),
        time:       now.getTime(),
        dateString: now.toLocaleDateString("ko-KR", { year:"numeric", month:"long", day:"numeric" }),
        timeString: now.toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" })
    };

    memories.push(data);
    createMemoryMarker(data, true);
    updateMemoryList();
    updateStats();
    scheduleSave();
}

function createMemoryMarker(data, openPopup = false) {
    const marker = L.marker([data.lat, data.lng], {
        pane: "memoryPane",
        icon: L.divIcon({ className: "memory-marker", html: "★", iconSize: [28, 28] })
    }).addTo(map);

    const popupEl = document.createElement("div");
    const title   = document.createElement("b");
    title.textContent = data.name;
    const info = document.createElement("small");
    info.style.display = "block";
    info.textContent   = `${data.dateString} ${data.timeString || ""}`;
    const delBtn = document.createElement("button");
    delBtn.className   = "popup-delete-btn";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => deleteMemory(data.id));
    popupEl.appendChild(title);
    popupEl.appendChild(document.createElement("br"));
    popupEl.appendChild(info);
    popupEl.appendChild(delBtn);

    marker.bindPopup(popupEl);
    memoryMarkers.set(data.id, marker);
    if (openPopup) marker.openPopup();
}

function deleteMemory(id) {
    memories = memories.filter(m => m.id !== id);
    const marker = memoryMarkers.get(id);
    if (marker) { map.removeLayer(marker); memoryMarkers.delete(id); }
    updateMemoryList();
    updateStats();
    scheduleSave();
}

function updateMemoryList() {
    const container = document.getElementById("memory-list-container");
    if (!container) return;
    if (memories.length === 0) {
        container.innerHTML = '<p class="empty-message">아직 기록이 없습니다.</p>';
        return;
    }
    container.innerHTML = "";
    [...memories].reverse().forEach(memo => {
        const item = document.createElement("div");
        item.className = "memory-item";

        const name = document.createElement("span");
        name.className   = "item-name";
        name.textContent = "★ " + memo.name;
        const date = document.createElement("span");
        date.className   = "item-date";
        date.textContent = `${memo.dateString} ${memo.timeString || ""}`;

        const actions = document.createElement("div");
        actions.className = "memory-actions";
        const moveBtn = document.createElement("button");
        moveBtn.className   = "memory-action-btn move";
        moveBtn.textContent = "이동";
        moveBtn.addEventListener("click", e => { e.stopPropagation(); map.flyTo([memo.lat, memo.lng], 17); });
        const delBtn = document.createElement("button");
        delBtn.className   = "memory-action-btn delete";
        delBtn.textContent = "삭제";
        delBtn.addEventListener("click", e => { e.stopPropagation(); deleteMemory(memo.id); });

        actions.appendChild(moveBtn);
        actions.appendChild(delBtn);
        item.appendChild(name);
        item.appendChild(date);
        item.appendChild(actions);
        item.addEventListener("click", () => { map.flyTo([memo.lat, memo.lng], 17); toggleSidebar(false); });
        container.appendChild(item);
    });
}

// ── 12. 사진 처리 ─────────────────────────────────────────────
function handlePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const arrayReader = new FileReader();
    arrayReader.onload = function(ae) {
        const buffer = ae.target.result;
        const gps    = parseExifGps(buffer);

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas  = document.createElement("canvas");
                const maxSize = 400;
                let w = img.width, h = img.height;
                if (w > h && w > maxSize) { h = h * maxSize / w; w = maxSize; }
                else if (h > maxSize)     { w = w * maxSize / h; h = maxSize; }
                canvas.width = w; canvas.height = h;
                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                const compressed = canvas.toDataURL("image/jpeg", 0.6);

                const lat = gps ? gps.lat : (currentPos ? currentPos.lat : null);
                const lng = gps ? gps.lng : (currentPos ? currentPos.lng : null);
                if (!lat || !lng) { alert("위치 정보가 없고 현재 위치도 수신 중입니다."); return; }
                if (!gps && currentPos) alert("사진에 위치 정보가 없어 현재 위치에 저장합니다.");

                const now  = new Date();
                const data = {
                    id:         String(now.getTime()),
                    lat, lng,
                    photo:      compressed,
                    time:       now.getTime(),
                    dateString: now.toLocaleDateString("ko-KR", { year:"numeric", month:"long", day:"numeric" }),
                    timeString: now.toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" })
                };
                photos.push(data);
                createPhotoMarker(data, true);
                updatePhotoList();
                updateStats();
                map.flyTo([lat, lng], 17);
                scheduleSave();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };
    arrayReader.readAsArrayBuffer(file);
    event.target.value = "";
}

function parseExifGps(buffer) {
    try {
        const view = new DataView(buffer);
        if (view.getUint16(0) !== 0xFFD8) return null;
        let offset = 2;
        while (offset < view.byteLength - 4) {
            const marker = view.getUint16(offset); offset += 2;
            if (marker === 0xFFE1) {
                const exifHeader = String.fromCharCode(
                    view.getUint8(offset+2), view.getUint8(offset+3),
                    view.getUint8(offset+4), view.getUint8(offset+5)
                );
                if (exifHeader !== "Exif") break;
                const tiffOffset = offset + 8;
                const le = view.getUint16(tiffOffset) === 0x4949;
                const getU16 = o => view.getUint16(tiffOffset + o, le);
                const getU32 = o => view.getUint32(tiffOffset + o, le);
                const ifdOffset = getU32(4);
                const ifdCount  = getU16(ifdOffset);
                let gpsIfdOffset = null;
                for (let i = 0; i < ifdCount; i++) {
                    const e = ifdOffset + 2 + i * 12;
                    if (getU16(e) === 0x8825) gpsIfdOffset = getU32(e + 8);
                }
                if (gpsIfdOffset === null) return null;
                const gpsCount = getU16(gpsIfdOffset);
                let latRef, lat, lngRef, lng;
                for (let i = 0; i < gpsCount; i++) {
                    const e   = gpsIfdOffset + 2 + i * 12;
                    const tag = getU16(e);
                    const vo  = getU32(e + 8);
                    if (tag === 1) latRef = String.fromCharCode(view.getUint8(tiffOffset + vo));
                    if (tag === 3) lngRef = String.fromCharCode(view.getUint8(tiffOffset + vo));
                    if (tag === 2 || tag === 4) {
                        const d   = getU32(vo)     / getU32(vo + 4);
                        const m   = getU32(vo + 8) / getU32(vo + 12);
                        const s   = getU32(vo + 16)/ getU32(vo + 20);
                        const val = d + m / 60 + s / 3600;
                        if (tag === 2) lat = val;
                        if (tag === 4) lng = val;
                    }
                }
                if (lat == null || lng == null) return null;
                return { lat: latRef === "S" ? -lat : lat, lng: lngRef === "W" ? -lng : lng };
            }
            offset += view.getUint16(offset);
        }
    } catch (e) { /* 무시 */ }
    return null;
}

function createPhotoMarker(data, openPopup = false) {
    const icon = L.divIcon({
        className: "photo-marker",
        html:      `<img src="${data.photo}" />`,
        iconSize:  [44, 44],
        iconAnchor:[22, 44]
    });
    const marker = L.marker([data.lat, data.lng], { pane: "memoryPane", icon }).addTo(map);

    const popupEl = document.createElement("div");
    popupEl.className = "photo-popup";
    const img = document.createElement("img");
    img.src = data.photo;
    const info = document.createElement("div");
    info.style.cssText = "font-size:12px;color:rgba(255,255,255,0.55);text-align:center;margin:6px 0 8px;";
    info.textContent   = `${data.dateString} ${data.timeString}`;
    const delBtn = document.createElement("button");
    delBtn.className   = "popup-delete-btn";
    delBtn.textContent = "사진 삭제";
    delBtn.addEventListener("click", () => { deletePhoto(data.id); marker.closePopup(); });
    popupEl.appendChild(img);
    popupEl.appendChild(info);
    popupEl.appendChild(delBtn);

    marker.bindPopup(popupEl);
    photoMarkers.set(data.id, marker);
    if (openPopup) marker.openPopup();
}

function deletePhoto(id) {
    photos = photos.filter(p => p.id !== id);
    const marker = photoMarkers.get(id);
    if (marker) { map.removeLayer(marker); photoMarkers.delete(id); }
    updatePhotoList();
    updateStats();
    scheduleSave();
}

function updatePhotoList() {
    const container = document.getElementById("photo-list-container");
    if (!container) return;
    if (photos.length === 0) {
        container.innerHTML = '<p class="empty-message">사진 기록이 없습니다.</p>';
        return;
    }
    container.innerHTML = "";
    [...photos].reverse().forEach(p => {
        const item = document.createElement("div");
        item.className = "photo-item";

        const img = document.createElement("img");
        img.className = "photo-item-img";
        img.src       = p.photo;

        const infoRow = document.createElement("div");
        infoRow.className = "photo-item-info";
        const date = document.createElement("span");
        date.className   = "photo-item-date";
        date.textContent = `${p.dateString} ${p.timeString}`;

        const actions = document.createElement("div");
        actions.className = "photo-item-actions";
        const moveBtn = document.createElement("button");
        moveBtn.className   = "photo-action-btn move";
        moveBtn.textContent = "이동";
        moveBtn.addEventListener("click", e => { e.stopPropagation(); map.flyTo([p.lat, p.lng], 17); });
        const delBtn = document.createElement("button");
        delBtn.className   = "photo-action-btn delete";
        delBtn.textContent = "삭제";
        delBtn.addEventListener("click", e => { e.stopPropagation(); deletePhoto(p.id); });

        actions.appendChild(moveBtn);
        actions.appendChild(delBtn);
        infoRow.appendChild(date);
        infoRow.appendChild(actions);
        item.appendChild(img);
        item.appendChild(infoRow);
        item.addEventListener("click", () => { map.flyTo([p.lat, p.lng], 17); toggleSidebar(false); });
        container.appendChild(item);
    });
}

// ── 13. GPX 내보내기 / 불러오기 ───────────────────────────────
function exportGPX() {
    const infoEl = document.getElementById("export-info");
    const cutoff = Date.now() - 12 * 3600 * 1000;
    const recent = pathCoordinates.filter(p => p.startTime >= cutoff);
    if (recent.length === 0) {
        if (infoEl) infoEl.textContent = "최근 12시간 경로가 없습니다.";
        return;
    }
    const now    = new Date();
    const stamp  = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const lines  = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<gpx version="1.1" creator="Giloa" xmlns="http://www.topografix.com/GPX/1/1">`,
        `  <trk><n>Giloa ${stamp}</n><trkseg>`
    ];
    recent.forEach(p => {
        lines.push(`    <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}">` +
                   `<time>${new Date(p.startTime).toISOString()}</time></trkpt>`);
    });
    lines.push(`  </trkseg></trk></gpx>`);

    const blob = new Blob([lines.join("\n")], { type: "application/gpx+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `giloa-${stamp}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
    if (infoEl) infoEl.textContent = `${recent.length}개 포인트 내보내기 완료!`;
}

function handleGPXImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const infoEl = document.getElementById("import-info");
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parser  = new DOMParser();
            const xmlDoc  = parser.parseFromString(e.target.result, "text/xml");
            const trkpts  = xmlDoc.querySelectorAll("trkpt");
            if (trkpts.length === 0) {
                if (infoEl) infoEl.textContent = "경로 포인트를 찾을 수 없습니다.";
                return;
            }
            const latlngs = [];
            trkpts.forEach(pt => {
                const lat = parseFloat(pt.getAttribute("lat"));
                const lng = parseFloat(pt.getAttribute("lon"));
                if (isFinite(lat) && isFinite(lng)) latlngs.push([lat, lng]);
            });
            const polyline = L.polyline(latlngs, {
                pane:      "gpxPane",
                color:     "#7ec8e3",
                weight:    3,
                opacity:   0.75,
                dashArray: "6 4"
            }).addTo(map);

            const layerId = String(Date.now());
            gpxLayers.push({ id: layerId, name: file.name, layer: polyline });
            map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
            updateGpxLayerList();
            if (infoEl) infoEl.textContent = `${latlngs.length}개 포인트 불러오기 완료!`;
        } catch (err) {
            if (infoEl) infoEl.textContent = "GPX 파일 읽기 실패.";
        }
    };
    reader.readAsText(file);
    event.target.value = "";
}

function updateGpxLayerList() {
    const listEl = document.getElementById("gpx-layer-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    gpxLayers.forEach(item => {
        const row = document.createElement("div");
        row.className = "gpx-layer-item";
        const name = document.createElement("span");
        name.className   = "gpx-layer-name";
        name.textContent = item.name;
        const removeBtn = document.createElement("button");
        removeBtn.className   = "gpx-layer-remove";
        removeBtn.textContent = "✕";
        removeBtn.addEventListener("click", () => {
            map.removeLayer(item.layer);
            gpxLayers.splice(gpxLayers.indexOf(item), 1);
            updateGpxLayerList();
        });
        row.appendChild(name);
        row.appendChild(removeBtn);
        listEl.appendChild(row);
    });
}

// ── 14. 탭 전환 ───────────────────────────────────────────────
function switchTab(name) {
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    const panel = document.getElementById("tab-" + name);
    if (panel) panel.classList.add("active");
    const btn = document.querySelector(".tab-" + name);
    if (btn) btn.classList.add("active");
}

// ── 15. UI 헬퍼 ───────────────────────────────────────────────
function toggleSidebar(forceOpen) {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (!sidebar || !overlay) return;
    const willOpen = typeof forceOpen === "boolean"
        ? forceOpen
        : !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", willOpen);
    overlay.classList.toggle("show", willOpen);
}

function toggleHud() {
    isHudExpanded = !isHudExpanded;
    document.getElementById("hud").classList.toggle("expanded", isHudExpanded);
    document.getElementById("controls").classList.toggle("hud-open", isHudExpanded);
    document.getElementById("help-btn").classList.toggle("hud-open", isHudExpanded);
}

function toggleHelp() {
    document.getElementById("help-popup").classList.toggle("show");
}

function centerMap() {
    if (currentPos) map.panTo(currentPos);
}

// ── 16. 통계 업데이트 ─────────────────────────────────────────
function updateStats() {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayMs    = todayStart.getTime();
    let todayDist    = 0;
    for (let i = 1; i < pathCoordinates.length; i++) {
        if (pathCoordinates[i].startTime >= todayMs) {
            const prev = pathCoordinates[i-1];
            const cur  = pathCoordinates[i];
            todayDist += L.latLng(cur.lat, cur.lng).distanceTo([prev.lat, prev.lng]);
        }
    }
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set("dist-val",          `${(totalDistance/1000).toFixed(2)}<span>km</span>`);
    set("today-dist-val",    `${(todayDist/1000).toFixed(2)}<span>km</span>`);
    set("memory-count-val",  `${memories.length}<span>개</span>`);
    set("photo-count-val",   `${photos.length}<span>개</span>`);
}

// ── 17. 저장 / 불러오기 ───────────────────────────────────────
function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistState, SAVE_DELAY_MS);
}

function persistState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            pathCoordinates: pathCoordinates.map(p => ({
                lat: p.lat, lng: p.lng,
                startTime: p.startTime, endTime: p.endTime, visits: p.visits || 1
            })),
            memories: memories.map(m => ({
                id: m.id, lat: m.lat, lng: m.lng, name: m.name, time: m.time,
                dateString: m.dateString, timeString: m.timeString
            })),
            photos: photos.map(p => ({
                id: p.id, lat: p.lat, lng: p.lng, photo: p.photo, time: p.time,
                dateString: p.dateString, timeString: p.timeString
            })),
            totalDistance
        }));
    } catch (e) { console.error("저장 실패", e); }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);

        if (Array.isArray(s.pathCoordinates)) {
            pathCoordinates = s.pathCoordinates.filter(p =>
                isFinite(p.lat) && isFinite(p.lng) &&
                isFinite(p.startTime) && isFinite(p.endTime)
            ).map(p => ({
                lat: p.lat, lng: p.lng,
                startTime: p.startTime, endTime: p.endTime,
                visits: isFinite(p.visits) ? p.visits : 1
            }));
        }
        if (Array.isArray(s.memories)) {
            memories = s.memories.filter(m =>
                isFinite(m.lat) && isFinite(m.lng) && typeof m.name === "string"
            );
        }
        if (Array.isArray(s.photos)) {
            photos = s.photos.filter(p =>
                isFinite(p.lat) && isFinite(p.lng) && typeof p.photo === "string"
            );
        }
        if (isFinite(s.totalDistance)) totalDistance = s.totalDistance;
    } catch (e) { console.error("불러오기 실패", e); }
}

// ── 18. 경로 압축 ─────────────────────────────────────────────
function compactPathData() {
    if (pathCoordinates.length <= 1) return;
    const merged = [];
    for (const pt of pathCoordinates) {
        const last = merged[merged.length - 1];
        if (!last) { merged.push({ ...pt }); continue; }
        const d = L.latLng(pt.lat, pt.lng).distanceTo([last.lat, last.lng]);
        if (d <= MERGE_DISTANCE_M && (pt.startTime - last.endTime) <= MERGE_TIME_GAP_MS) {
            last.endTime = pt.endTime;
            last.visits  = (last.visits||1) + (pt.visits||1);
        } else {
            merged.push({ ...pt });
        }
    }
    pathCoordinates = merged.slice(-MAX_PATH_POINTS);
}

// ── 19. 유틸 ─────────────────────────────────────────────────
function escapeHtml(v) {
    return String(v)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// ── 20. 초기화 ────────────────────────────────────────────────
function init() {
    isFogEnabled = true;    // 앱 시작 시 안개 켜짐
    resizeCanvas();
    loadState();

    memories.forEach(m => createMemoryMarker(m, false));
    photos.forEach(p   => createPhotoMarker(p,  false));

    updateStats();
    updateMemoryList();
    updatePhotoList();
    syncRecordingUI();
    syncFogButton();
    scheduleRender();

    startTracking();
}

map.whenReady(() => init());
const STORAGE_KEY = "giloa-layer-final";
const FOG_ENABLED_KEY = "giloa-fog-enabled";
const FOG_ALPHA = 0.8;
const FOG_RADIUS_M = 18;
const MIN_MOVE_M = 15;
const MAX_ACCURACY_M = 20;
const STAY_ACCURACY_FACTOR = 0.6;
const MAX_STAY_RADIUS_M = 36;
const SAVE_DELAY_MS = 800;
const MERGE_DISTANCE_M = 6;
const MERGE_TIME_GAP_MS = 2 * 60 * 1000;
const MAX_PATH_POINTS = 5000;
const FULL_VISIBILITY_HOURS = 0;
const MIN_VISIBILITY_HOURS = 24;
const MIN_PATH_VISIBILITY = 0.4;
const THREE_DAYS_IN_DAYS = 3;
const ONE_MONTH_DAYS = 30;
const THREE_MONTHS_DAYS = 90;
const SIX_MONTHS_DAYS = 180;
const ONE_YEAR_DAYS = 365;
const SEDIMENT_LAYER_COLOR = "rgba(126, 112, 96, 0.24)";

let isRecording = false, isFogEnabled = true, isHudExpanded = false;
let currentPos = null, pathCoordinates = [], memories = [], photos = [];
let totalDistance = 0, playerMarker = null, watchId = null, saveTimer = null, rafId = null;
const memoryMarkers = new Map(), photoMarkers = new Map(), gpxLayers = [];
const recBtn = document.getElementById("rec-btn");
const recStatusBox = document.getElementById("rec-status-box");

const map = L.map("map", { zoomControl: false, attributionControl: false }).setView([37.5665, 126.978], 16);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png").addTo(map);

map.createPane("memoryPane");
map.getPane("memoryPane").style.zIndex = 650;
map.createPane("gpxPane");
map.getPane("gpxPane").style.zIndex = 610;

const mapWrap = document.getElementById("map-wrap");

function makeOverlayCanvas(zIndex) {
    const c = document.createElement("canvas");
    c.style.position = "absolute";
    c.style.top = "0"; c.style.left = "0";
    c.style.width = "100%"; c.style.height = "100%";
    c.style.pointerEvents = "none";
    c.style.zIndex = String(zIndex);
    mapWrap.appendChild(c);
    return c;
}

const fogCanvas  = makeOverlayCanvas(620);
const ageCanvas  = makeOverlayCanvas(630);
const stayCanvas = makeOverlayCanvas(640);
const fogCtx  = fogCanvas.getContext("2d");
const ageCtx  = ageCanvas.getContext("2d");
const stayCtx = stayCanvas.getContext("2d");

function resizeCanvas() {
    const w = window.innerWidth, h = window.innerHeight;
    [fogCanvas, ageCanvas, stayCanvas].forEach(c => { c.width = w; c.height = h; });
    scheduleRender();
}
window.addEventListener("resize", resizeCanvas);
map.on("move zoom moveend zoomend", scheduleRender);

function scheduleRender() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => { rafId = null; render(); });
}
function render() { renderFog(); renderAgeTint(); renderStayTint(); }

function calcMpp() {
    const center = map.getCenter();
    const pt = map.latLngToContainerPoint(center);
    const ll2 = map.containerPointToLatLng(L.point(pt.x + 10, pt.y));
    return center.distanceTo(ll2) || 1;
}
function metersToPixels(meters, mpp) { return (meters / mpp) * 10; }

function renderFog() {
    const w = fogCanvas.width, h = fogCanvas.height;
    fogCtx.clearRect(0, 0, w, h);
    if (!isFogEnabled) return;
    fogCtx.fillStyle = `rgba(8, 10, 18, ${FOG_ALPHA})`;
    fogCtx.fillRect(0, 0, w, h);
    if (pathCoordinates.length === 0) return;
    const now = Date.now(), mpp = calcMpp();
    const baseRadius = metersToPixels(FOG_RADIUS_M, mpp);
    fogCtx.save();
    fogCtx.globalCompositeOperation = "destination-out";
    pathCoordinates.forEach((point, index) => {
        const ageHours = (now - point.startTime) / 3600000;
        fogCtx.globalAlpha = getPathVisibility(ageHours);
        const stayMin = (point.endTime - point.startTime) / 60000;
        let radius = baseRadius;
        if (stayMin >= 10) radius = baseRadius * (1 + Math.min(stayMin / 180, 1));
        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        fogCtx.beginPath(); fogCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); fogCtx.fill();
        if (index > 0) {
            const prev = pathCoordinates[index - 1];
            const prevPos = map.latLngToContainerPoint([prev.lat, prev.lng]);
            const prevStay = (prev.endTime - prev.startTime) / 60000;
            let prevRadius = baseRadius;
            if (prevStay >= 10) prevRadius = baseRadius * (1 + Math.min(prevStay / 180, 1));
            fogCtx.beginPath();
            fogCtx.lineWidth = ((radius + prevRadius) / 2) * 1.7;
            fogCtx.lineCap = "round"; fogCtx.lineJoin = "round";
            fogCtx.moveTo(prevPos.x, prevPos.y); fogCtx.lineTo(pos.x, pos.y); fogCtx.stroke();
        }
    });
    fogCtx.restore();
}

function getPathVisibility(ageHours) {
    if (ageHours <= FULL_VISIBILITY_HOURS) return 1;
    if (ageHours >= MIN_VISIBILITY_HOURS) return MIN_PATH_VISIBILITY;
    return 1 - (1 - MIN_PATH_VISIBILITY) * (ageHours / MIN_VISIBILITY_HOURS);
}

function renderAgeTint() {
    const w = ageCanvas.width, h = ageCanvas.height;
    ageCtx.clearRect(0, 0, w, h);
    if (pathCoordinates.length === 0) return;
    const now = Date.now(), mpp = calcMpp();
    const baseRadius = metersToPixels(FOG_RADIUS_M, mpp);
    ageCtx.save(); ageCtx.globalCompositeOperation = "screen";
    pathCoordinates.forEach((point, index) => {
        const ageDays = (now - point.startTime) / 86400000;
        const color = getAgeColor(ageDays);
        if (!color) return;
        const stayMin = (point.endTime - point.startTime) / 60000;
        let radius = baseRadius;
        if (stayMin >= 10) radius = baseRadius * (1 + Math.min(stayMin / 180, 1));
        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        ageCtx.fillStyle = color; ageCtx.strokeStyle = color;
        ageCtx.beginPath(); ageCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); ageCtx.fill();
        if (index > 0) {
            const prev = pathCoordinates[index - 1];
            const prevAgeDays = (now - prev.startTime) / 86400000;
            if (getAgeColor(prevAgeDays) !== color) return;
            const prevStay = (prev.endTime - prev.startTime) / 60000;
            let prevRadius = baseRadius;
            if (prevStay >= 10) prevRadius = baseRadius * (1 + Math.min(prevStay / 180, 1));
            const prevPos = map.latLngToContainerPoint([prev.lat, prev.lng]);
            ageCtx.beginPath();
            ageCtx.lineWidth = ((radius + prevRadius) / 2) * 1.15;
            ageCtx.lineCap = "round"; ageCtx.lineJoin = "round";
            ageCtx.moveTo(prevPos.x, prevPos.y); ageCtx.lineTo(pos.x, pos.y); ageCtx.stroke();
        }
    });
    ageCtx.restore();
}

function getAgeColor(ageDays) {
    if (ageDays < THREE_DAYS_IN_DAYS) return null;
    if (ageDays < ONE_MONTH_DAYS)     return "rgba(173, 255, 120, 0.16)";
    if (ageDays < THREE_MONTHS_DAYS)  return "rgba(60, 170, 80, 0.18)";
    if (ageDays < SIX_MONTHS_DAYS)    return "rgba(214, 176, 55, 0.18)";
    if (ageDays < ONE_YEAR_DAYS)      return "rgba(130, 92, 55, 0.20)";
    return SEDIMENT_LAYER_COLOR;
}

function renderStayTint() {
    const w = stayCanvas.width, h = stayCanvas.height;
    stayCtx.clearRect(0, 0, w, h);
    if (pathCoordinates.length === 0) return;
    const mpp = calcMpp();
    pathCoordinates.forEach(point => {
        const stayMin = (point.endTime - point.startTime) / 60000;
        if (stayMin < 10) return;
        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        const radius = metersToPixels(getStayRadiusMeters(stayMin), mpp);
        const grad = stayCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
        grad.addColorStop(0, "rgba(255, 220, 100, 0.18)");
        grad.addColorStop(0.6, "rgba(255, 220, 100, 0.08)");
        grad.addColorStop(1, "rgba(255, 220, 100, 0)");
        stayCtx.fillStyle = grad;
        stayCtx.beginPath(); stayCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2); stayCtx.fill();
    });
}

function getStayRadiusMeters(stayMin) {
    if (stayMin < 10) return FOG_RADIUS_M;
    if (stayMin >= 180) return FOG_RADIUS_M * 2.0;
    return FOG_RADIUS_M * (1 + (stayMin - 10) / 170);
}

function exportGPX() {
    const now = Date.now();
    const filtered = pathCoordinates.filter(p => p.startTime >= now - 12 * 3600000);
    const infoEl = document.getElementById("export-info");
    if (filtered.length === 0) { infoEl.textContent = "최근 12시간 기록이 없어요."; infoEl.style.color = "rgba(255,100,100,0.8)"; return; }
    const trackPoints = filtered.map(p => `    <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}">\n      <time>${new Date(p.startTime).toISOString()}</time>\n    </trkpt>`).join("\n");
    const exportDate = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Giloa" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk><n>${exportDate}</n><trkseg>\n${trackPoints}\n  </trkseg></trk>\n</gpx>`;
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fileName = `giloa_${new Date().toISOString().slice(0, 10)}.gpx`;
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    infoEl.textContent = `✅ ${filtered.length}개 포인트 저장 완료 (${fileName})`; infoEl.style.color = "rgba(100,255,150,0.9)";
}

function handleGPXImport(event) {
    const file = event.target.files[0]; if (!file) return;
    const infoEl = document.getElementById("import-info");
    infoEl.textContent = "읽는 중..."; infoEl.style.color = "rgba(255,255,255,0.5)";
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const xml = new DOMParser().parseFromString(e.target.result, "application/xml");
            if (xml.querySelector("parsererror")) { infoEl.textContent = "❌ GPX 파일을 읽을 수 없어요."; infoEl.style.color = "rgba(255,100,100,0.8)"; return; }
            const trkpts = Array.from(xml.querySelectorAll("trkpt, rtept"));
            if (trkpts.length === 0) { infoEl.textContent = "❌ 경로 데이터가 없는 파일이에요."; infoEl.style.color = "rgba(255,100,100,0.8)"; return; }
            const latlngs = trkpts.map(pt => { const lat = parseFloat(pt.getAttribute("lat")), lng = parseFloat(pt.getAttribute("lon")); return isFinite(lat) && isFinite(lng) ? [lat, lng] : null; }).filter(Boolean);
            if (latlngs.length < 2) { infoEl.textContent = "❌ 유효한 좌표가 부족해요."; infoEl.style.color = "rgba(255,100,100,0.8)"; return; }
            const polyline = L.polyline(latlngs, { pane: "gpxPane", color: "#4db8ff", weight: 3, opacity: 0.85, smoothFactor: 1.5 }).addTo(map);
            const id = String(Date.now()), name = file.name.replace(/\.gpx$/i, "");
            gpxLayers.push({ id, name, polyline });
            map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
            updateGpxLayerList();
            infoEl.textContent = `✅ ${latlngs.length}개 포인트 불러옴`; infoEl.style.color = "rgba(100,255,150,0.9)";
        } catch(err) { infoEl.textContent = "❌ 파일 처리 중 오류가 발생했어요."; infoEl.style.color = "rgba(255,100,100,0.8)"; }
        event.target.value = "";
    };
    reader.readAsText(file);
}

function updateGpxLayerList() {
    const listEl = document.getElementById("gpx-layer-list"); if (!listEl) return;
    listEl.innerHTML = "";
    gpxLayers.forEach(layer => {
        const item = document.createElement("div"); item.className = "gpx-layer-item";
        const nameEl = document.createElement("span"); nameEl.className = "gpx-layer-name"; nameEl.textContent = "🔵 " + layer.name;
        const removeBtn = document.createElement("button"); removeBtn.className = "gpx-layer-remove"; removeBtn.textContent = "✕";
        removeBtn.addEventListener("click", () => removeGpxLayer(layer.id));
        item.appendChild(nameEl); item.appendChild(removeBtn); listEl.appendChild(item);
    });
}

function removeGpxLayer(id) {
    const idx = gpxLayers.findIndex(l => l.id === id); if (idx === -1) return;
    map.removeLayer(gpxLayers[idx].polyline); gpxLayers.splice(idx, 1); updateGpxLayerList();
    const infoEl = document.getElementById("import-info"); if (gpxLayers.length === 0) infoEl.textContent = "";
}

function toggleHud() {
    isHudExpanded = !isHudExpanded;
    document.getElementById("hud").classList.toggle("expanded", isHudExpanded);
    document.getElementById("controls").classList.toggle("hud-open", isHudExpanded);
    document.getElementById("help-btn").classList.toggle("hud-open", isHudExpanded);
}

function syncRecordingUI() {
    recBtn.classList.toggle("recording", isRecording);
    recStatusBox.textContent = isRecording ? "기록 중" : "대기 중";
    recStatusBox.classList.toggle("recording", isRecording);
}

function syncFogButton() {
    const toggleBtn = document.getElementById("fog-toggle-btn"), toggleState = document.getElementById("fog-toggle-state");
    if (!toggleBtn || !toggleState) return;
    toggleBtn.classList.toggle("on", isFogEnabled); toggleBtn.classList.toggle("off", !isFogEnabled);
    toggleState.textContent = isFogEnabled ? "켜짐" : "꺼짐";
    toggleState.classList.toggle("on", isFogEnabled); toggleState.classList.toggle("off", !isFogEnabled);
}

function toggleHelp() { document.getElementById("help-popup").classList.toggle("show"); }
function resetRecordingState() { isRecording = false; syncRecordingUI(); stopTracking(); }

function toggleRecording() {
    if (isRecording) { isRecording = false; syncRecordingUI(); stopTracking(); compactPathData(); scheduleSave(); return; }
    isRecording = true; syncRecordingUI(); startTracking();
}

function toggleFog() {
    isFogEnabled = !isFogEnabled;
    localStorage.setItem(FOG_ENABLED_KEY, String(isFogEnabled));
    syncFogButton(); scheduleRender();
}

function startTracking() {
    if (!navigator.geolocation) { alert("이 브라우저는 위치 추적을 지원하지 않습니다."); resetRecordingState(); return; }
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") { alert("위치 추적은 HTTPS 또는 localhost에서만 동작합니다."); resetRecordingState(); return; }
    watchId = navigator.geolocation.watchPosition(handlePosition, handleLocationError, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
}

function stopTracking() { if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; } }

function handlePosition(position) {
    const accuracy = Number(position.coords.accuracy) || Infinity;
    const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
    currentPos = latlng;
    if (!playerMarker) { playerMarker = L.marker(latlng, { icon: L.divIcon({ className: "player-marker", iconSize: [18, 18] }) }).addTo(map); map.setView(latlng, 16); }
    else playerMarker.setLatLng(latlng);
    if (!isRecording) return;
    if (accuracy > MAX_ACCURACY_M) { recStatusBox.textContent = `GPS 약함 (${Math.round(accuracy)}m)`; return; }
    recStatusBox.textContent = "기록 중";
    const now = Date.now();
    if (pathCoordinates.length === 0) { pathCoordinates.push(createPathPoint(latlng, now)); updateStats(); scheduleSave(); scheduleRender(); return; }
    const last = pathCoordinates[pathCoordinates.length - 1];
    const dist = distanceToPoint(latlng, last);
    const stayThreshold = getDynamicStayThreshold(accuracy);
    if (dist <= stayThreshold) { last.endTime = now; last.visits = (last.visits || 1) + 1; last.lat += (latlng.lat - last.lat) * 0.3; last.lng += (latlng.lng - last.lng) * 0.3; }
    else { totalDistance += dist; pathCoordinates.push(createPathPoint(latlng, now)); if (pathCoordinates.length > MAX_PATH_POINTS) compactPathData(); }
    updateStats(); scheduleSave(); scheduleRender();
}

function handleLocationError(err) {
    const messages = { 1: "위치 권한이 거부되었습니다.", 2: "현재 위치를 확인할 수 없습니다.", 3: "위치 요청 시간이 초과되었습니다." };
    alert(messages[err.code] || "위치 정보를 가져오지 못했습니다."); resetRecordingState();
}

function createPathPoint(latlng, timestamp) { return { lat: latlng.lat, lng: latlng.lng, startTime: timestamp, endTime: timestamp, visits: 1 }; }
function distanceToPoint(latlng, point) { return latlng.distanceTo([point.lat, point.lng]); }
function getDynamicStayThreshold(accuracy) { return Math.max(MIN_MOVE_M, Math.min(MAX_STAY_RADIUS_M, accuracy * STAY_ACCURACY_FACTOR)); }

function calcTodayDistance() {
    const todayStartMs = new Date().setHours(0, 0, 0, 0); let dist = 0;
    for (let i = 1; i < pathCoordinates.length; i++) {
        if (pathCoordinates[i].startTime >= todayStartMs)
            dist += L.latLng(pathCoordinates[i].lat, pathCoordinates[i].lng).distanceTo([pathCoordinates[i-1].lat, pathCoordinates[i-1].lng]);
    }
    return dist;
}

function updateStats() {
    document.getElementById("dist-val").innerHTML = `${(totalDistance / 1000).toFixed(2)}<span>km</span>`;
    document.getElementById("today-dist-val").innerHTML = `${(calcTodayDistance() / 1000).toFixed(2)}<span>km</span>`;
    document.getElementById("memory-count-val").innerHTML = `${memories.length}<span>개</span>`;
    document.getElementById("photo-count-val").innerHTML = `${photos.length}<span>개</span>`;
}

function compactPathData() {
    if (pathCoordinates.length <= 1) return;
    const merged = [];
    for (const point of pathCoordinates) {
        const last = merged[merged.length - 1];
        if (!last) { merged.push({ ...point }); continue; }
        const timeGap = point.startTime - last.endTime;
        const dist = L.latLng(point.lat, point.lng).distanceTo([last.lat, last.lng]);
        if (dist <= MERGE_DISTANCE_M && timeGap <= MERGE_TIME_GAP_MS) {
            const tv = (last.visits || 1) + (point.visits || 1);
            last.lat = ((last.lat * (last.visits || 1)) + (point.lat * (point.visits || 1))) / tv;
            last.lng = ((last.lng * (last.visits || 1)) + (point.lng * (point.visits || 1))) / tv;
            last.endTime = Math.max(last.endTime, point.endTime); last.visits = tv;
        } else merged.push({ ...point });
    }
    pathCoordinates = shrinkOldPoints(merged, MAX_PATH_POINTS);
}

function shrinkOldPoints(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    const keepTail = Math.floor(maxPoints * 0.4), tail = points.slice(-keepTail);
    const head = points.slice(0, points.length - keepTail);
    const ratio = Math.ceil(head.length / (maxPoints - keepTail));
    return [...head.filter((_, i) => i % ratio === 0), ...tail].slice(-maxPoints);
}

function addMemory() {
    if (!currentPos) { alert("위치 정보를 수신 중입니다."); return; }
    const input = prompt("이 장소의 이름을 입력하세요:", "새로운 발견"); if (input === null) return;
    const now = new Date();
    const data = { id: String(now.getTime()), lat: currentPos.lat, lng: currentPos.lng, name: escapeHtml(input.trim() || "기억의 지점"), time: now.getTime(), dateString: now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }), timeString: now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) };
    memories.push(data); createMemoryMarker(data, true); updateMemoryList(); updateStats(); scheduleSave();
}

function createMemoryMarker(data, openPopup = false) {
    const marker = L.marker([data.lat, data.lng], { pane: "memoryPane", icon: L.divIcon({ className: "memory-marker", html: "★", iconSize: [28, 28] }) }).addTo(map);
    const popupEl = document.createElement("div");
    const title = document.createElement("b"); title.textContent = data.name;
    const info = document.createElement("small"); info.style.display = "block"; info.textContent = `${data.dateString} ${data.timeString || ""}`;
    const delBtn = document.createElement("button"); delBtn.className = "popup-delete-btn"; delBtn.textContent = "삭제"; delBtn.addEventListener("click", () => deleteMemory(data.id));
    popupEl.appendChild(title); popupEl.appendChild(document.createElement("br")); popupEl.appendChild(info); popupEl.appendChild(delBtn);
    marker.bindPopup(popupEl); memoryMarkers.set(data.id, marker); if (openPopup) marker.openPopup();
}

function deleteMemory(id) {
    memories = memories.filter(m => m.id !== id);
    const marker = memoryMarkers.get(id); if (marker) { map.removeLayer(marker); memoryMarkers.delete(id); }
    updateMemoryList(); updateStats(); scheduleSave();
}

function updateMemoryList() {
    const container = document.getElementById("memory-list-container"); if (!container) return;
    if (memories.length === 0) { container.innerHTML = '<p class="empty-message">아직 기록이 없습니다.</p>'; return; }
    container.innerHTML = "";
    [...memories].reverse().forEach(memo => {
        const item = document.createElement("div"); item.className = "memory-item";
        const name = document.createElement("span"); name.className = "item-name"; name.textContent = "★ " + memo.name;
        const date = document.createElement("span"); date.className = "item-date"; date.textContent = `${memo.dateString} ${memo.timeString || ""}`;
        const actions = document.createElement("div"); actions.className = "memory-actions";
        const moveBtn = document.createElement("button"); moveBtn.className = "memory-action-btn move"; moveBtn.textContent = "이동"; moveBtn.addEventListener("click", e => { e.stopPropagation(); map.flyTo([memo.lat, memo.lng], 17); });
        const delBtn = document.createElement("button"); delBtn.className = "memory-action-btn delete"; delBtn.textContent = "삭제"; delBtn.addEventListener("click", e => { e.stopPropagation(); deleteMemory(memo.id); });
        actions.appendChild(moveBtn); actions.appendChild(delBtn);
        item.appendChild(name); item.appendChild(date); item.appendChild(actions);
        item.addEventListener("click", () => { map.flyTo([memo.lat, memo.lng], 17); toggleSidebar(false); });
        container.appendChild(item);
    });
}

function handlePhoto(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const now = new Date();
        const data = { id: String(now.getTime()), lat: currentPos ? currentPos.lat : 37.5665, lng: currentPos ? currentPos.lng : 126.978, photo: e.target.result, time: now.getTime(), dateString: now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }), timeString: now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) };
        photos.push(data); createPhotoMarker(data, true); updateStats(); scheduleSave(); event.target.value = "";
    };
    reader.readAsDataURL(file);
}

function createPhotoMarker(data, openPopup = false) {
    const marker = L.marker([data.lat, data.lng], { pane: "memoryPane", icon: L.divIcon({ className: "photo-marker", html: `<img src="${data.photo}" alt="photo">`, iconSize: [44, 44], iconAnchor: [22, 44] }) }).addTo(map);
    const popupEl = document.createElement("div"); popupEl.className = "photo-popup";
    const img = document.createElement("img"); img.src = data.photo;
    const info = document.createElement("div"); info.style.cssText = "font-size:12px;color:rgba(255,255,255,0.6);text-align:center;margin:6px 0 8px;"; info.textContent = `${data.dateString} ${data.timeString}`;
    const delBtn = document.createElement("button"); delBtn.className = "popup-delete-btn"; delBtn.textContent = "사진 삭제"; delBtn.addEventListener("click", () => { deletePhoto(data.id); marker.closePopup(); });
    popupEl.appendChild(img); popupEl.appendChild(info); popupEl.appendChild(delBtn);
    marker.bindPopup(popupEl); photoMarkers.set(data.id, marker); if (openPopup) marker.openPopup();
}

function deletePhoto(id) {
    photos = photos.filter(p => p.id !== id);
    const marker = photoMarkers.get(id); if (marker) { map.removeLayer(marker); photoMarkers.delete(id); }
    updateStats(); scheduleSave();
}

function toggleSidebar(forceOpen) {
    const sidebar = document.getElementById("sidebar"), overlay = document.getElementById("sidebar-overlay");
    if (!sidebar || !overlay) return;
    const willOpen = typeof forceOpen === "boolean" ? forceOpen : !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", willOpen); overlay.classList.toggle("show", willOpen);
}

function centerMap() { if (currentPos) map.panTo(currentPos); }

function scheduleSave() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; compactPathData(); persistState(); }, SAVE_DELAY_MS);
}

function persistState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            pathCoordinates: pathCoordinates.map(p => ({ lat: p.lat, lng: p.lng, startTime: p.startTime, endTime: p.endTime, visits: p.visits || 1 })),
            memories: memories.map(m => ({ id: m.id, lat: m.lat, lng: m.lng, name: m.name, time: m.time, dateString: m.dateString, timeString: m.timeString })),
            photos: photos.map(p => ({ id: p.id, lat: p.lat, lng: p.lng, photo: p.photo, time: p.time, dateString: p.dateString, timeString: p.timeString })),
            totalDistance
        }));
    } catch(err) { console.error("저장 실패", err); }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.pathCoordinates)) pathCoordinates = saved.pathCoordinates.filter(p => isFinite(p.lat) && isFinite(p.lng) && isFinite(p.startTime) && isFinite(p.endTime)).map(p => ({ lat: p.lat, lng: p.lng, startTime: p.startTime, endTime: p.endTime, visits: isFinite(p.visits) ? p.visits : 1 }));
        if (Array.isArray(saved.memories)) memories = saved.memories.filter(m => isFinite(m.lat) && isFinite(m.lng) && typeof m.name === "string").map(m => ({ id: typeof m.id === "string" ? m.id : String(m.time), lat: m.lat, lng: m.lng, name: m.name, time: m.time, dateString: m.dateString, timeString: m.timeString || "" }));
        if (Array.isArray(saved.photos)) photos = saved.photos.filter(p => isFinite(p.lat) && isFinite(p.lng) && typeof p.photo === "string");
        if (isFinite(saved.totalDistance)) totalDistance = saved.totalDistance;
        const savedFog = localStorage.getItem(FOG_ENABLED_KEY);
        if (savedFog !== null) isFogEnabled = savedFog === "true";
        compactPathData();
    } catch(err) { console.error("복원 실패", err); }
}

function renderStoredMarkers()      { memories.forEach(m => createMemoryMarker(m, false)); }
function renderStoredPhotoMarkers() { photos.forEach(p => createPhotoMarker(p, false)); }

function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function init() {
    resizeCanvas(); loadState(); renderStoredMarkers(); renderStoredPhotoMarkers();
    updateStats(); updateMemoryList(); syncRecordingUI(); syncFogButton(); scheduleRender();
}

map.whenReady(init);

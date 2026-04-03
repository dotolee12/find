// =============================================
// 상수
// =============================================
const STORAGE_KEY          = "giloa-layer-final";
const FOG_ENABLED_KEY      = "giloa-fog-enabled";
const FOG_ALPHA            = 0.82;
const FOG_RADIUS_M         = 18;
const MIN_MOVE_M           = 15;
const MAX_ACCURACY_M       = 20;
const STAY_ACCURACY_FACTOR = 0.6;
const MAX_STAY_RADIUS_M    = 36;
const SAVE_DELAY_MS        = 800;
const MERGE_DISTANCE_M     = 6;
const MERGE_TIME_GAP_MS    = 2 * 60 * 1000;
const MAX_PATH_POINTS      = 5000;

const FULL_VISIBILITY_HOURS = 0;
const MIN_VISIBILITY_HOURS  = 24;
const MIN_PATH_VISIBILITY   = 0.4;

const THREE_DAYS_IN_DAYS = 3;
const ONE_MONTH_DAYS     = 30;
const THREE_MONTHS_DAYS  = 90;
const SIX_MONTHS_DAYS    = 180;
const ONE_YEAR_DAYS      = 365;
const SEDIMENT_LAYER_COLOR = "rgba(126,112,96,0.24)";

// =============================================
// 상태 변수
// =============================================
let isRecording    = false;
let isFogEnabled   = true;
let isHudExpanded  = false;
let currentPos     = null;
let pathCoordinates = [];
let memories       = [];
let photos         = [];
let totalDistance  = 0;
let playerMarker   = null;
let watchId        = null;
let saveTimer      = null;
let rafId          = null;

const memoryMarkers = new Map();
const photoMarkers  = new Map();
const gpxLayers     = [];

const recBtn       = document.getElementById("rec-btn");
const recStatusBox = document.getElementById("rec-status-box");

// =============================================
// 지도 초기화
// =============================================
const map = L.map("map", { zoomControl: false, attributionControl: false })
    .setView([37.5665, 126.978], 16);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png").addTo(map);

// =============================================
// Leaflet pane 계층 설정
//
//  tile       (200)
//  fogPane    (250)  ← 안개 canvas
//  agePane    (260)  ← 나이 색상 canvas
//  stayPane   (270)  ← 체류 색상 canvas
//  gpxPane    (450)  ← GPX 선
//  memoryPane (600)  ← ★ 마커, 사진 마커  ← 안개 위에 항상 보임
//  popup      (700)
// =============================================
map.createPane("fogPane");
map.createPane("agePane");
map.createPane("stayPane");
map.createPane("gpxPane");
map.createPane("memoryPane");

map.getPane("fogPane").style.zIndex    = "250";
map.getPane("agePane").style.zIndex    = "260";
map.getPane("stayPane").style.zIndex   = "270";
map.getPane("gpxPane").style.zIndex    = "450";
map.getPane("memoryPane").style.zIndex = "600";

["fogPane","agePane","stayPane"].forEach(name => {
    map.getPane(name).style.pointerEvents = "none";
});


/* 이건 임시 테스트 */


// 1. 안개 캔버스 생성 및 삽입 (70~84라인 설정 직후에 실행)
fogCanvas = document.createElement('canvas');
fogCanvas.id = "fog-canvas"; // CSS와 연결
map.getPane("fogPane").appendChild(fogCanvas);
fogCtx = fogCanvas.getContext('2d');

// 2. 캔버스 초기 크기 설정
function resizeCanvas() {
    const size = map.getSize();
    if (fogCanvas) {
        fogCanvas.width = size.x;
        fogCanvas.height = size.y;
    }
    renderFog(); // 크기 바뀔 때마다 다시 그리기
}

// 3. 윈도우 리사이즈 이벤트 연결
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // 즉시 실행

/* 이건 임시 테스트 */


// =============================================
// 안개 canvas — 각 pane 안에 생성
// =============================================
function makePaneCanvas(paneName) {
    const c = document.createElement("canvas");
    c.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;";
    map.getPane(paneName).appendChild(c);
    return c;
}

const fogCanvas  = makePaneCanvas("fogPane");
const ageCanvas  = makePaneCanvas("agePane");
const stayCanvas = makePaneCanvas("stayPane");
const fogCtx     = fogCanvas.getContext("2d");
const ageCtx     = ageCanvas.getContext("2d");
const stayCtx    = stayCanvas.getContext("2d");

// =============================================
// canvas 크기 동기화
// =============================================
function resizeCanvas() {
    const w = window.innerWidth, h = window.innerHeight;
    [fogCanvas, ageCanvas, stayCanvas].forEach(c => {
        c.width  = w; c.height = h;
        c.style.width = w + "px"; c.style.height = h + "px";
    });
    scheduleRender();
}

window.addEventListener("resize", resizeCanvas);
map.on("move zoom moveend zoomend", scheduleRender);

function scheduleRender() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => { rafId = null; render(); });
}

function render() {
    renderFog();
    renderAgeTint();
    renderStayTint();
}

// =============================================
// 좌표 → 픽셀 변환
// =============================================
function calcMpp() {
    const center = map.getCenter();
    const pt  = map.latLngToContainerPoint(center);
    const ll2 = map.containerPointToLatLng(L.point(pt.x + 10, pt.y));
    return center.distanceTo(ll2) || 1;
}
function metersToPixels(m, mpp) { return (m / mpp) * 10; }

// =============================================
// 안개 렌더링
// =============================================
function renderFog() {
    const w = fogCanvas.width, h = fogCanvas.height;
    fogCtx.clearRect(0, 0, w, h);
    if (!isFogEnabled) return;

    fogCtx.fillStyle = `rgba(8,10,18,${FOG_ALPHA})`;
    fogCtx.fillRect(0, 0, w, h);
    if (pathCoordinates.length === 0) return;

    const now = Date.now(), mpp = calcMpp();
    const base = metersToPixels(FOG_RADIUS_M, mpp);

    fogCtx.save();
    fogCtx.globalCompositeOperation = "destination-out";

    pathCoordinates.forEach((pt, i) => {
        const ageH = (now - pt.startTime) / 3600000;
        fogCtx.globalAlpha = getPathVisibility(ageH);

        const stayMin = (pt.endTime - pt.startTime) / 60000;
        const r = stayMin >= 10 ? base * (1 + Math.min(stayMin / 180, 1)) : base;
        const pos = map.latLngToContainerPoint([pt.lat, pt.lng]);

        fogCtx.beginPath();
        fogCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        fogCtx.fill();

        if (i > 0) {
            const prev   = pathCoordinates[i - 1];
            const prevS  = (prev.endTime - prev.startTime) / 60000;
            const pr     = prevS >= 10 ? base * (1 + Math.min(prevS / 180, 1)) : base;
            const ppos   = map.latLngToContainerPoint([prev.lat, prev.lng]);
            fogCtx.beginPath();
            fogCtx.lineWidth  = ((r + pr) / 2) * 1.7;
            fogCtx.lineCap    = "round";
            fogCtx.lineJoin   = "round";
            fogCtx.moveTo(ppos.x, ppos.y);
            fogCtx.lineTo(pos.x,  pos.y);
            fogCtx.stroke();
        }
    });

    fogCtx.restore();
}

function getPathVisibility(ageHours) {
    if (ageHours <= FULL_VISIBILITY_HOURS) return 1;
    if (ageHours >= MIN_VISIBILITY_HOURS)  return MIN_PATH_VISIBILITY;
    return 1 - (1 - MIN_PATH_VISIBILITY) * (ageHours / MIN_VISIBILITY_HOURS);
}

// =============================================
// 나이 색상 렌더링
// =============================================
function renderAgeTint() {
    const w = ageCanvas.width, h = ageCanvas.height;
    ageCtx.clearRect(0, 0, w, h);
    if (pathCoordinates.length === 0) return;

    const now = Date.now(), mpp = calcMpp();
    const base = metersToPixels(FOG_RADIUS_M, mpp);

    ageCtx.save();
    ageCtx.globalCompositeOperation = "screen";

    pathCoordinates.forEach((pt, i) => {
        const ageDays = (now - pt.startTime) / 86400000;
        const color = getAgeColor(ageDays);
        if (!color) return;

        const stayMin = (pt.endTime - pt.startTime) / 60000;
        const r   = stayMin >= 10 ? base * (1 + Math.min(stayMin / 180, 1)) : base;
        const pos = map.latLngToContainerPoint([pt.lat, pt.lng]);

        ageCtx.fillStyle   = color;
        ageCtx.strokeStyle = color;
        ageCtx.beginPath();
        ageCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ageCtx.fill();

        if (i > 0) {
            const prev = pathCoordinates[i - 1];
            if (getAgeColor((now - prev.startTime) / 86400000) !== color) return;
            const prevS = (prev.endTime - prev.startTime) / 60000;
            const pr    = prevS >= 10 ? base * (1 + Math.min(prevS / 180, 1)) : base;
            const ppos  = map.latLngToContainerPoint([prev.lat, prev.lng]);
            ageCtx.beginPath();
            ageCtx.lineWidth = ((r + pr) / 2) * 1.15;
            ageCtx.lineCap   = "round";
            ageCtx.lineJoin  = "round";
            ageCtx.moveTo(ppos.x, ppos.y);
            ageCtx.lineTo(pos.x,  pos.y);
            ageCtx.stroke();
        }
    });

    ageCtx.restore();
}

function getAgeColor(d) {
    if (d < THREE_DAYS_IN_DAYS) return null;
    if (d < ONE_MONTH_DAYS)     return "rgba(173,255,120,0.16)";
    if (d < THREE_MONTHS_DAYS)  return "rgba(60,170,80,0.18)";
    if (d < SIX_MONTHS_DAYS)    return "rgba(214,176,55,0.18)";
    if (d < ONE_YEAR_DAYS)      return "rgba(130,92,55,0.20)";
    return SEDIMENT_LAYER_COLOR;
}

// =============================================
// 체류 색상 렌더링
// =============================================
function renderStayTint() {
    const w = stayCanvas.width, h = stayCanvas.height;
    stayCtx.clearRect(0, 0, w, h);
    if (pathCoordinates.length === 0) return;

    const mpp = calcMpp();
    pathCoordinates.forEach(pt => {
        const stayMin = (pt.endTime - pt.startTime) / 60000;
        if (stayMin < 10) return;

        const pos = map.latLngToContainerPoint([pt.lat, pt.lng]);
        const r   = metersToPixels(
            stayMin >= 180 ? FOG_RADIUS_M * 2 : FOG_RADIUS_M * (1 + (stayMin - 10) / 170),
            mpp
        );
        const g = stayCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r);
        g.addColorStop(0,   "rgba(255,220,100,0.18)");
        g.addColorStop(0.6, "rgba(255,220,100,0.08)");
        g.addColorStop(1,   "rgba(255,220,100,0)");
        stayCtx.fillStyle = g;
        stayCtx.beginPath();
        stayCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        stayCtx.fill();
    });
}

// =============================================
// GPX 내보내기
// =============================================
function exportGPX() {
    const now      = Date.now();
    const filtered = pathCoordinates.filter(p => p.startTime >= now - 12 * 3600000);
    const infoEl   = document.getElementById("export-info");

    if (filtered.length === 0) {
        infoEl.textContent = "최근 12시간 기록이 없어요.";
        infoEl.style.color = "rgba(255,100,100,0.8)";
        return;
    }

    const trkpts = filtered.map(p =>
        `    <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}">\n` +
        `      <time>${new Date(p.startTime).toISOString()}</time>\n    </trkpt>`
    ).join("\n");

    const date = new Date().toLocaleDateString("ko-KR", { year:"numeric", month:"long", day:"numeric" });
    const gpx  = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<gpx version="1.1" creator="Giloa" xmlns="http://www.topografix.com/GPX/1/1">\n` +
        `  <trk><name>${date}</name><trkseg>\n${trkpts}\n  </trkseg></trk>\n</gpx>`;

    const a = Object.assign(document.createElement("a"), {
        href:     URL.createObjectURL(new Blob([gpx], { type:"application/gpx+xml" })),
        download: `giloa_${new Date().toISOString().slice(0,10)}.gpx`
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);

    infoEl.textContent = `✅ ${filtered.length}개 포인트 저장 완료`;
    infoEl.style.color = "rgba(100,255,150,0.9)";
}

// =============================================
// GPX 불러오기
// =============================================
function handleGPXImport(event) {
    const file  = event.target.files[0]; if (!file) return;
    const infoEl = document.getElementById("import-info");
    infoEl.textContent = "읽는 중..."; infoEl.style.color = "rgba(255,255,255,0.5)";

    const reader = new FileReader();
    reader.onload = e => {
        try {
            const xml   = new DOMParser().parseFromString(e.target.result, "application/xml");
            if (xml.querySelector("parsererror")) throw new Error("parse error");

            const pts = Array.from(xml.querySelectorAll("trkpt,rtept"))
                .map(p => {
                    const lat = parseFloat(p.getAttribute("lat"));
                    const lng = parseFloat(p.getAttribute("lon"));
                    return isFinite(lat) && isFinite(lng) ? [lat, lng] : null;
                }).filter(Boolean);

            if (pts.length < 2) throw new Error("too few points");

            const poly = L.polyline(pts, {
                pane: "gpxPane", color: "#7ec8e3", weight: 3,
                opacity: 0.85, smoothFactor: 1.5, lineCap: "round"
            }).addTo(map);

            const id = String(Date.now()), name = file.name.replace(/\.gpx$/i,"");
            gpxLayers.push({ id, name, poly });
            map.fitBounds(poly.getBounds(), { padding: [40,40] });
            updateGpxLayerList();
            infoEl.textContent = `✅ ${pts.length}개 포인트 불러옴`;
            infoEl.style.color = "rgba(100,255,150,0.9)";
        } catch(err) {
            infoEl.textContent = "❌ 파일을 읽을 수 없어요.";
            infoEl.style.color = "rgba(255,100,100,0.8)";
        }
        event.target.value = "";
    };
    reader.readAsText(file);
}

function updateGpxLayerList() {
    const el = document.getElementById("gpx-layer-list"); if (!el) return;
    el.innerHTML = "";
    gpxLayers.forEach(layer => {
        const item    = document.createElement("div"); item.className = "gpx-layer-item";
        const nameEl  = document.createElement("span"); nameEl.className = "gpx-layer-name"; nameEl.textContent = "🔵 " + layer.name;
        const delBtn  = document.createElement("button"); delBtn.className = "gpx-layer-remove"; delBtn.textContent = "✕";
        delBtn.addEventListener("click", () => {
            map.removeLayer(layer.poly);
            gpxLayers.splice(gpxLayers.indexOf(layer), 1);
            updateGpxLayerList();
            if (gpxLayers.length === 0) document.getElementById("import-info").textContent = "";
        });
        item.appendChild(nameEl); item.appendChild(delBtn); el.appendChild(item);
    });
}

// =============================================
// UI — HUD / 탭 / 사이드바
// =============================================
function toggleHud() {
    isHudExpanded = !isHudExpanded;
    document.getElementById("hud").classList.toggle("expanded", isHudExpanded);
    document.getElementById("controls").classList.toggle("hud-open", isHudExpanded);
    document.getElementById("help-btn").classList.toggle("hud-open", isHudExpanded);
}

function switchTab(name) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    document.querySelector(`.tab-${name}`)?.classList.add("active");
    document.getElementById(`tab-${name}`)?.classList.add("active");
}

function toggleSidebar(forceOpen) {
    const sb  = document.getElementById("sidebar");
    const ov  = document.getElementById("sidebar-overlay");
    if (!sb || !ov) return;
    const open = typeof forceOpen === "boolean" ? forceOpen : !sb.classList.contains("open");
    sb.classList.toggle("open", open);
    ov.classList.toggle("show", open);
}

function syncRecordingUI() {
    recBtn.classList.toggle("recording", isRecording);
    recStatusBox.textContent = isRecording ? "기록 중" : "대기 중";
    recStatusBox.classList.toggle("recording", isRecording);
}

function syncFogButton() {
    const btn = document.getElementById("fog-toggle-btn"); if (!btn) return;
    btn.classList.toggle("on",  isFogEnabled);
    btn.classList.toggle("off", !isFogEnabled);
}

function toggleFog() {
    isFogEnabled = !isFogEnabled;
    localStorage.setItem(FOG_ENABLED_KEY, String(isFogEnabled));
    syncFogButton();
    scheduleRender();
}

function toggleHelp() { document.getElementById("help-popup").classList.toggle("show"); }
function centerMap()  { if (currentPos) map.panTo(currentPos); }

// =============================================
// GPS 추적
// =============================================
function toggleRecording() {
    if (isRecording) {
        isRecording = false; syncRecordingUI();
        stopTracking(); compactPathData(); scheduleSave();
    } else {
        isRecording = true; syncRecordingUI();
        startTracking();
    }
}

function startTracking() {
    if (!navigator.geolocation) { alert("위치 추적을 지원하지 않는 브라우저입니다."); isRecording = false; syncRecordingUI(); return; }
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        alert("위치 추적은 HTTPS 또는 localhost에서만 동작합니다."); isRecording = false; syncRecordingUI(); return;
    }
    watchId = navigator.geolocation.watchPosition(handlePosition, handleLocationError,
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
}

function stopTracking() {
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
}

function handlePosition(position) {
    const acc    = Number(position.coords.accuracy) || Infinity;
    const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
    currentPos   = latlng;

    if (!playerMarker) {
        playerMarker = L.marker(latlng, {
            icon: L.divIcon({ className: "player-marker", iconSize: [18,18] })
        }).addTo(map);
        map.setView(latlng, 16);
    } else {
        playerMarker.setLatLng(latlng);
    }

    if (!isRecording) return;

    if (acc > MAX_ACCURACY_M) {
        recStatusBox.textContent = `GPS 약함 (${Math.round(acc)}m)`; return;
    }
    recStatusBox.textContent = "기록 중";

    const now = Date.now();
    if (pathCoordinates.length === 0) {
        pathCoordinates.push(mkPt(latlng, now));
        updateStats(); scheduleSave(); scheduleRender(); return;
    }

    const last  = pathCoordinates[pathCoordinates.length - 1];
    const dist  = latlng.distanceTo([last.lat, last.lng]);
    const thresh = Math.max(MIN_MOVE_M, Math.min(MAX_STAY_RADIUS_M, acc * STAY_ACCURACY_FACTOR));

    if (dist <= thresh) {
        last.endTime = now; last.visits = (last.visits || 1) + 1;
        last.lat += (latlng.lat - last.lat) * 0.3;
        last.lng += (latlng.lng - last.lng) * 0.3;
    } else {
        totalDistance += dist;
        pathCoordinates.push(mkPt(latlng, now));
        if (pathCoordinates.length > MAX_PATH_POINTS) compactPathData();
    }
    updateStats(); scheduleSave(); scheduleRender();
}

function handleLocationError(err) {
    const msg = { 1:"위치 권한이 거부되었습니다.", 2:"현재 위치를 확인할 수 없습니다.", 3:"위치 요청 시간이 초과되었습니다." };
    alert(msg[err.code] || "위치 정보를 가져오지 못했습니다.");
    isRecording = false; syncRecordingUI(); stopTracking();
}

function mkPt(ll, ts) { return { lat: ll.lat, lng: ll.lng, startTime: ts, endTime: ts, visits: 1 }; }

function calcTodayDistance() {
    const start = new Date().setHours(0,0,0,0);
    let d = 0;
    for (let i = 1; i < pathCoordinates.length; i++) {
        if (pathCoordinates[i].startTime >= start)
            d += L.latLng(pathCoordinates[i].lat, pathCoordinates[i].lng)
                  .distanceTo([pathCoordinates[i-1].lat, pathCoordinates[i-1].lng]);
    }
    return d;
}

function updateStats() {
    document.getElementById("dist-val").innerHTML        = `${(totalDistance/1000).toFixed(2)}<span>km</span>`;
    document.getElementById("today-dist-val").innerHTML  = `${(calcTodayDistance()/1000).toFixed(2)}<span>km</span>`;
    document.getElementById("memory-count-val").innerHTML = `${memories.length}<span>개</span>`;
    document.getElementById("photo-count-val").innerHTML  = `${photos.length}<span>개</span>`;
}

function compactPathData() {
    if (pathCoordinates.length <= 1) return;
    const merged = [];
    for (const pt of pathCoordinates) {
        const last = merged[merged.length - 1];
        if (!last) { merged.push({...pt}); continue; }
        const gap  = pt.startTime - last.endTime;
        const dist = L.latLng(pt.lat, pt.lng).distanceTo([last.lat, last.lng]);
        if (dist <= MERGE_DISTANCE_M && gap <= MERGE_TIME_GAP_MS) {
            const tv = (last.visits||1) + (pt.visits||1);
            last.lat = (last.lat*(last.visits||1) + pt.lat*(pt.visits||1)) / tv;
            last.lng = (last.lng*(last.visits||1) + pt.lng*(pt.visits||1)) / tv;
            last.endTime = Math.max(last.endTime, pt.endTime);
            last.visits  = tv;
        } else { merged.push({...pt}); }
    }
    if (merged.length > MAX_PATH_POINTS) {
        const tail  = merged.slice(-Math.floor(MAX_PATH_POINTS * 0.4));
        const head  = merged.slice(0, merged.length - tail.length);
        const ratio = Math.ceil(head.length / (MAX_PATH_POINTS - tail.length));
        pathCoordinates = [...head.filter((_,i) => i % ratio === 0), ...tail].slice(-MAX_PATH_POINTS);
    } else {
        pathCoordinates = merged;
    }
}

// =============================================
// 메모리 마커
// =============================================
function addMemory() {
    if (!currentPos) { alert("위치 정보를 수신 중입니다."); return; }
    const input = prompt("이 장소의 이름을 입력하세요:", "새로운 발견");
    if (input === null) return;
    const now = new Date();
    const data = {
        id: String(now.getTime()), lat: currentPos.lat, lng: currentPos.lng,
        name: escHtml(input.trim() || "기억의 지점"), time: now.getTime(),
        dateString: now.toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"}),
        timeString: now.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})
    };
    memories.push(data);
    createMemoryMarker(data, true);
    updateMemoryList(); updateStats(); scheduleSave();
}

function createMemoryMarker(data, openPopup = false) {
    const marker = L.marker([data.lat, data.lng], {
        pane: "memoryPane",
        icon: L.divIcon({ className:"memory-marker", html:"★", iconSize:[28,28] })
    }).addTo(map);

    const pop = document.createElement("div");
    const ttl = Object.assign(document.createElement("b"),   { textContent: data.name });
    const inf = Object.assign(document.createElement("small"),{ textContent: `${data.dateString} ${data.timeString||""}` });
    inf.style.display = "block";
    const del = Object.assign(document.createElement("button"), { className:"popup-delete-btn", textContent:"삭제" });
    del.addEventListener("click", () => deleteMemory(data.id));
    pop.append(ttl, document.createElement("br"), inf, del);

    marker.bindPopup(pop);
    memoryMarkers.set(data.id, marker);
    if (openPopup) marker.openPopup();
}

function deleteMemory(id) {
    memories = memories.filter(m => m.id !== id);
    const mk = memoryMarkers.get(id); if (mk) { map.removeLayer(mk); memoryMarkers.delete(id); }
    updateMemoryList(); updateStats(); scheduleSave();
}

function updateMemoryList() {
    const box = document.getElementById("memory-list-container"); if (!box) return;
    if (!memories.length) { box.innerHTML = '<p class="empty-message">아직 기록이 없습니다.</p>'; return; }
    box.innerHTML = "";
    [...memories].reverse().forEach(m => {
        const item = document.createElement("div"); item.className = "memory-item";
        const nm   = Object.assign(document.createElement("span"), { className:"item-name", textContent:"★ "+m.name });
        const dt   = Object.assign(document.createElement("span"), { className:"item-date", textContent:`${m.dateString} ${m.timeString||""}` });
        const acts = document.createElement("div"); acts.className = "memory-actions";
        const mv   = Object.assign(document.createElement("button"), { className:"memory-action-btn move",   textContent:"이동" });
        const dl   = Object.assign(document.createElement("button"), { className:"memory-action-btn delete", textContent:"삭제" });
        mv.onclick = e => { e.stopPropagation(); map.flyTo([m.lat,m.lng],17); };
        dl.onclick = e => { e.stopPropagation(); deleteMemory(m.id); };
        acts.append(mv, dl);
        item.append(nm, dt, acts);
        item.addEventListener("click", () => { map.flyTo([m.lat,m.lng],17); toggleSidebar(false); });
        box.appendChild(item);
    });
}

// =============================================
// 사진 마커
// =============================================
function handlePhoto(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const now  = new Date();
        const data = {
            id: String(now.getTime()),
            lat: currentPos ? currentPos.lat : 37.5665,
            lng: currentPos ? currentPos.lng : 126.978,
            photo: e.target.result, time: now.getTime(),
            dateString: now.toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"}),
            timeString: now.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})
        };
        photos.push(data);
        createPhotoMarker(data, true);
        updatePhotoList(); updateStats(); scheduleSave();
        event.target.value = "";
    };
    reader.readAsDataURL(file);
}

function createPhotoMarker(data, openPopup = false) {
    const marker = L.marker([data.lat, data.lng], {
        pane: "memoryPane",
        icon: L.divIcon({
            className: "photo-marker",
            html: `<img src="${data.photo}" alt="photo">`,
            iconSize: [44,44], iconAnchor: [22,44]
        })
    }).addTo(map);

    const pop = document.createElement("div"); pop.className = "photo-popup";
    const img = Object.assign(document.createElement("img"), { src: data.photo });
    const inf = document.createElement("div");
    inf.style.cssText = "font-size:12px;color:rgba(255,255,255,0.6);text-align:center;margin:6px 0 8px;";
    inf.textContent = `${data.dateString} ${data.timeString}`;
    const del = Object.assign(document.createElement("button"), { className:"popup-delete-btn", textContent:"사진 삭제" });
    del.addEventListener("click", () => { deletePhoto(data.id); marker.closePopup(); });
    pop.append(img, inf, del);

    marker.bindPopup(pop);
    photoMarkers.set(data.id, marker);
    if (openPopup) marker.openPopup();
}

function deletePhoto(id) {
    photos = photos.filter(p => p.id !== id);
    const mk = photoMarkers.get(id); if (mk) { map.removeLayer(mk); photoMarkers.delete(id); }
    updatePhotoList(); updateStats(); scheduleSave();
}

function updatePhotoList() {
    const box = document.getElementById("photo-list-container"); if (!box) return;
    if (!photos.length) { box.innerHTML = '<p class="empty-message">사진 기록이 없습니다.</p>'; return; }
    box.innerHTML = "";
    [...photos].reverse().forEach(ph => {
        const item = document.createElement("div"); item.className = "photo-item";
        const img  = Object.assign(document.createElement("img"), { className:"photo-item-img", src:ph.photo, alt:"photo" });
        img.addEventListener("click", () => { map.flyTo([ph.lat,ph.lng],17); toggleSidebar(false); });

        const info = document.createElement("div"); info.className = "photo-item-info";
        const dt   = Object.assign(document.createElement("span"), { className:"photo-item-date", textContent:`${ph.dateString} ${ph.timeString||""}` });
        const acts = document.createElement("div"); acts.className = "photo-item-actions";
        const mv   = Object.assign(document.createElement("button"), { className:"photo-action-btn move",   textContent:"이동" });
        const dl   = Object.assign(document.createElement("button"), { className:"photo-action-btn delete", textContent:"삭제" });
        mv.onclick = e => { e.stopPropagation(); map.flyTo([ph.lat,ph.lng],17); toggleSidebar(false); };
        dl.onclick = e => { e.stopPropagation(); deletePhoto(ph.id); };
        acts.append(mv, dl);
        info.append(dt, acts);
        item.append(img, info);
        box.appendChild(item);
    });
}

// =============================================
// 저장 / 불러오기
// =============================================
function scheduleSave() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; compactPathData(); persistState(); }, SAVE_DELAY_MS);
}

function persistState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            pathCoordinates: pathCoordinates.map(p => ({ lat:p.lat, lng:p.lng, startTime:p.startTime, endTime:p.endTime, visits:p.visits||1 })),
            memories:        memories.map(m => ({ id:m.id, lat:m.lat, lng:m.lng, name:m.name, time:m.time, dateString:m.dateString, timeString:m.timeString })),
            photos:          photos.map(p => ({ id:p.id, lat:p.lat, lng:p.lng, photo:p.photo, time:p.time, dateString:p.dateString, timeString:p.timeString })),
            totalDistance
        }));
    } catch(e) { console.error("저장 실패", e); }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
        const s   = JSON.parse(raw);
        if (Array.isArray(s.pathCoordinates))
            pathCoordinates = s.pathCoordinates
                .filter(p => isFinite(p.lat) && isFinite(p.lng) && isFinite(p.startTime) && isFinite(p.endTime))
                .map(p => ({ lat:p.lat, lng:p.lng, startTime:p.startTime, endTime:p.endTime, visits:isFinite(p.visits)?p.visits:1 }));
        if (Array.isArray(s.memories))
            memories = s.memories
                .filter(m => isFinite(m.lat) && isFinite(m.lng) && typeof m.name === "string")
                .map(m => ({ id:typeof m.id==="string"?m.id:String(m.time), lat:m.lat, lng:m.lng, name:m.name, time:m.time, dateString:m.dateString, timeString:m.timeString||"" }));
        if (Array.isArray(s.photos))
            photos = s.photos.filter(p => isFinite(p.lat) && isFinite(p.lng) && typeof p.photo === "string");
        if (isFinite(s.totalDistance)) totalDistance = s.totalDistance;
        const fog = localStorage.getItem(FOG_ENABLED_KEY);
        if (fog !== null) isFogEnabled = fog === "true";
        compactPathData();
    } catch(e) { console.error("복원 실패", e); }
}

function escHtml(v) {
    return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// =============================================
// 초기화
// =============================================
function init() {
    resizeCanvas();
    loadState();
    memories.forEach(m => createMemoryMarker(m, false));
    photos.forEach(p => createPhotoMarker(p, false));
    updateStats();
    updateMemoryList();
    updatePhotoList();
    syncRecordingUI();
    syncFogButton();
    scheduleRender();
}

map.whenReady(init);



/* 이것도 테스트용 */


map.on('move moveend zoomend', renderFog);
window.addEventListener('resize', resizeCanvas); // resizeCanvas 함수에서 fogCanvas 크기를 조절해야 함

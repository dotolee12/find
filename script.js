const STORAGE_KEY          = "giloa-v7";
const FOG_ENABLED_KEY      = "giloa-fog-enabled";
const FOG_ALPHA            = 0.8;
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
const MIN_VISIBILITY_HOURS  = 12;
const MIN_PATH_VISIBILITY   = 0.4;

const THREE_DAYS_IN_DAYS   = 0.5;
const ONE_MONTH_DAYS       = 30;
const THREE_MONTHS_DAYS    = 90;
const SIX_MONTHS_DAYS      = 180;
const ONE_YEAR_DAYS        = 365;
const SEDIMENT_LAYER_COLOR = "rgba(126, 112, 96, 0.06)";

let isRecording      = false;
let photos           = [];
const photoMarkers   = new Map();
let isFogEnabled     = true;
let isHudExpanded    = false;
let currentPos       = null;
let pathCoordinates  = [];
let memories         = [];
let totalDistance    = 0;
let playerMarker     = null;
let watchId          = null;
let saveTimer        = null;
let rafId            = null;
const memoryMarkers  = new Map();
let loadedRouteLayer   = null;
let loadedRouteMarkers = [];

const recBtn       = document.getElementById("rec-btn");
const recStatusBox = document.getElementById("rec-status-box");

const map = L.map("map", { zoomControl: false, attributionControl: false })
    .setView([37.5665, 126.978], 16);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png").addTo(map);

map.createPane("memoryPane");
map.getPane("memoryPane").style.zIndex = 500;

const fogCanvas  = document.getElementById("fog-canvas");
const ageCanvas  = document.getElementById("age-canvas");
const stayCanvas = document.getElementById("stay-canvas");
const fogCtx     = fogCanvas.getContext("2d");
const ageCtx     = ageCanvas.getContext("2d");
const stayCtx    = stayCanvas.getContext("2d");

function resizeCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    [fogCanvas, ageCanvas, stayCanvas].forEach(c => {
        c.width  = w; c.height = h;
        c.style.width  = w + "px";
        c.style.height = h + "px";
        c.style.top  = "0";
        c.style.left = "0";
    });
    scheduleRender();
}

window.addEventListener("resize", resizeCanvas);
map.on("move zoom", scheduleRender);

function scheduleRender() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => { rafId = null; render(); });
}

function render() {
    renderFog();
    renderAgeTint();
    renderStayTint();
}

function calcMpp() {
    const center = map.getCenter();
    const pt  = map.latLngToContainerPoint(center);
    const ll2 = map.containerPointToLatLng(L.point(pt.x + 10, pt.y));
    const mpp = center.distanceTo(ll2);
    return mpp || 1;
}

function metersToPixels(meters, mpp) {
    return (meters / mpp) * 10;
}

function renderFog() {
    const w = fogCanvas.width, h = fogCanvas.height;
    fogCtx.clearRect(0, 0, w, h);
    if (!isFogEnabled) return;

    fogCtx.fillStyle = `rgba(8, 10, 18, ${FOG_ALPHA})`;
    fogCtx.fillRect(0, 0, w, h);
    if (pathCoordinates.length === 0) return;

    const now    = Date.now();
    const mpp    = calcMpp();
    const baseRadius = metersToPixels(FOG_RADIUS_M, mpp);

    fogCtx.save();
    fogCtx.globalCompositeOperation = "destination-out";

    pathCoordinates.forEach((point, i) => {
        const ageHours = (now - point.startTime) / 3600000;
        fogCtx.globalAlpha = getPathVisibility(ageHours);

        // 체류 시간 계산 (밀리초 → 분)
        const stayMinutes = (point.endTime - point.startTime) / 60000;
        
        // 체류 시간에 따라 반지름 증가
        let radius = baseRadius;
        if (stayMinutes >= 10) {
            const maxStayMinutes = 180; // 3시간
            const stayFactor = Math.min(stayMinutes / maxStayMinutes, 1);
            // 10분 이상 머물면 최대 2배까지 커짐
            radius = baseRadius * (1 + stayFactor);
        }

        const pos = map.latLngToContainerPoint([point.lat, point.lng]);

        // 원형으로 안개 걷히기
        fogCtx.beginPath();
        fogCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        fogCtx.fill();

        // 이전 점과 연결 (경로)
        if (i > 0) {
            const prev = map.latLngToContainerPoint([
                pathCoordinates[i - 1].lat,
                pathCoordinates[i - 1].lng
            ]);
            
            // 이전 점의 체류 시간도 고려
            const prevStayMinutes = (pathCoordinates[i-1].endTime - pathCoordinates[i-1].startTime) / 60000;
            let prevRadius = baseRadius;
            if (prevStayMinutes >= 10) {
                const prevStayFactor = Math.min(prevStayMinutes / 180, 1);
                prevRadius = baseRadius * (1 + prevStayFactor);
            }
            
            // 두 점의 평균 반지름 사용
            const avgRadius = (radius + prevRadius) / 2;
            
            fogCtx.beginPath();
            fogCtx.lineWidth  = avgRadius * 1.7;
            fogCtx.lineCap    = "round";
            fogCtx.lineJoin   = "round";
            fogCtx.moveTo(prev.x, prev.y);
            fogCtx.lineTo(pos.x, pos.y);
            fogCtx.stroke();
        }
    });

    fogCtx.restore();
}

function getPathVisibility(ageHours) {
    if (ageHours <= FULL_VISIBILITY_HOURS) return 1;
    if (ageHours >= MIN_VISIBILITY_HOURS)  return MIN_PATH_VISIBILITY;
    const progress = ageHours / MIN_VISIBILITY_HOURS;
    return 1 - (1 - MIN_PATH_VISIBILITY) * progress;
}

function renderAgeTint() {
    const w = ageCanvas.width, h = ageCanvas.height;
    ageCtx.clearRect(0, 0, w, h);
    if (pathCoordinates.length === 0) return;

    const now    = Date.now();
    const mpp    = calcMpp();
    const baseRadius = metersToPixels(FOG_RADIUS_M, mpp);

    ageCtx.save();
    ageCtx.globalCompositeOperation = "screen";

    pathCoordinates.forEach((point, i) => {
        const ageDays = (now - point.startTime) / 86400000;
        const color   = getAgeColor(ageDays);
        if (!color) return;

        // 체류 시간에 따라 반지름 증가 (age-canvas도 동일하게)
        const stayMinutes = (point.endTime - point.startTime) / 60000;
        let radius = baseRadius;
        if (stayMinutes >= 10) {
            const stayFactor = Math.min(stayMinutes / 180, 1);
            radius = baseRadius * (1 + stayFactor);
        }

        const pos = map.latLngToContainerPoint([point.lat, point.lng]);

        ageCtx.fillStyle   = color;
        ageCtx.strokeStyle = color;

        ageCtx.beginPath();
        ageCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ageCtx.fill();

        if (i > 0) {
            const prev = pathCoordinates[i - 1];
            const prevAgeDays = (now - prev.startTime) / 86400000;
            if (getAgeColor(prevAgeDays) !== color) return;

            const prevStayMinutes = (prev.endTime - prev.startTime) / 60000;
            let prevRadius = baseRadius;
            if (prevStayMinutes >= 10) {
                const prevStayFactor = Math.min(prevStayMinutes / 180, 1);
                prevRadius = baseRadius * (1 + prevStayFactor);
            }

            const avgRadius = (radius + prevRadius) / 2;
            const prevPos = map.latLngToContainerPoint([prev.lat, prev.lng]);
            
            ageCtx.beginPath();
            ageCtx.lineWidth  = avgRadius * 1.15;
            ageCtx.lineCap    = "round";
            ageCtx.lineJoin   = "round";
            ageCtx.moveTo(prevPos.x, prevPos.y);
            ageCtx.lineTo(pos.x, pos.y);
            ageCtx.stroke();
        }
    });

    ageCtx.restore();
}

function getAgeColor(ageDays) {
    if (ageDays < THREE_DAYS_IN_DAYS) return null;
    if (ageDays < ONE_MONTH_DAYS)     return "rgba(173, 255, 120, 0.06)";
    if (ageDays < THREE_MONTHS_DAYS)  return "rgba(60,  170,  80, 0.06)";
    if (ageDays < SIX_MONTHS_DAYS)    return "rgba(214, 176,  55, 0.06)";
    if (ageDays < ONE_YEAR_DAYS)      return "rgba(130,  92,  55, 0.06)";
    return SEDIMENT_LAYER_COLOR;
}

function renderStayTint() {
    const w = stayCanvas.width, h = stayCanvas.height;
    stayCtx.clearRect(0, 0, w, h);
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
    const toggleBtn   = document.getElementById("fog-toggle-btn");
    const toggleState = document.getElementById("fog-toggle-state");
    if (!toggleBtn) return;
    toggleBtn.classList.toggle("on",  isFogEnabled);
    toggleBtn.classList.toggle("off", !isFogEnabled);
    if (toggleState) {
        toggleState.textContent = isFogEnabled ? "켜짐" : "꺼짐";
        toggleState.classList.toggle("on",  isFogEnabled);
        toggleState.classList.toggle("off", !isFogEnabled);
    }
}

function toggleHelp() {
    document.getElementById("help-popup").classList.toggle("show");
}

function resetRecordingState() {
    isRecording = false;
    syncRecordingUI();
    stopTracking();
}

function toggleRecording() {
    if (isRecording) {
        isRecording = false;
        syncRecordingUI();
        stopTracking();
        compactPathData();
        scheduleSave();
        return;
    }
    isRecording = true;
    syncRecordingUI();
    startTracking();
}

function toggleFog() {
    isFogEnabled = !isFogEnabled;
    localStorage.setItem(FOG_ENABLED_KEY, String(isFogEnabled));
    syncFogButton();
    scheduleRender();
}

function startTracking() {
    if (!navigator.geolocation) {
        alert("이 브라우저는 위치 추적을 지원하지 않습니다.");
        resetRecordingState(); return;
    }
    if (!window.isSecureContext &&
        location.hostname !== "localhost" &&
        location.hostname !== "127.0.0.1") {
        alert("위치 추적은 HTTPS 또는 localhost에서만 동작합니다.");
        resetRecordingState(); return;
    }
    watchId = navigator.geolocation.watchPosition(
        handlePosition,
        handleLocationError,
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
}

function stopTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

function handlePosition(position) {
    const accuracy = Number(position.coords.accuracy) || Infinity;
    const latlng   = L.latLng(position.coords.latitude, position.coords.longitude);
    currentPos     = latlng;

    if (!playerMarker) {
        playerMarker = L.marker(latlng, {
            icon: L.divIcon({ className: "player-marker", iconSize: [18, 18] })
        }).addTo(map);
        map.setView(latlng, 16);
    } else {
        playerMarker.setLatLng(latlng);
    }

    if (!isRecording) return;

    if (accuracy > MAX_ACCURACY_M) {
        recStatusBox.textContent = `GPS 약함 (${Math.round(accuracy)}m)`;
        return;
    }

    recStatusBox.textContent = "기록 중";
    const now = Date.now();

    if (pathCoordinates.length === 0) {
        pathCoordinates.push(createPathPoint(latlng, now));
        updateStats();
        scheduleSave();
        scheduleRender();
        return;
    }

    const last          = pathCoordinates[pathCoordinates.length - 1];
    const dist          = distanceToPoint(latlng, last);
    const stayThreshold = getDynamicStayThreshold(accuracy);

    if (dist <= stayThreshold) {
        last.endTime = now;
        last.visits  = (last.visits || 1) + 1;
        const sf = 0.3;
        last.lat += (latlng.lat - last.lat) * sf;
        last.lng += (latlng.lng - last.lng) * sf;
    } else {
        totalDistance += dist;
        pathCoordinates.push(createPathPoint(latlng, now));
        if (pathCoordinates.length > MAX_PATH_POINTS) compactPathData();
    }

    updateStats();
    scheduleSave();
    scheduleRender();
}

function handleLocationError(err) {
    const messages = {
        1: "위치 권한이 거부되었습니다.",
        2: "현재 위치를 확인할 수 없습니다.",
        3: "위치 요청 시간이 초과되었습니다."
    };
    alert(messages[err.code] || "위치 정보를 가져오지 못했습니다.");
    resetRecordingState();
}

function createPathPoint(latlng, timestamp) {
    return {
        lat: latlng.lat, lng: latlng.lng,
        startTime: timestamp, endTime: timestamp, visits: 1
    };
}

function distanceToPoint(latlng, point) {
    return latlng.distanceTo([point.lat, point.lng]);
}

function getDynamicStayThreshold(accuracy) {
    return Math.max(MIN_MOVE_M, Math.min(MAX_STAY_RADIUS_M, accuracy * STAY_ACCURACY_FACTOR));
}

function calcTodayDistance() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    let dist = 0;
    for (let i = 1; i < pathCoordinates.length; i++) {
        if (pathCoordinates[i].startTime >= todayStartMs) {
            const prev = pathCoordinates[i - 1];
            const cur  = pathCoordinates[i];
            dist += L.latLng(cur.lat, cur.lng).distanceTo([prev.lat, prev.lng]);
        }
    }
    return dist;
}

function updateStats() {
    const todayDist = calcTodayDistance();
    document.getElementById("dist-val").innerHTML =
        `${(totalDistance / 1000).toFixed(2)}<span>km</span>`;
    document.getElementById("today-dist-val").innerHTML =
        `${(todayDist / 1000).toFixed(2)}<span>km</span>`;
    document.getElementById("memory-count-val").innerHTML =
        `${memories.length}<span>개</span>`;
    document.getElementById("photo-count-val").innerHTML =
        `${photos.length}<span>개</span>`;
}

function compactPathData() {
    if (pathCoordinates.length <= 1) return;
    const merged = [];
    for (const point of pathCoordinates) {
        const last = merged[merged.length - 1];
        if (!last) { merged.push({ ...point }); continue; }
        const timeGap = point.startTime - last.endTime;
        const dist    = L.latLng(point.lat, point.lng).distanceTo([last.lat, last.lng]);
        if (dist <= MERGE_DISTANCE_M && timeGap <= MERGE_TIME_GAP_MS) {
            const tv = (last.visits || 1) + (point.visits || 1);
            last.lat     = ((last.lat * (last.visits || 1)) + (point.lat * (point.visits || 1))) / tv;
            last.lng     = ((last.lng * (last.visits || 1)) + (point.lng * (point.visits || 1))) / tv;
            last.endTime = Math.max(last.endTime, point.endTime);
            last.visits  = tv;
        } else {
            merged.push({ ...point });
        }
    }
    pathCoordinates = shrinkOldPoints(merged, MAX_PATH_POINTS);
}

function shrinkOldPoints(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    const keepTail = Math.floor(maxPoints * 0.4);
    const tail  = points.slice(-keepTail);
    const head  = points.slice(0, points.length - keepTail);
    const ratio = Math.ceil(head.length / (maxPoints - keepTail));
    return [...head.filter((_, i) => i % ratio === 0), ...tail].slice(-maxPoints);
}

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
        dateString: now.toLocaleDateString("ko-KR",
            { year: "numeric", month: "long", day: "numeric" }),
        timeString: now.toLocaleTimeString("ko-KR",
            { hour: "2-digit", minute: "2-digit" })
    };

    memories.push(data);
    createMemoryMarker(data, true);
    updateMemoryList();
    updateStats();
    scheduleSave();
}

function getMemoryIcon() {
    const zoom = map.getZoom();
    const size = Math.max(14, Math.min(28, (zoom - 10) * 3));
    return L.divIcon({
        className: "memory-marker",
        html: `★`,
        iconSize:  [size, size],
        iconAnchor:[size / 2, size / 2]
    });
}

function createMemoryMarker(data, openPopup = false) {
    const marker = L.marker([data.lat, data.lng], {
        pane: "memoryPane",
        icon: getMemoryIcon()
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

    map.on("zoomend", () => marker.setIcon(getMemoryIcon()));
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
        moveBtn.addEventListener("click", e => {
            e.stopPropagation();
            map.flyTo([memo.lat, memo.lng], 17);
        });

        const delBtn = document.createElement("button");
        delBtn.className   = "memory-action-btn delete";
        delBtn.textContent = "삭제";
        delBtn.addEventListener("click", e => {
            e.stopPropagation();
            deleteMemory(memo.id);
        });

        actions.appendChild(moveBtn);
        actions.appendChild(delBtn);
        item.appendChild(name);
        item.appendChild(date);
        item.appendChild(actions);

        item.addEventListener("click", () => {
            map.flyTo([memo.lat, memo.lng], 17);
            toggleSidebar(false);
        });

        container.appendChild(item);
    });
}

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

function centerMap() {
    if (currentPos) map.panTo(currentPos);
}

function saveRoute() {
    const now     = Date.now();
    const hours12 = 12 * 60 * 60 * 1000;

    const filtered = pathCoordinates.filter(p =>
        (now - p.startTime) <= hours12
    );

    if (filtered.length === 0) {
        alert("최근 12시간 데이터가 없습니다.");
        return;
    }

    let totalM = 0;
    for (let i = 1; i < filtered.length; i++) {
        totalM += L.latLng(filtered[i].lat, filtered[i].lng)
            .distanceTo([filtered[i-1].lat, filtered[i-1].lng]);
    }

    const data = {
        exportTime:      new Date().toLocaleString("ko-KR"),
        pointCount:      filtered.length,
        totalDistanceKm: (totalM / 1000).toFixed(2),
        startTime:       new Date(filtered[0].startTime).toLocaleString("ko-KR"),
        endTime:         new Date(filtered[filtered.length-1].endTime).toLocaleString("ko-KR"),
        path: filtered.map(p => ({
            lat:       p.lat,
            lng:       p.lng,
            startTime: p.startTime,
            endTime:   p.endTime,
            visits:    p.visits
        }))
    };

    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `giloa_route_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    alert(`${filtered.length}개 지점, ${(totalM/1000).toFixed(2)}km 경로를 저장했습니다.`);
    toggleSidebar(false);
}

function loadRoute(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);

            if (!Array.isArray(data.path) || data.path.length < 2) {
                alert("올바른 경로 파일이 아닙니다.");
                return;
            }

            clearLoadedRoute();

            const latlngs = data.path.map(p => [p.lat, p.lng]);

            loadedRouteLayer = L.polyline(latlngs, {
                color:     "#4db8ff",
                weight:    4,
                opacity:   0.75,
                lineCap:   "round",
                lineJoin:  "round",
                dashArray: "8, 6",
                pane:      "memoryPane"
            }).addTo(map);

            const startMarker = L.circleMarker(latlngs[0], {
                radius:      8,
                color:       "#fff",
                fillColor:   "#4db8ff",
                fillOpacity: 1,
                weight:      2,
                pane:        "memoryPane"
            }).bindTooltip("출발", {
                permanent: true, direction: "top"
            }).addTo(map);

            const endMarker = L.circleMarker(latlngs[latlngs.length - 1], {
                radius:      8,
                color:       "#fff",
                fillColor:   "#ff8888",
                fillOpacity: 1,
                weight:      2,
                pane:        "memoryPane"
            }).bindTooltip("도착", {
                permanent: true, direction: "top"
            }).addTo(map);

            loadedRouteMarkers = [startMarker, endMarker];

            map.fitBounds(loadedRouteLayer.getBounds(), { padding: [40, 40] });

            document.getElementById("clear-route-btn").style.display = "flex";

            alert(`경로 불러오기 완료!\n${data.pointCount}개 지점 / ${data.totalDistanceKm}km\n기록일: ${data.exportTime}`);
            toggleSidebar(false);

        } catch(err) {
            alert("파일을 읽을 수 없습니다.");
            console.error(err);
        }
    };
    reader.readAsText(file);
    event.target.value = "";
}

function clearLoadedRoute() {
    if (loadedRouteLayer) {
        map.removeLayer(loadedRouteLayer);
        loadedRouteLayer = null;
    }
    loadedRouteMarkers.forEach(m => map.removeLayer(m));
    loadedRouteMarkers = [];
    document.getElementById("clear-route-btn").style.display = "none";
}

function scheduleSave() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        compactPathData();
        persistState();
    }, SAVE_DELAY_MS);
}

function persistState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            pathCoordinates: pathCoordinates.map(p => ({
                lat: p.lat, lng: p.lng,
                startTime: p.startTime, endTime: p.endTime,
                visits: p.visits || 1
            })),
            memories: memories.map(m => ({
                id: m.id, lat: m.lat, lng: m.lng,
                name: m.name, time: m.time,
                dateString: m.dateString, timeString: m.timeString
            })),
            photos: photos.map(p => ({
                id: p.id, lat: p.lat, lng: p.lng,
                photo: p.photo, time: p.time,
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
        const saved = JSON.parse(raw);

        if (Array.isArray(saved.pathCoordinates)) {
            pathCoordinates = saved.pathCoordinates
                .filter(p => isFinite(p.lat) && isFinite(p.lng) &&
                             isFinite(p.startTime) && isFinite(p.endTime))
                .map(p => ({
                    lat: p.lat, lng: p.lng,
                    startTime: p.startTime, endTime: p.endTime,
                    visits: isFinite(p.visits) ? p.visits : 1
                }));
        }

        if (Array.isArray(saved.memories)) {
            memories = saved.memories
                .filter(m => isFinite(m.lat) && isFinite(m.lng) &&
                             typeof m.name === "string")
                .map(m => ({
                    id: typeof m.id === "string" ? m.id : String(m.time),
                    lat: m.lat, lng: m.lng,
                    name: m.name, time: m.time,
                    dateString: m.dateString,
                    timeString: typeof m.timeString === "string"
                        ? m.timeString
                        : new Date(m.time).toLocaleTimeString("ko-KR",
                            { hour: "2-digit", minute: "2-digit" })
                }));
        }

        if (isFinite(saved.totalDistance)) totalDistance = saved.totalDistance;

        if (Array.isArray(saved.photos)) {
            photos = saved.photos.filter(p =>
                isFinite(p.lat) && isFinite(p.lng) && typeof p.photo === "string"
            );
        }

        const savedFog = localStorage.getItem(FOG_ENABLED_KEY);
        if (savedFog !== null) isFogEnabled = savedFog === "true";

        compactPathData();
    } catch (e) { console.error("복원 실패", e); }
}

function handlePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const arrayReader = new FileReader();
    arrayReader.onload = function(ae) {
        const buffer = ae.target.result;
        const gps    = parseExifGps(buffer);

        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            const now    = new Date();
            const img    = new Image();

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

                if (!lat || !lng) {
                    alert("사진에 위치 정보가 없고 현재 위치도 수신 중입니다.");
                    return;
                }
                if (!gps && currentPos) {
                    alert("사진에 위치 정보가 없어 현재 위치에 저장합니다.");
                }

                const data = {
                    id:         String(now.getTime()),
                    lat, lng,
                    photo:      compressed,
                    time:       now.getTime(),
                    dateString: now.toLocaleDateString("ko-KR",
                        { year: "numeric", month: "long", day: "numeric" }),
                    timeString: now.toLocaleTimeString("ko-KR",
                        { hour: "2-digit", minute: "2-digit" })
                };

                photos.push(data);
                createPhotoMarker(data, true);
                map.flyTo([lat, lng], 17);
                updateStats();
                scheduleSave();
            };
            img.src = base64;
        };
        reader.readAsDataURL(file);
    };
    arrayReader.readAsArrayBuffer(file);
    event.target.value = "";
}

function parseExifGps(buffer) {
    const view = new DataView(buffer);
    if (view.getUint16(0) !== 0xFFD8) return null;

    let offset = 2;
    while (offset < view.byteLength) {
        const marker = view.getUint16(offset);
        offset += 2;
        if (marker === 0xFFE1) {
            const exifHeader = String.fromCharCode(
                view.getUint8(offset + 2), view.getUint8(offset + 3),
                view.getUint8(offset + 4), view.getUint8(offset + 5)
            );
            if (exifHeader !== "Exif") break;

            const tiffOffset   = offset + 8;
            const littleEndian = view.getUint16(tiffOffset) === 0x4949;
            const getU16 = o => view.getUint16(tiffOffset + o, littleEndian);
            const getU32 = o => view.getUint32(tiffOffset + o, littleEndian);

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
                    const d   = getU32(vo)      / getU32(vo + 4);
                    const m   = getU32(vo + 8)  / getU32(vo + 12);
                    const s   = getU32(vo + 16) / getU32(vo + 20);
                    const val = d + m / 60 + s / 3600;
                    if (tag === 2) lat = val;
                    if (tag === 4) lng = val;
                }
            }

            if (lat == null || lng == null) return null;
            return {
                lat: latRef === "S" ? -lat : lat,
                lng: lngRef === "W" ? -lng : lng
            };
        }
        offset += view.getUint16(offset);
    }
    return null;
}

function getPhotoIconSize() {
    const zoom = map.getZoom();
    return Math.max(20, Math.min(44, (zoom - 10) * 5));
}

function createPhotoMarker(data, openPopup = false) {
    const makeIcon = (s) => L.divIcon({
        className: "photo-marker",
        html: `<img src="${data.photo}" style="width:${s}px;height:${s}px;border-radius:50%;object-fit:cover;border:2px solid #fff;">`,
        iconSize:  [s, s],
        iconAnchor:[s / 2, s]
    });

    const marker = L.marker([data.lat, data.lng], {
        pane: "memoryPane",
        icon: makeIcon(getPhotoIconSize())
    }).addTo(map);

    const popupEl = document.createElement("div");
    popupEl.className = "photo-popup";

    const img = document.createElement("img");
    img.src = data.photo;

    const info = document.createElement("div");
    info.style.cssText =
        "font-size:12px;color:rgba(255,255,255,0.6);" +
        "text-align:center;margin:6px 0 8px;";
    info.textContent = `${data.dateString} ${data.timeString}`;

    const delBtn = document.createElement("button");
    delBtn.className   = "popup-delete-btn";
    delBtn.textContent = "사진 삭제";
    delBtn.addEventListener("click", () => {
        deletePhoto(data.id);
        marker.closePopup();
    });

    popupEl.appendChild(img);
    popupEl.appendChild(info);
    popupEl.appendChild(delBtn);

    marker.bindPopup(popupEl);
    photoMarkers.set(data.id, marker);
    if (openPopup) marker.openPopup();

    map.on("zoomend", () => {
        marker.setIcon(makeIcon(getPhotoIconSize()));
    });
}

function deletePhoto(id) {
    photos = photos.filter(p => p.id !== id);
    const marker = photoMarkers.get(id);
    if (marker) {
        map.removeLayer(marker);
        photoMarkers.delete(id);
    }
    updateStats();
    scheduleSave();
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderStoredMarkers() {
    memories.forEach(m => createMemoryMarker(m, false));
}

function renderStoredPhotoMarkers() {
    photos.forEach(p => createPhotoMarker(p, false));
}

function init() {
    resizeCanvas();
    loadState();
    renderStoredMarkers();
    renderStoredPhotoMarkers();
    updateStats();
    updateMemoryList();
    syncRecordingUI();
    syncFogButton();
    scheduleRender();
}

map.whenReady(() => init());
```

---

## 🎉 완성!

이제 **길로아 프로젝트 전체 코드**가 준비되었습니다!

### 📦 최종 파일 구조
```
나의대동여지도/
├── index.html    ✅
├── style.css     ✅
└── script.js     ✅

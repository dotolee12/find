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

let isRecording = false;
let isFogEnabled = true;
let isHudExpanded = false;
let currentPos = null;
let pathCoordinates = [];
let memories = [];
let photos = [];
let totalDistance = 0;
let playerMarker = null;
let watchId = null;
let saveTimer = null;
let rafId = null;

const memoryMarkers = new Map();
const photoMarkers = new Map();

const recBtn = document.getElementById("rec-btn");
const recStatusBox = document.getElementById("rec-status-box");

const map = L.map("map", {
    zoomControl: false,
    attributionControl: false
}).setView([37.5665, 126.978], 16);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png").addTo(map);

map.createPane("memoryPane");
map.getPane("memoryPane").style.zIndex = 500;

const fogCanvas = document.getElementById("fog-canvas");
const ageCanvas = document.getElementById("age-canvas");
const stayCanvas = document.getElementById("stay-canvas");
const fogCtx = fogCanvas.getContext("2d");
const ageCtx = ageCanvas.getContext("2d");
const stayCtx = stayCanvas.getContext("2d");

function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    [fogCanvas, ageCanvas, stayCanvas].forEach((canvas) => {
        canvas.width = width;
        canvas.height = height;
    });

    scheduleRender();
}

window.addEventListener("resize", resizeCanvas);
map.on("move zoom", scheduleRender);

function scheduleRender() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
        rafId = null;
        render();
    });
}

function render() {
    renderFog();
    renderAgeTint();
    renderStayTint();
}

function calcMpp() {
    const center = map.getCenter();
    const pt = map.latLngToContainerPoint(center);
    const ll2 = map.containerPointToLatLng(L.point(pt.x + 10, pt.y));
    return center.distanceTo(ll2) || 1;
}

function metersToPixels(meters, mpp) {
    return (meters / mpp) * 10;
}

function renderFog() {
    const width = fogCanvas.width;
    const height = fogCanvas.height;

    fogCtx.clearRect(0, 0, width, height);
    if (!isFogEnabled) return;

    fogCtx.fillStyle = `rgba(8, 10, 18, ${FOG_ALPHA})`;
    fogCtx.fillRect(0, 0, width, height);

    if (pathCoordinates.length === 0) return;

    const now = Date.now();
    const mpp = calcMpp();
    const baseRadius = metersToPixels(FOG_RADIUS_M, mpp);

    fogCtx.save();
    fogCtx.globalCompositeOperation = "destination-out";

    pathCoordinates.forEach((point, index) => {
        const ageHours = (now - point.startTime) / 3600000;
        fogCtx.globalAlpha = getPathVisibility(ageHours);

        // ✨ 체류 시간에 따라 반지름 증가
        const stayMinutes = (point.endTime - point.startTime) / 60000;
        let radius = baseRadius;
        if (stayMinutes >= 10) {
            const stayFactor = Math.min(stayMinutes / 180, 1);
            radius = baseRadius * (1 + stayFactor);
        }

        const pos = map.latLngToContainerPoint([point.lat, point.lng]);

        fogCtx.beginPath();
        fogCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        fogCtx.fill();

        if (index > 0) {
            const prev = map.latLngToContainerPoint([
                pathCoordinates[index - 1].lat,
                pathCoordinates[index - 1].lng
            ]);

            // ✨ 이전 점의 체류 시간도 고려
            const prevStayMinutes = (pathCoordinates[index - 1].endTime - pathCoordinates[index - 1].startTime) / 60000;
            let prevRadius = baseRadius;
            if (prevStayMinutes >= 10) {
                const prevStayFactor = Math.min(prevStayMinutes / 180, 1);
                prevRadius = baseRadius * (1 + prevStayFactor);
            }

            const avgRadius = (radius + prevRadius) / 2;

            fogCtx.beginPath();
            fogCtx.lineWidth = avgRadius * 1.7;
            fogCtx.lineCap = "round";
            fogCtx.lineJoin = "round";
            fogCtx.moveTo(prev.x, prev.y);
            fogCtx.lineTo(pos.x, pos.y);
            fogCtx.stroke();
        }
    });

    fogCtx.restore();
}

function getPathVisibility(ageHours) {
    if (ageHours <= FULL_VISIBILITY_HOURS) return 1;
    if (ageHours >= MIN_VISIBILITY_HOURS) return MIN_PATH_VISIBILITY;
    const progress = ageHours / MIN_VISIBILITY_HOURS;
    return 1 - (1 - MIN_PATH_VISIBILITY) * progress;
}

function renderAgeTint() {
    const width = ageCanvas.width;
    const height = ageCanvas.height;

    ageCtx.clearRect(0, 0, width, height);
    if (pathCoordinates.length === 0) return;

    const now = Date.now();
    const mpp = calcMpp();
    const baseRadius = metersToPixels(FOG_RADIUS_M, mpp);

    ageCtx.save();
    ageCtx.globalCompositeOperation = "screen";

    pathCoordinates.forEach((point, index) => {
        const ageDays = (now - point.startTime) / 86400000;
        const color = getAgeColor(ageDays);
        if (!color) return;

        // ✨ 체류 시간에 따라 반지름 증가 (age-canvas도 동일)
        const stayMinutes = (point.endTime - point.startTime) / 60000;
        let radius = baseRadius;
        if (stayMinutes >= 10) {
            const stayFactor = Math.min(stayMinutes / 180, 1);
            radius = baseRadius * (1 + stayFactor);
        }

        const pos = map.latLngToContainerPoint([point.lat, point.lng]);

        ageCtx.fillStyle = color;
        ageCtx.strokeStyle = color;

        ageCtx.beginPath();
        ageCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ageCtx.fill();

        if (index > 0) {
            const prev = pathCoordinates[index - 1];
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
            ageCtx.lineWidth = avgRadius * 1.15;
            ageCtx.lineCap = "round";
            ageCtx.lineJoin = "round";
            ageCtx.moveTo(prevPos.x, prevPos.y);
            ageCtx.lineTo(pos.x, pos.y);
            ageCtx.stroke();
        }
    });

    ageCtx.restore();
}

function getAgeColor(ageDays) {
    if (ageDays < THREE_DAYS_IN_DAYS) return null;
    if (ageDays < ONE_MONTH_DAYS) return "rgba(173, 255, 120, 0.16)";
    if (ageDays < THREE_MONTHS_DAYS) return "rgba(60, 170, 80, 0.18)";
    if (ageDays < SIX_MONTHS_DAYS) return "rgba(214, 176, 55, 0.18)";
    if (ageDays < ONE_YEAR_DAYS) return "rgba(130, 92, 55, 0.20)";
    return SEDIMENT_LAYER_COLOR;
}

function renderStayTint() {
    const width = stayCanvas.width;
    const height = stayCanvas.height;

    stayCtx.clearRect(0, 0, width, height);
    if (pathCoordinates.length === 0) return;

    const mpp = calcMpp();

    pathCoordinates.forEach((point) => {
        const stayMin = (point.endTime - point.startTime) / 60000;
        if (stayMin < 10) return;

        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        const radius = metersToPixels(getStayRadiusMeters(stayMin), mpp);

        const grad = stayCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
        grad.addColorStop(0, "rgba(255, 220, 100, 0.18)");
        grad.addColorStop(0.6, "rgba(255, 220, 100, 0.08)");
        grad.addColorStop(1, "rgba(255, 220, 100, 0)");

        stayCtx.fillStyle = grad;
        stayCtx.beginPath();
        stayCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        stayCtx.fill();
    });
}

function getStayRadiusMeters(stayMin) {
    if (stayMin < 10) return FOG_RADIUS_M;
    if (stayMin >= 180) return FOG_RADIUS_M * 2.0;
    const progress = (stayMin - 10) / (180 - 10);
    return FOG_RADIUS_M * (1 + progress);
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
    const toggleBtn = document.getElementById("fog-toggle-btn");
    const toggleState = document.getElementById("fog-toggle-state");
    if (!toggleBtn || !toggleState) return;

    toggleBtn.classList.toggle("on", isFogEnabled);
    toggleBtn.classList.toggle("off", !isFogEnabled);
    toggleState.textContent = isFogEnabled ? "켜짐" : "꺼짐";
    toggleState.classList.toggle("on", isFogEnabled);
    toggleState.classList.toggle("off", !isFogEnabled);
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
        resetRecordingState();
        return;
    }

    if (!window.isSecureContext &&
        location.hostname !== "localhost" &&
        location.hostname !== "127.0.0.1") {
        alert("위치 추적은 HTTPS 또는 localhost에서만 동작합니다.");
        resetRecordingState();
        return;
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
    const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
    currentPos = latlng;

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

    const last = pathCoordinates[pathCoordinates.length - 1];
    const dist = distanceToPoint(latlng, last);
    const stayThreshold = getDynamicStayThreshold(accuracy);

    if (dist <= stayThreshold) {
        last.endTime = now;
        last.visits = (last.visits || 1) + 1;
        const smoothFactor = 0.3;
        last.lat += (latlng.lat - last.lat) * smoothFactor;
        last.lng += (latlng.lng - last.lng) * smoothFactor;
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
        lat: latlng.lat,
        lng: latlng.lng,
        startTime: timestamp,
        endTime: timestamp,
        visits: 1
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
            const cur = pathCoordinates[i];
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
        if (!last) {
            merged.push({ ...point });
            continue;
        }

        const timeGap = point.startTime - last.endTime;
        const dist = L.latLng(point.lat, point.lng).distanceTo([last.lat, last.lng]);

        if (dist <= MERGE_DISTANCE_M && timeGap <= MERGE_TIME_GAP_MS) {
            const totalVisits = (last.visits || 1) + (point.visits || 1);
            last.lat = ((last.lat * (last.visits || 1)) + (point.lat * (point.visits || 1))) / totalVisits;
            last.lng = ((last.lng * (last.visits || 1)) + (point.lng * (point.visits || 1))) / totalVisits;
            last.endTime = Math.max(last.endTime, point.endTime);
            last.visits = totalVisits;
        } else {
            merged.push({ ...point });
        }
    }

    pathCoordinates = shrinkOldPoints(merged, MAX_PATH_POINTS);
}

function shrinkOldPoints(points, maxPoints) {
    if (points.length <= maxPoints) return points;

    const keepTail = Math.floor(maxPoints * 0.4);
    const tail = points.slice(-keepTail);
    const head = points.slice(0, points.length - keepTail);
    const ratio = Math.ceil(head.length / (maxPoints - keepTail));
    return [...head.filter((_, i) => i % ratio === 0), ...tail].slice(-maxPoints);
}

function addMemory() {
    if (!currentPos) {
        alert("위치 정보를 수신 중입니다.");
        return;
    }

    const input = prompt("이 장소의 이름을 입력하세요:", "새로운 발견");
    if (input === null) return;

    const now = new Date();
    const data = {
        id: String(now.getTime()),
        lat: currentPos.lat,
        lng: currentPos.lng,
        name: escapeHtml(input.trim() || "기억의 지점"),
        time: now.getTime(),
        dateString: now.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric"
        }),
        timeString: now.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit"
        })
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
        icon: L.divIcon({
            className: "memory-marker",
            html: "★",
            iconSize: [28, 28]
        })
    }).addTo(map);

    const popupEl = document.createElement("div");

    const title = document.createElement("b");
    title.textContent = data.name;

    const info = document.createElement("small");
    info.style.display = "block";
    info.textContent = `${data.dateString} ${data.timeString || ""}`;

    const delBtn = document.createElement("button");
    delBtn.className = "popup-delete-btn";
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
    memories = memories.filter((memory) => memory.id !== id);

    const marker = memoryMarkers.get(id);
    if (marker) {
        map.removeLayer(marker);
        memoryMarkers.delete(id);
    }

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

    [...memories].reverse().forEach((memo) => {
        const item = document.createElement("div");
        item.className = "memory-item";

        const name = document.createElement("span");
        name.className = "item-name";
        name.textContent = "★ " + memo.name;

        const date = document.createElement("span");
        date.className = "item-date";
        date.textContent = `${memo.dateString} ${memo.timeString || ""}`;

        const actions = document.createElement("div");
        actions.className = "memory-actions";

        const moveBtn = document.createElement("button");
        moveBtn.className = "memory-action-btn move";
        moveBtn.textContent = "이동";
        moveBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            map.flyTo([memo.lat, memo.lng], 17);
        });

        const delBtn = document.createElement("button");
        delBtn.className = "memory-action-btn delete";
        delBtn.textContent = "삭제";
        delBtn.addEventListener("click", (event) => {
            event.stopPropagation();
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

function handlePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const now = new Date();
        const data = {
            id: String(now.getTime()),
            lat: currentPos ? currentPos.lat : 37.5665,
            lng: currentPos ? currentPos.lng : 126.978,
            photo: e.target.result,
            time: now.getTime(),
            dateString: now.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric"
            }),
            timeString: now.toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit"
            })
        };

        photos.push(data);
        createPhotoMarker(data, true);
        updateStats();
        scheduleSave();
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
            iconSize: [44, 44],
            iconAnchor: [22, 44]
        })
    }).addTo(map);

    const popupEl = document.createElement("div");
    popupEl.className = "photo-popup";

    const img = document.createElement("img");
    img.src = data.photo;

    const info = document.createElement("div");
    info.style.cssText = "font-size:12px;color:rgba(255,255,255,0.6);text-align:center;margin:6px 0 8px;";
    info.textContent = `${data.dateString} ${data.timeString}`;

    const delBtn = document.createElement("button");
    delBtn.className = "popup-delete-btn";
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
}

function deletePhoto(id) {
    photos = photos.filter((photo) => photo.id !== id);
    const marker = photoMarkers.get(id);

    if (marker) {
        map.removeLayer(marker);
        photoMarkers.delete(id);
    }

    updateStats();
    scheduleSave();
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
            pathCoordinates: pathCoordinates.map((point) => ({
                lat: point.lat,
                lng: point.lng,
                startTime: point.startTime,
                endTime: point.endTime,
                visits: point.visits || 1
            })),
            memories: memories.map((memory) => ({
                id: memory.id,
                lat: memory.lat,
                lng: memory.lng,
                name: memory.name,
                time: memory.time,
                dateString: memory.dateString,
                timeString: memory.timeString
            })),
            photos: photos.map((photo) => ({
                id: photo.id,
                lat: photo.lat,
                lng: photo.lng,
                photo: photo.photo,
                time: photo.time,
                dateString: photo.dateString,
                timeString: photo.timeString
            })),
            totalDistance
        }));
    } catch (error) {
        console.error("저장 실패", error);
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const saved = JSON.parse(raw);

        if (Array.isArray(saved.pathCoordinates)) {
            pathCoordinates = saved.pathCoordinates
                .filter((point) =>
                    isFinite(point.lat) &&
                    isFinite(point.lng) &&
                    isFinite(point.startTime) &&
                    isFinite(point.endTime)
                )
                .map((point) => ({
                    lat: point.lat,
                    lng: point.lng,
                    startTime: point.startTime,
                    endTime: point.endTime,
                    visits: isFinite(point.visits) ? point.visits : 1
                }));
        }

        if (Array.isArray(saved.memories)) {
            memories = saved.memories
                .filter((memory) =>
                    isFinite(memory.lat) &&
                    isFinite(memory.lng) &&
                    typeof memory.name === "string"
                )
                .map((memory) => ({
                    id: typeof memory.id === "string" ? memory.id : String(memory.time),
                    lat: memory.lat,
                    lng: memory.lng,
                    name: memory.name,
                    time: memory.time,
                    dateString: memory.dateString,
                    timeString: memory.timeString || ""
                }));
        }

        if (Array.isArray(saved.photos)) {
            photos = saved.photos
                .filter((photo) =>
                    isFinite(photo.lat) &&
                    isFinite(photo.lng) &&
                    typeof photo.photo === "string"
                );
        }

        if (isFinite(saved.totalDistance)) {
            totalDistance = saved.totalDistance;
        }

        const savedFog = localStorage.getItem(FOG_ENABLED_KEY);
        if (savedFog !== null) isFogEnabled = savedFog === "true";

        compactPathData();
    } catch (error) {
        console.error("복원 실패", error);
    }
}

function renderStoredMarkers() {
    memories.forEach((memory) => createMemoryMarker(memory, false));
}

function renderStoredPhotoMarkers() {
    photos.forEach((photo) => createPhotoMarker(photo, false));
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

map.whenReady(init);

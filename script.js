/**
 * 길로아 (Giloa) - 기억 휘발 시스템 안정판
 * 이동 흔적: 초기 100% -> 6시간 후 40% 영구 잔상
 * 체류 반경: 10분 미만 18m, 20분 20m, 30분 22m, 60분 24m, 120분 이상 26m
 */
const STORAGE_KEY = "giloa-v7";
const FOG_ENABLED_KEY = "giloa-fog-enabled";
const FOG_ALPHA = 0.8;
const FOG_RADIUS_M = 18;
const MIN_MOVE_M = 8;
const MAX_ACCURACY_M = 45;
const STAY_ACCURACY_FACTOR = 0.6;
const MAX_STAY_RADIUS_M = 18;
const SAVE_DELAY_MS = 800;
const MERGE_DISTANCE_M = 6;
const MERGE_TIME_GAP_MS = 2 * 60 * 1000;
const MAX_PATH_POINTS = 5000;

const START_ALPHA = 1.0;
const FINAL_ALPHA = 0.4;
const DECAY_RATE_PER_HOUR = 0.1;

let isRecording = false;
let isFogEnabled = true;
let currentPos = null;
let pathCoordinates = [];
let memories = [];
let totalDistance = 0;
let playerMarker = null;
let watchId = null;
let saveTimer = null;
let rafId = null;
let stayRenderTimer = null;
let memoryMarkers = new Map();

const recBtn = document.getElementById("rec-btn");
const recStatusBox = document.getElementById("rec-status-box");

const map = L.map("map", { zoomControl: false, attributionControl: false })
    .setView([37.5665, 126.9780], 16);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png").addTo(map);

map.createPane("memoryPane");
map.getPane("memoryPane").style.zIndex = 650;

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

function startStayRenderLoop() {
    if (stayRenderTimer !== null) return;

    stayRenderTimer = window.setInterval(() => {
        if (pathCoordinates.length === 0) return;
        scheduleRender();
    }, 1000);
}

function renderFog() {
    const width = fogCanvas.width;
    const height = fogCanvas.height;

    fogCtx.clearRect(0, 0, width, height);

    if (!isFogEnabled) return;

    fogCtx.fillStyle = `rgba(8, 10, 18, ${FOG_ALPHA})`;
    fogCtx.fillRect(0, 0, width, height);

    if (pathCoordinates.length === 0) return;

    fogCtx.save();
    fogCtx.globalCompositeOperation = "destination-out";
    fogCtx.globalAlpha = 1;

    pathCoordinates.forEach((point, index) => {
        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        const radius = getMetersToPixels(FOG_RADIUS_M);

        fogCtx.beginPath();
        fogCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        fogCtx.fill();

        if (index > 0) {
            const prev = map.latLngToContainerPoint([
                pathCoordinates[index - 1].lat,
                pathCoordinates[index - 1].lng
            ]);

            fogCtx.beginPath();
            fogCtx.lineWidth = radius * 1.7;
            fogCtx.lineCap = "round";
            fogCtx.lineJoin = "round";
            fogCtx.moveTo(prev.x, prev.y);
            fogCtx.lineTo(pos.x, pos.y);
            fogCtx.stroke();
        }
    });

    fogCtx.restore();
}

function renderAgeTint() {
    const width = ageCanvas.width;
    const height = ageCanvas.height;

    ageCtx.clearRect(0, 0, width, height);
    if (pathCoordinates.length === 0) return;

    ageCtx.save();
    ageCtx.beginPath();

    pathCoordinates.forEach((point, index) => {
        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        const radius = getMetersToPixels(FOG_RADIUS_M);

        ageCtx.moveTo(pos.x + radius, pos.y);
        ageCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

        if (index > 0) {
            const prev = map.latLngToContainerPoint([
                pathCoordinates[index - 1].lat,
                pathCoordinates[index - 1].lng
            ]);
            const dx = pos.x - prev.x;
            const dy = pos.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len * radius * 0.85;
            const ny = dx / len * radius * 0.85;

            ageCtx.moveTo(prev.x + nx, prev.y + ny);
            ageCtx.lineTo(pos.x + nx, pos.y + ny);
            ageCtx.lineTo(pos.x - nx, pos.y - ny);
            ageCtx.lineTo(prev.x - nx, prev.y - ny);
            ageCtx.closePath();
        }
    });

    ageCtx.clip();

    pathCoordinates.forEach((point, index) => {
        const color = getAgeColor(point.startTime);
        if (!color) return;

        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        const radius = getMetersToPixels(FOG_RADIUS_M);

        ageCtx.fillStyle = color;
        ageCtx.strokeStyle = color;

        ageCtx.beginPath();
        ageCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ageCtx.fill();

        if (index > 0) {
            const prev = map.latLngToContainerPoint([
                pathCoordinates[index - 1].lat,
                pathCoordinates[index - 1].lng
            ]);

            ageCtx.beginPath();
            ageCtx.lineWidth = radius * 1.15;
            ageCtx.lineCap = "round";
            ageCtx.lineJoin = "round";
            ageCtx.moveTo(prev.x, prev.y);
            ageCtx.lineTo(pos.x, pos.y);
            ageCtx.stroke();
        }
    });

    ageCtx.restore();
}

function renderStayTint() {
    const width = stayCanvas.width;
    const height = stayCanvas.height;

    stayCtx.clearRect(0, 0, width, height);
    if (pathCoordinates.length === 0) return;

    stayCtx.save();
    stayCtx.beginPath();

    pathCoordinates.forEach((point, index) => {
        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        const stayMin = (point.endTime - point.startTime) / 60000;
        const radius = getMetersToPixels(getStayRadiusMeters(stayMin));

        stayCtx.moveTo(pos.x + radius, pos.y);
        stayCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

        if (index > 0) {
            const prev = map.latLngToContainerPoint([
                pathCoordinates[index - 1].lat,
                pathCoordinates[index - 1].lng
            ]);
            const prevStayMin = (pathCoordinates[index - 1].endTime - pathCoordinates[index - 1].startTime) / 60000;
            const prevRadius = getMetersToPixels(getStayRadiusMeters(prevStayMin));
            const linkRadius = Math.max(radius, prevRadius);

            const dx = pos.x - prev.x;
            const dy = pos.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len * linkRadius * 0.85;
            const ny = dx / len * linkRadius * 0.85;

            stayCtx.moveTo(prev.x + nx, prev.y + ny);
            stayCtx.lineTo(pos.x + nx, pos.y + ny);
            stayCtx.lineTo(pos.x - nx, pos.y - ny);
            stayCtx.lineTo(prev.x - nx, prev.y - ny);
            stayCtx.closePath();
        }
    });

    stayCtx.clip();

    pathCoordinates.forEach((point) => {
        const stayMin = (point.endTime - point.startTime) / 60000;
        const color = getStayColor(stayMin, point.startTime);
        if (!color) return;

        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        const radius = getMetersToPixels(getStayRadiusMeters(stayMin));
        const grad = stayCtx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);

        grad.addColorStop(0, color.center);
        grad.addColorStop(0.65, color.mid);
        grad.addColorStop(1, color.edge);

        stayCtx.beginPath();
        stayCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        stayCtx.fillStyle = grad;
        stayCtx.fill();
    });

    stayCtx.restore();
}

function getAgeColor(startTime) {
    const now = Date.now();
    const hoursAgo = (now - startTime) / 3600000;

    let alpha = START_ALPHA - hoursAgo * DECAY_RATE_PER_HOUR;
    alpha = Math.max(FINAL_ALPHA, alpha);

    if (hoursAgo < 2) return `rgba(60, 170, 80, ${alpha})`;
    if (hoursAgo < 6) return `rgba(214, 176, 55, ${alpha})`;
    return `rgba(130, 92, 55, ${alpha})`;
}

function getStayColor(stayMin, startTime) {
    const now = Date.now();
    const hoursAgo = (now - startTime) / 3600000;

    let alphaBase = START_ALPHA - hoursAgo * DECAY_RATE_PER_HOUR;
    alphaBase = Math.max(FINAL_ALPHA, alphaBase);

    const centerAlpha = Math.min(alphaBase + 0.1, 1);

    if (stayMin >= 60) {
        return {
            center: `rgba(150, 90, 255, ${centerAlpha})`,
            mid: `rgba(150, 90, 255, ${alphaBase})`,
            edge: "rgba(150, 90, 255, 0)"
        };
    }

    if (stayMin >= 30) {
        return {
            center: `rgba(70, 130, 255, ${centerAlpha})`,
            mid: `rgba(70, 130, 255, ${alphaBase})`,
            edge: "rgba(70, 130, 255, 0)"
        };
    }

    if (stayMin >= 10) {
        return {
            center: `rgba(135, 206, 235, ${centerAlpha})`,
            mid: `rgba(135, 206, 235, ${alphaBase})`,
            edge: "rgba(135, 206, 235, 0)"
        };
    }

    return null;
}

function getStayRadiusMeters(stayMin) {
    if (stayMin < 10) return 18;

    if (stayMin < 20) {
        const t = (stayMin - 10) / 10;
        return 18 + (20 - 18) * t;
    }

    if (stayMin < 30) {
        const t = (stayMin - 20) / 10;
        return 20 + (22 - 20) * t;
    }

    if (stayMin < 60) {
        const t = (stayMin - 30) / 30;
        return 22 + (24 - 22) * t;
    }

    if (stayMin < 120) {
        const t = (stayMin - 60) / 60;
        return 24 + (26 - 24) * t;
    }

    return 26;
}

function getMetersToPixels(meters) {
    const center = map.getCenter();
    const pt = map.latLngToContainerPoint(center);
    const ll2 = map.containerPointToLatLng(L.point(pt.x + 10, pt.y));
    const metersPerPixels = center.distanceTo(ll2);
    return metersPerPixels ? (meters / metersPerPixels) * 10 : 1;
}

function syncRecordingUI() {
    recBtn.classList.toggle("recording", isRecording);
    recStatusBox.textContent = isRecording ? "기록 중" : "대기 중";
    recStatusBox.classList.toggle("recording", isRecording);
}

function syncFogButton() {
    const fogBtn = document.getElementById("fog-btn");
    if (!fogBtn) return;

    fogBtn.classList.toggle("off", !isFogEnabled);
    fogBtn.textContent = isFogEnabled ? "☁" : "☀";
    fogBtn.title = isFogEnabled ? "어둠 끄기" : "어둠 켜기";
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

        const smoothFactor = 0.12;
        last.lat = last.lat + (latlng.lat - last.lat) * smoothFactor;
        last.lng = last.lng + (latlng.lng - last.lng) * smoothFactor;
    } else {
        totalDistance += dist;
        pathCoordinates.push(createPathPoint(latlng, now));
        if (pathCoordinates.length > MAX_PATH_POINTS) {
            compactPathData();
        }
    }

    updateStats();
    scheduleSave();
    scheduleRender();
}

function handleLocationError(err) {
    let message = "위치 정보를 가져오지 못했습니다.";
    if (err.code === 1) message = "위치 권한이 거부되었습니다.";
    if (err.code === 2) message = "현재 위치를 확인할 수 없습니다.";
    if (err.code === 3) message = "위치 요청 시간이 초과되었습니다.";
    alert(message);
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
    return Math.max(
        MIN_MOVE_M,
        Math.min(MAX_STAY_RADIUS_M, accuracy * STAY_ACCURACY_FACTOR)
    );
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
    const reducedHead = head.filter((_, index) => index % ratio === 0);

    return [...reducedHead, ...tail].slice(-maxPoints);
}

function updateStats() {
    document.getElementById("dist-val").innerHTML =
        (totalDistance / 1000).toFixed(2) + "<span>km</span>";
    document.getElementById("memo-val").innerText = memories.length;
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
        icon: L.divIcon({ className: "memory-marker", html: "★", iconSize: [28, 28] })
    }).addTo(map);

    marker.bindPopup(
        "<b>" + data.name + "</b><br>" +
        "<small>" + data.dateString + " " + data.timeString + "</small><br>" +
        '<button onclick="deleteMemory(\'' + data.id + '\')" class="popup-delete-btn">삭제</button>'
    );

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
        item.innerHTML =
            '<span class="item-name">★ ' + memo.name + "</span>" +
            '<span class="item-date">' + memo.dateString + " " + memo.timeString + "</span>" +
            '<div class="memory-actions">' +
            '<button onclick="event.stopPropagation(); map.flyTo([' + memo.lat + "," + memo.lng + '], 17);" class="memory-action-btn move">이동</button>' +
            '<button onclick="event.stopPropagation(); deleteMemory(\'' + memo.id + '\')" class="memory-action-btn delete">삭제</button>' +
            "</div>";

        item.onclick = () => {
            map.flyTo([memo.lat, memo.lng], 17);
            toggleSidebar(false);
        };

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
        const data = {
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
            totalDistance
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
                    timeString: typeof memory.timeString === "string"
                        ? memory.timeString
                        : new Date(memory.time).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit"
                        })
                }));
        }

        if (isFinite(saved.totalDistance)) {
            totalDistance = saved.totalDistance;
        }

        const savedFogEnabled = localStorage.getItem(FOG_ENABLED_KEY);
        if (savedFogEnabled !== null) {
            isFogEnabled = savedFogEnabled === "true";
        }

        compactPathData();
    } catch (error) {
        console.error("복원 실패", error);
    }
}

function renderStoredMarkers() {
    memories.forEach((memory) => createMemoryMarker(memory, false));
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

loadState();
renderStoredMarkers();
updateStats();
updateMemoryList();
syncRecordingUI();
syncFogButton();
resizeCanvas();
startStayRenderLoop();
scheduleRender();

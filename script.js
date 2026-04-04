/* ✨ Giloa - 나의 대동여지도 | 이 코드는 쿄로아(Giloa) 프로젝트의 지적 재산입니다. 이 코드의 무단 복제와 배포를 금지합니다. Copyright 2026 Giloa Project. All rights reserved. */
const _oIooollIoO = "giloa-v7";
const _lOOIOo = "giloa-fog-enabled";
const _loOolOI = "giloa-gpx-_oIOIoOlo";
const _OIOOol = 0.8;
const _lOoIOooIlI = 18;
const _OollloI = 15;
const _lOIOIOOo = 50;
const _llollOl = 0.6;
const _OlOIOlol = 36;
const _OllloOIIII = 800;
const _OOOOOllo = 6;
const _OOlOIIolO = 2 * 60 * 1000;
const _lOOOOOo = 5000;
const _OOlIIII = 0;
const _IlIolOoOOl = 24;
const _IIIlIol = 0.4;
const _IIloOOloO = 3;
const _OlIoll = 30;
const _oOloIOo = 90;
const _OoOIIIoo = 180;
const _olIIOo = 365;
const _OIIlIo = "rgba(126, 112, 96, 0.24)";
const _IIoOIIoIO = [
 { level: 1, _IOlOlOOll: "길 없는 자", _lOooOIolo: 0, _lOloOoOOl: 0, _OloIolOOO: 0 },
 { level: 2, _IOlOlOOll: "흔적을 남긴 자", _lOooOIolo: 1, _lOloOoOOl: 0, _OloIolOOO: 0 },
 { level: 3, _IOlOlOOll: "탐험자", _lOooOIolo: 10, _lOloOoOOl: 1, _OloIolOOO: 0 },
 { level: 4, _IOlOlOOll: "길을 만든 자", _lOooOIolo: 30, _lOloOoOOl: 3, _OloIolOOO: 0 },
 { level: 5, _IOlOlOOll: "기억을 수집하는 자", _lOooOIolo: 50, _lOloOoOOl: 5, _OloIolOOO: 3 },
 { level: 6, _IOlOlOOll: "개척자", _lOooOIolo: 100, _lOloOoOOl: 10, _OloIolOOO: 7 },
 { level: 7, _IOlOlOOll: "세계의 기록자", _lOooOIolo: 200, _lOloOoOOl: 20, _OloIolOOO: 15 },
];
let _IoIOlloO = false;
let _OloIolOOO = [];
const _OIOolOlOIO = new Map();
let _OloIlOOoo = true;
let _lolloOOI = false;
let _oIlIOoO = null;
let _IoOoIl = [];
let _lOloOoOOl = [];
let _IloIIOlol = 0;
let _IOIlIo = null;
let _IolOOIoOII = null;
let _IOlOOooll = null;
let _loOIlo = null;
const _oIIIoll = new Map();
let _ooIoIlOOl = null;
let _IIOllloo = [];
let _loOIIllI = 12;
const _OoloIllIO = document.getElementById("rec-btn");
const _oOoOooIIll = document.getElementById("rec-status-_OOOOIlIoo");
const map = L.map("map", { zoomControl: false, attributionControl: false })
 .setView([37.5665, 126.978], 16);
L.tileLayer("https:
map.createPane("memoryPane");
map.getPane("memoryPane").style.zIndex = 500;
const _IoOIOOl = document.getElementById("fog-_lOoIOo");
const _lOIloOll = document.getElementById("age-_lOoIOo");
const _IIOollo = document.getElementById("stay-_lOoIOo");
const _OllOooIIl = _IoOIOOl.getContext("2d");
const _llOlIoIo = _lOIloOll.getContext("2d");
const _OloIoOoIO = _IIOollo.getContext("2d");
function _OOIIlII() {
 const w = window.innerWidth + 2;
 const h = window.innerHeight + 2;
 [_IoOIOOl, _lOIloOll, _IIOollo].forEach(c => {
 c.width = w;
 c.height = h;
 c.style.width = w + "px";
 c.style.height = h + "px";
 c.style.top = "-1px";
 c.style.left = "-1px";
 });
 _ooOoIl();
}
window.addEventListener("resize", _OOIIlII);
map.on("move zoom", _ooOoIl);
function _ooOoIl() {
 if (_loOIlo !== null) return;
 _loOIlo = requestAnimationFrame(() => { _loOIlo = null; _OOlIlIIoI(); });
}
function _OOlIlIIoI() { _lIOIlIIolI(); _ooloOoI(); _IIIOOol(); }
function _oIOoolIoI() {
 const _IlOIlOIloO = map.getCenter();
 const pt = map.latLngToContainerPoint(_IlOIlOIloO);
 const _llOlOO = map.containerPointToLatLng(L._loIoOOIOol(pt.x + 10, pt.y));
 return _IlOIlOIloO.distanceTo(_llOlOO) || 1;
}
function _IOOlIIoool(meters, _oOIoIOOOI) { return (meters / _oOIoIOOOI) * 10; }
function _lIOIlIIolI() {
 const w = _IoOIOOl.width, h = _IoOIOOl.height;
 _OllOooIIl.clearRect(0, 0, w, h);
 if (!_OloIlOOoo) return;
 _OllOooIIl.fillStyle = `rgba(8, 10, 18, ${_OIOOol})`;
 _OllOooIIl.fillRect(0, 0, w, h);
 if (_IoOoIl.length === 0) return;
 const _oIlIlI = Date._oIlIlI();
 const _oOIoIOOOI = _oIOoolIoI();
 const _loolOo = _IOOlIIoool(_lOoIOooIlI, _oOIoIOOOI);
 const _OlIIoIoOOI = document.createElement("_lOoIOo");
 _OlIIoIoOOI.width = w;
 _OlIIoIoOOI.height = h;
 const _ooIooIl = _OlIIoIoOOI.getContext("2d");
 _ooIooIl.fillStyle = "black";
 _ooIooIl.fillRect(0, 0, w, h);
 _ooIooIl.globalCompositeOperation = "source-over";
 if (_IoOoIl.length === 1) {
 const _loIoOOIOol = _IoOoIl[0];
 const _OOoIloII = (_oIlIlI - _loIoOOIOol.startTime) / 3600000;
 const _IoooOoIO = _OOoooOOIo(_OOoIloII);
 const _oOOloO = (_loIoOOIOol.endTime - _loIoOOIOol.startTime) / 60000;
 const _lOIlloOlI = _IOOlIIoool(_lOlOoIIOII(_oOOloO), _oOIoIOOOI);
 const _IIOolOIlo = map.latLngToContainerPoint([_loIoOOIOol._OOooIlIOlO, _loIoOOIOol._lIllOO]);
 _ooIooIl.fillStyle = `rgba(255,255,255,${_IoooOoIO})`;
 _ooIooIl.beginPath();
 _ooIooIl.arc(_IIOolOIlo.x, _IIOolOIlo.y, _lOIlloOlI, 0, Math.PI * 2);
 _ooIooIl.fill();
 } else {
 for (let i = 1; i < _IoOoIl.length; i++) {
 const _loIoOOIOol = _IoOoIl[i];
 const _OOoIloII = (_oIlIlI - _loIoOOIOol.startTime) / 3600000;
 const _IoooOoIO = _OOoooOOIo(_OOoIloII);
 const _oOOloO = (_loIoOOIOol.endTime - _loIoOOIOol.startTime) / 60000;
 const _lOIlloOlI = _IOOlIIoool(_lOlOoIIOII(_oOOloO), _oOIoIOOOI);
 const _oOooIoO = map.latLngToContainerPoint([_IoOoIl[i-1]._OOooIlIOlO, _IoOoIl[i-1]._lIllOO]);
 const _IIOolOIlo = map.latLngToContainerPoint([_loIoOOIOol._OOooIlIOlO, _loIoOOIOol._lIllOO]);
 if (_oOOloO >= 10) {
 _ooIooIl.fillStyle = `rgba(255,255,255,${_IoooOoIO})`;
 _ooIooIl.beginPath();
 _ooIooIl.arc(_IIOolOIlo.x, _IIOolOIlo.y, _lOIlloOlI, 0, Math.PI * 2);
 _ooIooIl.fill();
 }
 _ooIooIl.strokeStyle = `rgba(255,255,255,${_IoooOoIO})`;
 _ooIooIl.lineWidth = _loolOo * 2;
 _ooIooIl.lineCap = "round";
 _ooIooIl.lineJoin = "round";
 _ooIooIl.beginPath();
 _ooIooIl.moveTo(_oOooIoO.x, _oOooIoO.y);
 _ooIooIl.lineTo(_IIOolOIlo.x, _IIOolOIlo.y);
 _ooIooIl.stroke();
 }
 }
 _OllOooIIl.save();
 _OllOooIIl.globalCompositeOperation = "destination-out";
 _OllOooIIl.drawImage(_OlIIoIoOOI, 0, 0);
 _OllOooIIl.restore();
}
function _OOoooOOIo(_OOoIloII) {
 if (_OOoIloII <= _OOlIIII) return 1;
 if (_OOoIloII >= _IlIolOoOOl) return _IIIlIol;
 return 1 - (1 - _IIIlIol) * (_OOoIloII / _IlIolOoOOl);
}
function _ooloOoI() {
 const w = _lOIloOll.width, h = _lOIloOll.height;
 _llOlIoIo.clearRect(0, 0, w, h);
 if (_IoOoIl.length === 0) return;
 const _oIlIlI = Date._oIlIlI();
 const _oOIoIOOOI = _oIOoolIoI();
 const _loolOo = _IOOlIIoool(_lOoIOooIlI, _oOIoIOOOI);
 _IoOoIl.forEach((_loIoOOIOol, i) => {
 const _oIlolIOlII = (_oIlIlI - _loIoOOIOol.startTime) / 86400000;
 const color = _oOllIoolo(_oIlolIOlII);
 if (!color) return;
 const _IIOolOIlo = map.latLngToContainerPoint([_loIoOOIOol._OOooIlIOlO, _loIoOOIOol._lIllOO]);
 _llOlIoIo.fillStyle = color; _llOlIoIo.strokeStyle = color;
 _llOlIoIo.beginPath(); _llOlIoIo.arc(_IIOolOIlo.x, _IIOolOIlo.y, _loolOo, 0, Math.PI * 2); _llOlIoIo.fill();
 if (i > 0) {
 const _oOooIoO = map.latLngToContainerPoint([_IoOoIl[i-1]._OOooIlIOlO, _IoOoIl[i-1]._lIllOO]);
 _llOlIoIo.beginPath();
 _llOlIoIo.lineWidth = _loolOo * 1.15; _llOlIoIo.lineCap = "round"; _llOlIoIo.lineJoin = "round";
 _llOlIoIo.moveTo(_oOooIoO.x, _oOooIoO.y); _llOlIoIo.lineTo(_IIOolOIlo.x, _IIOolOIlo.y); _llOlIoIo.stroke();
 }
 });
}
function _oOllIoolo(_oIlolIOlII) {
 if (_oIlolIOlII < _IIloOOloO) return null;
 if (_oIlolIOlII < _OlIoll) return "rgba(173, 255, 120, 0.16)";
 if (_oIlolIOlII < _oOloIOo) return "rgba(60, 170, 80, 0.18)";
 if (_oIlolIOlII < _OoOIIIoo) return "rgba(214, 176, 55, 0.18)";
 if (_oIlolIOlII < _olIIOo) return "rgba(130, 92, 55, 0.20)";
 return _OIIlIo;
}
function _IIIOOol() {
 const w = _IIOollo.width, h = _IIOollo.height;
 _OloIoOoIO.clearRect(0, 0, w, h);
 if (_IoOoIl.length === 0) return;
 const _oOIoIOOOI = _oIOoolIoI();
 _IoOoIl.forEach(_loIoOOIOol => {
 const _oOOloO = (_loIoOOIOol.endTime - _loIoOOIOol.startTime) / 60000;
 if (_oOOloO < 10) return;
 const _IIOolOIlo = map.latLngToContainerPoint([_loIoOOIOol._OOooIlIOlO, _loIoOOIOol._lIllOO]);
 const _loolOo = _IOOlIIoool(_lOlOoIIOII(_oOOloO), _oOIoIOOOI);
 const _OOoIlollo = _OloIoOoIO.createRadialGradient(_IIOolOIlo.x, _IIOolOIlo.y, 0, _IIOolOIlo.x, _IIOolOIlo.y, _loolOo);
 _OOoIlollo.addColorStop(0, "rgba(255, 220, 100, 0.18)");
 _OOoIlollo.addColorStop(0.6, "rgba(255, 220, 100, 0.08)");
 _OOoIlollo.addColorStop(1, "rgba(255, 220, 100, 0)");
 _OloIoOoIO.fillStyle = _OOoIlollo;
 _OloIoOoIO.beginPath(); _OloIoOoIO.arc(_IIOolOIlo.x, _IIOolOIlo.y, _loolOo, 0, Math.PI * 2); _OloIoOoIO.fill();
 });
}
function _lOlOoIIOII(_oOOloO) {
 if (_oOOloO < 10) return _lOoIOooIlI;
 if (_oOOloO >= 180) return _lOoIOooIlI * 2.0;
 return _lOoIOooIlI * (1.0 + (_oOOloO - 10) / (180 - 10));
}
function _oOIOIloIo() {
 const _lOooOIolo = _IloIIOlol / 1000;
 const _oloooloI = _lOloOoOOl.length;
 const _ooooololl = _OloIolOOO.length;
 let _llOoIO = _IIoOIIoIO[0];
 for (const _IIolol of _IIoOIIoIO) {
 if (_lOooOIolo >= _IIolol._lOooOIolo && _oloooloI >= _IIolol._lOloOoOOl && _ooooololl >= _IIolol._OloIolOOO) {
 _llOoIO = _IIolol;
 } else {
 break;
 }
 }
 return _llOoIO;
}
function _olloooIIl() {
 const _OoOlloll = _oOIOIloIo();
 const _lOooOIolo = _IloIIOlol / 1000;
 const _oloooloI = _lOloOoOOl.length;
 const _ooooololl = _OloIolOOO.length;
 const _oOIIOIIl = _IIoOIIoIO.find(r => r.level === _OoOlloll.level + 1);
 const _ooIOOo = document.getElementById("_OoOoIl-_IOlOlOOll-text");
 const _ollOlolI = document.getElementById("_OoOoIl-level-num");
 if (_ooIOOo) _ooIOOo.textContent = _OoOlloll._IOlOlOOll;
 if (_ollOlolI) _ollOlolI.textContent = _OoOlloll.level;
 const _OlOlllo = document.getElementById("prog-_oIoIlI-cur");
 const _oOolOI = document.getElementById("prog-_oIoIlI-bar");
 const _OoIoIlOo = document.getElementById("prog-_oIoIlI-_IoOlOl");
 if (_OlOlllo) _OlOlllo.textContent = _lOooOIolo.toFixed(2) + " km";
 if (_oOolOI && _OoIoIlOo) {
 if (!_oOIIOIIl) {
 _oOolOI.style.width = "100%";
 _OoIoIlOo.textContent = "최고 레벨 달성!";
 } else {
 const _oOoIllOooO = _oOIIOIIl._lOooOIolo > _OoOlloll._lOooOIolo
 ? Math.min(100, ((_lOooOIolo - _OoOlloll._lOooOIolo) / (_oOIIOIIl._lOooOIolo - _OoOlloll._lOooOIolo)) * 100)
 : 100;
 _oOolOI.style.width = _oOoIllOooO.toFixed(1) + "%";
 const _IllIIoOOol = Math.max(0, _oOIIOIIl._lOooOIolo - _lOooOIolo);
 _OoIoIlOo.textContent = _IllIIoOOol > 0.01 ? `다음까지 ${_IllIIoOOol.toFixed(1)}km` : "조건 충족!";
 }
 }
 const _lOlolOlO = document.getElementById("prog-mem-cur");
 const _lOlOIl = document.getElementById("prog-mem-bar");
 const _OoOlIl = document.getElementById("prog-mem-_IoOlOl");
 if (_lOlolOlO) _lOlolOlO.textContent = _oloooloI + " 개";
 if (_lOlOIl && _OoOlIl) {
 if (!_oOIIOIIl || _oOIIOIIl._lOloOoOOl === 0) {
 _lOlOIl.style.width = "100%";
 _OoOlIl.textContent = _oOIIOIIl ? "조건 없음" : "최고!";
 } else {
 const _oOoIllOooO = _oOIIOIIl._lOloOoOOl > _OoOlloll._lOloOoOOl
 ? Math.min(100, ((_oloooloI - _OoOlloll._lOloOoOOl) / (_oOIIOIIl._lOloOoOOl - _OoOlloll._lOloOoOOl)) * 100)
 : 100;
 _lOlOIl.style.width = _oOoIllOooO.toFixed(1) + "%";
 const _IllIIoOOol = Math.max(0, _oOIIOIIl._lOloOoOOl - _oloooloI);
 _OoOlIl.textContent = _IllIIoOOol > 0 ? `다음까지 ${_IllIIoOOol}개` : "조건 충족!";
 }
 }
 const _olIOIl = document.getElementById("prog-photo-cur");
 const _looIoloOOO = document.getElementById("prog-photo-bar");
 const _loooIoI = document.getElementById("prog-photo-_IoOlOl");
 if (_olIOIl) _olIOIl.textContent = _ooooololl + " 개";
 if (_looIoloOOO && _loooIoI) {
 if (!_oOIIOIIl || _oOIIOIIl._OloIolOOO === 0) {
 _looIoloOOO.style.width = "100%";
 _loooIoI.textContent = _oOIIOIIl ? "조건 없음" : "최고!";
 } else {
 const _oOoIllOooO = _oOIIOIIl._OloIolOOO > _OoOlloll._OloIolOOO
 ? Math.min(100, ((_ooooololl - _OoOlloll._OloIolOOO) / (_oOIIOIIl._OloIolOOO - _OoOlloll._OloIolOOO)) * 100)
 : 100;
 _looIoloOOO.style.width = _oOoIllOooO.toFixed(1) + "%";
 const _IllIIoOOol = Math.max(0, _oOIIOIIl._OloIolOOO - _ooooololl);
 _loooIoI.textContent = _IllIIoOOol > 0 ? `다음까지 ${_IllIIoOOol}개` : "조건 충족!";
 }
 }
}
function _IlOlOlOIOI() {
 const _OoIIOlo = _oOOOoOI();
 const _oIIIol = document.getElementById("_oIoIlI-_oooIOolIOI");
 const _oIOlIO = document.getElementById("today-_oIoIlI-_oooIOolIOI");
 const _oIIloll = document.getElementById("memory-count-_oooIOolIOI");
 const _ooOllolI = document.getElementById("photo-count-_oooIOolIOI");
 if (_oIIIol) _oIIIol.innerHTML = `${(_IloIIOlol / 1000).toFixed(2)}<span>km</span>`;
 if (_oIOlIO) _oIOlIO.innerHTML = `${(_OoIIOlo / 1000).toFixed(2)}<span>km</span>`;
 if (_oIIloll) _oIIloll.innerHTML = `${_lOloOoOOl.length}<span>개</span>`;
 if (_ooOllolI) _ooOllolI.innerHTML = `${_OloIolOOO.length}<span>개</span>`;
 _olloooIIl();
}
function toggleHud() {
 _lolloOOI = !_lolloOOI;
 document.getElementById("_OoOoIl").classList.toggle("expanded", _lolloOOI);
 document.getElementById("controls").classList.toggle("_OoOoIl-open", _lolloOOI);
 document.getElementById("help-btn").classList.toggle("_OoOoIl-open", _lolloOOI);
 if (_lolloOOI) {
 setTimeout(() => {
 document.addEventListener("click", _IIooolO);
 }, 0);
 } else {
 document.removeEventListener("click", _IIooolO);
 }
}
function _IIooolO(event) {
 const _OoOoIl = document.getElementById("_OoOoIl");
 if (!_OoOoIl.contains(event.target)) {
 _lolloOOI = false;
 _OoOoIl.classList.remove("expanded");
 document.getElementById("controls").classList.remove("_OoOoIl-open");
 document.getElementById("help-btn").classList.remove("_OoOoIl-open");
 document.removeEventListener("click", _IIooolO);
 }
}
function _IlOloIOoI() {
 _OoloIllIO.classList.toggle("recording", _IoIOlloO);
 _oOoOooIIll.textContent = _IoIOlloO ? "기록 중" : "대기 중";
 _oOoOooIIll.classList.toggle("recording", _IoIOlloO);
}
function _oOoIlIOOIO() {
 const _llIooOIOO = document.getElementById("fog-toggle-btn");
 const _OloIOI = document.getElementById("fog-toggle-state");
 if (!_llIooOIOO) return;
 _llIooOIOO.classList.toggle("on", _OloIlOOoo);
 _llIooOIOO.classList.toggle("off", !_OloIlOOoo);
 if (_OloIOI) {
 _OloIOI.textContent = _OloIlOOoo ? "켜짐" : "꺼짐";
 _OloIOI.classList.toggle("on", _OloIlOOoo);
 _OloIOI.classList.toggle("off", !_OloIlOOoo);
 }
}
function toggleHelp() {
 document.getElementById("help-popup").classList.toggle("show");
}
function handleHelpOverlayClick(event) {
 const _OOOOIlIoo = document.getElementById("help-content-_OOOOIlIoo");
 if (!_OOOOIlIoo.contains(event.target)) toggleHelp();
}
function switchHelpTab(tab) {
 ["ask", "info"].forEach(t => {
 document.getElementById("htab-" + t).classList.toggle("active", t === tab);
 document.getElementById("hpanel-" + t).style.display = t === tab ? "" : "none";
 });
}
function _OloIllOloI() {
 _IoIOlloO = false;
 _IlOloIOoI();
 _llIlOl();
}
function toggleRecording() {
 if (_IoIOlloO) {
 _IoIOlloO = false;
 _IlOloIOoI();
 _llIlOl();
 _OOIOoOoOO();
 _loOOolO();
 return;
 }
 _IoIOlloO = true;
 _IlOloIOoI();
 _IoloIolIl();
}
function toggleFog() {
 _OloIlOOoo = !_OloIlOOoo;
 localStorage.setItem(_lOOIOo, String(_OloIlOOoo));
 _oOoIlIOOIO();
 _ooOoIl();
}
function _IoloIolIl() {
 if (!navigator.geolocation) { alert("이 브라우저는 위치 추적을 지원하지 않습니다."); _OloIllOloI(); return; }
 if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
 alert("위치 추적은 HTTPS 또는 localhost에서만 동작합니다."); _OloIllOloI(); return;
 }
 _IolOOIoOII = navigator.geolocation.watchPosition(_oooooIIOII, _lIlOIIl,
 { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
}
function _llIlOl() {
 if (_IolOOIoOII !== null) { navigator.geolocation.clearWatch(_IolOOIoOII); _IolOOIoOII = null; }
}
function _oooooIIOII(position) {
 const _OIIoII = Number(position.coords._OIIoII) || Infinity;
 const _looooOoII = L.latLng(position.coords.latitude, position.coords.longitude);
 _oIlIOoO = _looooOoII;
 if (!_IOIlIo) {
 _IOIlIo = L._OlOIoOOI(_looooOoII, {
 _oOOIol: L.divIcon({ className: "player-_OlOIoOOI", iconSize: [18, 18] })
 }).addTo(map);
 map.setView(_looooOoII, 16);
 } else {
 _IOIlIo.setLatLng(_looooOoII);
 }
 if (!_IoIOlloO) return;
 if (_OIIoII > 100) { _oOoOooIIll.textContent = `GPS 너무 약함 (${Math.round(_OIIoII)}m)`; return; }
 _oOoOooIIll.textContent = _OIIoII > _lOIOIOOo ? `GPS 약함 (${Math.round(_OIIoII)}m)` : "기록 중";
 const _oIlIlI = Date._oIlIlI();
 if (_IoOoIl.length === 0) {
 _IoOoIl.push(_IOOIIII(_looooOoII, _oIlIlI));
 _IlOlOlOIOI(); _loOOolO(); _ooOoIl(); return;
 }
 const _looOIO = _IoOoIl[_IoOoIl.length - 1];
 const _oIoIlI = _lolIOol(_looooOoII, _looOIO);
 const _olIIllIl = _oIOlIlIllO(_OIIoII);
 if (_oIoIlI <= _olIIllIl) {
 _looOIO.endTime = _oIlIlI;
 _looOIO.visits = (_looOIO.visits || 1) + 1;
 _looOIO._OOooIlIOlO += (_looooOoII._OOooIlIOlO - _looOIO._OOooIlIOlO) * 0.3;
 _looOIO._lIllOO += (_looooOoII._lIllOO - _looOIO._lIllOO) * 0.3;
 } else {
 _IloIIOlol += _oIoIlI;
 _IoOoIl.push(_IOOIIII(_looooOoII, _oIlIlI));
 if (_IoOoIl.length > _lOOOOOo) _OOIOoOoOO();
 }
 _IlOlOlOIOI(); _loOOolO(); _ooOoIl();
}
function _lIlOIIl(err) {
 const _IIOIIoOo = { 1: "위치 권한이 거부되었습니다.", 2: "현재 위치를 확인할 수 없습니다.", 3: "위치 요청 시간이 초과되었습니다." };
 alert(_IIOIIoOo[err.code] || "위치 정보를 가져오지 못했습니다.");
 _OloIllOloI();
}
function _IOOIIII(_looooOoII, timestamp) {
 return { _OOooIlIOlO: _looooOoII._OOooIlIOlO, _lIllOO: _looooOoII._lIllOO, startTime: timestamp, endTime: timestamp, visits: 1 };
}
function _lolIOol(_looooOoII, _loIoOOIOol) { return _looooOoII.distanceTo([_loIoOOIOol._OOooIlIOlO, _loIoOOIOol._lIllOO]); }
function _oIOlIlIllO(_OIIoII) { return Math.max(_OollloI, Math.min(_OlOIOlol, _OIIoII * _llollOl)); }
function _oOOOoOI() {
 const _IOlOolIOll = new Date().setHours(0, 0, 0, 0);
 let _oIoIlI = 0;
 for (let i = 1; i < _IoOoIl.length; i++) {
 if (_IoOoIl[i].startTime >= _IOlOolIOll) {
 _oIoIlI += L.latLng(_IoOoIl[i]._OOooIlIOlO, _IoOoIl[i]._lIllOO)
 .distanceTo([_IoOoIl[i-1]._OOooIlIOlO, _IoOoIl[i-1]._lIllOO]);
 }
 }
 return _oIoIlI;
}
function _OOIOoOoOO() {
 if (_IoOoIl.length <= 1) return;
 const _oIIOOOlol = [];
 for (const _loIoOOIOol of _IoOoIl) {
 const _looOIO = _oIIOOOlol[_oIIOOOlol.length - 1];
 if (!_looOIO) { _oIIOOOlol.push({ ..._loIoOOIOol }); continue; }
 const _oIooIOIoI = _loIoOOIOol.startTime - _looOIO.endTime;
 const _oIoIlI = L.latLng(_loIoOOIOol._OOooIlIOlO, _loIoOOIOol._lIllOO).distanceTo([_looOIO._OOooIlIOlO, _looOIO._lIllOO]);
 if (_oIoIlI <= _OOOOOllo && _oIooIOIoI <= _OOlOIIolO) {
 const tv = (_looOIO.visits || 1) + (_loIoOOIOol.visits || 1);
 _looOIO._OOooIlIOlO = ((_looOIO._OOooIlIOlO * (_looOIO.visits || 1)) + (_loIoOOIOol._OOooIlIOlO * (_loIoOOIOol.visits || 1))) / tv;
 _looOIO._lIllOO = ((_looOIO._lIllOO * (_looOIO.visits || 1)) + (_loIoOOIOol._lIllOO * (_loIoOOIOol.visits || 1))) / tv;
 _looOIO.endTime = Math.max(_looOIO.endTime, _loIoOOIOol.endTime);
 _looOIO.visits = tv;
 } else { _oIIOOOlol.push({ ..._loIoOOIOol }); }
 }
 _IoOoIl = _lIOooolo(_oIIOOOlol, _lOOOOOo);
}
function _lIOooolo(points, maxPoints) {
 if (points.length <= maxPoints) return points;
 const _lOIlIlOoIo = Math.floor(maxPoints * 0.4);
 const _llIlOlI = points.slice(-_lOIlIlOoIo);
 const _olIIOoOll = points.slice(0, points.length - _lOIlIlOoIo);
 const _ollIollIo = Math.ceil(_olIIOoOll.length / (maxPoints - _lOIlIlOoIo));
 return [..._olIIOoOll.filter((_, i) => i % _ollIollIo === 0), ..._llIlOlI].slice(-maxPoints);
}
function addMemory() {
 if (!_oIlIOoO) { alert("위치 정보를 수신 중입니다."); return; }
 const _IllooOOoI = prompt("이 장소의 이름을 입력하세요:", "새로운 발견");
 if (_IllooOOoI === null) return;
 const _oIlIlI = new Date();
 const _llloOO = {
 id: String(_oIlIlI.getTime()), _OOooIlIOlO: _oIlIOoO._OOooIlIOlO, _lIllOO: _oIlIOoO._lIllOO,
 _IOOlII: _OOOlllO(_IllooOOoI.trim() || "기억의 지점"), time: _oIlIlI.getTime(),
 dateString: _oIlIlI.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }),
 timeString: _oIlIlI.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
 };
 _lOloOoOOl.push(_llloOO);
 _IIIoOIoI(_llloOO, true);
 updateMemoryList();
 _IlOlOlOIOI();
 _loOOolO();
}
function _IIIoOIoI(_llloOO, openPopup = false) {
 const _OlOIoOOI = L._OlOIoOOI([_llloOO._OOooIlIOlO, _llloOO._lIllOO], {
 pane: "memoryPane",
 _oOOIol: L.divIcon({ className: "memory-_OlOIoOOI", html: "★", iconSize: [28, 28] })
 }).addTo(map);
 const _looollOI = document.createElement("div");
 const _IOlOlOOll = document.createElement("b"); _IOlOlOOll.textContent = _llloOO._IOOlII;
 const info = document.createElement("small"); info.style.display = "block";
 info.textContent = `${_llloOO.dateString} ${_llloOO.timeString || ""}`;
 const _ololllOol = document.createElement("button");
 _ololllOol.className = "popup-delete-btn"; _ololllOol.textContent = "삭제";
 _ololllOol.addEventListener("click", () => deleteMemory(_llloOO.id));
 _looollOI.appendChild(_IOlOlOOll); _looollOI.appendChild(document.createElement("br"));
 _looollOI.appendChild(info); _looollOI.appendChild(_ololllOol);
 _OlOIoOOI.bindPopup(_looollOI);
 _oIIIoll.set(_llloOO.id, _OlOIoOOI);
 if (openPopup) _OlOIoOOI.openPopup();
}
function deleteMemory(id) {
 _lOloOoOOl = _lOloOoOOl.filter(m => m.id !== id);
 const _OlOIoOOI = _oIIIoll.get(id);
 if (_OlOIoOOI) { map.removeLayer(_OlOIoOOI); _oIIIoll.delete(id); }
 updateMemoryList(); _IlOlOlOIOI(); _loOOolO();
}
function updateMemoryList() {
 const _lOOlOI = document.getElementById("memory-list-_lOOlOI");
 if (!_lOOlOI) return;
 if (_lOloOoOOl.length === 0) { _lOOlOI.innerHTML = '<p class="empty-message">아직 기록이 없습니다.</p>'; return; }
 _lOOlOI.innerHTML = "";
 [..._lOloOoOOl].reverse().forEach(memo => {
 const _IIolOoOoOI = document.createElement("div"); _IIolOoOoOI.className = "memory-_IIolOoOoOI";
 const _IOOlII = document.createElement("span"); _IOOlII.className = "_IIolOoOoOI-_IOOlII"; _IOOlII.textContent = "★ " + memo._IOOlII;
 const _OOOIlIO = document.createElement("span"); _OOOIlIO.className = "_IIolOoOoOI-_OOOIlIO"; _OOOIlIO.textContent = `${memo.dateString} ${memo.timeString || ""}`;
 const _olOloIloIl = document.createElement("div"); _olOloIloIl.className = "memory-_olOloIloIl";
 const _OolooIoOI = document.createElement("button"); _OolooIoOI.className = "memory-action-btn move"; _OolooIoOI.textContent = "이동";
 _OolooIoOI.addEventListener("click", e => { e.stopPropagation(); map.flyTo([memo._OOooIlIOlO, memo._lIllOO], 17); });
 const _ololllOol = document.createElement("button"); _ololllOol.className = "memory-action-btn delete"; _ololllOol.textContent = "삭제";
 _ololllOol.addEventListener("click", e => { e.stopPropagation(); deleteMemory(memo.id); });
 _olOloIloIl.appendChild(_OolooIoOI); _olOloIloIl.appendChild(_ololllOol);
 _IIolOoOoOI.appendChild(_IOOlII); _IIolOoOoOI.appendChild(_OOOIlIO); _IIolOoOoOI.appendChild(_olOloIloIl);
 _IIolOoOoOI.addEventListener("click", () => { map.flyTo([memo._OOooIlIOlO, memo._lIllOO], 17); toggleSidebar(false); });
 _lOOlOI.appendChild(_IIolOoOoOI);
 });
}
function switchTab(tab) {
 ["memory", "photo", "gpx"].forEach(t => {
 document.getElementById("tab-" + t).classList.toggle("active", t === tab);
 document.getElementById("panel-" + t).style.display = t === tab ? "" : "none";
 });
 if (tab === "photo") updatePhotoList();
 if (tab === "gpx") updateGpxSavedList();
}
function updatePhotoList() {
 const _lOOlOI = document.getElementById("photo-list-_lOOlOI");
 if (!_lOOlOI) return;
 if (_OloIolOOO.length === 0) { _lOOlOI.innerHTML = '<p class="empty-message" style="grid-column:1/-1">아직 사진이 없습니다.</p>'; return; }
 _lOOlOI.innerHTML = "";
 [..._OloIolOOO].reverse().forEach(p => {
 const _IIolOoOoOI = document.createElement("div"); _IIolOoOoOI.className = "photo-list-_IIolOoOoOI";
 const _IIOoooOloo = document.createElement("_IIOoooOloo"); _IIOoooOloo.src = p.photo;
 const _OOOIlIO = document.createElement("div"); _OOOIlIO.className = "photo-list-_OOOIlIO"; _OOOIlIO.textContent = p.dateString;
 const _oOIlOIlO = document.createElement("div"); _oOIlOIlO.className = "photo-list-_oOIlOIlO"; _oOIlOIlO.textContent = "✕";
 _oOIlOIlO.addEventListener("click", e => { e.stopPropagation(); deletePhoto(p.id); updatePhotoList(); });
 _IIolOoOoOI.addEventListener("click", () => {
 map.flyTo([p._OOooIlIOlO, p._lIllOO], 17);
 const _OlOIoOOI = _OIOolOlOIO.get(p.id);
 if (_OlOIoOOI) _OlOIoOOI.openPopup();
 toggleSidebar(false);
 });
 _IIolOoOoOI.appendChild(_IIOoooOloo); _IIolOoOoOI.appendChild(_OOOIlIO); _IIolOoOoOI.appendChild(_oOIlOIlO);
 _lOOlOI.appendChild(_IIolOoOoOI);
 });
}
function adjustHourDial(dir) {
 const _IoOlOl = _loOIIllI + dir;
 if (_IoOlOl < 1 || _IoOlOl > 20) return;
 _loOIIllI = _IoOlOl;
 updateDialUI();
}
function updateDialUI() {
 const _OoOllIO = document.getElementById("dial-hour-label");
 const _OloIOOOIIl = document.getElementById("gpx-range-info");
 if (_OoOllIO) _OoOllIO.textContent = _loOIIllI + "시간";
 if (_OloIOOOIIl) _OloIOOOIIl.textContent = `오늘 기준 최근 ${_loOIIllI}시간 발걸음`;
}
function exportGpx() {
 const _olIOoOOoOI = Date._oIlIlI() - _loOIIllI * 60 * 60 * 1000;
 const _lOlloIIoI = _IoOoIl.filter(p => p.startTime >= _olIOoOOoOI);
 if (_lOlloIIoI.length === 0) { alert("해당 시간에 기록된 발걸음이 없습니다."); return; }
 const _OllOoIoo = document.getElementById("gpx-export-_IOOlII").value.trim();
 const _IOOlII = _OllOoIoo || `발걸음 최근${_loOIIllI}시간`;
 const _oOIOOo = _lOlloIIoI.map(p => {
 const t = new Date(p.startTime).toISOString();
 return ` <trkpt _OOooIlIOlO="${p._OOooIlIOlO.toFixed(7)}" lon="${p._lIllOO.toFixed(7)}">\n <time>${t}</time>\n </trkpt>`;
 }).join("\n");
 const _IOllIol =
`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Giloa - 나의 대동여지도"
 xmlns="http:
 <metadata>
 <_IOOlII>${_IOOlII}</_IOOlII>
 <time>${new Date().toISOString()}</time>
 </metadata>
 <trk>
 <_IOOlII>${_IOOlII}</_IOOlII>
 <trkseg>
${_oOIOOo}
 </trkseg>
 </trk>
</gpx>`;
 const _oIOIoOlo = _oIOlOolO();
 const id = String(Date._oIlIlI());
 _oIOIoOlo.push({ id, _IOOlII, createdAt: Date._oIlIlI(), pointCount: _lOlloIIoI.length, _IOllIol });
 _ooIllIO(_oIOIoOlo);
 updateGpxSavedList();
 const _OlolOOIII = new Blob([_IOllIol], { type: "application/gpx+xml" });
 const _OOOllo = URL.createObjectURL(_OlolOOIII);
 const a = document.createElement("a");
 a.href = _OOOllo; a.download = `giloa_${_IOOlII}.gpx`; a.click();
 URL.revokeObjectURL(_OOOllo);
 document.getElementById("gpx-export-_IOOlII").value = "";
 document.getElementById("gpx-import-status").textContent = `✓ "${_IOOlII}" 저장 완료`;
}
function _oIOlOolO() { try { return JSON.parse(localStorage.getItem(_loOolOI) || "[]"); } catch { return []; } }
function _ooIllIO(_oIOIoOlo) { localStorage.setItem(_loOolOI, JSON.stringify(_oIOIoOlo)); }
function updateGpxSavedList() {
 const _lOOlOI = document.getElementById("gpx-_lllOllol-list");
 if (!_lOOlOI) return;
 const _oIOIoOlo = _oIOlOolO();
 if (_oIOIoOlo.length === 0) { _lOOlOI.innerHTML = '<p class="empty-message">저장된 발걸음이 없습니다.</p>'; return; }
 _lOOlOI.innerHTML = "";
 [..._oIOIoOlo].reverse().forEach(s => {
 const _IIolOoOoOI = document.createElement("div");
 _IIolOoOoOI.className = "gpx-_lllOllol-_IIolOoOoOI" + (s.id === _ooIoIlOOl ? " active-route" : "");
 const _oOOIol = document.createElement("span"); _oOOIol.className = "gpx-_lllOllol-_oOOIol";
 _oOOIol.textContent = s.id === _ooIoIlOOl ? "🔵" : "👣";
 const info = document.createElement("div"); info.className = "gpx-_lllOllol-info";
 const _IOIOlI = document.createElement("div"); _IOIOlI.className = "gpx-_lllOllol-_IOOlII"; _IOIOlI.textContent = s._IOOlII;
 const _oIOIlI = document.createElement("div"); _oIOIlI.className = "gpx-_lllOllol-_oIOIlI";
 _oIOIlI.textContent = `${new Date(s.createdAt).toLocaleDateString("ko-KR")} · ${s.pointCount}개 포인트`;
 info.appendChild(_IOIOlI); info.appendChild(_oIOIlI);
 const _oOIlOIlO = document.createElement("div"); _oOIlOIlO.className = "gpx-_lllOllol-_oOIlOIlO"; _oOIlOIlO.textContent = "✕";
 _oOIlOIlO.addEventListener("click", e => { e.stopPropagation(); deleteGpxSave(s.id); });
 _IIolOoOoOI.appendChild(_oOOIol); _IIolOoOoOI.appendChild(info); _IIolOoOoOI.appendChild(_oOIlOIlO);
 _IIolOoOoOI.addEventListener("click", () => toggleGpxRoute(s));
 _lOOlOI.appendChild(_IIolOoOoOI);
 });
}
function deleteGpxSave(id) {
 if (id === _ooIoIlOOl) _oOoIIOOoo();
 _ooIllIO(_oIOlOolO().filter(s => s.id !== id));
 updateGpxSavedList();
}
function toggleGpxRoute(save) {
 if (_ooIoIlOOl === save.id) { _oOoIIOOoo(); updateGpxSavedList(); return; }
 _oOoIIOOoo(); _lOoIooOo(save._IOllIol, save.id); updateGpxSavedList(); toggleSidebar(false);
}
function _oOoIIOOoo() {
 _IIOllloo.forEach(l => map.removeLayer(l));
 _IIOllloo = []; _ooIoIlOOl = null;
}
function _lOoIooOo(_IOllIol, id) {
 const _OolIOOllIO = new DOMParser();
 const _oIIllll = _OolIOOllIO.parseFromString(_IOllIol, "application/xml");
 const _oOIOOo = _oIIllll.querySelectorAll("trkpt");
 const _oOoIIIIOOo = [];
 _oOIOOo.forEach(pt => {
 const _OOooIlIOlO = parseFloat(pt.getAttribute("_OOooIlIOlO"));
 const _lIllOO = parseFloat(pt.getAttribute("lon"));
 if (isFinite(_OOooIlIOlO) && isFinite(_lIllOO)) _oOoIIIIOOo.push([_OOooIlIOlO, _lIllOO]);
 });
 if (_oOoIIIIOOo.length === 0) return;
 const _ollOIlO = L._ollOIlO(_oOoIIIIOOo, { color: "#4db8ff", weight: 4, opacity: 0.85, dashArray: "8, 6" }).addTo(map);
 const _oOIOooOI = L.circleMarker(_oOoIIIIOOo[0], { _loolOo: 7, color: "#4db8ff", fillColor: "#fff", fillOpacity: 1, weight: 2.5 }).addTo(map).bindTooltip("출발");
 const _lIIlIlo = L.circleMarker(_oOoIIIIOOo[_oOoIIIIOOo.length - 1], { _loolOo: 7, color: "#ff6b6b", fillColor: "#fff", fillOpacity: 1, weight: 2.5 }).addTo(map).bindTooltip("도착");
 _IIOllloo = [_ollOIlO, _oOIOooOI, _lIIlIlo]; _ooIoIlOOl = id;
 map.fitBounds(_ollOIlO.getBounds(), { padding: [50, 50] });
}
function importGpxFile(event) {
 const _oolOoo = event.target.files[0]; if (!_oolOoo) return;
 const _lOOoIIlloo = document.getElementById("gpx-import-status");
 _lOOoIIlloo.textContent = "읽는 중...";
 const _IOoIloI = new FileReader();
 _IOoIloI.onload = function(e) {
 try {
 const _IOOlII = _oolOoo._IOOlII.replace(".gpx", "");
 const _IOllIol = e.target.result;
 const _oOIOOo = new DOMParser().parseFromString(_IOllIol, "application/xml").querySelectorAll("trkpt");
 if (_oOIOOo.length === 0) { _lOOoIIlloo.textContent = "경로 없음"; return; }
 const _oIOIoOlo = _oIOlOolO(); const id = String(Date._oIlIlI());
 _oIOIoOlo.push({ id, _IOOlII, createdAt: Date._oIlIlI(), pointCount: _oOIOOo.length, _IOllIol });
 _ooIllIO(_oIOIoOlo);
 _oOoIIOOoo(); _lOoIooOo(_IOllIol, id); updateGpxSavedList();
 _lOOoIIlloo.textContent = `✓ "${_IOOlII}" 불러오기 완료`; toggleSidebar(false);
 } catch (err) { _lOOoIIlloo.textContent = "파일을 읽지 못했습니다."; console.error(err); }
 };
 _IOoIloI.readAsText(_oolOoo); event.target.value = "";
}
function toggleSidebar(forceOpen) {
 const _loIoIoOIO = document.getElementById("_loIoIoOIO");
 const _llIlIOIoO = document.getElementById("_loIoIoOIO-_llIlIOIoO");
 if (!_loIoIoOIO || !_llIlIOIoO) return;
 const _OlllIloIIO = typeof forceOpen === "boolean" ? forceOpen : !_loIoIoOIO.classList.contains("open");
 _loIoIoOIO.classList.toggle("open", _OlllIloIIO);
 _llIlIOIoO.classList.toggle("show", _OlllIloIIO);
}
function centerMap() { if (_oIlIOoO) map.panTo(_oIlIOoO); }
function _loOOolO() {
 if (_IOlOOooll !== null) clearTimeout(_IOlOOooll);
 _IOlOOooll = setTimeout(() => { _IOlOOooll = null; _OOIOoOoOO(); _IoooIollol(); }, _OllloOIIII);
}
function _IoooIollol() {
 try {
 localStorage.setItem(_oIooollIoO, JSON.stringify({
 _IoOoIl: _IoOoIl.map(p => ({ _OOooIlIOlO: p._OOooIlIOlO, _lIllOO: p._lIllOO, startTime: p.startTime, endTime: p.endTime, visits: p.visits || 1 })),
 _lOloOoOOl: _lOloOoOOl.map(m => ({ id: m.id, _OOooIlIOlO: m._OOooIlIOlO, _lIllOO: m._lIllOO, _IOOlII: m._IOOlII, time: m.time, dateString: m.dateString, timeString: m.timeString })),
 _OloIolOOO: _OloIolOOO.map(p => ({ id: p.id, _OOooIlIOlO: p._OOooIlIOlO, _lIllOO: p._lIllOO, photo: p.photo, time: p.time, dateString: p.dateString, timeString: p.timeString })),
 _IloIIOlol
 }));
 } catch (e) { console.error("저장 실패", e); }
}
function _IOlOOIOl() {
 try {
 const _IOoOlO = localStorage.getItem(_oIooollIoO); if (!_IOoOlO) return;
 const _lllOllol = JSON.parse(_IOoOlO);
 if (Array.isArray(_lllOllol._IoOoIl)) {
 _IoOoIl = _lllOllol._IoOoIl
 .filter(p => isFinite(p._OOooIlIOlO) && isFinite(p._lIllOO) && isFinite(p.startTime) && isFinite(p.endTime))
 .map(p => ({ _OOooIlIOlO: p._OOooIlIOlO, _lIllOO: p._lIllOO, startTime: p.startTime, endTime: p.endTime, visits: isFinite(p.visits) ? p.visits : 1 }));
 }
 if (Array.isArray(_lllOllol._lOloOoOOl)) {
 _lOloOoOOl = _lllOllol._lOloOoOOl
 .filter(m => isFinite(m._OOooIlIOlO) && isFinite(m._lIllOO) && typeof m._IOOlII === "string")
 .map(m => ({
 id: typeof m.id === "string" ? m.id : String(m.time),
 _OOooIlIOlO: m._OOooIlIOlO, _lIllOO: m._lIllOO, _IOOlII: m._IOOlII, time: m.time,
 dateString: m.dateString,
 timeString: typeof m.timeString === "string" ? m.timeString
 : new Date(m.time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
 }));
 }
 if (isFinite(_lllOllol._IloIIOlol)) _IloIIOlol = _lllOllol._IloIIOlol;
 if (Array.isArray(_lllOllol._OloIolOOO)) {
 _OloIolOOO = _lllOllol._OloIolOOO.filter(p => isFinite(p._OOooIlIOlO) && isFinite(p._lIllOO) && typeof p.photo === "string");
 }
 const _IIIIIOoo = localStorage.getItem(_lOOIOo);
 if (_IIIIIOoo !== null) _OloIlOOoo = _IIIIIOoo === "true";
 _OOIOoOoOO();
 } catch (e) { console.error("복원 실패", e); }
}
function handlePhoto(event) {
 const _oolOoo = event.target.files[0]; if (!_oolOoo) return;
 const _OIOllIol = new FileReader();
 _OIOllIol.onload = function(ae) {
 const _IllIOOOIlo = _OIOlllll(ae.target.result);
 const _IOoIloI = new FileReader();
 _IOoIloI.onload = function(e) {
 const _oIlIlI = new Date();
 const _IIOoooOloo = new Image();
 _IIOoooOloo.onload = function() {
 const _lOoIOo = document.createElement("_lOoIOo");
 const _OoloolIOO = 400;
 let w = _IIOoooOloo.width, h = _IIOoooOloo.height;
 if (w > h && w > _OoloolIOO) { h = h * _OoloolIOO / w; w = _OoloolIOO; }
 else if (h > _OoloolIOO) { w = w * _OoloolIOO / h; h = _OoloolIOO; }
 _lOoIOo.width = w; _lOoIOo.height = h;
 _lOoIOo.getContext("2d").drawImage(_IIOoooOloo, 0, 0, w, h);
 const _lOOOOl = _lOoIOo.toDataURL("image/jpeg", 0.6);
 const _OOooIlIOlO = _IllIOOOIlo ? _IllIOOOIlo._OOooIlIOlO : (_oIlIOoO ? _oIlIOoO._OOooIlIOlO : null);
 const _lIllOO = _IllIOOOIlo ? _IllIOOOIlo._lIllOO : (_oIlIOoO ? _oIlIOoO._lIllOO : null);
 if (!_OOooIlIOlO || !_lIllOO) { alert("사진에 위치 정보가 없고 현재 위치도 수신 중입니다."); return; }
 if (!_IllIOOOIlo && _oIlIOoO) alert("사진에 위치 정보가 없어 현재 위치에 저장합니다.");
 const _llloOO = {
 id: String(_oIlIlI.getTime()), _OOooIlIOlO, _lIllOO, photo: _lOOOOl, time: _oIlIlI.getTime(),
 dateString: _oIlIlI.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }),
 timeString: _oIlIlI.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
 };
 _OloIolOOO.push(_llloOO); _olIIIOI(_llloOO, true);
 map.flyTo([_OOooIlIOlO, _lIllOO], 17); _IlOlOlOIOI(); _loOOolO();
 };
 _IIOoooOloo.src = e.target.result;
 };
 _IOoIloI.readAsDataURL(_oolOoo);
 };
 _OIOllIol.readAsArrayBuffer(_oolOoo);
 event.target.value = "";
}
function _OIOlllll(buffer) {
 const _OllIlIo = new DataView(buffer);
 if (_OllIlIo.getUint16(0) !== 0xFFD8) return null;
 let _llOloo = 2;
 while (_llOloo < _OllIlIo.byteLength) {
 const _OlOIoOOI = _OllIlIo.getUint16(_llOloo); _llOloo += 2;
 if (_OlOIoOOI === 0xFFE1) {
 const _IOOIIoOoOO = String.fromCharCode(_OllIlIo.getUint8(_llOloo+2), _OllIlIo.getUint8(_llOloo+3), _OllIlIo.getUint8(_llOloo+4), _OllIlIo.getUint8(_llOloo+5));
 if (_IOOIIoOoOO !== "Exif") break;
 const _IIoIIl = _llOloo + 8;
 const _OIoIIl = _OllIlIo.getUint16(_IIoIIl) === 0x4949;
 const _lOOIIolOl = o => _OllIlIo.getUint16(_IIoIIl + o, _OIoIIl);
 const _OlooIIoIOo = o => _OllIlIo.getUint32(_IIoIIl + o, _OIoIIl);
 const _ooIIOoll = _OlooIIoIOo(4); const _IlIolloI = _lOOIIolOl(_ooIIOoll);
 let _OIIolIO = null;
 for (let i = 0; i < _IlIolloI; i++) {
 const e = _ooIIOoll + 2 + i * 12;
 if (_lOOIIolOl(e) === 0x8825) _OIIolIO = _OlooIIoIOo(e + 8);
 }
 if (_OIIolIO === null) return null;
 const _IIOoloO = _lOOIIolOl(_OIIolIO);
 let _lloIoOIO, _OOooIlIOlO, lngRef, _lIllOO;
 for (let i = 0; i < _IIOoloO; i++) {
 const e = _OIIolIO + 2 + i * 12; const _IOOoOOol = _lOOIIolOl(e); const vo = _OlooIIoIOo(e + 8);
 if (_IOOoOOol === 1) _lloIoOIO = String.fromCharCode(_OllIlIo.getUint8(_IIoIIl + vo));
 if (_IOOoOOol === 3) lngRef = String.fromCharCode(_OllIlIo.getUint8(_IIoIIl + vo));
 if (_IOOoOOol === 2 || _IOOoOOol === 4) {
 const _oooIOolIOI = _OlooIIoIOo(vo)/_OlooIIoIOo(vo+4) + _OlooIIoIOo(vo+8)/_OlooIIoIOo(vo+12)/60 + _OlooIIoIOo(vo+16)/_OlooIIoIOo(vo+20)/3600;
 if (_IOOoOOol === 2) _OOooIlIOlO = _oooIOolIOI; if (_IOOoOOol === 4) _lIllOO = _oooIOolIOI;
 }
 }
 if (_OOooIlIOlO == null || _lIllOO == null) return null;
 return { _OOooIlIOlO: _lloIoOIO === "S" ? -_OOooIlIOlO : _OOooIlIOlO, _lIllOO: lngRef === "W" ? -_lIllOO : _lIllOO };
 }
 _llOloo += _OllIlIo.getUint16(_llOloo);
 }
 return null;
}
function _olIIIOI(_llloOO, openPopup = false) {
 const _OlOIoOOI = L._OlOIoOOI([_llloOO._OOooIlIOlO, _llloOO._lIllOO], {
 pane: "memoryPane",
 _oOOIol: L.divIcon({ className: "photo-_OlOIoOOI", html: `<_IIOoooOloo src="${_llloOO.photo}" />`, iconSize: [44, 44], iconAnchor: [22, 44] })
 }).addTo(map);
 const _looollOI = document.createElement("div"); _looollOI.className = "photo-popup";
 const _IIOoooOloo = document.createElement("_IIOoooOloo"); _IIOoooOloo.src = _llloOO.photo;
 const info = document.createElement("div");
 info.style.cssText = "font-size:12px;color:rgba(255,255,255,0.6);text-align:_IlOIlOIloO;margin:6px 0 8px;";
 info.textContent = `${_llloOO.dateString} ${_llloOO.timeString}`;
 const _ololllOol = document.createElement("button"); _ololllOol.className = "popup-delete-btn"; _ololllOol.textContent = "사진 삭제";
 _ololllOol.addEventListener("click", () => { deletePhoto(_llloOO.id); _OlOIoOOI.closePopup(); });
 _looollOI.appendChild(_IIOoooOloo); _looollOI.appendChild(info); _looollOI.appendChild(_ololllOol);
 _OlOIoOOI.bindPopup(_looollOI); _OIOolOlOIO.set(_llloOO.id, _OlOIoOOI);
 if (openPopup) _OlOIoOOI.openPopup();
}
function deletePhoto(id) {
 _OloIolOOO = _OloIolOOO.filter(p => p.id !== id);
 const _OlOIoOOI = _OIOolOlOIO.get(id);
 if (_OlOIoOOI) { map.removeLayer(_OlOIoOOI); _OIOolOlOIO.delete(id); }
 _IlOlOlOIOI(); _loOOolO();
}
function _OOOlllO(value) {
 return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function _OoooIolO() { _lOloOoOOl.forEach(m => _IIIoOIoI(m, false)); }
function _oIolIOo() { _OloIolOOO.forEach(p => _olIIIOI(p, false)); }
function _oloOIOoOO() { _loOIIllI = 12; updateDialUI(); }
function init() {
 _OOIIlII();
 _IOlOOIOl();
 _OoooIolO();
 _oIolIOo();
 _IlOlOlOIOI(); 
 updateMemoryList();
 _IlOloIOoI();
 _oOoIlIOOIO();
 _ooOoIl();
 _oloOIOoOO();
}
map.whenReady(() => init());
// ===== 走動小熊（選用）=====
// 打開後，本週抽到的熊會在畫面底部走來走去。純前端就做得到：
// 一個固定在畫面底部的透明圖層 + requestAnimationFrame 每幀移動位置；圖層不接收滑鼠事件（pointer-events:none），不會擋到任何按鈕。
// 開關記在這個瀏覽器的 localStorage（跟 Key 一樣不進備份檔）。
// 需要 app.js、game.js 先載入（mk、$、weekBears，以及 game.js 發出的 bears-changed 事件）
const ROAM_KEY = 'studyhub.roam';
const ROAM_MAX = 12;            // 同時最多走動幾隻（太多會擠、也比較耗效能）
const ROAM_SIZE = 56;           // 小熊大小（px），要和 style.css 的 .rbear 一致
const ROAM_FACES_RIGHT = true;  // 你的圖片預設是面向右邊嗎？如果小熊都倒退走，改成 false
const roamReduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; // 系統設定「減少動態效果」時不移動
let roamOn = false; try { roamOn = localStorage.getItem(ROAM_KEY) === '1'; } catch { }
let roamList = [], roamLayer = null, roamRaf = 0, roamLast = 0;
const roamItems = new Map(); // key → { el, inner, x, y, v, dir, idle, next }

function roamFit() { // 圖層避開左邊的側邊欄（手機版側邊欄在上方，就整個寬度都用）
    const s = document.querySelector('.side'); let left = 0;
    if (s) { const r = s.getBoundingClientRect(); if (r.left < 4 && r.width < innerWidth * 0.5) left = r.right; }
    roamLayer.style.left = left + 'px';
}
function roamPaint(it) {
    it.el.style.transform = `translate(${it.x}px, ${-it.y}px)`;
    it.inner.style.transform = `scaleX(${(it.dir > 0) === ROAM_FACES_RIGHT ? 1 : -1})`;
    it.el.classList.toggle('walk', it.idle <= 0 && !roamReduce);
}
function roamAdd(key, b) {
    const el = mk('div', { className: 'rbear' }), inner = mk('div', { className: 'rin' }), emoji = () => mk('span', { className: 'remo' }, '🧸');
    if (b.src) { const img = mk('img', { src: b.src, alt: '', draggable: false }); img.onerror = () => img.replaceWith(emoji()); inner.append(img); }
    else inner.append(emoji());
    el.append(inner); roamLayer.append(el);
    const W = Math.max(0, roamLayer.clientWidth - ROAM_SIZE);
    const it = { el, inner, x: Math.random() * W, y: Math.random() * 18, v: 22 + Math.random() * 38, dir: Math.random() < 0.5 ? -1 : 1, idle: 0, next: 2 + Math.random() * 5 };
    roamItems.set(key, it); roamPaint(it);
}
function roamTick(ts) {
    roamRaf = requestAnimationFrame(roamTick);
    const dt = Math.min((ts - (roamLast || ts)) / 1000, 0.1); roamLast = ts; // 分頁切到背景再回來時，不要讓小熊瞬間跳很遠
    const W = Math.max(0, roamLayer.clientWidth - ROAM_SIZE);
    roamItems.forEach(it => {
        if (it.idle > 0) it.idle -= dt;
        else {
            it.x += it.dir * it.v * dt;
            if (it.x <= 0) { it.x = 0; it.dir = 1; } else if (it.x >= W) { it.x = W; it.dir = -1; }
            it.next -= dt;
            if (it.next <= 0) { it.next = 3 + Math.random() * 6; if (Math.random() < 0.6) it.idle = 1 + Math.random() * 2.5; else it.dir *= -1; } // 偶爾停下來發呆，偶爾回頭
        }
        roamPaint(it);
    });
}
function roamStop() {
    cancelAnimationFrame(roamRaf); roamRaf = 0; roamLast = 0; roamItems.clear();
    if (roamLayer) roamLayer.innerHTML = '';
}
function roamRefresh() {
    if (!roamOn) { roamStop(); return; }
    if (!roamLayer) { roamLayer = mk('div', { id: 'roamLayer' }); roamLayer.setAttribute('aria-hidden', 'true'); document.body.append(roamLayer); }
    roamFit();
    const off = Math.max(0, roamList.length - ROAM_MAX), want = new Map();
    roamList.slice(-ROAM_MAX).forEach((b, i) => want.set((off + i) + ':' + b.t, b)); // 熊的 key：在本週清單的位置 + 時間，新增的熊不會讓舊的重畫
    roamItems.forEach((it, key) => { if (!want.has(key)) { it.el.remove(); roamItems.delete(key); } });
    want.forEach((b, key) => { if (!roamItems.has(key)) roamAdd(key, b); });
    if (!roamReduce && !roamRaf && roamItems.size) roamRaf = requestAnimationFrame(roamTick);
}
document.addEventListener('bears-changed', e => { roamList = e.detail || []; roamRefresh(); });
window.addEventListener('resize', () => { if (roamLayer) roamFit(); });

$('#gRoam').checked = roamOn;
if (roamReduce) $('#gRoamNote').textContent = '（你的系統設定為「減少動態效果」，所以小熊只會站在畫面底部不動）';
$('#gRoam').onchange = e => {
    roamOn = e.target.checked;
    try { localStorage.setItem(ROAM_KEY, roamOn ? '1' : '0'); } catch { }
    roamRefresh();
};
roamList = weekBears(); roamRefresh();
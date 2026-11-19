// ===== 走動小熊 =====
// 在「每週挑戰」的熊熊舞台上點一下熊，它就會跑到畫面底部走來走去（再點一次收回）。預設一隻都不走，等於「自己開啟」。
// 純前端：一個蓋住整個視窗的透明圖層 + requestAnimationFrame 每幀移動位置；
// 圖層本身不接收滑鼠事件，只有小熊會（所以小熊會擋到它底下的按鈕，這是刻意的）。
// 走動中的熊：按住拖曳 = 移動，放開的位置就是新的「地面」，它會在那個高度繼續左右走動（不會掉下去）；
// 單純點一下（沒拖動）= 暫停，再點一下 = 繼續走。
// 選了哪些熊記在 db.game.roam（會跟著備份）：{ all: 是否全選（之後抽到的新熊也自動加入）, ids: 被選的熊 id }
// 需要 app.js、game.js 先載入（mk、$、save、gm、weekBears，以及 game.js 發出的 bears-changed 事件）
const ROAM_SIZE = 56;           // 小熊大小（px），要和 style.css 的 .rbear 一致
const ROAM_FACES_RIGHT = true;  // 你的圖片預設是面向右邊嗎？如果小熊都倒退走，改成 false
const roamReduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; // 系統設定「減少動態效果」時不自己走動、不做掉落動畫
let roamList = [], roamLayer = null, roamRaf = 0, roamLast = 0;
const roamItems = new Map(); // 熊的 id → { el, inner, x, y, gy, vy, v, dir, idle, next, drag, lx }
const clamp = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b));

const roamCfg = () => { const g = gm(); const r = g.roam = g.roam || { all: false, ids: [] }; r.ids = r.ids || []; return r; };
const roamSel = b => roamCfg().all || roamCfg().ids.includes(b.id);

// ---- 舞台上的選取狀態 ----
function roamMark() {
    document.querySelectorAll('#gStage .bear[data-id]').forEach(el => {
        const on = roamSel({ id: el.dataset.id }); el.classList.toggle('sel', on); el.setAttribute('aria-pressed', on);
    });
    const n = roamList.filter(roamSel).length;
    $('#gRoamInfo').textContent = `走動中 ${n} 隻 / 本週 ${roamList.length} 隻`;
}
function roamToggle(id) {
    const r = roamCfg();
    if (r.all) { r.all = false; r.ids = roamList.map(b => b.id).filter(x => x !== id); } // 全選狀態下點一隻 = 把這隻收回
    else { const i = r.ids.indexOf(id); if (i >= 0) r.ids.splice(i, 1); else r.ids.push(id); }
    save(); roamMark(); roamRefresh();
}
$('#gStage').onclick = e => { const el = e.target.closest('.bear[data-id]'); if (el) roamToggle(el.dataset.id); };
$('#gStage').onkeydown = e => { if (e.key !== 'Enter' && e.key !== ' ') return; const el = e.target.closest('.bear[data-id]'); if (el) { e.preventDefault(); roamToggle(el.dataset.id); } };
$('#gRoamAll').onclick = () => { const r = roamCfg(); r.all = true; r.ids = []; save(); roamMark(); roamRefresh(); };
$('#gRoamNone').onclick = () => { const r = roamCfg(); r.all = false; r.ids = []; save(); roamMark(); roamRefresh(); };

// ---- 圖層與小熊 ----
function roamFit() { // 圖層避開左邊的側邊欄（手機版側邊欄在上方，就整個寬度都用）
    const s = document.querySelector('.side'); let left = 0;
    if (s) { const r = s.getBoundingClientRect(); if (r.left < 4 && r.width < innerWidth * 0.5) left = r.right; }
    roamLayer.style.left = left + 'px';
}
function roamPaint(it) {
    it.el.style.transform = `translate(${it.x}px, ${-it.y}px)`;
    it.inner.style.transform = `scaleX(${(it.dir > 0) === ROAM_FACES_RIGHT ? 1 : -1})`;
    it.el.classList.toggle('walk', !it.drag && !it.paused && it.idle <= 0 && it.y <= it.gy + 0.5 && !roamReduce);
}
function roamAdd(b) {
    const el = mk('div', { className: 'rbear' }), inner = mk('div', { className: 'rin' }), emoji = () => mk('span', { className: 'remo' }, '🧸');
    if (b.src) { const img = mk('img', { src: b.src, alt: '', draggable: false }); img.onerror = () => img.replaceWith(emoji()); inner.append(img); }
    else inner.append(emoji());
    el.append(inner); roamLayer.append(el);
    const W = Math.max(0, roamLayer.clientWidth - ROAM_SIZE), gy = Math.random() * 18;
    const it = { el, inner, paused: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0, x: Math.random() * W, y: gy, gy, vy: 0, v: 22 + Math.random() * 38, dir: Math.random() < 0.5 ? -1 : 1, idle: 0, next: 2 + Math.random() * 5, drag: false, lx: 0 };
    // 拖曳／點擊：按住拖動超過 5px 才算拖曳（放開的高度 = 新的行走高度）；沒拖動就是「點一下」＝暫停／繼續
    el.title = '點一下：暫停／繼續；按住拖曳：移動';
    const move = e => {
        if (!roamLayer || !roamLayer.contains(el)) return;
        if (!it.moved && Math.hypot(e.clientX - it.sx, e.clientY - it.sy) < 5) return; // 手抖不算拖曳
        it.moved = true; el.classList.add('drag');
        const r = roamLayer.getBoundingClientRect();
        it.x = clamp(e.clientX - r.left - it.ox, 0, r.width - ROAM_SIZE); // 用按下時的抓取位置當偏移，小熊不會跳一下
        it.y = clamp(r.bottom - e.clientY - it.oy, 0, r.height - ROAM_SIZE);
        if (Math.abs(e.clientX - it.lx) > 2) { it.dir = e.clientX > it.lx ? 1 : -1; it.lx = e.clientX; }
        roamPaint(it);
    };
    // 事件掛在 window 上（不靠 pointer capture），滑鼠移出小熊、或是在手機上都不會斷掉
    const onMove = e => { if (it.drag) move(e); };
    const end = () => {
        window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
        if (!it.drag) return;
        it.drag = false; el.classList.remove('drag');
        if (it.moved) it.gy = it.y; // 拖過：放開的高度 = 新的行走高度
        else { it.paused = !it.paused; el.classList.toggle('paused', it.paused); } // 沒拖：點一下切換暫停
        roamPaint(it);
    };
    el.addEventListener('pointerdown', e => {
        if (e.button) return; e.preventDefault();
        const r = roamLayer.getBoundingClientRect();
        it.drag = true; it.moved = false; it.sx = it.lx = e.clientX; it.sy = e.clientY;
        it.ox = e.clientX - r.left - it.x; it.oy = r.bottom - e.clientY - it.y;
        window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    });
    roamItems.set(b.id, it); roamPaint(it);
}
function roamTick(ts) {
    roamRaf = requestAnimationFrame(roamTick);
    const dt = Math.min((ts - (roamLast || ts)) / 1000, 0.1); roamLast = ts; // 分頁切到背景再回來時，不要讓小熊瞬間跳很遠
    const W = Math.max(0, roamLayer.clientWidth - ROAM_SIZE);
    roamItems.forEach(it => {
        if (it.drag) return;
        const maxY = Math.max(0, roamLayer.clientHeight - ROAM_SIZE); if (it.gy > maxY) it.gy = it.y = maxY; // 視窗縮小時，別讓小熊卡在畫面外
        if (it.paused) { roamPaint(it); return; } // 暫停：站著不動
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
function roamRefresh() {
    const want = roamList.filter(roamSel);
    if (!want.length) { // 沒有被選的熊：停掉動畫、拿掉圖層
        cancelAnimationFrame(roamRaf); roamRaf = 0; roamLast = 0; roamItems.clear();
        if (roamLayer) { roamLayer.remove(); roamLayer = null; }
        return;
    }
    if (!roamLayer) { roamLayer = mk('div', { id: 'roamLayer' }); roamLayer.setAttribute('aria-hidden', 'true'); document.body.append(roamLayer); }
    roamFit();
    const ids = new Set(want.map(b => b.id));
    roamItems.forEach((it, id) => { if (!ids.has(id)) { it.el.remove(); roamItems.delete(id); } });
    want.forEach(b => { if (!roamItems.has(b.id)) roamAdd(b); });
    if (!roamReduce && !roamRaf) roamRaf = requestAnimationFrame(roamTick);
}
document.addEventListener('bears-changed', e => { roamList = e.detail || []; roamMark(); roamRefresh(); });
window.addEventListener('resize', () => { if (roamLayer) roamFit(); });

if (roamReduce) $('#gRoamNote').textContent = '（你的系統設定為「減少動態效果」，所以小熊只會站在畫面底部，不會自己走動）';
roamList = weekBears(); roamMark(); roamRefresh();
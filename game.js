// ===== 熊熊挑戰：每週專注目標 + 抽熊 =====
// 規則（想調整就改這幾個常數）：
//   1) 本週（週一到週日）每累積專注滿 1 小時，抽 1 隻熊。
//   2) 達到目標的 25%、50%、75%、100% 時，各有 1 次「獎勵抽倍率」：抽到 ×N，就額外獲得 N 隻熊。
//   3) 熊的圖片放在 BEAR_DIR，檔名從 1 開始編號（1.png、2.png…）；程式會自動往下找，找不到就停。
//      圖庫是空的時用 🧸 代替，所以還沒放圖片也能正常玩。
// 需要 app.js 先載入（db、dkey、mk、$、save）
const BEAR_DIR = 'assets/bears/', BEAR_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const PCTS = [25, 50, 75, 100];
const MULTS = [[1, 45], [2, 30], [3, 17], [5, 8]]; // [倍率, 權重]
const LEVELS = ['🌱 森林新手', '🧸 見習熊', '🐻 勤奮熊', '🏅 學霸熊', '👑 熊熊王'];

// 遊戲資料放在 db.game（和其他學習資料一起備份）：{ goal, weeks:{週一日期:{goal,hours,ms,used,res}}, bears:[{src,t,wk,kind}] }
const gm = () => { const g = db.game = db.game || {}; g.goal = g.goal || 20; g.weeks = g.weeks || {}; g.bears = g.bears || []; return g; };
const mondayKey = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return dkey(x); };
function weekMinutes(start) {
    let s = 0; const x = new Date(start + 'T00:00');
    for (let i = 0; i < 7; i++) { s += (db.days[dkey(x)] || {}).focus || 0; x.setDate(x.getDate() + 1); }
    return s;
}
function curWeek() {
    const g = gm(), k = mondayKey();
    const w = g.weeks[k] = g.weeks[k] || { goal: g.goal, hours: 0, ms: [], used: [], res: {} };
    w.res = w.res || {};
    return { k, w };
}

// ---- 圖庫：依編號一張一張找 ----
let poolP = null, pool = [];
const probe = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = src; });
async function loadPool() {
    const found = []; let ext0 = BEAR_EXTS[0];
    for (let n = 1; n <= 300; n++) {
        let hit = null;
        for (const e of [ext0, ...BEAR_EXTS.filter(x => x !== ext0)]) { const src = `${BEAR_DIR}${n}.${e}`; if (await probe(src)) { hit = src; ext0 = e; break; } }
        if (!hit) break; found.push(hit);
    }
    pool = found; return pool;
}
const ensurePool = () => poolP || (poolP = loadPool());
const drawBear = kind => ({ src: pool.length ? pool[Math.floor(Math.random() * pool.length)] : '', t: Date.now(), wk: mondayKey(), kind });
function drawMult() {
    let r = Math.random() * MULTS.reduce((s, m) => s + m[1], 0);
    for (const [m, wt] of MULTS) { if ((r -= wt) < 0) return m; }
    return 1;
}

// ---- 同步：依本週累積分鐘發熊、解鎖獎勵 ----
async function sync(announce) {
    await ensurePool(); // 之後的區塊沒有 await，所以同時觸發兩次也不會重複發熊
    const g = gm(), { k, w } = curWeek(), min = weekMinutes(k), hrs = Math.floor(min / 60), hit = [];
    let got = 0;
    while (w.hours < hrs) { w.hours++; g.bears.push(drawBear('hour')); got++; }
    PCTS.forEach(p => { if (!w.ms.includes(p) && min >= Math.ceil(w.goal * 60 * p / 100)) { w.ms.push(p); hit.push(p); } });
    if (got || hit.length) save();
    if (announce && (got || hit.length)) bearToast('🧸 ' + (got ? `本週累積 ${w.hours} 小時，抽到 ${got} 隻新熊！` : '') + (hit.length ? `達成 ${hit.join('、')}%，到「熊熊挑戰」領獎勵！` : ''));
    renderGame();
}
let toastT;
function bearToast(text) {
    let t = $('#gToast');
    if (!t) { t = mk('div', { id: 'gToast', className: 'gtoast' }); t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = text; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 6000);
}

// ---- 獎勵：抽倍率 ----
let gameMsg = '';
function claim(p) {
    const g = gm(), { w } = curWeek();
    if (!w.ms.includes(p) || w.used.includes(p)) return;
    const m = drawMult(); w.used.push(p); w.res[p] = m;
    for (let i = 0; i < m; i++) g.bears.push(drawBear('bonus'));
    gameMsg = `🎁 ${p}% 獎勵：抽到 ×${m}！額外獲得 ${m} 隻熊`;
    save(); renderGame();
}

// ---- 畫面 ----
let shown = -1; // 已經畫過幾隻；之後新增的才會有登場動畫
const fmtH = m => (m / 60).toFixed(1);
function bearEl(b, isNew) {
    const tip = `${b.kind === 'bonus' ? '獎勵' : '每小時'}・${new Date(b.t).toLocaleDateString('zh-TW')}`;
    const emoji = () => mk('span', { className: 'bear emoji' + (isNew ? ' new' : ''), title: tip }, '🧸');
    if (!b.src) return emoji();
    const img = mk('img', { className: 'bear' + (isNew ? ' new' : ''), src: b.src, alt: '熊', title: tip, loading: 'lazy' });
    img.onerror = () => img.replaceWith(emoji()); // 圖片被刪掉或改名時，用 🧸 頂替
    return img;
}
function renderGame() {
    const g = gm(), { k, w } = curWeek(), min = weekMinutes(k), goalMin = w.goal * 60, pct = Math.min(100, min / goalMin * 100);
    if (document.activeElement !== $('#gGoal')) $('#gGoal').value = w.goal;
    $('#gTitle').textContent = `${LEVELS[w.ms.length]}　本週挑戰（${k.slice(5).replace('-', '/')} 起）`;
    $('#gFill').style.width = pct + '%';
    document.querySelectorAll('#gBar .gtick').forEach(t => t.classList.toggle('hit', w.ms.includes(+t.dataset.p)));
    const next = PCTS.find(p => !w.ms.includes(p));
    $('#gText').textContent = `${fmtH(min)} / ${w.goal} 小時（${Math.floor(pct)}%）・本週抽到 ${w.hours} 隻・再專注 ${60 - min % 60} 分鐘抽下一隻`
        + (next ? `・下一個獎勵 ${next}%（還差 ${fmtH(Math.ceil(goalMin * next / 100) - min)} 小時）` : '・🎉 本週挑戰完成！');
    const gifts = $('#gGifts'); gifts.innerHTML = '';
    w.ms.filter(p => !w.used.includes(p)).forEach(p => { const b = mk('button', { className: 'primary' }, `🎁 達成 ${p}%：抽倍率`); b.dataset.p = p; gifts.append(b); });
    const got = Object.entries(w.res).map(([p, m]) => `${p}% ×${m}`).join('、');
    $('#gMsg').textContent = gameMsg || (got ? '已領取獎勵：' + got : '');
    const cleared = Object.values(g.weeks).filter(x => (x.ms || []).includes(100)).length;
    const uniq = new Set(g.bears.map(b => b.src).filter(Boolean)).size;
    $('#gCount').textContent = `（共 ${g.bears.length} 隻・圖庫 ${pool.length} 款${pool.length ? '・已蒐集 ' + uniq + ' 款' : ''}・累積完成挑戰 ${cleared} 週）`;
    const st = $('#gStage'); st.innerHTML = '';
    const list = g.bears.slice(-300), off = g.bears.length - list.length;
    list.forEach((b, i) => st.append(bearEl(b, shown >= 0 && off + i >= shown)));
    if (!g.bears.length) st.append(mk('p', { className: 'soon' }, '舞台還空空的。本週專注滿 1 小時，就會抽到第一隻熊。'));
    shown = g.bears.length;
}

// ---- 事件與初始化 ----
PCTS.forEach(p => { const t = mk('div', { className: 'gtick' }); t.dataset.p = p; t.style.left = p + '%'; t.append(mk('span', {}, p + '%')); $('#gBar').append(t); });
$('#gGoal').onchange = e => {
    const v = Math.min(Math.max(Math.round(+e.target.value) || 1, 1), 168), g = gm(), { w } = curWeek();
    w.goal = g.goal = v; e.target.value = v; save(); sync();
};
$('#gGifts').onclick = e => { const b = e.target.closest('button[data-p]'); if (b) claim(+b.dataset.p); };
document.addEventListener('viewchange', e => { if (e.detail === 'game') { gameMsg = ''; sync(); } });
document.addEventListener('pomodoro-end', e => { if (e.detail.mode === 'focus') sync(true); });
renderGame(); sync(false);
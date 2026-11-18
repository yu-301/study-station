// ===== 每週挑戰：每週專注目標 + 抽熊 =====
// 規則（想調整就改這幾個常數）：
//   1) 本週（週一到週日）每累積專注滿 1 小時，抽 1 隻熊（超過目標之後也一樣）；超過本週目標後，每多累積 OVER_STEP_H 小時，另外可以再抽 1 次「獎勵倍率」。
//   2) 達到目標的 25%、50%、75%、100% 時，各有 1 次「獎勵抽倍率」：抽到 ×N，就額外獲得 N 隻熊。
//      其中 GUARANTEE 列的百分比（預設 50%、100%）達成時，另外「保證直接送 1 隻」，而且會優先挑「本週舞台上還沒有的圖」。
//   3) 熊舞台只顯示「本週」的熊；每週一從 0 重新累積。歷史累積數量仍然保留（顯示在標題旁）。
//   4) 圖庫 = 網站 assets 資料夾裡的所有圖片（檔名不拘，數量不拘，不含子資料夾）。
//      網頁沒辦法直接列出資料夾，所以用 GitHub 的 API 查檔案清單：
//      網址是 帳號.github.io/專案名 時會自動判斷；自訂網域或判斷錯誤時，把下面 GH_REPO 填成 '帳號/專案名'。
//      查詢結果會快取 5 分鐘（API 每小時有查詢次數限制）；查不到時改讀 assets list.json（選用，內容是檔名陣列），再不行就用上次的快取。
//      圖庫是空的時用 🧸 代替，所以還沒放圖片也能正常玩。
// 需要 app.js 先載入（db、dkey、mk、$、save）
const ASSET_DIR = 'assets/', GH_REPO = '', IMG_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const POOL_KEY = 'studyhub.pool', POOL_TTL = 5 * 60000;
const PCTS = [25, 50, 75, 100];
const MULTS = [[1, 45], [2, 30], [3, 17], [5, 8]]; // [倍率, 權重]
const GUARANTEE = [50, 100]; // 達到這些 % 時，保證直接送 1 隻熊
const OVER_STEP_H = 5;       // 超過本週目標後，每多專注幾小時，多 1 次「獎勵倍率」可抽（時數熊照樣每小時 1 隻）
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const LEVELS = ['🌱 森林新手', '🧸 見習熊', '🐻 勤奮熊', '🏅 學霸熊', '👑 熊熊王'];

// 遊戲資料放在 db.game（和其他學習資料一起備份）：{ goal, weeks:{週一日期:{goal,hours,ms,used,res}}, bears:[{src,t,wk,kind}] }
const gm = () => { const g = db.game = db.game || {}; g.goal = g.goal || 20; g.weeks = g.weeks || {}; g.bears = g.bears || []; g.bears.forEach(b => { if (!b.id) b.id = newId(); }); return g; };
const mondayKey = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return dkey(x); };
function weekMinutes(start) {
    let s = 0; const x = new Date(start + 'T00:00');
    for (let i = 0; i < 7; i++) { s += (db.days[dkey(x)] || {}).focus || 0; x.setDate(x.getDate() + 1); }
    return s;
}
function curWeek() {
    const g = gm(), k = mondayKey();
    const w = g.weeks[k] = g.weeks[k] || { goal: g.goal, hours: 0, ms: [], used: [], res: {} };
    w.res = w.res || {}; w.overN = w.overN || 0; w.overUsed = w.overUsed || []; // overN：超標獎勵累計幾次；overUsed：已抽到的倍率
    return { k, w };
}

// ---- 圖庫：讀 assets/ 資料夾 ----
let poolP = null, pool = [], poolInfo = '';
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
function autoRepo() { // 網址是 帳號.github.io/專案名 時自動判斷
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i); if (!m) return '';
    const first = location.pathname.split('/')[1];
    return m[1] + '/' + (first && !/\.html?$/i.test(first) ? first : location.hostname);
}
const ghRepo = () => GH_REPO || gm().repo || autoRepo();
async function listAssets(force) {
    let c = null; try { c = JSON.parse(localStorage.getItem(POOL_KEY)); } catch { }
    const cached = c && Array.isArray(c.files) ? c : null;
    if (!force && cached && Date.now() - cached.t < POOL_TTL) { poolInfo = `來源：快取（${cached.from || 'GitHub'}）`; return cached.files; }
    let files = null, from = ''; const why = [], repo = ghRepo();
    if (repo) {
        try {
            const r = await fetch(`https://api.github.com/repos/${repo}/contents/${ASSET_DIR.replace(/\/$/, '')}`);
            if (r.ok) {
                const all = await r.json();
                if (Array.isArray(all)) { files = all.filter(x => x.type === 'file' && IMG_RE.test(x.name)).map(x => x.name); from = `GitHub：${repo}`; if (!files.length) why.push(`${repo} 的 ${ASSET_DIR} 裡沒有圖片（支援 png、jpg、gif、webp、svg、avif）`); }
                else why.push(`${repo} 裡的 ${ASSET_DIR.replace(/\/$/, '')} 不是資料夾`);
            } else why.push(`GitHub 回應 ${r.status}（${repo}）` + (r.status === 404 ? '：找不到這個專案或 assets 資料夾，或專案是私人的' : r.status === 403 ? '：查詢次數超過限制，稍後再試' : ''));
        } catch { why.push('連不上 GitHub'); }
    } else why.push('無法判斷 GitHub 專案（網址不是「帳號.github.io/專案名」），請在下方「圖庫設定」填入');
    if (!files || !files.length) {
        try {
            const r = await fetch(ASSET_DIR + 'list.json');
            if (r.ok) { const f = (await r.json()).filter(n => typeof n === 'string' && IMG_RE.test(n)); if (f.length) { files = f; from = ASSET_DIR + 'list.json'; } }
        } catch { }
    }
    if (!files || !files.length) {
        if (cached && cached.files.length) { poolInfo = `讀取失敗，先用上次的結果：${why.join('；')}`; return cached.files; }
        poolInfo = '讀不到圖庫：' + (why.join('；') || '沒有圖片'); return files || [];
    }
    poolInfo = '來源：' + from;
    try { localStorage.setItem(POOL_KEY, JSON.stringify({ t: Date.now(), files, from })); } catch { }
    return files;
}
async function loadPool(force) { pool = (await listAssets(force)).map(n => ASSET_DIR + encodeURIComponent(n)); return pool; }
const ensurePool = () => poolP || (poolP = loadPool());
function weekBears() { const { k } = curWeek(); return gm().bears.filter(b => b.wk === k); } // 本週的熊（舞台、走動小熊都用這個）
function drawBear(kind, fresh) { // fresh：優先挑本週舞台上還沒有的圖（圖庫都有了才重複）
    let list = pool;
    if (fresh && pool.length) { const have = new Set(weekBears().map(b => b.src)), nu = pool.filter(s => !have.has(s)); if (nu.length) list = nu; }
    return { id: newId(), src: list.length ? list[Math.floor(Math.random() * list.length)] : '', t: Date.now(), wk: mondayKey(), kind };
}
function drawMult() {
    let r = Math.random() * MULTS.reduce((s, m) => s + m[1], 0);
    for (const [m, wt] of MULTS) { if ((r -= wt) < 0) return m; }
    return 1;
}

// ---- 同步：依本週累積分鐘發熊、解鎖獎勵 ----
async function sync(announce) {
    await ensurePool(); // 之後的區塊沒有 await，所以同時觸發兩次也不會重複發熊
    const g = gm(), { k, w } = curWeek(), min = weekMinutes(k), hrs = Math.floor(min / 60), hit = [];
    let got = 0, sure = 0, healed = 0;
    if (pool.length) g.bears.forEach(b => { if (!b.src || /^assets\/bears\//.test(b.src)) { b.src = pool[Math.floor(Math.random() * pool.length)]; healed++; } }); // 圖庫還是空的時抽到的熊，補上圖片
    while (w.hours < hrs) { w.hours++; g.bears.push(drawBear('hour')); got++; } // w.hours = 已經依時數發出幾隻
    PCTS.forEach(p => {
        if (!w.ms.includes(p) && min >= Math.ceil(w.goal * 60 * p / 100)) {
            w.ms.push(p); hit.push(p);
            if (GUARANTEE.includes(p)) { g.bears.push(drawBear('milestone', true)); sure++; }
        }
    });
    const overBefore = w.overN, over = min > w.goal * 60 ? Math.floor((min - w.goal * 60) / (OVER_STEP_H * 60)) : 0;
    w.overN = Math.max(w.overN, over); // 超標每滿 OVER_STEP_H 小時，多一次倍率可抽
    if (got || sure || hit.length || healed || w.overN > overBefore) save();
    if (announce && (got || sure || hit.length || w.overN > overBefore)) {
        const gifts = hit.filter(p => !w.used.includes(p));
        bearToast('🧸 ' + (got + sure ? `抽到 ${got + sure} 隻新熊！（本週共 ${weekBears().length} 隻）` : '') + (gifts.length ? ` 達成 ${gifts.join('、')}%，到「每週挑戰」領獎勵！` : '') + (w.overN > overBefore ? ' 超標獎勵可以抽倍率了！' : ''));
        if (got + sure) document.dispatchEvent(new CustomEvent('bears-drawn', { detail: { count: got + sure, milestone: sure > 0 } }));
    }
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
// 抽倍率改成轉盤（wheel.js）：按「開始」轉、自己按「停！」，指針指到哪格就是幾倍。沒轉完就關掉視窗 = 沒領取，獎勵還在。
function grant(m, label) {
    const g = gm();
    for (let i = 0; i < m; i++) g.bears.push(drawBear('bonus'));
    gameMsg = `🎁 ${label}：抽到 ×${m}！額外獲得 ${m} 隻熊`;
    save(); renderGame();
    document.dispatchEvent(new CustomEvent('bears-drawn', { detail: { count: m, bonus: true, mult: m } })); // 夥伴 AI 只在 ×5 時特別慶祝
}
function claim(p) {
    const { w } = curWeek();
    if (!w.ms.includes(p) || w.used.includes(p)) return;
    openWheel(`${p}% 獎勵`, m => {
        const { w } = curWeek(); if (!w.ms.includes(p) || w.used.includes(p)) return false; // 領過了就不重複算
        w.used.push(p); w.res[p] = m; grant(m, `${p}% 獎勵`); return true;
    });
}
function claimOver() { // 超過本週目標後，每 OVER_STEP_H 小時一次
    const { w } = curWeek();
    if (w.overUsed.length >= w.overN) return;
    openWheel('超標獎勵', m => {
        const { w } = curWeek(); if (w.overUsed.length >= w.overN) return false;
        w.overUsed.push(m); grant(m, '超標獎勵'); return true;
    });
}

// ---- 畫面 ----
let shown = -1, shownWk = ''; // 已經畫過幾隻（只算本週）；之後新增的才會有登場動畫
const fmtH = m => (m / 60).toFixed(1);
function bearEl(b, isNew) {
    const tip = `${b.kind === 'bonus' ? '獎勵' : b.kind === 'milestone' ? '里程碑保證' : '專注時數'}・${new Date(b.t).toLocaleDateString('zh-TW')}（點一下：讓它在畫面底部走動／收回）`;
    const mark = el => { el.dataset.id = b.id; el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-pressed', 'false'); return el; }; // roam.js 負責點選與標示
    const emoji = () => mark(mk('span', { className: 'bear emoji' + (isNew ? ' new' : ''), title: tip }, '🧸'));
    if (!b.src) return emoji();
    const img = mark(mk('img', { className: 'bear' + (isNew ? ' new' : ''), src: b.src, alt: '熊', title: tip, loading: 'lazy' }));
    img.onerror = () => img.replaceWith(emoji()); // 圖片被刪掉或改名時，用 🧸 頂替
    return img;
}
function renderGame() {
    const g = gm(), { k, w } = curWeek(), min = weekMinutes(k), goalMin = w.goal * 60, pct = Math.min(100, min / goalMin * 100);
    const mine = weekBears();
    if (shownWk !== k) { shownWk = k; shown = -1; } // 換週：舞台清空重來，不放登場動畫
    const stepMin = OVER_STEP_H * 60, nextMin = 60 - min % 60, overNext = stepMin - (min - goalMin) % stepMin;
    if (document.activeElement !== $('#gGoal')) $('#gGoal').value = w.goal;
    $('#gTitle').textContent = `${LEVELS[w.ms.length]}　本週挑戰（${k.slice(5).replace('-', '/')} 起）`;
    $('#gFill').style.width = pct + '%';
    document.querySelectorAll('#gBar .gtick').forEach(t => t.classList.toggle('hit', w.ms.includes(+t.dataset.p)));
    const next = PCTS.find(p => !w.ms.includes(p));
    $('#gText').textContent = `${fmtH(min)} / ${w.goal} 小時（${Math.floor(pct)}%）・本週抽到 ${mine.length} 隻・再專注 ${nextMin} 分鐘抽下一隻${min >= goalMin ? `・超標每 ${OVER_STEP_H} 小時可多抽一次倍率（再 ${overNext} 分鐘）` : ''}`
        + (next ? `・下一個獎勵 ${next}%（還差 ${fmtH(Math.ceil(goalMin * next / 100) - min)} 小時）` : '・🎉 本週挑戰完成！');
    const gifts = $('#gGifts'); gifts.innerHTML = '';
    w.ms.filter(p => !w.used.includes(p)).forEach(p => { const b = mk('button', { className: 'primary' }, `🎁 達成 ${p}%：抽倍率`); b.dataset.p = p; gifts.append(b); });
    for (let i = w.overUsed.length; i < w.overN; i++) { const b = mk('button', { className: 'primary' }, '🎁 超標獎勵：抽倍率'); b.dataset.o = '1'; gifts.append(b); }
    const got = [...Object.entries(w.res).map(([p, m]) => `${p}% ×${m}`), ...w.overUsed.map(m => `超標 ×${m}`)].join('、');
    $('#gMsg').textContent = gameMsg || (got ? '已領取獎勵：' + got : '');
    $('#gPoolInfo').textContent = '圖庫　' + poolInfo; if (document.activeElement !== $('#gRepo')) $('#gRepo').value = gm().repo || autoRepo();
    const cleared = Object.values(g.weeks).filter(x => (x.ms || []).includes(100)).length;
    const uniq = new Set(mine.map(b => b.src).filter(Boolean)).size; // 本週蒐集到幾種圖
    $('#gCount').textContent = `（本週 ${mine.length} 隻・歷史累積 ${g.bears.length} 隻・圖庫 ${pool.length} 張${pool.length ? '・本週蒐集 ' + uniq + ' 種' : '（assets/ 裡還沒有圖片）'}・累積完成挑戰 ${cleared} 週）`;
    const st = $('#gStage'); st.innerHTML = '';
    const list = mine.slice(-300), off = mine.length - list.length;
    list.forEach((b, i) => st.append(bearEl(b, shown >= 0 && off + i >= shown)));
    if (!mine.length) st.append(mk('p', { className: 'soon' }, '本週的舞台還空空的。專注滿 1 小時，就會抽到第一隻熊。'));
    shown = mine.length;
    document.dispatchEvent(new CustomEvent('bears-changed', { detail: mine })); // 走動小熊（roam.js）用
}

// ---- 事件與初始化 ----
PCTS.forEach(p => { const t = mk('div', { className: 'gtick' }); t.dataset.p = p; t.style.left = p + '%'; t.append(mk('span', {}, p + '%')); $('#gBar').append(t); });
$('#gGoal').onchange = e => {
    const v = Math.min(Math.max(Math.round(+e.target.value) || 1, 1), 168), g = gm(), { w } = curWeek();
    w.goal = g.goal = v; e.target.value = v; save(); sync();
};
$('#gGifts').onclick = e => { const b = e.target.closest('button[data-p],button[data-o]'); if (!b) return; if (b.dataset.o) claimOver(); else claim(+b.dataset.p); };
document.addEventListener('viewchange', e => { if (e.detail === 'game') { gameMsg = ''; poolP = null; sync(); } }); // 進頁面時重新讀圖庫（5 分鐘內用快取）
$('#gRepoSave').onclick = async () => {
    const v = $('#gRepo').value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    if (v && !REPO_RE.test(v)) { gameMsg = '格式不對，請填「帳號/專案名」，例如 yu/study-station'; renderGame(); return; }
    gm().repo = v; save(); poolP = loadPool(true); await poolP; gameMsg = `圖庫已更新：共 ${pool.length} 張`; sync(); // sync 會順便補上舊熊的圖片
};
$('#gReload').onclick = async () => { poolP = loadPool(true); await poolP; gameMsg = `圖庫已更新：共 ${pool.length} 張`; sync(); };
document.addEventListener('pomodoro-end', e => { if (e.detail.mode === 'focus') sync(true); });
renderGame(); sync(false);
// 週日或週一：每週提示一次，提醒去看 AI 週報與下週目標
(() => {
    const d = new Date().getDay(), g = gm(), k = mondayKey();
    if ((d === 0 || d === 1) && g.hint !== k) { g.hint = k; save(); setTimeout(() => bearToast('📊 新的一週：到「每週挑戰」按「🎯 目標 AI」，看週報、決定下週目標'), 1500); }
})();
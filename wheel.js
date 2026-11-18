// ===== 抽獎轉盤 =====
// openWheel(標題, onResult)：跳出轉盤視窗 → 按「開始」轉起來 → 自己按「停！」→ 指針指到哪一格就是幾倍。
// 格子的大小 = 機率（取自 game.js 的 MULTS 權重）：倍率越高，格子越小，越難瞄準。
// 停下的那一刻，轉盤「立刻定住」（不會再滑行），結果就是當下指針所指的格子；所以是瞄準的遊戲，不是裝飾動畫。
// onResult(倍率) 在停下的那一刻呼叫；回傳 false 代表這次不算數（例如已經領過了）。中途關掉視窗 = 沒領取，獎勵還在。
// 需要 app.js（$、mk）先載入；MULTS 在開視窗時才讀，所以 game.js 可以晚一點載入
const WHEEL_ORDER = [1, 2, 1, 3, 1, 2, 5, 2, 1, 3]; // 格子排列（同倍率分散開，每一圈都會掃過各種倍率）
const WHEEL_V0 = 300, WHEEL_V1 = 720, WHEEL_RAMP = 4; // 轉速（度/秒）：開始時 V0，在 RAMP 秒內加速到 V1。想更刺激就把兩個數字調大
const WHEEL_COLOR = { 1: '#6b7785', 2: '#0f8b8d', 3: '#8b6fd1', 5: '#e0675a' };
let wSt = null; // { segs, onResult, state: 'idle'|'spin'|'done', base, t0, raf }

function wheelSegs() {
    const total = MULTS.reduce((s, m) => s + m[1], 0), cnt = {};
    const order = [...WHEEL_ORDER, ...MULTS.map(x => x[0]).filter(m => !WHEEL_ORDER.includes(m))]; // MULTS 裡有、排列表裡沒有的倍率，補在最後
    order.forEach(m => { cnt[m] = (cnt[m] || 0) + 1; });
    let a = 0;
    return order.map(m => {
        const wt = (MULTS.find(x => x[0] === m) || [0, 0])[1], w = 360 * wt / total / cnt[m], s = { m, a0: a, a1: a + w };
        a += w; return s;
    }).filter(s => s.a1 > s.a0);
}
function wheelDraw(segs) {
    const cv = $('#wCanvas'), size = 300, dpr = window.devicePixelRatio || 1;
    cv.width = cv.height = Math.round(size * dpr);
    const c = cv.getContext('2d'), R = size / 2 - 4, cx = size / 2, cy = size / 2, rad = d => (d - 90) * Math.PI / 180; // 0 度 = 正上方，順時針
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, size, size);
    segs.forEach(s => {
        c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, rad(s.a0), rad(s.a1)); c.closePath();
        c.fillStyle = WHEEL_COLOR[s.m] || '#c9a227'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
        const mid = rad((s.a0 + s.a1) / 2);
        c.save(); c.translate(cx + Math.cos(mid) * R * 0.72, cy + Math.sin(mid) * R * 0.72); c.rotate(mid + Math.PI / 2);
        c.fillStyle = '#fff'; c.font = 'bold 20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('×' + s.m, 0, 0); c.restore();
    });
    c.beginPath(); c.arc(cx, cy, 12, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
}
// 轉盤目前的角度（度，順時針）。轉速從 V0 線性加速到 V1，之後維持 V1；用算的而不是累加，按下去的那一瞬間才準
function wheelAngle(now) {
    const t = (now - wSt.t0) / 1000, r = Math.min(t, WHEEL_RAMP);
    return wSt.base + WHEEL_V0 * r + (WHEEL_V1 - WHEEL_V0) / (2 * WHEEL_RAMP) * r * r + WHEEL_V1 * Math.max(0, t - WHEEL_RAMP);
}
function wheelFrame() {
    if (!wSt || wSt.state !== 'spin') return;
    $('#wCanvas').style.transform = `rotate(${wheelAngle(performance.now())}deg)`;
    wSt.raf = requestAnimationFrame(wheelFrame);
}
function wheelStart() {
    wSt.state = 'spin'; wSt.t0 = performance.now();
    $('#wGo').textContent = '停！'; $('#wGo').classList.add('stop'); $('#wResult').textContent = '';
    wheelFrame();
}
function wheelStop() {
    const th = wheelAngle(performance.now()); // 先算角度再停：以按下去的那一刻為準
    cancelAnimationFrame(wSt.raf); wSt.state = 'done';
    $('#wCanvas').style.transform = `rotate(${th}deg)`;
    const phi = (((-th) % 360) + 360) % 360, seg = wSt.segs.find(s => phi >= s.a0 && phi < s.a1) || wSt.segs[wSt.segs.length - 1]; // 轉盤順時針轉 th 度 → 指針（正上方）指到轉盤上 -th 度的位置
    const counted = wSt.onResult(seg.m) !== false;
    $('#wResult').textContent = counted ? `🎉 ×${seg.m}！` : '這次沒有算數（可能已經領過了）';
    $('#wGo').disabled = true; $('#wGo').classList.remove('stop'); $('#wClose').textContent = '關閉';
}
function wheelAct() { // 「開始」和「停！」是同一顆鈕；用 pointerdown / 鍵盤觸發，比等放開滑鼠的 click 少約 0.1 秒延遲
    if (!wSt) return;
    if (wSt.state === 'idle') wheelStart(); else if (wSt.state === 'spin') wheelStop();
}
function openWheel(title, onResult) {
    const segs = wheelSegs(), total = MULTS.reduce((s, m) => s + m[1], 0);
    wSt = { segs, onResult, state: 'idle', base: Math.random() * 360, t0: 0, raf: 0 }; // 每次起始角度隨機，記不住位置
    $('#wTitle').textContent = '🎡 ' + title;
    $('#wOdds').textContent = '機率（＝格子大小）：' + MULTS.map(([m, wt]) => `×${m} ${Math.round(wt / total * 100)}%`).join('・');
    $('#wResult').textContent = ''; $('#wGo').disabled = false; $('#wGo').textContent = '開始'; $('#wGo').classList.remove('stop'); $('#wClose').textContent = '取消';
    wheelDraw(segs); $('#wCanvas').style.transform = `rotate(${wSt.base}deg)`;
    $('#wheelDlg').showModal(); $('#wGo').focus();
}
$('#wGo').onpointerdown = e => { if (e.button) return; e.preventDefault(); wheelAct(); };
$('#wheelDlg').addEventListener('keydown', e => { // 空白鍵或 Enter 也能開始／停止（焦點在「取消」鈕上時不攔截）
    if ((e.key === ' ' || e.key === 'Enter') && e.target.id !== 'wClose') { e.preventDefault(); if (!e.repeat) wheelAct(); }
});
$('#wClose').onclick = () => $('#wheelDlg').close();
$('#wheelDlg').addEventListener('close', () => { if (wSt) cancelAnimationFrame(wSt.raf); wSt = null; });
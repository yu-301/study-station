// ===== 待辦計時：番茄鐘進行中，隨時切換「現在在做哪個待辦」=====
// 一輪專注可以很長（例如 120 分鐘），中間可能先做 A 再做 B。規則：
//   1) 在計時器頁選「現在在做」的待辦（可以先選好再開始，也可以做到一半才切換）。
//   2) 每次切換，前一個待辦這段做了多久，先記在「暫存」裡；接下來的時間算給新選的待辦。
//   3) 這一輪「完成」或「儲存目前進度」時，暫存一次寫進：當天的 d.tasks[待辦id]（分鐘）和待辦自己的 spent（累計分鐘）。
//   4) 按「重設」、換預設時間等放棄這一輪 → 暫存清掉，跟專注分鐘一樣不計。
//   5) 沒有選待辦的時間不記在任何待辦上（專注分鐘照常累計）。
// 讀書計畫的「計畫完成度」、預估準確度，都用這裡記下來的時間。
// 需要 app.js 先載入（mode、left、tick、endAt、setMode、db、save、day、dkey、dueLabel、$、mk）
let tkPend = {}, tkBase = 0; // tkPend：{待辦id: 這一輪累積秒數}；tkBase：目前這一段是從「這一輪的第幾秒」開始算
const tkCur = () => db.timerTask || 0;
function tkSecNow() { // 這一輪已經專注的秒數（暫停時不增加）
    if (mode !== 'focus') return 0;
    const l = tick ? Math.max(0, Math.round((endAt - Date.now()) / 1000)) : left;
    return Math.max(0, db.settings.focus * 60 - l);
}
function tkFlush() { // 把「目前這一段」算給目前選的待辦，然後從現在重新起算
    const s = tkSecNow(), d = s - tkBase;
    if (d > 0 && tkCur()) tkPend[tkCur()] = (tkPend[tkCur()] || 0) + d;
    tkBase = s;
}
const tkOpenTodos = () => db.todos.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.id - b.id);

function tkFillSel() {
    const sel = $('#tkSel'); sel.innerHTML = '';
    sel.append(mk('option', { value: 0 }, '（不指定）'));
    tkOpenTodos().forEach(t => sel.append(mk('option', { value: t.id }, t.text + (t.due ? `（${dueLabel(t)}）` : '') + (t.spent ? `・已花 ${(t.spent / 60).toFixed(1)} 小時` : ''))));
    if (!tkOpenTodos().some(t => t.id === tkCur())) { tkFlush(); db.timerTask = 0; } // 選的那個待辦已經完成或刪除了
    sel.value = tkCur();
}
const tkFmt = s => s >= 60 ? Math.round(s / 60) + ' 分' : Math.round(s) + ' 秒';
function tkPaint() { // 「本輪」即時顯示：暫存 + 進行中的這一段
    const cur = Math.max(0, tkSecNow() - tkBase), sums = { ...tkPend };
    if (tkCur() && mode === 'focus') sums[tkCur()] = (sums[tkCur()] || 0) + cur;
    const parts = Object.entries(sums).filter(([, s]) => s >= 1).map(([id, s]) => {
        const t = db.todos.find(x => x.id === +id);
        return `${t ? t.text : '（已刪除的待辦）'} ${tkFmt(s)}${+id === tkCur() && tick ? '（進行中）' : ''}`;
    });
    $('#tkInfo').textContent = mode !== 'focus' ? '休息中（休息時間不計）。' : parts.length ? '本輪：' + parts.join('、') : '本輪還沒有記到任何待辦。';
}
$('#tkSel').onchange = () => { tkFlush(); db.timerTask = +$('#tkSel').value || 0; save(); tkPaint(); };

// 一輪專注結束（完成 / 儲存目前進度）：app.js 在重設計時器「之前」發出這個事件，所以這時還讀得到這一輪的秒數
document.addEventListener('pomodoro-end', e => {
    if (!e.detail || e.detail.mode !== 'focus') return;
    tkFlush();
    const d = day(dkey(new Date())); d.tasks = d.tasks || {};
    Object.entries(tkPend).forEach(([id, sec]) => {
        const m = Math.round(sec / 6) / 10; // 分鐘，取到小數 1 位
        if (m <= 0) return;
        d.tasks[id] = +((d.tasks[id] || 0) + m).toFixed(1);
        const t = db.todos.find(x => x.id === +id); if (t) t.spent = +((t.spent || 0) + m).toFixed(1);
    });
    tkPend = {}; tkBase = 0; save(); tkFillSel(); tkPaint();
    document.dispatchEvent(new CustomEvent('tasks-logged'));
});
// 放棄這一輪（重設、換預設時間、略過休息…都會呼叫 setMode）→ 暫存作廢。完成時事件在 setMode 之前，已經寫進去了
const tkSetMode = setMode;
setMode = function () { tkPend = {}; tkBase = 0; const r = tkSetMode.apply(this, arguments); tkPaint(); return r; };

// 給讀書計畫用：某段日期（含頭尾）各待辦實際花的分鐘 → { 待辦id: 分鐘 }
function tasksInRange(fromK, toK) {
    const out = {}, x = new Date(fromK + 'T00:00'), end = new Date(toK + 'T00:00');
    for (; x <= end; x.setDate(x.getDate() + 1)) {
        const t = (db.days[dkey(x)] || {}).tasks;
        if (t) Object.entries(t).forEach(([id, m]) => { out[id] = (out[id] || 0) + m; });
    }
    return out;
}
document.addEventListener('viewchange', e => { if (e.detail === 'timer') { tkFillSel(); tkPaint(); } });
tkFillSel(); tkPaint(); setInterval(tkPaint, 1000);
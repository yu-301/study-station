// ===== 夥伴 AI：鼓勵 + 待辦提醒 =====
// 設計：「程式決定什麼時候說，AI 決定怎麼說」。
// 觸發來源：番茄鐘結束、專注每滿 30 分鐘、待辦 deadline 進入新階段。沒有 Key 或沒勾自動觸發時，改用內建句子，功能照常運作。
// 需要 app.js、llm.js 先載入
const FALLBACK = {
    focusDone: ['完成一輪專注，幹得好！先站起來伸展一下。', '又穩穩收下一個番茄，進度正在累積。', '專注完成，喝口水再繼續。'],
    restDone: ['休息結束，回到座位，下一輪開始吧。', '電充飽了，準備好再專注一輪？'],
    milestone: ['已經連續專注 30 分鐘了，保持住。', '30 分鐘過去了，狀態很穩。', '專注持續中，你比你想的更能撐。'],
    tap: ['我在這裡陪你。', '先做最小的那一步就好。', '今天的你已經比昨天往前一點了。'],
    bear: ['又抽到新熊了，熊熊舞台越來越熱鬧！', '新熊報到！這是你專注換來的。', '熊熊 +1，繼續保持。'],
    bear5: ['×5！！一口氣多了五隻熊，太厲害了！', '大獎！五隻熊衝進舞台，今天你最閃亮！']
};
const pick = a => a[Math.floor(Math.random() * a.length)];
let compBusy = false, toastTimer = null, queuedSpeak = null;

function paintIcon() { const i = roleInfo().icon; $('#mascotIcon').textContent = i; $('#toastIcon').textContent = i; }
function currentView() { const v = document.querySelector('.view:not([hidden])'); return v ? v.id.replace('view-', '') : ''; }

// 顯示一句話：計時器頁下方的小圖示冒泡；在其他頁面則跳出右下角提示（8 秒後自動收起）
function say(text, { notify } = {}) {
    paintIcon();
    $('#bubble').textContent = text; $('#bubble').hidden = false;
    if (currentView() !== 'timer') {
        $('#toastText').textContent = text; $('#toast').hidden = false;
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 8000);
    }
    if (notify && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
        try { new Notification(notify, { body: text }); } catch { }
    }
}
$('#toastClose').onclick = () => { $('#toast').hidden = true; };
$('#mascotIcon').onclick = () => speak('tap', '使用者點了你一下，想要一句簡短的陪伴或打氣。', FALLBACK.tap);

// 讓目前角色說一句話。能用 AI 就用 AI，失敗或沒開就用備用句子。
async function speak(kind, situation, fallbackList, opt = {}) {
    const fallback = typeof fallbackList === 'string' ? fallbackList : pick(fallbackList);
    // opt.queue：不要蓋掉正在說的話。AI 還在想就排隊等它說完；沒開 AI 時晚幾秒再出現
    if (opt.queue && compBusy) { queuedSpeak = [kind, situation, fallbackList, opt]; return; }
    if (opt.queue && (!ai.key || !ai.auto)) { setTimeout(() => say(fallback, opt), 4000); return; }
    if (!ai.key || !ai.auto || compBusy) { say(fallback, opt); return; }
    compBusy = true; $('#bubble').hidden = false; $('#bubble').textContent = '…';
    try {
        const { text } = await callLLM({
            system: rolePrompt() + '\n\n你現在是學習儀表板角落的小夥伴，只用一則對話泡泡說話：一到兩句、60 字以內，不要條列、不要加引號、不要自我介紹。\n' + stateLine(),
            messages: [{ role: 'user', content: situation }], temperature: 0.9, max: 400
        });
        say(text || fallback, opt);
    } catch { say(fallback, opt); }
    compBusy = false;
    if (queuedSpeak) { const q = queuedSpeak; queuedSpeak = null; speak(...q); }
}

// ---- 番茄鐘事件 ----
document.addEventListener('pomodoro-end', e => {
    const { mode, minutes } = e.detail;
    if (mode === 'focus') {
        const today = (db.days[dkey(new Date())] || {}).focus || 0;
        speak('done', `[系統事件] 使用者剛完成 ${minutes} 分鐘的專注，今天累計 ${today} 分鐘。請給一句具體的鼓勵或一個很短的笑話。`, FALLBACK.focusDone, { notify: '專注完成' });
    } else speak('rest', '[系統事件] 休息時間結束了，請簡短提醒使用者回到專注。', FALLBACK.restDone, { notify: '休息結束' });
});
document.addEventListener('focus-milestone', e => {
    speak('milestone', `[系統事件] 使用者已連續專注 ${e.detail.minutes} 分鐘，還沒結束。請給一句勵志的話，鼓勵他撐下去。`, FALLBACK.milestone);
});

// ---- 抽到熊：由角色慶祝（game.js 發出 bears-drawn）----
// 新熊（時數、里程碑）每次都說一句；獎勵抽倍率只有抽到 ×5 才特別慶祝，×1～×3 畫面上已經有顯示，不多打擾。
document.addEventListener('bears-drawn', e => {
    const d = e.detail || {};
    if (d.bonus && d.mult < 5) return;
    const big = d.bonus && d.mult >= 5;
    speak(big ? 'bear5' : 'bear',
        big ? '[系統事件] 使用者在每週挑戰的獎勵抽倍率抽到最高的 ×5，一次多了 5 隻熊！請熱烈慶祝。'
            : `[系統事件] 使用者靠專注累積，剛抽到 ${d.count} 隻新熊${d.milestone ? '（含達成里程碑的保證熊）' : ''}。請簡短慶祝。`,
        big ? FALLBACK.bear5 : FALLBACK.bear, { queue: true });
});

// ---- 待辦 deadline 提醒 ----
// 每個待辦的每個階段（明天到期／今天到期／已逾期）最多提醒一次，記在 t.nudge，避免重複消耗額度。
const STAGE_TEXT = { 1: '明天到期', 2: '今天到期', 3: '已經逾期' };
function checkDeadlines() {
    const fresh = db.todos.filter(t => !t.done && dueStage(t) > (t.nudge || 0));
    if (!fresh.length) return;
    fresh.sort((a, b) => dueStage(b) - dueStage(a));
    const lines = fresh.map(t => `- 「${t.text}」${STAGE_TEXT[dueStage(t)]}（deadline ${t.due}）`).join('\n');
    fresh.forEach(t => { t.nudge = dueStage(t); }); save(); if (editTodo === null) renderTodos(); // 編輯中不重畫，避免洗掉正在輸入的內容
    const top = fresh[0], more = fresh.length > 1 ? `（還有 ${fresh.length - 1} 項）` : '';
    const fallback = `「${top.text}」${STAGE_TEXT[dueStage(top)]}，還沒完成喔！${more}`;
    speak('deadline', `[系統事件] 以下待辦需要提醒，使用者還沒完成：\n${lines}\n請用你的角色寫一則提醒，點名最緊急的一項，語氣符合角色，不要責罵。`, fallback, { notify: '待辦提醒' });
}
window.checkDeadlines = checkDeadlines;
setInterval(checkDeadlines, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDeadlines(); });

// ---- 瀏覽器通知（選用：分頁在背景時也能看到提醒）----
function paintNotify() {
    const b = $('#notifyBtn'), p = 'Notification' in window ? Notification.permission : 'unsupported';
    if (p === 'unsupported') { b.hidden = true; return; }
    b.textContent = p === 'granted' ? '瀏覽器通知：已開啟（點一下測試）' : p === 'denied' ? '通知已被瀏覽器封鎖' : '開啟瀏覽器通知';
    b.disabled = p === 'denied';
}
function testNotify() { try { new Notification('學習儀表板', { body: '通知正常！之後分頁在背景時，待辦提醒和番茄鐘結束會這樣跳出來。' }); } catch { } }
$('#notifyBtn').onclick = () => {
    if (Notification.permission === 'granted') { testNotify(); return; }
    Notification.requestPermission().then(r => { paintNotify(); if (r === 'granted') testNotify(); });
};
paintNotify();
document.addEventListener('role-changed', paintIcon);
paintIcon();
setTimeout(checkDeadlines, 800); // 頁面載入後檢查一次
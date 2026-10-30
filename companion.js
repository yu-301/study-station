// ===== 夥伴 AI：鼓勵 + 待辦提醒 =====
// 設計：「程式決定什麼時候說，AI 決定怎麼說」。
// 觸發來源：番茄鐘結束、專注每滿 30 分鐘、待辦 deadline 進入新階段。沒有 Key 或沒勾自動觸發時，改用內建句子，功能照常運作。
// 需要 app.js、llm.js 先載入
const FALLBACK = {
    focusDone: ['完成一輪專注，幹得好！先站起來伸展一下。', '又穩穩收下一個番茄，進度正在累積。', '專注完成，喝口水再繼續。'],
    restDone: ['休息結束，回到座位，下一輪開始吧。', '電充飽了，準備好再專注一輪？'],
    milestone: ['已經連續專注 30 分鐘了，保持住。', '30 分鐘過去了，狀態很穩。', '專注持續中，你比你想的更能撐。'],
    tap: ['我在這裡陪你。', '先做最小的那一步就好。', '今天的你已經比昨天往前一點了。']
};
const pick = a => a[Math.floor(Math.random() * a.length)];
let compBusy = false, toastTimer = null;

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
}

// ---- 番茄鐘事件 ----
document.addEventListener('pomodoro-end', e => {
    const { mode, minutes } = e.detail;
    if (mode === 'focus') {
        const today = (db.days[dkey(new Date())] || {}).focus || 0;
        speak('done', `[系統事件] 使用者剛完成 ${minutes} 分鐘的專注，今天累計 ${today} 分鐘。請給一句具體的鼓勵或一個很短的笑話。`, FALLBACK.focusDone);
    } else speak('rest', '[系統事件] 休息時間結束了，請簡短提醒使用者回到專注。', FALLBACK.restDone);
});
document.addEventListener('focus-milestone', e => {
    speak('milestone', `[系統事件] 使用者已連續專注 ${e.detail.minutes} 分鐘，還沒結束。請給一句勵志的話，鼓勵他撐下去。`, FALLBACK.milestone);
});

// ---- 待辦 deadline 提醒 ----
// 每個待辦的每個階段（明天到期／今天到期／已逾期）最多提醒一次，記在 t.nudge，避免重複消耗額度。
const STAGE_TEXT = { 1: '明天到期', 2: '今天到期', 3: '已經逾期' };
function checkDeadlines() {
    const fresh = db.todos.filter(t => !t.done && dueStage(t) > (t.nudge || 0));
    if (!fresh.length) return;
    fresh.sort((a, b) => dueStage(b) - dueStage(a));
    const lines = fresh.map(t => `- 「${t.text}」${STAGE_TEXT[dueStage(t)]}（deadline ${t.due}）`).join('\n');
    fresh.forEach(t => { t.nudge = dueStage(t); }); save(); renderTodos();
    const top = fresh[0], more = fresh.length > 1 ? `（還有 ${fresh.length - 1} 項）` : '';
    const fallback = `「${top.text}」${STAGE_TEXT[dueStage(top)]}，還沒完成喔！${more}`;
    speak('deadline', `[系統事件] 以下待辦需要提醒，使用者還沒完成：\n${lines}\n請用你的角色寫一則提醒，點名最緊急的一項，語氣符合角色，不要責罵。`, fallback, { notify: '待辦提醒' });
}
window.checkDeadlines = checkDeadlines;
setInterval(checkDeadlines, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDeadlines(); });

// ---- 瀏覽器通知（選用：分頁在背景時也能看到提醒）----
function paintNotify() {
    const b = $('#notifyBtn');
    if (!('Notification' in window)) { b.hidden = true; return; }
    b.textContent = Notification.permission === 'granted' ? '瀏覽器通知：已開啟' : '開啟瀏覽器通知';
    b.disabled = Notification.permission !== 'default';
}
$('#notifyBtn').onclick = () => Notification.requestPermission().then(paintNotify);
paintNotify();
document.addEventListener('role-changed', paintIcon);
paintIcon();
setTimeout(checkDeadlines, 800); // 頁面載入後檢查一次

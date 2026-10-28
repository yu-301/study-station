// ===== AI 助手（Groq，OpenAI 相容格式）=====
// 需要 app.js 先載入：會用到 $、mk、db、dkey
const AIK = 'studyhub.ai'; // Key 和 AI 設定獨立存放，不和學習資料混在一起
let ai = {};
try { ai = JSON.parse(localStorage.getItem(AIK)) || {}; } catch { }
ai.model = ai.model || 'llama-3.3-70b-versatile';
ai.role = ai.role || 'puppy';
ai.custom = ai.custom || '';
if (ai.auto === undefined) ai.auto = true;
const saveAI = () => { try { localStorage.setItem(AIK, JSON.stringify(ai)); } catch { } };

const ROLES = {
    puppy: { name: '誇誇小狗', prompt: '你是一隻熱情的小狗學習夥伴。用台灣繁體中文回答，語氣活潑，偶爾說「汪！」。擅長具體地稱讚使用者的努力，每次最多 3 句，不說教。' },
    ta: { name: '嚴厲資工助教', prompt: '你是嚴厲但公正的資工系助教。用台灣繁體中文回答，直接指出問題，給具體的改進步驟。遇到程式問題，會要求對方提供程式碼與完整錯誤訊息，再一步步排查。不囉嗦，不客套。' },
    funny: { name: '幽默角色', prompt: '你是個冷面笑匠型的學習夥伴。用台灣繁體中文回答，擅長用雙關語和程式、課業相關的冷笑話化解壓力，但回答問題時仍然準確有用。每次最多 4 句。' },
    custom: { name: '自訂角色…', prompt: '' }
};
let history = [], busy = false;

// ---- 介面 ----
const sel = $('#roleSel');
Object.entries(ROLES).forEach(([k, r]) => sel.append(mk('option', { value: k }, r.name)));
sel.value = ai.role;
function syncRole() { $('#customPrompt').hidden = ai.role !== 'custom'; $('#customPrompt').value = ai.custom; }
sel.onchange = () => { ai.role = sel.value; saveAI(); syncRole(); };
$('#customPrompt').oninput = e => { ai.custom = e.target.value; saveAI(); };
syncRole();

function addMsg(who, text) {
    const m = mk('div', { className: 'msg-' + who }, text);
    $('#msgs').append(m); $('#msgs').scrollTop = 1e9; return m;
}
function openPanel() { $('#chat').hidden = false; $('#chatIn').focus(); }
$('#fab').onclick = () => {
    if (!$('#chat').hidden) { $('#chat').hidden = true; return; }
    if (!ai.key) { openKeyDlg(); return; } // 第一次使用：先跳出 Key 輸入視窗
    openPanel();
};
$('#closeChat').onclick = () => { $('#chat').hidden = true; };
$('#clr').onclick = () => { history = []; $('#msgs').innerHTML = ''; };

// ---- Key 設定 ----
function openKeyDlg() {
    $('#kIn').value = ai.key || '';
    $('#kModel').value = ai.model;
    $('#kAuto').checked = ai.auto;
    $('#kState').textContent = ai.key ? '目前狀態：已儲存 Key（只存在這個瀏覽器）' : '目前狀態：尚未設定 Key';
    $('#keyDlg').showModal();
}
$('#gear').onclick = openKeyDlg;
$('#kClose').onclick = () => $('#keyDlg').close();
$('#kSave').onclick = () => {
    const k = $('#kIn').value.trim();
    if (!k) { $('#kIn').focus(); return; }
    ai.key = k; ai.model = $('#kModel').value.trim() || 'llama-3.3-70b-versatile'; ai.auto = $('#kAuto').checked;
    saveAI(); $('#keyDlg').close(); openPanel();
};
$('#kClear').onclick = () => { // 斷開：把 Key 從本機移除
    delete ai.key; saveAI(); history = []; $('#msgs').innerHTML = '';
    $('#keyDlg').close(); $('#chat').hidden = true;
};

// ---- 呼叫 Groq ----
function systemPrompt() {
    const base = ai.role === 'custom' ? (ai.custom.trim() || '你是一個友善的學習助手，用台灣繁體中文回答。') : ROLES[ai.role].prompt;
    const k = dkey(new Date()), d = db.days[k] || {}, open = db.todos.filter(t => !t.done).length;
    return base + `\n\n[使用者今日狀態] 今天已專注 ${d.focus || 0} 分鐘；未完成待辦 ${open} 項。只在相關時自然運用，不要逐項複述。`;
}
function errText(status, j) {
    if (status === 401) return 'Key 無效或已失效，請按 ⚙ 重新輸入。';
    if (status === 429) return '請求太頻繁或超過免費額度，稍後再試。';
    if (status === 404 || /model/i.test(j.error?.message || '')) return `模型「${ai.model}」不可用，請按 ⚙ 改成 Groq 目前提供的模型。`;
    return j.error?.message || `發生錯誤（${status}）`;
}
async function ask(text, silent) {
    if (!ai.key) { openKeyDlg(); return; }
    if (busy) return;
    busy = true; $('#sendBtn').disabled = true;
    history.push({ role: 'user', content: text });
    if (!silent) addMsg('user', text);
    const holder = addMsg('bot', '…');
    try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.key },
            body: JSON.stringify({
                model: ai.model, temperature: 0.8, max_tokens: 600,
                messages: [{ role: 'system', content: systemPrompt() }, ...history.slice(-20)]
            })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(errText(r.status, j));
        const out = j.choices?.[0]?.message?.content?.trim() || '（沒有收到回覆）';
        holder.textContent = out; history.push({ role: 'assistant', content: out });
    } catch (e) {
        holder.textContent = '⚠ ' + (e instanceof TypeError ? '連不上 Groq，請檢查網路。' : e.message);
        holder.classList.add('err'); history.pop();
    }
    busy = false; $('#sendBtn').disabled = false; $('#msgs').scrollTop = 1e9;
}
function send() {
    const t = $('#chatIn').value.trim(); if (!t) return;
    $('#chatIn').value = ''; ask(t);
}
$('#sendBtn').onclick = send;
$('#chatIn').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

// ---- 情境觸發：番茄鐘結束（只有已設定 Key 且勾選自動觸發才會呼叫，不會偷偷消耗額度）----
document.addEventListener('pomodoro-end', e => {
    if (!ai.key || !ai.auto) return;
    const { mode, minutes } = e.detail;
    openPanel();
    ask(mode === 'focus'
        ? `[系統事件] 我剛完成 ${minutes} 分鐘的專注。請用你的角色給我一句獎勵語錄或一個短笑話。`
        : '[系統事件] 休息時間結束了，請用你的角色簡短提醒我回到專注。', true);
});

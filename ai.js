// ===== 右下角 AI 面板：聊天分頁（角色 + 工具）；問答分頁在 rag.js =====
// 需要 app.js、llm.js、tools.js 先載入：會用到 $、mk、db、ai、ROLES、callLLM、TOOLS
let history = [], busy = false;

// ---- 角色選單 ----
const sel = $('#roleSel');
Object.entries(ROLES).forEach(([k, r]) => sel.append(mk('option', { value: k }, r.icon + ' ' + r.name)));
sel.value = ai.role;
function syncRole() { $('#customPrompt').hidden = ai.role !== 'custom'; $('#customPrompt').value = ai.custom; }
sel.onchange = () => { ai.role = sel.value; saveAI(); syncRole(); document.dispatchEvent(new CustomEvent('role-changed')); };
$('#customPrompt').oninput = e => { ai.custom = e.target.value; saveAI(); };
syncRole();

// ---- 面板開關與分頁 ----
let tab = 'chat';
function showTab(t) {
    tab = t;
    document.querySelectorAll('#chat .tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#tab-chat').hidden = t !== 'chat'; $('#tab-qa').hidden = t !== 'qa';
    $(t === 'chat' ? '#chatIn' : '#qaIn').focus();
}
$('#chat .tabs').onclick = e => { if (e.target.dataset.tab) showTab(e.target.dataset.tab); };
function openPanel() { $('#chat').hidden = false; showTab(tab); }
window.openPanel = openPanel;
$('#fab').onclick = () => {
    if (!$('#chat').hidden) { $('#chat').hidden = true; return; }
    if (!ai.key) { openKeyDlg(openPanel); return; } // 第一次使用：先跳出 Key 輸入視窗，存好後自動打開面板
    openPanel();
};
$('#closeChat').onclick = () => { $('#chat').hidden = true; };
$('#clr').onclick = () => { // 清空目前分頁的對話
    if (tab === 'chat') { history = []; $('#msgs').innerHTML = ''; } else window.clearQA && clearQA();
};
document.addEventListener('key-cleared', () => { history = []; $('#msgs').innerHTML = ''; $('#chat').hidden = true; });

function addMsg(who, text, box = '#msgs') {
    const m = mk('div', { className: 'msg-' + who }, text);
    $(box).append(m); $(box).scrollTop = 1e9; return m;
}
window.addMsg = addMsg;

// ---- 聊天：呼叫 callLLM，並把天氣／匯率工具交給模型自己決定要不要用 ----
function chatSystem() {
    return rolePrompt() + '\n\n' + stateLine()
        + `\n你可以使用工具查詢天氣與匯率。只有使用者問到天氣、匯率或換算時才呼叫，查到的數字照實轉述，不要自己編造。使用者沒說城市時，預設是「${db.settings.city}」。`;
}
async function ask(text) {
    if (!ai.key) { openKeyDlg(); return; }
    if (busy) return;
    busy = true; $('#sendBtn').disabled = true;
    history.push({ role: 'user', content: text });
    addMsg('user', text);
    const holder = addMsg('bot', '…');
    try {
        const { text: out, used } = await callLLM({
            system: chatSystem(), messages: history.slice(-20), temperature: 0.8, tools: TOOLS,
            onTool: name => { holder.textContent = name === 'get_weather' ? '🔧 正在查詢天氣…' : '🔧 正在查詢匯率…'; }
        });
        const reply = out || '（沒有收到回覆）';
        holder.textContent = reply; history.push({ role: 'assistant', content: reply });
        if (used.length) holder.append(mk('small', { className: 'tool-note' }, '使用工具：' + [...new Set(used)].join('、')));
    } catch (e) {
        holder.textContent = '⚠ ' + netErr(e); holder.classList.add('err'); history.pop();
    }
    busy = false; $('#sendBtn').disabled = false; $('#msgs').scrollTop = 1e9;
}
function send() {
    const t = $('#chatIn').value.trim(); if (!t) return;
    $('#chatIn').value = ''; ask(t);
}
$('#sendBtn').onclick = send;
$('#chatIn').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };

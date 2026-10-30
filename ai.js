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
    if (tab === 'chat') { history = []; $('#msgs').innerHTML = ''; } else if (typeof clearQA === 'function') clearQA();
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
// ---- 工具備援 ----
// function calling 要靠模型自己決定呼叫（有些模型／帳號會不呼叫，或直接拒絕 tools 參數）。
// 所以模型沒用工具、但問題明顯是天氣或匯率時，由程式依關鍵字代為查詢，再把結果交給模型轉述。
const CITIES = ['台北', '臺北', '新北', '桃園', '台中', '臺中', '台南', '臺南', '高雄', '新竹', '基隆', '嘉義', '宜蘭', '花蓮', '台東', '臺東', '屏東', '彰化', '南投', '雲林', '苗栗', '澎湖', '金門',
    '東京', '大阪', '京都', '札幌', '福岡', '沖繩', '首爾', '釜山', '香港', '澳門', '上海', '北京', '深圳', '新加坡', '曼谷', '吉隆坡', '河內', '馬尼拉', '雪梨', '倫敦', '巴黎', '柏林', '紐約', '洛杉磯', '舊金山', '西雅圖', '溫哥華'];
const CUR = [['USD', /美金|美元|usd/i], ['TWD', /新?台幣|新?臺幣|twd|ntd/i], ['JPY', /日圓|日幣|jpy/i], ['EUR', /歐元|eur/i], ['CNY', /人民幣|cny|rmb/i],
['KRW', /韓元|韓幣|krw/i], ['HKD', /港幣|hkd/i], ['GBP', /英鎊|gbp/i], ['AUD', /澳幣|aud/i], ['THB', /泰銖|thb/i]];
const WEATHER_RE = /天氣|氣溫|溫度|下雨|降雨|帶傘|會冷|會熱|冷不冷|熱不熱|weather/i, FX_RE = /匯率|換算|兌換|換成|exchange/i;
function guessFx(text) {
    const hits = CUR.map(([c, re]) => [c, text.search(re)]).filter(x => x[1] >= 0).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    const from = hits[0] || 'USD', to = hits[1] || (from === 'TWD' ? 'USD' : 'TWD');
    return { from, to, amount: +(text.match(/\d+(\.\d+)?/) || [1])[0] };
}
async function manualTools(text) {
    const out = [], used = [];
    if (WEATHER_RE.test(text)) {
        const city = CITIES.find(c => text.includes(c)) || db.settings.city; used.push('get_weather');
        try { out.push({ tool: 'get_weather', city, result: await weather(city) }); } catch (e) { out.push({ tool: 'get_weather', city, error: netErr(e) }); }
    }
    if (FX_RE.test(text) || (/多少/.test(text) && CUR.filter(([, re]) => re.test(text)).length)) {
        const a = guessFx(text); used.push('get_exchange_rate');
        try { out.push({ tool: 'get_exchange_rate', result: await rate(a.from, a.to, a.amount) }); } catch (e) { out.push({ tool: 'get_exchange_rate', error: netErr(e) }); }
    }
    return { out, used };
}

async function ask(text) {
    if (!ai.key) { openKeyDlg(); return; }
    if (busy) return;
    busy = true; $('#sendBtn').disabled = true;
    history.push({ role: 'user', content: text });
    addMsg('user', text);
    const holder = addMsg('bot', '…');
    try {
        let r = await callLLM({
            system: chatSystem(), messages: history.slice(-20), temperature: 0.8, tools: TOOLS,
            onTool: name => { holder.textContent = name === 'get_weather' ? '🔧 正在查詢天氣…' : '🔧 正在查詢匯率…'; }
        });
        let note = r.used.length ? '使用工具：' + [...new Set(r.used)].join('、') : '';
        if (!r.used.length && (WEATHER_RE.test(text) || FX_RE.test(text) || /多少/.test(text))) { // 模型沒用工具 → 程式代查
            const m = await manualTools(text);
            if (m.used.length) {
                holder.textContent = '🔧 正在查詢…';
                r = await callLLM({
                    system: chatSystem() + '\n\n[工具查詢結果，由程式查詢；請照實轉述，查不到就直接說查不到，不要自己編數字]\n' + JSON.stringify(m.out),
                    messages: history.slice(-20), temperature: 0.6
                });
                note = '使用工具（程式代為查詢）：' + m.used.join('、');
            }
        }
        const reply = r.text || '（沒有收到回覆）';
        holder.textContent = reply; history.push({ role: 'assistant', content: reply });
        if (note) holder.append(mk('small', { className: 'tool-note' }, note));
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
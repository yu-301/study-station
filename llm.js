// ===== 共用 AI 引擎（Groq，OpenAI 相容格式）=====
// 整個網站只有這個檔案會真的 fetch Groq。所有 AI（聊天、問答、分析、音樂、夥伴）都呼叫 callLLM()。
// 需要 app.js 先載入：會用到 $、mk、db、dkey
const AIK = 'studyhub.ai'; // Key 和 AI 設定獨立存放，不和學習資料混在一起
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b'; // 課堂使用的模型（Groq 上的實際 ID 不含 "groq:" 前綴）
let ai = {};
try { ai = JSON.parse(localStorage.getItem(AIK)) || {}; } catch { }
if (!ai.model || ai.model === 'llama-3.3-70b-versatile') ai.model = DEFAULT_MODEL; // 舊版預設值自動換新
ai.role = ai.role || 'puppy';
ai.custom = ai.custom || '';
if (ai.auto === undefined) ai.auto = true;
const saveAI = () => { try { localStorage.setItem(AIK, JSON.stringify(ai)); } catch { } };

// ---- 角色（聊天 AI 與夥伴 AI 共用；原作角色只描述說話風格，不複製台詞）----
const ROLES = {
    puppy: { name: '誇誇小狗', icon: '🐶', prompt: '你是一隻熱情的小狗學習夥伴。用台灣繁體中文回答，語氣活潑，偶爾說「汪！」。擅長具體地稱讚使用者的努力，不說教。' },
    ta: { name: '嚴厲資工助教', icon: '🧑‍🏫', prompt: '你是嚴厲但公正的資工系助教。用台灣繁體中文回答，直接指出問題，給具體的改進步驟。遇到程式問題，會要求對方提供程式碼與完整錯誤訊息，再一步步排查。不囉嗦，不客套。' },
    funny: { name: '幽默角色', icon: '🎭', prompt: '你是個冷面笑匠型的學習夥伴。用台灣繁體中文回答，擅長用雙關語和程式、課業相關的冷笑話化解壓力，但回答問題時仍然準確有用。' },
    shin: { name: '蠟筆小新風', icon: '🖍️', prompt: '你扮演一個調皮、天真、愛開玩笑、偶爾吐槽大人的 5 歲小孩口吻的學習夥伴（蠟筆小新風格，但不要照抄原作台詞）。用台灣繁體中文回答，可以調侃使用者拖延，但回答問題時內容必須正確、有幫助。' },
    conan: { name: '名偵探柯南風', icon: '🔍', prompt: '你扮演一個冷靜敏銳的少年偵探型學習夥伴（名偵探柯南風格，但不要照抄原作台詞）。用台灣繁體中文回答，擅長把問題拆成「線索 → 推論 → 結論」，遇到使用者拖延會用推理的口吻點出破綻。回答必須準確。' },
    doraemon: { name: '哆啦A夢風', icon: '🔔', prompt: '你扮演一個溫暖、有點操心的未來機器人朋友（哆啦A夢風格，但不要照抄原作台詞）。用台灣繁體中文回答，遇到困難時會像從口袋「變出」一個具體可行的小道具或方法（用比喻即可），語氣親切。' },
    custom: { name: '自訂角色…', icon: '💬', prompt: '' }
};
const roleInfo = () => ROLES[ai.role] || ROLES.puppy;
function rolePrompt() {
    if (ai.role === 'custom') return ai.custom.trim() || '你是一個友善的學習助手，用台灣繁體中文回答。';
    return roleInfo().prompt;
}
function stateLine() { // 今日狀態：給 AI 的背景資訊（只在相關時自然運用）
    const k = dkey(new Date()), d = db.days[k] || {}, open = db.todos.filter(t => !t.done).length;
    return `[使用者今日狀態] 今天已專注 ${d.focus || 0} 分鐘；未完成待辦 ${open} 項。只在相關時自然運用，不要逐項複述。`;
}

// ---- 錯誤訊息 ----
function errText(status, j) {
    if (status === 401) return 'Key 無效或已失效，請按 ⚙ 重新輸入。';
    if (status === 429) return '請求太頻繁或超過免費額度，稍後再試。';
    if (status === 404 || /model/i.test(j.error?.message || '')) return `模型「${ai.model}」不可用，請按 ⚙ 改成 Groq 目前提供的模型。`;
    return j.error?.message || `發生錯誤（${status}）`;
}
const netErr = e => e instanceof TypeError ? '連不上網路，請檢查連線。' : e.message;

// ---- 呼叫 Groq ----
async function llmRequest(msgs, o) {
    const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.key },
        body: JSON.stringify({
            model: ai.model, temperature: o.temperature ?? 0.7, max_tokens: o.max ?? 1500,
            // gpt-oss 是推理模型，推理過程也會吃 token；調成 low 才不會把回答額度用光
            ...(/gpt-oss/.test(ai.model) ? { reasoning_effort: o.effort || 'low' } : {}),
            ...(o.tools ? { tools: o.tools.map(t => ({ type: 'function', function: t.def })), tool_choice: 'auto' } : {}),
            messages: msgs
        })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(errText(r.status, j)), { status: r.status });
    return j.choices?.[0]?.message || {};
}
// o = { system, messages, temperature, max, effort, tools:[{def,run}], onTool(name,args) }
// 回傳 { text, used:[用過的工具名稱] }
async function callLLM(o) {
    if (!ai.key) throw new Error('尚未設定 API Key');
    const msgs = [{ role: 'system', content: o.system }, ...o.messages], used = [];
    for (let i = 0; i < 4; i++) { // 最多 4 輪：模型要工具 → 我們執行 → 把結果交回去
        let m;
        try { m = await llmRequest(msgs, o); }
        catch (e) { // 模型或帳號不支援 tools 時，退回「不用工具」再試一次
            if (o.tools && e.status === 400 && !used.length) { o = { ...o, tools: null }; i--; continue; }
            throw e;
        }
        if (!m.tool_calls?.length) return { text: (m.content || '').trim(), used };
        msgs.push({ role: 'assistant', content: m.content || '', tool_calls: m.tool_calls });
        for (const c of m.tool_calls) {
            const t = (o.tools || []).find(x => x.def.name === c.function.name);
            let args = {}, out;
            try { args = JSON.parse(c.function.arguments || '{}'); } catch { }
            o.onTool && o.onTool(c.function.name, args);
            try { out = t ? await t.run(args) : { error: '沒有這個工具' }; } catch (e) { out = { error: netErr(e) }; }
            used.push(c.function.name);
            msgs.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out) });
        }
    }
    return { text: '（工具呼叫次數過多，請換個方式問問看）', used };
}
// 模型有時會在 JSON 前後加文字或 ```，這裡只取第一個完整的 {...} 或 [...]
function parseJSON(text) {
    const s = String(text).replace(/```json|```/g, '');
    const a = s.search(/[\[{]/); if (a < 0) throw new Error('回覆不是 JSON');
    const open = s[a], close = open === '{' ? '}' : ']', b = s.lastIndexOf(close);
    return JSON.parse(s.slice(a, b + 1));
}

// ---- Key 設定視窗（Groq Key 所有 AI 功能共用；天氣、匯率的 Key 選填，沒填就用免 Key 來源）----
let afterKey = null;
function openKeyDlg(after) {
    afterKey = typeof after === 'function' ? after : null;
    $('#kIn').value = ai.key || '';
    $('#kModel').value = ai.model; $('#kModel').placeholder = DEFAULT_MODEL;
    $('#kOwm').value = ai.owmKey || ''; $('#kFx').value = ai.fxKey || '';
    $('#kAuto').checked = ai.auto;
    $('#kState').textContent = ai.key ? '目前狀態：已儲存 Groq Key（只存在這個瀏覽器）' : '目前狀態：尚未設定 Groq Key';
    $('#keyDlg').showModal();
}
$('#gear').onclick = () => openKeyDlg();
$('#kClose').onclick = () => $('#keyDlg').close();
$('#kSave').onclick = () => {
    const k = $('#kIn').value.trim(), owm = $('#kOwm').value.trim(), fx = $('#kFx').value.trim();
    if (!k && !owm && !fx) { $('#kIn').focus(); return; }
    if (k) ai.key = k; else delete ai.key;
    ai.model = $('#kModel').value.trim() || DEFAULT_MODEL; ai.auto = $('#kAuto').checked;
    if (owm) ai.owmKey = owm; else delete ai.owmKey;
    if (fx) ai.fxKey = fx; else delete ai.fxKey;
    saveAI(); $('#keyDlg').close();
    document.dispatchEvent(new CustomEvent('keys-changed'));
    const f = afterKey; afterKey = null; if (f && ai.key) f();
};
$('#kClear').onclick = () => { // 斷開：把所有 Key 從本機移除
    delete ai.key; delete ai.owmKey; delete ai.fxKey; saveAI(); $('#keyDlg').close();
    document.dispatchEvent(new CustomEvent('key-cleared'));
    document.dispatchEvent(new CustomEvent('keys-changed'));
};
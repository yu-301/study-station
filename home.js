// ===== 今日總覽 =====
// 需要 app.js、llm.js、tools.js 先載入
const FX_LIST = [['USD', '美元'], ['JPY', '日圓'], ['EUR', '歐元'], ['KRW', '韓元']];
let weatherNow = null;

function renderToday() {
    const k = dkey(new Date()), d = db.days[k] || {};
    const items = [
        ['今日專注', (d.focus || 0) + ' 分鐘'],
        ['完成待辦', dayTodos(k).length + ' 項'],
        ['今日花費', dayMoney(k) + ' 元'],
        ['今日運動', dayWork(k).reduce((s, w) => s + w.min, 0) + ' 分鐘']
    ];
    const box = $('#hToday'); box.innerHTML = '';
    items.forEach(([l, v]) => { const c = mk('div', { className: 'card' }); c.append(mk('span', {}, l), mk('strong', {}, v)); box.append(c); });
}
function renderDeadlines() {
    const ul = $('#hDue'); ul.innerHTML = '';
    // deadline 在 3 天內（含今天、已逾期）的未完成待辦
    const rows = db.todos.filter(t => !t.done && t.due && dueDays(t) <= 3).sort((a, b) => a.due.localeCompare(b.due));
    rows.forEach(t => {
        const li = mk('li'); li.append(mk('span', { className: 'grow' }, t.text), mk('span', { className: 'due s' + (dueStage(t) || 1) }, dueLabel(t)), mk('span', { className: 'dt' }, t.due.slice(5)));
        ul.append(li);
    });
    if (!rows.length) ul.append(mk('li', { className: 'soon' }, '3 天內沒有到期的待辦。'));
}
async function renderWeather() {
    const box = $('#hWeather'), city = db.settings.city;
    $('#cityIn').value = city; box.textContent = '查詢中…'; box.classList.remove('err-text');
    try {
        weatherNow = await weather(city);
        const w = weatherNow;
        box.innerHTML = '';
        box.append(mk('strong', { className: 'big' }, `${w.氣溫}・${w.現在天氣}`),
            mk('span', {}, `${w.地點}`),
            mk('span', {}, w.今日最低 ? `今日 ${w.今日最低} ~ ${w.今日最高}，降雨機率 ${w.降雨機率}` : `目前區域 ${w.區域最低} ~ ${w.區域最高}${w.近一小時降雨 ? '，近一小時降雨 ' + w.近一小時降雨 : ''}`),
            mk('span', {}, `體感 ${w.體感}，濕度 ${w.濕度}`), mk('span', { className: 'soon' }, `來源：${w.資料來源}${w.備註 ? '（' + w.備註 + '）' : ''}`));
    } catch (e) { weatherNow = null; box.textContent = '⚠ ' + netErr(e); box.classList.add('err-text'); }
}
async function renderFx() {
    const ul = $('#hFx'); ul.innerHTML = '';
    try {
        const rows = await Promise.all(FX_LIST.map(async ([c, n]) => [c, n, await rate(c, 'TWD', c === 'JPY' || c === 'KRW' ? 100 : 1)]));
        rows.forEach(([c, n, r]) => {
            const li = mk('li'); li.append(mk('span', { className: 'grow' }, `${r.金額} ${c}（${n}）`), mk('strong', {}, `${r.換算結果} TWD`));
            ul.append(li);
        });
        const meta = await ratesOf('USD');
        ul.append(mk('li', { className: 'soon' }, `資料日期：${meta.date}・來源：${meta.src}${meta.note ? '（' + meta.note + '）' : ''}`));
    } catch (e) { ul.append(mk('li', { className: 'err-text' }, '⚠ ' + netErr(e))); }
}
$('#tKeys').onclick = () => openKeyDlg();
document.addEventListener('keys-changed', () => { renderWeather(); renderFx(); });
$('#cityGo').onclick = () => { db.settings.city = $('#cityIn').value.trim() || '台北'; save(); renderWeather(); };
$('#cityIn').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) $('#cityGo').click(); };

// ---- 今日 AI 建議：把天氣、待辦、專注量交給目前選的角色 ----
$('#hAI').onclick = async () => {
    if (!ai.key) { openKeyDlg(() => $('#hAI').click()); return; }
    const out = $('#hAIout'); $('#hAI').disabled = true; out.textContent = '想想看…'; out.classList.remove('err');
    const k = dkey(new Date()), d = db.days[k] || {};
    const due = db.todos.filter(t => !t.done && t.due).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5).map(t => `${t.text}（${dueLabel(t)}）`).join('、') || '無';
    const open = db.todos.filter(t => !t.done && !t.due).length;
    const info = `日期：${k}\n天氣：${weatherNow ? `${weatherNow.地點}，${weatherNow.現在天氣}，${weatherNow.氣溫}${weatherNow.降雨機率 ? '，降雨機率 ' + weatherNow.降雨機率 : ''}` : '沒有取得'}\n今天已專注 ${d.focus || 0} 分鐘；今天運動 ${dayWork(k).reduce((s, w) => s + w.min, 0)} 分鐘\n有 deadline 的待辦：${due}\n沒 deadline 的未完成待辦：${open} 項`;
    try {
        const { text } = await callLLM({
            system: rolePrompt() + '\n\n請根據使用者提供的資料，給今天的 3 點具體建議（讀書安排、要不要出門或帶傘、先做哪件待辦）。只根據資料，不要編造；總長 150 字內。',
            messages: [{ role: 'user', content: info }], temperature: 0.7, max: 700
        });
        out.textContent = text || '（沒有收到回覆）';
    } catch (e) { out.textContent = '⚠ ' + netErr(e); out.classList.add('err'); }
    $('#hAI').disabled = false;
};

function renderHome() { renderToday(); renderDeadlines(); }
document.addEventListener('viewchange', e => { if (e.detail === 'home') renderHome(); });
setInterval(() => { if (!$('#view-home').hidden) renderHome(); }, 60000);
renderHome(); renderWeather(); renderFx();
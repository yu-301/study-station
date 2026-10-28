// ===== 數據統計 =====
// 需要 app.js、ai.js 先載入（用到 db、dkey、mk、$、ai、errText、openKeyDlg）
const charts = {};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} 小時 ${Math.round(m % 60)} 分` : `${Math.round(m)} 分`;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function getRange() {
    const v = $('#sRange').value, today = new Date(); today.setHours(0, 0, 0, 0);
    if (v === 'custom') {
        const f = $('#sFrom').value, t = $('#sTo').value;
        if (!f || !t || f > t) return null;
        return { from: new Date(f + 'T00:00'), to: new Date(t + 'T00:00') };
    }
    return { from: addDays(today, -(+v - 1)), to: today };
}
function keysOf(from, to) {
    const a = [];
    for (let d = new Date(from); d <= to && a.length < 400; d = addDays(d, 1)) a.push(dkey(d));
    return a;
}
function calc(keys) {
    const focus = keys.map(k => (db.days[k] || {}).focus || 0);
    const hours = Array(24).fill(0);
    keys.forEach(k => ((db.days[k] || {}).sessions || []).forEach(s => {
        // 把一段專注依「跨過的整點」切開，分別累加到各個小時
        let t = s.start; const end = s.start + s.min * 60000;
        while (t < end) {
            const d = new Date(t), next = new Date(d); next.setHours(d.getHours() + 1, 0, 0, 0);
            const seg = Math.min(end, next.getTime()) - t;
            hours[d.getHours()] += seg / 60000; t += seg;
        }
    }));
    return { focus, hours, total: focus.reduce((a, b) => a + b, 0) };
}

function drawChart(id, cfg) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($('#' + id), cfg);
}
function renderStats() {
    const r = getRange(), box = $('#sCards');
    box.innerHTML = '';
    if (!r) { box.append(mk('p', { className: 'soon' }, '請選擇有效的起訖日期。')); return; }
    if (typeof Chart === 'undefined') { box.append(mk('p', { className: 'soon' }, '圖表套件載入失敗，請檢查網路後重新整理。')); return; }
    const keys = keysOf(r.from, r.to), n = keys.length, c = calc(keys);
    const prev = calc(keysOf(addDays(r.from, -n), addDays(r.from, -1)));
    const set = new Set(keys), days = c.focus.filter(x => x > 0).length;
    const todos = db.todos.filter(t => set.has(t.doneAt)).length;
    const spend = db.expenses.filter(e => set.has(e.date)).reduce((s, e) => s + e.amount, 0);
    const delta = prev.total ? Math.round((c.total - prev.total) / prev.total * 100) : null;
    [
        ['總專注時間', fmtMin(c.total)],
        ['有讀書的天數', `${days} / ${n} 天`],
        ['日均', fmtMin(c.total / n)],
        ['最長的一天', fmtMin(Math.max(0, ...c.focus))],
        ['較前一段同長度期間', delta === null ? '前期無資料' : (delta >= 0 ? '+' : '') + delta + '%'],
        ['完成待辦 / 支出', `${todos} 項 / ${spend} 元`]
    ].forEach(([l, v]) => {
        const card = mk('div', { className: 'card' });
        card.append(mk('span', {}, l), mk('strong', {}, v));
        box.append(card);
    });

    Chart.defaults.color = css('--mute'); Chart.defaults.borderColor = css('--line');
    const opt = (yTitle, xTitle) => ({
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, title: { display: true, text: yTitle } }, x: { title: { display: !!xTitle, text: xTitle } } }
    });
    drawChart('cDaily', { type: 'bar', data: { labels: keys.map(k => k.slice(5)), datasets: [{ data: c.focus, backgroundColor: css('--accent') }] }, options: opt('分鐘') });
    drawChart('cHour', { type: 'bar', data: { labels: c.hours.map((_, i) => i), datasets: [{ data: c.hours.map(Math.round), backgroundColor: css('--warm') }] }, options: opt('分鐘', '一天中的時刻（點）') });
}

// ---- 專屬 AI 分析（固定的分析師角色，不受右下角聊天角色影響）----
const ANALYST = '你是學習數據分析師，用台灣繁體中文回答。只根據提供的資料分析，不要編造資料裡沒有的事；資料不足時直接說明。輸出格式：1) 一句話總結；2) 觀察到的模式（要引用具體的數字或日期，包含專注時段與筆記主題）；3) 兩到三條具體可執行的建議。總長度控制在 300 字內。';
function buildPayload(keys, c) {
    const top = c.hours.map((m, h) => [h, m]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => `${x[0]}點(${Math.round(x[1])}分)`).join('、');
    const lines = [];
    keys.forEach(k => {
        const d = db.days[k], done = db.todos.filter(t => t.doneAt === k).map(t => t.text);
        if (!(d && (d.focus || d.notes || (d.tags || []).length)) && !done.length) return;
        lines.push(`${k}｜專注 ${(d && d.focus) || 0} 分｜標籤：${((d && d.tags) || []).join('、') || '無'}｜完成待辦：${done.join('、') || '無'}｜筆記：${((d && d.notes) || '').slice(0, 200) || '無'}`);
    });
    if (!lines.length) return null;
    return `分析期間：${keys[0]} 到 ${keys[keys.length - 1]}（${keys.length} 天）\n總專注 ${c.total} 分鐘；專注最多的時段：${top || '無資料'}\n\n逐日紀錄：\n` + lines.slice(-60).join('\n');
}
$('#sAI').onclick = async () => {
    const r = getRange(), out = $('#sOut');
    if (!r) { out.textContent = '請先選擇有效的日期範圍。'; return; }
    if (!ai.key) { openKeyDlg(); return; }
    const keys = keysOf(r.from, r.to), c = calc(keys), payload = buildPayload(keys, c);
    if (!payload) { out.textContent = '這段期間還沒有資料，先去跑幾個番茄鐘或寫點筆記吧。'; return; }
    $('#sAI').disabled = true; out.textContent = '分析中…'; out.classList.remove('err');
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.key },
            body: JSON.stringify({
                model: ai.model, temperature: 0.5, max_tokens: 2000,
                ...(/gpt-oss/.test(ai.model) ? { reasoning_effort: 'low' } : {}),
                messages: [{ role: 'system', content: ANALYST }, { role: 'user', content: payload }]
            })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errText(res.status, j));
        out.textContent = j.choices?.[0]?.message?.content?.trim() || '（沒有收到回覆）';
    } catch (e) {
        out.textContent = '⚠ ' + (e instanceof TypeError ? '連不上 Groq，請檢查網路。' : e.message); out.classList.add('err');
    }
    $('#sAI').disabled = false;
};

// ---- 事件 ----
$('#sTo').value = dkey(new Date()); $('#sFrom').value = dkey(addDays(new Date(), -6));
$('#sRange').onchange = () => { $('#sCustom').hidden = $('#sRange').value !== 'custom'; renderStats(); };
$('#sFrom').onchange = $('#sTo').onchange = renderStats;
$('#nav').addEventListener('click', e => { if (e.target.dataset.view === 'stats') setTimeout(renderStats, 0); }); // 切到統計頁才畫，圖表尺寸才正確
// ===== 備份：匯出／匯入 JSON =====
// 資料全存在這個瀏覽器的 localStorage；匯出成檔案後，可以在別的瀏覽器或電腦匯入。
// 匯出內容：學習資料（含每週挑戰）、上傳的文件、AI 角色設定。API Key 不會匯出。
// 需要 app.js、llm.js、rag.js 先載入（KEY、DOCK、AIK、db、ai、dkey、mk、$）
function exportData() {
    let docsRaw = []; try { docsRaw = JSON.parse(localStorage.getItem(DOCK)) || []; } catch { }
    const { key, owmKey, fxKey, ...aiSafe } = ai;
    const out = { app: 'studyhub', version: 1, exportedAt: new Date().toISOString(), data: db, docs: docsRaw, ai: aiSafe };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
    const a = mk('a', { href: url, download: `study-station-backup-${dkey(new Date())}.json` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#status').textContent = '已匯出備份檔';
}
async function importData(file) {
    let o;
    try { o = JSON.parse(await file.text()); } catch { alert('匯入失敗：這個檔案不是有效的 JSON。'); return; }
    if (!o || o.app !== 'studyhub' || !o.data || typeof o.data !== 'object' || !o.data.days) { alert('匯入失敗：這不是學習儀表板的備份檔。'); return; }
    const days = Object.keys(o.data.days).length, todos = (o.data.todos || []).length;
    if (!confirm(`要匯入「${file.name}」嗎？\n備份裡有 ${days} 天的紀錄、${todos} 項待辦。\n這個瀏覽器目前的資料會被覆蓋，無法復原。`)) return;
    localStorage.setItem(KEY, JSON.stringify(o.data));
    if (Array.isArray(o.docs)) localStorage.setItem(DOCK, JSON.stringify(o.docs));
    if (o.ai) { // 只換角色／模型設定，保留這個瀏覽器自己的 Key
        let cur = {}; try { cur = JSON.parse(localStorage.getItem(AIK)) || {}; } catch { }
        const { role, custom, model, auto } = o.ai;
        localStorage.setItem(AIK, JSON.stringify({ ...cur, ...(role && { role }), ...(custom !== undefined && { custom }), ...(model && { model }), ...(auto !== undefined && { auto }) }));
    }
    location.reload();
}
$('#exportBtn').onclick = exportData;
$('#importBtn').onclick = () => $('#importIn').click();
$('#importIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importData(f); };
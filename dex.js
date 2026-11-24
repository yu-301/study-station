// ===== 熊圖鑑 =====
// 圖庫（assets 資料夾）裡每一張圖：蒐集過的顯示圖片＋累計數量，還沒蒐集到的顯示成剪影。
// - 熊每週重置只影響「每週挑戰」的舞台；所有抽過的熊都還留在 db.game.bears，這裡是從頭到尾的累計。
// - 圖庫是動態的：每次進圖鑑都重新讀一次（5 分鐘內用快取，可以按「重新讀取圖庫」強制更新）；新放進圖庫的圖會自動出現成剪影，並標上 NEW（7 天）。
// - 圖庫裡已經被刪掉、但你抽到過的熊，還是會留在圖鑑裡（標示「圖庫已移除」）。
// 需要 app.js、game.js 先載入（gm、weekBears、mondayKey、loadPool、pool、poolP、poolInfo、save、mk、$）
const DEX_NEW_DAYS = 7;
let dexFilter = 'all', dexBusy = false;
const dexName = src => { try { return decodeURIComponent(src.replace(/^.*\//, '')); } catch { return src; } };

async function renderDex(force) {
    if (dexBusy) return; dexBusy = true;
    $('#dexInfo').textContent = '讀取圖庫中…';
    try { poolP = loadPool(!!force); await poolP; } catch { }
    const g = gm(), now = Date.now(), wk = mondayKey(), cnt = new Map(), first = new Map(), weekCnt = new Map();
    g.bears.forEach(b => {
        if (!b.src) return; // 圖庫還沒有圖時抽到的熊沒有圖，不列入
        cnt.set(b.src, (cnt.get(b.src) || 0) + 1);
        if (!first.has(b.src) || b.t < first.get(b.src)) first.set(b.src, b.t);
        if (b.wk === wk) weekCnt.set(b.src, (weekCnt.get(b.src) || 0) + 1);
    });
    // 新圖偵測：第一次開圖鑑時，現有的圖都算「舊的」；之後才出現的圖記下第一次看到的時間
    if (!g.dexSeen) { g.dexSeen = {}; pool.forEach(s => { g.dexSeen[s] = 0; }); save(); }
    let changed = false; pool.forEach(s => { if (!(s in g.dexSeen)) { g.dexSeen[s] = now; changed = true; } }); if (changed) save();

    const inPool = new Set(pool), all = [...pool, ...[...cnt.keys()].filter(s => !inPool.has(s))];
    const owned = pool.filter(s => cnt.has(s)).length, pct = pool.length ? Math.round(owned / pool.length * 100) : 0;
    $('#dexInfo').textContent = pool.length
        ? `累計共抽到 ${g.bears.length} 隻（從頭到尾）・圖庫 ${pool.length} 種，已蒐集 ${owned} 種（${pct}%）・本週 ${weekBears().length} 隻`
        : `累計共抽到 ${g.bears.length} 隻・圖庫還是空的（${poolInfo || 'assets/ 裡還沒有圖片'}）`;
    document.querySelectorAll('#dexFilter button').forEach(b => b.classList.toggle('on', b.dataset.f === dexFilter));

    const grid = $('#dexGrid'); grid.innerHTML = '';
    all.filter(s => dexFilter === 'all' || (dexFilter === 'got' ? cnt.has(s) : !cnt.has(s))).forEach(src => {
        const n = cnt.get(src) || 0, isNew = !n && g.dexSeen[src] > 0 && now - g.dexSeen[src] < DEX_NEW_DAYS * 864e5;
        const card = mk('div', { className: 'dexcard' + (n ? '' : ' locked') });
        card.title = n ? `${dexName(src)}\n累計 ${n} 隻・本週 ${weekCnt.get(src) || 0} 隻\n第一次得到：${new Date(first.get(src)).toLocaleDateString('zh-TW')}${inPool.has(src) ? '' : '\n（圖庫已移除）'}`
            : (isNew ? '新加入圖庫的熊！還沒蒐集到' : '還沒蒐集到'); // 沒蒐集到的不顯示檔名，不劇透
        const img = mk('img', { src, alt: n ? dexName(src) : '未蒐集的熊', loading: 'lazy', draggable: false });
        img.onerror = () => img.replaceWith(mk('span', { className: 'remo' }, '🧸'));
        card.append(img);
        if (n) card.append(mk('span', { className: 'dexn' }, '×' + n)); else card.append(mk('span', { className: 'dexq' }, '？'));
        if (isNew) card.append(mk('span', { className: 'dexnew' }, 'NEW'));
        if (n && !inPool.has(src)) card.append(mk('span', { className: 'dexgone' }, '已移除'));
        grid.append(card);
    });
    if (!grid.children.length) grid.append(mk('p', { className: 'soon' }, dexFilter === 'got' ? '還沒有蒐集到任何一張。' : dexFilter === 'miss' ? '🎉 圖庫裡的熊你全部蒐集到了！' : '沒有圖片。'));
    dexBusy = false;
}
$('#dexFilter').onclick = e => { const f = e.target.dataset.f; if (!f) return; dexFilter = f; renderDex(); };
$('#dexReload').onclick = () => renderDex(true);
document.addEventListener('viewchange', e => { if (e.detail === 'dex') renderDex(); });
document.addEventListener('bears-changed', () => { if (!$('#view-dex').hidden) renderDex(); }); // 在圖鑑頁開著時抽到新熊，馬上更新
// ===== 音樂 AI =====
// LLM 不知道真實的 YouTube 影片 ID，叫它給連結一定會編造。
// 所以只讓它回傳「歌名 + 歌手」的 JSON，連結由我們用 YouTube 搜尋網址自己組：就算 AI 記錯歌，也只是搜尋結果不準，不會變成死連結。
// 需要 app.js、llm.js 先載入
const MUSIC_SYSTEM = `你是專注讀書用的音樂推薦助手。使用者會描述想聽的氛圍、類型，或直接給一首歌名。
只輸出一個 JSON 物件，不要任何其他文字：
{"say":"一句 30 字內的回應","songs":[{"title":"歌名","artist":"歌手或空字串"}]}
規則：
1) 推薦 4 到 5 首。
2) 使用者給的是歌名：第一首就是那首歌（附上正確歌手），其餘是風格相近、適合專注的歌。
3) 使用者給的是氛圍或類型：優先推薦歌詞少或純音樂、節奏平穩、適合讀書的歌。
4) 只推薦你確定真實存在的歌曲。不確定時改給搜尋關鍵字，例如 {"title":"lofi hip hop radio","artist":""}。`;
const ytLink = s => 'https://www.youtube.com/results?search_query=' + encodeURIComponent((s.title + ' ' + (s.artist || '')).trim());

function renderSongs(data) {
    const out = $('#mOut'); out.innerHTML = '';
    const songs = (Array.isArray(data.songs) ? data.songs : []).filter(s => s && typeof s.title === 'string' && s.title.trim()).slice(0, 6);
    if (data.say) out.append(mk('p', { className: 'say' }, String(data.say)));
    if (!songs.length) { out.append(mk('p', { className: 'soon' }, '這次沒有推薦出歌，換個說法再試一次。')); return; }
    const box = mk('div', { className: 'songs' });
    songs.forEach(s => box.append(mk('a', {
        className: 'song', href: ytLink(s), target: '_blank', rel: 'noopener noreferrer',
        title: '在 YouTube 搜尋這首歌'
    }, '▶ ' + s.title + (s.artist ? ' — ' + s.artist : ''))));
    out.append(box);
}
async function recommend() {
    const q = $('#mIn').value.trim(), out = $('#mOut');
    if (!q) { $('#mIn').focus(); return; }
    if (!ai.key) { openKeyDlg(recommend); return; }
    $('#mGo').disabled = true; out.innerHTML = ''; out.append(mk('p', { className: 'soon' }, '挑歌中…'));
    try {
        const { text } = await callLLM({ system: MUSIC_SYSTEM, messages: [{ role: 'user', content: q }], temperature: 0.8, max: 800 });
        renderSongs(parseJSON(text));
    } catch (e) {
        out.innerHTML = ''; out.append(mk('p', { className: 'err-text' }, '⚠ ' + (e instanceof SyntaxError || /JSON/.test(e.message) ? 'AI 回覆的格式讀不懂，請再按一次推薦。' : netErr(e))));
    }
    $('#mGo').disabled = false;
}
$('#mGo').onclick = recommend;
$('#mIn').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) recommend(); };

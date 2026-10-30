// ===== 外部工具：天氣（Open-Meteo）、匯率（open.er-api.com）=====
// 兩個都不需要使用者另外申請 Key。同一批函式有兩種用法：
//   1) 「今日總覽」頁直接呼叫     2) 包成 TOOLS 讓聊天 AI 用 function calling 自己決定要不要呼叫
const WMO = {
    0: '晴朗', 1: '大致晴朗', 2: '局部多雲', 3: '陰天', 45: '霧', 48: '霧凇',
    51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨', 56: '凍毛毛雨', 57: '凍毛毛雨',
    61: '小雨', 63: '中雨', 65: '大雨', 66: '凍雨', 67: '凍雨', 71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
    80: '短暫陣雨', 81: '陣雨', 82: '強陣雨', 85: '陣雪', 86: '強陣雪', 95: '雷雨', 96: '雷雨夾冰雹', 99: '強雷雨夾冰雹'
};
const cache = new Map(); // 簡單的記憶體快取，避免短時間重複打 API
async function cached(key, ttlMs, fn) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < ttlMs) return hit.v;
    const v = await fn(); cache.set(key, { v, t: Date.now() }); return v;
}
async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw Object.assign(new Error(`資料來源回應 ${r.status}`), { status: r.status });
    return r.json();
}
document.addEventListener('keys-changed', () => cache.clear()); // 換了 Key 就不要用舊的快取結果

// ---- 天氣 ----
// 有 OpenWeatherMap Key：用 OpenWeatherMap；沒有（或失敗）：用免 Key 的 Open-Meteo。
// 兩邊都先把地名轉成座標。OpenWeatherMap 的 q=城市 對中文地名不太友善，所以座標一律先查好再用 lat/lon 查天氣。
async function geocode(city) {
    const variants = [...new Set([city, city.replace(/台/g, '臺'), city.replace(/臺/g, '台')])];
    if (ai.owmKey) {
        for (const v of variants) {
            try {
                const g = await getJSON(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(v)}&limit=1&appid=${encodeURIComponent(ai.owmKey)}`);
                if (Array.isArray(g) && g.length) return { name: g[0].local_names?.zh || g[0].local_names?.['zh-TW'] || g[0].name, lat: g[0].lat, lon: g[0].lon, country: g[0].country };
            } catch (e) { if (e.status === 401) break; }
        }
    }
    for (const v of variants) {
        const res = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(v)}&count=1&language=zh&format=json`);
        if (res.results?.length) { const g = res.results[0]; return { name: [g.name, g.admin1].filter(Boolean).join('，'), lat: g.latitude, lon: g.longitude, country: g.country }; }
    }
    throw new Error(`找不到「${city}」，試試英文名稱（例如 Taipei）`);
}
async function weatherOWM(g) {
    const w = await getJSON(`https://api.openweathermap.org/data/2.5/weather?lat=${g.lat}&lon=${g.lon}&appid=${encodeURIComponent(ai.owmKey)}&units=metric&lang=zh_tw`);
    return {
        地點: [w.name || g.name, w.sys?.country || g.country].filter(Boolean).join('，'),
        現在天氣: w.weather?.[0]?.description || '未知', 氣溫: Math.round(w.main.temp * 10) / 10 + '°C', 體感: Math.round(w.main.feels_like * 10) / 10 + '°C',
        濕度: w.main.humidity + '%', 風速: w.wind?.speed + ' m/s', 區域最低: w.main.temp_min + '°C', 區域最高: w.main.temp_max + '°C',
        ...(w.rain?.['1h'] ? { 近一小時降雨: w.rain['1h'] + ' mm' } : {}), 資料來源: 'OpenWeatherMap'
    };
}
async function weatherOpenMeteo(g) {
    const f = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}`
        + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m'
        + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1');
    const c = f.current, d = f.daily;
    return {
        地點: [g.name, g.country].filter(Boolean).join('，'),
        現在天氣: WMO[c.weather_code] || '未知', 氣溫: c.temperature_2m + '°C', 體感: c.apparent_temperature + '°C',
        濕度: c.relative_humidity_2m + '%', 風速: c.wind_speed_10m + ' km/h',
        今日最高: d.temperature_2m_max[0] + '°C', 今日最低: d.temperature_2m_min[0] + '°C',
        降雨機率: (d.precipitation_probability_max[0] ?? '未知') + '%', 資料來源: 'Open-Meteo'
    };
}
function weather(city) {
    city = String(city || '').trim() || '台北';
    return cached('w:' + city + ':' + !!ai.owmKey, 10 * 60000, async () => {
        const g = await geocode(city); let note = '';
        if (ai.owmKey) {
            try { return await weatherOWM(g); }
            catch (e) { note = e.status === 401 ? 'OpenWeatherMap Key 無效或還沒啟用（新 Key 可能要等一段時間），已改用 Open-Meteo' : 'OpenWeatherMap 暫時失敗，已改用 Open-Meteo'; }
        }
        const r = await weatherOpenMeteo(g);
        return note ? { ...r, 備註: note } : r;
    });
}

// ---- 匯率 ----
// 有 ExchangeRate-API Key：用 v6 API（/v6/KEY/latest/BASE）；沒有（或失敗）：open.er-api.com，再不行用 jsDelivr 上的開源匯率表
function ratesOf(base) {
    base = base.toUpperCase();
    return cached('fx:' + base + ':' + !!ai.fxKey, 10 * 60000, async () => {
        let note = '';
        if (ai.fxKey) {
            try {
                const j = await getJSON(`https://v6.exchangerate-api.com/v6/${encodeURIComponent(ai.fxKey)}/latest/${base}`);
                if (j.result === 'success') return { rates: j.conversion_rates, date: (j.time_last_update_utc || '').slice(0, 16), src: 'ExchangeRate-API' };
                note = 'ExchangeRate-API：' + (j['error-type'] || '失敗') + '，已改用免 Key 來源';
            } catch (e) { note = e.status === 403 || e.status === 401 ? 'ExchangeRate-API Key 無效，已改用免 Key 來源' : 'ExchangeRate-API 暫時失敗，已改用免 Key 來源'; }
        }
        try {
            const j = await getJSON('https://open.er-api.com/v6/latest/' + base);
            if (j.result !== 'success') throw new Error('匯率來源失敗');
            return { rates: j.rates, date: (j.time_last_update_utc || '').slice(0, 16), src: 'open.er-api.com', note };
        } catch {
            const j = await getJSON(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`);
            const rates = {}; Object.entries(j[base.toLowerCase()] || {}).forEach(([k, v]) => rates[k.toUpperCase()] = v);
            return { rates, date: j.date || '', src: 'currency-api', note };
        }
    });
}
async function rate(from, to, amount = 1) {
    from = String(from || 'USD').toUpperCase(); to = String(to || 'TWD').toUpperCase();
    const { rates, date, src, note } = await ratesOf(from), r = rates[to];
    if (!r) throw new Error(`不支援的幣別：${from} → ${to}（請用 USD、TWD、JPY 這種 3 碼代碼）`);
    amount = +amount || 1;
    return { 從: from, 到: to, 金額: amount, 匯率: +r.toFixed(6), 換算結果: +(amount * r).toFixed(4), 資料日期: date, 資料來源: src, ...(note ? { 備註: note } : {}) };
}

// ---- 給 function calling 的工具清單 ----
const TOOLS = [
    {
        def: {
            name: 'get_weather', description: '查詢指定城市目前的天氣與今天的預報（氣溫、降雨機率等）。使用者問天氣、要不要帶傘、適不適合出門時使用。',
            parameters: { type: 'object', properties: { city: { type: 'string', description: '城市名稱，中文或英文皆可，例如「台北」或 Tokyo' } }, required: ['city'] }
        },
        run: a => weather(a.city || db.settings.city)
    },
    {
        def: {
            name: 'get_exchange_rate', description: '查詢兩種貨幣的即時匯率，並可換算金額。使用者問匯率、換算價格時使用。',
            parameters: {
                type: 'object', properties: {
                    from: { type: 'string', description: '來源幣別的 3 碼代碼，例如 USD、JPY、TWD' },
                    to: { type: 'string', description: '目標幣別的 3 碼代碼，例如 TWD' },
                    amount: { type: 'number', description: '要換算的金額，預設 1' }
                }, required: ['from', 'to']
            }
        },
        run: a => rate(a.from, a.to, a.amount)
    }
];

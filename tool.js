// ===== 外部工具：天氣（Open-Meteo）、匯率（open.er-api.com）=====
// 兩個都不需要使用者另外申請 Key。同一批函式有兩種用法：
//   1) 「今日總覽」頁直接呼叫      2) 包成 TOOLS 讓聊天 AI 用 function calling 自己決定要不要呼叫
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
    if (!r.ok) throw new Error(`資料來源回應 ${r.status}`);
    return r.json();
}

// 天氣：先用地名查座標（geocoding），再查預報
function weather(city) {
    city = String(city || '').trim() || '台北';
    return cached('w:' + city, 10 * 60000, async () => {
        const variants = [...new Set([city, city.replace(/台/g, '臺'), city.replace(/臺/g, '台')])];
        let g = null;
        for (const name of variants) {
            const res = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=zh&format=json`);
            if (res.results?.length) { g = res.results[0]; break; }
        }
        if (!g) throw new Error(`找不到「${city}」，試試英文名稱（例如 Taipei）`);
        const f = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}`
            + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m'
            + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1');
        const c = f.current, d = f.daily;
        return {
            地點: [g.name, g.admin1, g.country].filter(Boolean).join('，'),
            現在天氣: WMO[c.weather_code] || '未知', 氣溫: c.temperature_2m + '°C', 體感: c.apparent_temperature + '°C',
            濕度: c.relative_humidity_2m + '%', 風速: c.wind_speed_10m + ' km/h',
            今日最高: d.temperature_2m_max[0] + '°C', 今日最低: d.temperature_2m_min[0] + '°C',
            降雨機率: (d.precipitation_probability_max[0] ?? '未知') + '%'
        };
    });
}

// 匯率：抓一次 base 幣別對所有幣別的匯率，再換算（open.er-api.com 有 TWD；備援用 jsDelivr 上的開源匯率表）
function ratesOf(base) {
    base = base.toUpperCase();
    return cached('fx:' + base, 10 * 60000, async () => {
        try {
            const j = await getJSON('https://open.er-api.com/v6/latest/' + base);
            if (j.result !== 'success') throw new Error('匯率來源失敗');
            return { rates: j.rates, date: (j.time_last_update_utc || '').slice(0, 16) };
        } catch {
            const j = await getJSON(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`);
            const rates = {}; Object.entries(j[base.toLowerCase()] || {}).forEach(([k, v]) => rates[k.toUpperCase()] = v);
            return { rates, date: j.date || '' };
        }
    });
}
async function rate(from, to, amount = 1) {
    from = String(from || 'USD').toUpperCase(); to = String(to || 'TWD').toUpperCase();
    const { rates, date } = await ratesOf(from), r = rates[to];
    if (!r) throw new Error(`不支援的幣別：${from} → ${to}（請用 USD、TWD、JPY 這種 3 碼代碼）`);
    amount = +amount || 1;
    return { 從: from, 到: to, 金額: amount, 匯率: +r.toFixed(6), 換算結果: +(amount * r).toFixed(4), 資料日期: date };
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

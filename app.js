// ===== 資料層：全部存在 localStorage 的同一個 key =====
// 結構：{ days: { "2026-10-28": { focus:分鐘, notes:"心情日記", mood:1~5, tags:[], sessions:[{start,min}] } }, settings:{focus,rest,city} }
const KEY = 'studyhub.v1';
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
let db;

function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  db = db || {};
  db.days = db.days || {};
  db.settings = db.settings || { focus: 25, rest: 5 };
  db.settings.city = db.settings.city || '台北';
  db.todos = db.todos || [];       // [{id,text,done,doneAt:'YYYY-MM-DD'|null, due:'YYYY-MM-DD'|'', nudge:已提醒到第幾階段}]
  db.expenses = db.expenses || []; // [{id,date,amount,cat,note}]
  db.workouts = db.workouts || []; // [{id,date,type,min,steps,note}]
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    $('#status').textContent = '已存於本機 ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  } catch { $('#status').textContent = '無法寫入本機儲存'; }
}
function day(k) { return db.days[k] || (db.days[k] = { focus: 0, notes: '', mood: 0, tags: [], sessions: [] }); }
const MOODS = ['', '😞', '😕', '😐', '🙂', '😄']; // 心情 1~5

// ===== 側邊欄切換 =====
$('#nav').onclick = e => {
  const v = e.target.dataset.view;
  if (!v) return;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b === e.target));
  document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== 'view-' + v);
  document.dispatchEvent(new CustomEvent('viewchange', { detail: v })); // 統計、總覽頁用來重畫
};

// ===== 番茄鐘 =====
let mode = 'focus', left = 0, endAt = null, tick = null, startedAt = null, milestones = 0;
const mmss = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

function setMode(m) {
  stop(); mode = m; milestones = 0;
  left = (m === 'focus' ? db.settings.focus : db.settings.rest) * 60;
  renderTimer();
}
function renderTimer() {
  $('#clock').textContent = mmss(left);
  $('#modeLabel').textContent = mode === 'focus' ? '專注' : '休息';
  $('#startBtn').textContent = tick ? '暫停' : '開始';
  document.title = tick ? `${mmss(left)} 學習儀表板` : '學習儀表板';
}
function stop() { clearInterval(tick); tick = null; endAt = null; }
function start() {
  if (mode === 'focus' && !startedAt) startedAt = Date.now();
  endAt = Date.now() + left * 1000;
  tick = setInterval(update, 250);
  renderTimer();
}
function update() {
  left = Math.max(0, Math.round((endAt - Date.now()) / 1000)); // 用時間戳計算，分頁在背景也不會慢
  renderTimer();
  if (left === 0) { finish(); return; }
  if (mode === 'focus') { // 連續專注每滿 30 分鐘提醒一次（暫停期間不計）
    const elapsed = db.settings.focus * 60 - left;
    if (elapsed >= 1800 * (milestones + 1)) {
      milestones = Math.floor(elapsed / 1800);
      document.dispatchEvent(new CustomEvent('focus-milestone', { detail: { minutes: milestones * 30 } }));
    }
  }
}
function finish() {
  const finished = mode;
  stop(); beep();
  if (finished === 'focus') {
    const min = db.settings.focus, d = day(dkey(new Date()));
    d.focus += min;
    d.sessions.push({ start: startedAt, min });
    save(); renderCal();
    $('#msg').textContent = `完成！已記錄 ${min} 分鐘到今天的歷程。`;
  } else $('#msg').textContent = '休息結束，準備好再來一輪。';
  startedAt = null;
  // 夥伴 AI（companion.js）監聽這個事件來跳出鼓勵對話框
  document.dispatchEvent(new CustomEvent('pomodoro-end', { detail: { mode: finished, minutes: db.settings.focus } }));
  setMode(finished === 'focus' ? 'rest' : 'focus');
}
function beep() {
  try {
    const a = new AudioContext(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); g.gain.value = 0.15; o.frequency.value = 880;
    o.start(); o.stop(a.currentTime + 0.4);
  } catch { }
}
$('#startBtn').onclick = () => { if (tick) { stop(); renderTimer(); } else start(); };
$('#resetBtn').onclick = () => { startedAt = null; $('#msg').textContent = ''; setMode(mode); };
$('#presets').onclick = e => {
  if (!e.target.dataset.m) return;
  db.settings.focus = +e.target.dataset.m; $('#focusIn').value = db.settings.focus; save(); setMode('focus');
};
function bindInput(id, key, m) {
  $(id).onchange = e => {
    db.settings[key] = Math.min(Math.max(+e.target.value || 1, 1), 180);
    e.target.value = db.settings[key]; save(); if (mode === m) setMode(m);
  };
}
bindInput('#focusIn', 'focus', 'focus'); bindInput('#restIn', 'rest', 'rest');

// ===== 背景音：用 Web Audio 即時合成（不需要音檔）=====
let ac, gain, srcNode;
function makeBuffer(type) {
  const len = ac.sampleRate * 4, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'cafe') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // 棕噪音：低沉人聲底噪
    else d[i] = w * 0.5;                                                          // 白噪音：沙沙雨聲
  }
  return b;
}
function playNoise(type) {
  if (srcNode) { srcNode.stop(); srcNode = null; }
  if (type === 'off') return;
  ac = ac || new AudioContext();
  gain = gain || Object.assign(ac.createGain(), {}); gain.connect(ac.destination);
  gain.gain.value = +$('#vol').value;
  srcNode = ac.createBufferSource(); srcNode.buffer = makeBuffer(type); srcNode.loop = true;
  const f = ac.createBiquadFilter();
  f.type = type === 'cafe' ? 'lowpass' : 'highpass';
  f.frequency.value = type === 'cafe' ? 700 : 1500;
  srcNode.connect(f).connect(gain); srcNode.start();
}
document.querySelector('.noise').onclick = e => {
  if (!e.target.dataset.n) return;
  document.querySelectorAll('.noise button').forEach(b => b.classList.toggle('on', b === e.target));
  playNoise(e.target.dataset.n);
};
$('#vol').oninput = e => { if (gain) gain.gain.value = +e.target.value; };

// ===== 月曆 =====
let view = new Date(); view.setDate(1);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderCal() {
  const y = view.getFullYear(), m = view.getMonth();
  $('#monthTitle').textContent = `${y} 年 ${m + 1} 月`;
  let html = '日一二三四五六'.split('').map(w => `<div class="wd">${w}</div>`).join('');
  html += '<div class="blank"></div>'.repeat(view.getDay());
  let sum = 0, todayK = dkey(new Date());
  for (let i = 1, n = new Date(y, m + 1, 0).getDate(); i <= n; i++) {
    const k = `${y}-${pad(m + 1)}-${pad(i)}`, d = db.days[k] || {}, f = d.focus || 0;
    sum += f;
    const tags = (d.tags || []).slice(0, 2).map(t => `<span class="t">${esc(t)}</span>`).join('');
    html += `<button class="cell${k === todayK ? ' today' : ''}" data-k="${k}" style="--h:${Math.min(f / 180, 1)}">
      <span class="n">${i}${d.mood ? ` <span class="mood">${MOODS[d.mood]}</span>` : ''}</span>${f ? `<span class="m">${f} 分鐘</span>` : ''}${tags}</button>`;
  }
  $('#grid').innerHTML = html;
  $('#monthSum').textContent = `本月累計 ${sum} 分鐘（約 ${(sum / 60).toFixed(1)} 小時）`;
}
$('#prev').onclick = () => { view.setMonth(view.getMonth() - 1); renderCal(); };
$('#next').onclick = () => { view.setMonth(view.getMonth() + 1); renderCal(); };

let openKey = null, dMood = 0;
function paintMood() { document.querySelectorAll('#dMoodRow button').forEach(b => b.classList.toggle('on', +b.dataset.v === dMood)); }
$('#dMoodRow').innerHTML = MOODS.slice(1).map((e, i) => `<button type="button" data-v="${i + 1}" aria-label="心情 ${i + 1} 分">${e}</button>`).join('');
$('#dMoodRow').onclick = e => { // 再點一次同一個表情＝取消選擇
  const v = +e.target.dataset.v; if (!v) return;
  dMood = dMood === v ? 0 : v; paintMood();
};
$('#grid').onclick = e => {
  const c = e.target.closest('.cell'); if (!c) return;
  openKey = c.dataset.k;
  const d = db.days[openKey] || {};
  $('#dlgTitle').textContent = openKey;
  $('#dFocus').value = d.focus || 0;
  $('#dTags').value = (d.tags || []).join(', ');
  $('#dNotes').value = d.notes || '';
  dMood = d.mood || 0; paintMood();
  const done = dayTodos(openKey), money = dayMoney(openKey), work = dayWork(openKey);
  $('#dSummary').innerHTML = `<p>完成待辦：${done.length ? done.length + ' 項（' + done.map(t => esc(t.text)).join('、') + '）' : '無'}</p><p>當日花費：${money} 元</p>`
    + `<p>運動：${work.length ? work.map(w => esc(w.type) + ' ' + w.min + ' 分').join('、') : '無'}</p>`;
  $('#dlg').showModal();
};
$('#dSave').onclick = () => {
  const d = day(openKey);
  d.focus = Math.max(+$('#dFocus').value || 0, 0);
  d.tags = $('#dTags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  d.notes = $('#dNotes').value; d.mood = dMood;
  save(); renderCal(); $('#dlg').close();
};
$('#dClose').onclick = () => $('#dlg').close();

// ===== 待辦事項 =====
const dayTodos = k => db.todos.filter(t => t.doneAt === k);
const dayMoney = k => db.expenses.filter(e => e.date === k).reduce((s, e) => s + e.amount, 0);
const dayWork = k => db.workouts.filter(w => w.date === k);
// deadline：距今幾天（今天=0、明天=1、昨天=-1）；沒填就是 null
const dueDays = t => t.due ? Math.round((new Date(t.due + 'T00:00') - new Date(dkey(new Date()) + 'T00:00')) / 864e5) : null;
// 提醒階段：0 沒事、1 明天到期、2 今天到期、3 已逾期（未完成才算）
const dueStage = t => { const n = t.done ? null : dueDays(t); return n === null ? 0 : n < 0 ? 3 : n === 0 ? 2 : n === 1 ? 1 : 0; };
const dueLabel = t => { const n = dueDays(t); return n === null ? '' : n < 0 ? `逾期 ${-n} 天` : n === 0 ? '今天到期' : n === 1 ? '明天到期' : `${n} 天後`; };
const mk = (tag, props, text) => Object.assign(document.createElement(tag), props, text ? { textContent: text } : {});

function renderTodos() {
  const ul = $('#todoList'); ul.innerHTML = '';
  [...db.todos].sort((a, b) => a.done - b.done || (a.due || '9999').localeCompare(b.due || '9999') || b.id - a.id).forEach(t => {
    const li = mk('li', { className: t.done ? 'done' : '' });
    const cb = mk('input', { type: 'checkbox', checked: t.done });
    cb.setAttribute('aria-label', '完成：' + t.text);
    cb.onchange = () => { t.done = cb.checked; t.doneAt = t.done ? dkey(new Date()) : null; save(); renderTodos(); };
    const del = mk('button', {}, '刪除');
    del.onclick = () => { db.todos = db.todos.filter(x => x !== t); save(); renderTodos(); };
    const st = dueStage(t), due = mk('input', { type: 'date', value: t.due || '', className: 'duein' });
    due.setAttribute('aria-label', 'Deadline：' + t.text);
    due.onchange = () => { t.due = due.value; t.nudge = 0; save(); renderTodos(); window.checkDeadlines && checkDeadlines(); };
    li.append(cb, mk('span', { className: 'grow' }, t.text));
    if (t.due && !t.done) li.append(mk('span', { className: 'due s' + st }, dueLabel(t)));
    li.append(due, del);
    ul.append(li);
  });
  if (!db.todos.length) ul.innerHTML = '<li class="soon">還沒有待辦。輸入一件事，按 Enter 加入。</li>';
}
function addTodo() {
  const text = $('#todoIn').value.trim(); if (!text) return;
  db.todos.push({ id: Date.now(), text, done: false, doneAt: null, due: $('#todoDue').value || '', nudge: 0 });
  $('#todoIn').value = ''; $('#todoDue').value = ''; save(); renderTodos(); window.checkDeadlines && checkDeadlines();
}
$('#todoAdd').onclick = addTodo;
$('#todoIn').onkeydown = e => { if (e.key === 'Enter') addTodo(); };

// ===== 生活記帳 =====
function renderMoney() {
  const ul = $('#eList'), ym = dkey(new Date()).slice(0, 7);
  const rows = db.expenses.filter(e => e.date.startsWith(ym)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  $('#eSum').textContent = `本月支出 ${rows.reduce((s, e) => s + e.amount, 0)} 元`;
  ul.innerHTML = '';
  rows.forEach(e => {
    const li = mk('li'), del = mk('button', {}, '刪除');
    del.onclick = () => { db.expenses = db.expenses.filter(x => x !== e); save(); renderMoney(); };
    li.append(mk('span', { className: 'dt' }, e.date.slice(5)), mk('span', { className: 'cat' }, e.cat),
      mk('span', { className: 'grow' }, e.note || ''), mk('strong', {}, e.amount + ' 元'), del);
    ul.append(li);
  });
  if (!rows.length) ul.innerHTML = '<li class="soon">這個月還沒有記帳。</li>';
}
$('#eAdd').onclick = () => {
  const amount = Math.round(+$('#eAmt').value);
  if (!amount || amount < 0 || !$('#eDate').value) { $('#eAmt').focus(); return; }
  db.expenses.push({ id: Date.now(), date: $('#eDate').value, amount, cat: $('#eCat').value, note: $('#eNote').value.trim() });
  $('#eAmt').value = ''; $('#eNote').value = ''; save(); renderMoney();
};

// ===== 運動紀錄 =====
function renderWork() {
  const ul = $('#wList'), ym = dkey(new Date()).slice(0, 7);
  const rows = db.workouts.filter(w => w.date.startsWith(ym)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const min = rows.reduce((s, w) => s + w.min, 0), steps = rows.reduce((s, w) => s + (w.steps || 0), 0);
  $('#wSum').textContent = `本月運動 ${rows.length} 次，共 ${min} 分鐘` + (steps ? `，步數 ${steps.toLocaleString()}` : '');
  ul.innerHTML = '';
  rows.forEach(w => {
    const li = mk('li'), del = mk('button', {}, '刪除');
    del.onclick = () => { db.workouts = db.workouts.filter(x => x !== w); save(); renderWork(); };
    li.append(mk('span', { className: 'dt' }, w.date.slice(5)), mk('span', { className: 'cat' }, w.type),
      mk('span', { className: 'grow' }, w.note || ''), mk('strong', {}, w.min + ' 分' + (w.steps ? '・' + w.steps.toLocaleString() + ' 步' : '')), del);
    ul.append(li);
  });
  if (!rows.length) ul.innerHTML = '<li class="soon">這個月還沒有運動紀錄。</li>';
}
$('#wAdd').onclick = () => {
  const min = Math.round(+$('#wMin').value), steps = Math.round(+$('#wSteps').value) || 0;
  if (!min || min < 0 || !$('#wDate').value) { $('#wMin').focus(); return; }
  db.workouts.push({ id: Date.now(), date: $('#wDate').value, type: $('#wType').value, min, steps, note: $('#wNote').value.trim() });
  $('#wMin').value = ''; $('#wSteps').value = ''; $('#wNote').value = ''; save(); renderWork();
};

// ===== 啟動 =====
load();
$('#focusIn').value = db.settings.focus; $('#restIn').value = db.settings.rest;
$('#eDate').value = $('#wDate').value = dkey(new Date());
save(); setMode('focus'); renderCal(); renderTodos(); renderMoney(); renderWork();

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
  stop(); mode = m; milestones = 0; startedAt = null;
  left = (m === 'focus' ? db.settings.focus : db.settings.rest) * 60;
  renderTimer();
}
function renderTimer() {
  $('#clock').textContent = mmss(left);
  $('#modeLabel').textContent = mode === 'focus' ? '專注' : '休息';
  $('#startBtn').textContent = tick ? '暫停' : '開始';
  $('#saveBtn').hidden = !(mode === 'focus' && startedAt); // 專注進行中（含暫停）才能提前儲存
  $('#skipBtn').hidden = mode !== 'rest';
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
$('#skipBtn').onclick = () => { $('#msg').textContent = ''; setMode('focus'); }; // 略過休息，直接回到專注
$('#saveBtn').onclick = () => { // 臨時要結束：把「已經專注的時間」記錄下來
  if (mode !== 'focus' || !startedAt) return;
  if (tick) left = Math.max(0, Math.round((endAt - Date.now()) / 1000)); // 先把剩餘時間更新到最新
  const min = Math.round((db.settings.focus * 60 - left) / 60);
  if (min < 1) { $('#msg').textContent = '專注還不到 1 分鐘，沒有可以儲存的時間。'; return; }
  const d = day(dkey(new Date()));
  d.focus += min; d.sessions.push({ start: startedAt, min });
  save(); renderCal();
  $('#msg').textContent = `已儲存 ${min} 分鐘到今天的歷程。`;
  document.dispatchEvent(new CustomEvent('pomodoro-end', { detail: { mode: 'focus', minutes: min } }));
  setMode('focus');
};
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

let openKey = null, dMood = 0, dTags = [];
function paintMood() { document.querySelectorAll('#dMoodRow button').forEach(b => b.classList.toggle('on', +b.dataset.v === dMood)); }
$('#dMoodRow').innerHTML = MOODS.slice(1).map((e, i) => `<button type="button" data-v="${i + 1}" aria-label="心情 ${i + 1} 分">${e}</button>`).join('');
$('#dMoodRow').onclick = e => { // 再點一次同一個表情＝取消選擇
  const v = +e.target.dataset.v; if (!v) return;
  dMood = dMood === v ? 0 : v; paintMood();
};
// 重點標籤：一顆一顆顯示，旁邊的 × 可以刪除；輸入框只負責新增（按「儲存」後才會真的寫入）
function paintTags() {
  const box = $('#dTagList'); box.innerHTML = '';
  dTags.forEach((t, i) => {
    const chip = mk('span', { className: 'tagchip' }, t), x = mk('button', { type: 'button' }, '×');
    x.setAttribute('aria-label', '刪除標籤：' + t);
    x.onclick = () => { dTags.splice(i, 1); paintTags(); };
    chip.append(x); box.append(chip);
  });
}
function addTag() {
  $('#dTagIn').value.split(/[,，、]/).map(s => s.trim()).filter(Boolean).forEach(t => { if (!dTags.includes(t)) dTags.push(t); });
  $('#dTagIn').value = ''; paintTags();
}
$('#dTagAdd').onclick = addTag;
$('#dTagIn').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addTag(); } };
$('#grid').onclick = e => {
  const c = e.target.closest('.cell'); if (!c) return;
  openKey = c.dataset.k;
  const d = db.days[openKey] || {};
  $('#dlgTitle').textContent = openKey;
  $('#dFocus').value = d.focus || 0;
  dTags = [...(d.tags || [])]; $('#dTagIn').value = ''; paintTags();
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
  addTag(); d.tags = [...dTags]; // 輸入框裡還沒按新增的文字也一起收進來
  d.notes = $('#dNotes').value; d.mood = dMood;
  save(); renderCal(); $('#dlg').close();
};
$('#dClose').onclick = () => $('#dlg').close();

// ===== 待辦事項 =====
// 當天完成的待辦 = 還留著的 + 已被自動清掉、但文字存在當天紀錄（archive）裡的
const dayTodos = k => [...db.todos.filter(t => t.doneAt === k), ...(((db.days[k] || {}).archive || []).map(text => ({ text })))];
const dayMoney = k => db.expenses.filter(e => e.date === k).reduce((s, e) => s + e.amount, 0);
const dayWork = k => db.workouts.filter(w => w.date === k);
// deadline：距今幾天（今天=0、明天=1、昨天=-1）；沒填就是 null
const dueDays = t => t.due ? Math.round((new Date(t.due + 'T00:00') - new Date(dkey(new Date()) + 'T00:00')) / 864e5) : null;
// 提醒階段：0 沒事、1 明天到期、2 今天到期、3 已逾期（未完成才算）
const dueStage = t => { const n = t.done ? null : dueDays(t); return n === null ? 0 : n < 0 ? 3 : n === 0 ? 2 : n === 1 ? 1 : 0; };
const dueLabel = t => { const n = dueDays(t); return n === null ? '' : n < 0 ? `逾期 ${-n} 天` : n === 0 ? '今天到期' : n === 1 ? '明天到期' : `${n} 天後`; };
const mk = (tag, props, text) => Object.assign(document.createElement(tag), props, text ? { textContent: text } : {});

let todoTab = 'open', editTodo = null;
const cloneSel = (id, val) => { const s = $(id).cloneNode(true); s.removeAttribute('id'); s.value = val; return s; }; // 編輯時沿用原本的下拉選單
const editKeys = (els, ok, no) => els.forEach(el => { el.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) ok.onclick(); else if (e.key === 'Escape') no.onclick(); }; });

// 已完成超過 7 天的待辦自動清掉；文字會存進當天紀錄，月曆與統計仍然看得到
function purgeDone() {
  const c = new Date(); c.setDate(c.getDate() - 7); const cut = dkey(c);
  const old = db.todos.filter(t => t.done && t.doneAt && t.doneAt < cut);
  if (!old.length) return;
  old.forEach(t => { const d = day(t.doneAt); (d.archive = d.archive || []).push(t.text); });
  db.todos = db.todos.filter(t => !old.includes(t)); save();
}
// 未完成清單的分組標題：依 deadline 日期
function dueHead(k) {
  if (!k) return '沒有 deadline';
  const n = dueDays({ due: k }), base = `${k.slice(5).replace('-', '/')}（週${'日一二三四五六'[new Date(k + 'T00:00').getDay()]}）`;
  return n < 0 ? `已逾期・${base}` : n === 0 ? `今天・${base}` : n === 1 ? `明天・${base}` : base;
}
function todoRow(t) {
  const li = mk('li', { className: t.done ? 'done' : '' });
  if (t.id === editTodo) { // 編輯模式：直接改內容與 deadline
    li.className = 'editing';
    const tx = mk('input', { className: 'grow', value: t.text }), du = mk('input', { type: 'date', value: t.due || '', className: 'duein' });
    tx.setAttribute('aria-label', '待辦內容'); du.setAttribute('aria-label', 'Deadline（選填）');
    const ok = mk('button', { className: 'primary' }, '儲存'), no = mk('button', {}, '取消');
    ok.onclick = () => {
      const text = tx.value.trim(); if (!text) { tx.focus(); return; }
      if (du.value !== (t.due || '')) t.nudge = 0; // deadline 改了，提醒重新計算
      t.text = text; t.due = du.value; editTodo = null; save(); renderTodos(); window.checkDeadlines && checkDeadlines();
    };
    no.onclick = () => { editTodo = null; renderTodos(); };
    editKeys([tx, du], ok, no);
    li.append(tx, du, ok, no); setTimeout(() => tx.focus(), 0);
    return li;
  }
  const cb = mk('input', { type: 'checkbox', checked: t.done });
  cb.setAttribute('aria-label', (t.done ? '取消完成：' : '完成：') + t.text);
  cb.onchange = () => { t.done = cb.checked; t.doneAt = t.done ? dkey(new Date()) : null; save(); renderTodos(); };
  const del = mk('button', {}, '刪除');
  del.onclick = () => { db.todos = db.todos.filter(x => x !== t); save(); renderTodos(); };
  li.append(cb, mk('span', { className: 'grow' }, t.text));
  if (t.done) li.append(mk('span', { className: 'dt' }, '完成於 ' + (t.doneAt || '').slice(5)));
  else {
    if (t.due) li.append(mk('span', { className: 'due s' + dueStage(t) }, dueLabel(t)));
    const ed = mk('button', {}, '編輯'); ed.onclick = () => { editTodo = t.id; renderTodos(); };
    li.append(ed);
  }
  li.append(del);
  return li;
}
function renderTodos() {
  purgeDone();
  const box = $('#todoList'); box.innerHTML = '';
  const open = db.todos.filter(t => !t.done), done = db.todos.filter(t => t.done);
  $('#cntOpen').textContent = open.length ? `(${open.length})` : '';
  $('#cntDone').textContent = done.length ? `(${done.length})` : '';
  document.querySelectorAll('#todoTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === todoTab));
  if (todoTab === 'open') {
    if (!open.length) { box.append(mk('p', { className: 'soon' }, '沒有未完成的待辦。輸入一件事，按 Enter 加入。')); return; }
    const groups = new Map(); // deadline 日期 → 待辦；沒有 deadline 的排最後
    [...open].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || b.id - a.id)
      .forEach(t => { const k = t.due || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    groups.forEach((items, k) => {
      box.append(mk('h4', { className: 'todohead' }, dueHead(k)));
      const ul = mk('ul', { className: 'list' }); items.forEach(t => ul.append(todoRow(t))); box.append(ul);
    });
  } else {
    box.append(mk('p', { className: 'soon' }, '已完成的待辦會保留 7 天，之後自動清除（月曆與統計仍會記得完成了哪些）。'));
    if (!done.length) { box.append(mk('p', { className: 'soon' }, '還沒有已完成的待辦。')); return; }
    const ul = mk('ul', { className: 'list' });
    [...done].sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '') || b.id - a.id).forEach(t => ul.append(todoRow(t)));
    box.append(ul);
  }
}
function addTodo() {
  const text = $('#todoIn').value.trim(); if (!text) return;
  db.todos.push({ id: Date.now(), text, done: false, doneAt: null, due: $('#todoDue').value || '', nudge: 0 });
  $('#todoIn').value = ''; $('#todoDue').value = ''; todoTab = 'open'; save(); renderTodos(); window.checkDeadlines && checkDeadlines();
}
$('#todoAdd').onclick = addTodo;
$('#todoIn').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) addTodo(); };
$('#todoTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; todoTab = b.dataset.t; renderTodos(); };

// ===== 生活記帳 =====
let editE = null, editW = null;
function moneyEditRow(e) {
  const li = mk('li', { className: 'editing' });
  const dt = mk('input', { type: 'date', value: e.date }), cat = cloneSel('#eCat', e.cat),
    amt = mk('input', { type: 'number', min: 0, value: e.amount }), note = mk('input', { className: 'grow', value: e.note || '', placeholder: '備註（選填）' });
  dt.setAttribute('aria-label', '日期'); amt.setAttribute('aria-label', '金額');
  const ok = mk('button', { className: 'primary' }, '儲存'), no = mk('button', {}, '取消');
  ok.onclick = () => {
    const a = Math.round(+amt.value);
    if (!a || a < 0 || !dt.value) { amt.focus(); return; }
    Object.assign(e, { date: dt.value, amount: a, cat: cat.value, note: note.value.trim() });
    editE = null; save(); renderMoney();
  };
  no.onclick = () => { editE = null; renderMoney(); };
  editKeys([dt, cat, amt, note], ok, no);
  li.append(dt, cat, amt, note, ok, no);
  return li;
}
function renderMoney() {
  const ul = $('#eList'), ym = dkey(new Date()).slice(0, 7);
  const rows = db.expenses.filter(e => e.date.startsWith(ym)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  $('#eSum').textContent = `本月支出 ${rows.reduce((s, e) => s + e.amount, 0)} 元`;
  ul.innerHTML = '';
  rows.forEach(e => {
    if (e.id === editE) { ul.append(moneyEditRow(e)); return; }
    const li = mk('li'), del = mk('button', {}, '刪除'), ed = mk('button', {}, '編輯');
    ed.onclick = () => { editE = e.id; renderMoney(); };
    del.onclick = () => { db.expenses = db.expenses.filter(x => x !== e); save(); renderMoney(); };
    li.append(mk('span', { className: 'dt' }, e.date.slice(5)), mk('span', { className: 'cat' }, e.cat),
      mk('span', { className: 'grow' }, e.note || ''), mk('strong', {}, e.amount + ' 元'), ed, del);
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
function workEditRow(w) {
  const li = mk('li', { className: 'editing' });
  const dt = mk('input', { type: 'date', value: w.date }), type = cloneSel('#wType', w.type),
    min = mk('input', { type: 'number', min: 1, value: w.min, placeholder: '分鐘' }),
    steps = mk('input', { type: 'number', min: 0, value: w.steps || '', placeholder: '步數（選填）' }),
    note = mk('input', { className: 'grow', value: w.note || '', placeholder: '備註（選填）' });
  dt.setAttribute('aria-label', '日期'); min.setAttribute('aria-label', '運動分鐘'); steps.setAttribute('aria-label', '步數');
  const ok = mk('button', { className: 'primary' }, '儲存'), no = mk('button', {}, '取消');
  ok.onclick = () => {
    const m = Math.round(+min.value), s = Math.round(+steps.value) || 0;
    if (!m || m < 0 || !dt.value) { min.focus(); return; }
    Object.assign(w, { date: dt.value, type: type.value, min: m, steps: s, note: note.value.trim() });
    editW = null; save(); renderWork();
  };
  no.onclick = () => { editW = null; renderWork(); };
  editKeys([dt, type, min, steps, note], ok, no);
  li.append(dt, type, min, steps, note, ok, no);
  return li;
}
function renderWork() {
  const ul = $('#wList'), ym = dkey(new Date()).slice(0, 7);
  const rows = db.workouts.filter(w => w.date.startsWith(ym)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const min = rows.reduce((s, w) => s + w.min, 0), steps = rows.reduce((s, w) => s + (w.steps || 0), 0);
  $('#wSum').textContent = `本月運動 ${rows.length} 次，共 ${min} 分鐘` + (steps ? `，步數 ${steps.toLocaleString()}` : '');
  ul.innerHTML = '';
  rows.forEach(w => {
    if (w.id === editW) { ul.append(workEditRow(w)); return; }
    const li = mk('li'), del = mk('button', {}, '刪除'), ed = mk('button', {}, '編輯');
    ed.onclick = () => { editW = w.id; renderWork(); };
    del.onclick = () => { db.workouts = db.workouts.filter(x => x !== w); save(); renderWork(); };
    li.append(mk('span', { className: 'dt' }, w.date.slice(5)), mk('span', { className: 'cat' }, w.type),
      mk('span', { className: 'grow' }, w.note || ''), mk('strong', {}, w.min + ' 分' + (w.steps ? '・' + w.steps.toLocaleString() + ' 步' : '')), ed, del);
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
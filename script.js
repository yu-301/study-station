// --- 全域變數與 LocalStorage 初始化 ---
let timerInterval = null;
let selectedDuration = 25 * 60; // 預設 25 分鐘
let timeLeft = selectedDuration;
let isRunning = false;

// 真實音效 API 播放器
const audioPlayers = {
  rain: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-light-rain-loop-2393.mp3'),
  coffee: new Audio('https://assets.mixkit.co/sfx/preview/mixkit-restaurant-crowd-talking-ambient-2443.mp3')
};
audioPlayers.rain.loop = true;
audioPlayers.coffee.loop = true;

// 本地存儲結構：支援日期記錄 (以 YYYY-MM-DD 為 key)
let appData = JSON.parse(localStorage.getItem('study_station_data')) || {
  todos: [],
  dailyLogs: {} // 例如 '2026-10-28': { minutes: 50, notes: '讀了計算機網路' }
};

let currentCalendarDate = new Date();
let activeModalDateStr = null;

document.addEventListener('DOMContentLoaded', () => {
  renderTodos();
  renderCalendar();
});

function saveData() {
  localStorage.setItem('study_station_data', JSON.stringify(appData));
}

// --- 分頁切換 ---
function switchTab(tabName) {
  ['timer', 'todo', 'calendar'].forEach(tab => {
    const section = document.getElementById(`tab-${tab}`);
    const btn = document.getElementById(`btn-${tab}`);
    if (tab === tabName) {
      section.classList.remove('hidden');
      btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-600 text-white font-medium transition";
    } else {
      section.classList.add('hidden');
      btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 font-medium transition";
    }
  });
  if (tabName === 'calendar') renderCalendar();
}

// --- 番茄鐘邏輯 ---
function setCustomTimer(minutes) {
  if (isRunning) resetTimer();
  selectedDuration = minutes * 60;
  timeLeft = selectedDuration;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const seconds = (timeLeft % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${minutes}:${seconds}`;
}

function toggleTimer() {
  const startBtn = document.getElementById('start-btn');
  if (isRunning) {
    clearInterval(timerInterval);
    isRunning = false;
    startBtn.textContent = '繼續專注';
    startBtn.classList.replace('bg-amber-600', 'bg-indigo-600');
  } else {
    isRunning = true;
    startBtn.textContent = '暫停';
    startBtn.classList.replace('bg-indigo-600', 'bg-amber-600');
    timerInterval = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
        updateTimerDisplay();
      } else {
        clearInterval(timerInterval);
        isRunning = false;
        handleTimerComplete();
      }
    }, 1000);
  }
}

function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  timeLeft = selectedDuration;
  updateTimerDisplay();
  const startBtn = document.getElementById('start-btn');
  startBtn.textContent = '開始專注';
  startBtn.className = "px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-600/30";
}

function handleTimerComplete() {
  const todayStr = getTodayString();
  const minutesCompleted = Math.round(selectedDuration / 60);

  if (!appData.dailyLogs[todayStr]) {
    appData.dailyLogs[todayStr] = { minutes: 0, notes: '' };
  }
  appData.dailyLogs[todayStr].minutes += minutesCompleted;
  saveData();

  alert(`🎉 恭喜完成 ${minutesCompleted} 分鐘專注！已為你紀錄至今日行事曆。`);
  resetTimer();
}

// --- 音效播放 ---
function toggleAudio(type) {
  const player = audioPlayers[type];
  const icon = document.getElementById(`icon-${type}`);
  
  if (player.paused) {
    player.play();
    icon.className = "fa-solid fa-pause text-xs text-indigo-400";
  } else {
    player.pause();
    icon.className = "fa-solid fa-play text-xs text-slate-500";
  }
}

// --- 待辦事項邏輯 ---
function addTodo() {
  const input = document.getElementById('todo-input');
  const text = input.value.trim();
  if (!text) return;

  appData.todos.push({ id: Date.now(), text, completed: false });
  input.value = '';
  saveData();
  renderTodos();
}

function toggleTodo(id) {
  const todo = appData.todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    saveData();
    renderTodos();
  }
}

function deleteTodo(id) {
  appData.todos = appData.todos.filter(t => t.id !== id);
  saveData();
  renderTodos();
}

function renderTodos() {
  const list = document.getElementById('todo-list');
  list.innerHTML = appData.todos.map(todo => `
    <li class="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-700/60">
      <div class="flex items-center gap-3 cursor-pointer" onclick="toggleTodo(${todo.id})">
        <input type="checkbox" ${todo.completed ? 'checked' : ''} class="w-4 h-4 accent-indigo-500">
        <span class="${todo.completed ? 'line-through text-slate-500' : 'text-slate-200'}">${todo.text}</span>
      </div>
      <button onclick="deleteTodo(${todo.id})" class="text-slate-500 hover:text-rose-400 transition">
        <i class="fa-solid fa-trash"></i>
      </button>
    </li>
  `).join('');
}

// --- 月曆邏輯 (Calendar System) ---
function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function prevMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  renderCalendar();
}

function nextMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderCalendar();
}

function renderCalendar() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  
  document.getElementById('calendar-month-year').textContent = `${year}年 ${month + 1}月`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // 填補月初空白欄位
  for (let i = 0; i < firstDay; i++) {
    grid.innerHTML += `<div class="h-24 bg-slate-900/20 rounded-xl border border-slate-800/40"></div>`;
  }

  // 渲染當月每一天
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const log = appData.dailyLogs[dateStr] || { minutes: 0, notes: '' };
    const isToday = dateStr === getTodayString();

    grid.innerHTML += `
      <div onclick="openDayModal('${dateStr}')" 
           class="h-24 p-2 bg-slate-900/60 hover:bg-slate-700/40 rounded-xl border ${isToday ? 'border-indigo-500 bg-indigo-950/20' : 'border-slate-700/60'} 
                  cursor-pointer transition flex flex-col justify-between">
        <div class="flex justify-between items-center">
          <span class="text-xs font-bold ${isToday ? 'text-indigo-400' : 'text-slate-300'}">${day}</span>
          ${log.minutes > 0 ? `<span class="text-[10px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-semibold">${log.minutes}分</span>` : ''}
        </div>
        <p class="text-[11px] text-slate-400 truncate mt-1">${log.notes || ''}</p>
      </div>
    `;
  }
}

// --- 月曆點擊詳細彈窗 (Modal) ---
function openDayModal(dateStr) {
  activeModalDateStr = dateStr;
  const log = appData.dailyLogs[dateStr] || { minutes: 0, notes: '' };
  
  document.getElementById('modal-date-title').textContent = `${dateStr} 學習紀錄`;
  document.getElementById('modal-study-time').value = log.minutes;
  document.getElementById('modal-notes').value = log.notes;
  document.getElementById('day-modal').classList.remove('hidden');
}

function closeDayModal() {
  document.getElementById('day-modal').classList.add('hidden');
}

function saveDayModal() {
  const minutes = parseInt(document.getElementById('modal-study-time').value) || 0;
  const notes = document.getElementById('modal-notes').value.trim();

  appData.dailyLogs[activeModalDateStr] = { minutes, notes };
  saveData();
  renderCalendar();
  closeDayModal();
}

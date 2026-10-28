// --- 全域變數與 LocalStorage 初始化 ---
let timerInterval = null;
let timeLeft = 25 * 60; // 25 分鐘
let isRunning = false;
let isWorkMode = true;

// 從 LocalStorage 載入資料
let appData = JSON.parse(localStorage.getItem('study_station_data')) || {
  todos: [],
  pomodoroCount: 0,
  history: []
};

// 頁面載入時初始化 UI
document.addEventListener('DOMContentLoaded', () => {
  renderTodos();
  renderHistory();
});

// 保存資料到 LocalStorage
function saveData() {
  localStorage.setItem('study_station_data', JSON.stringify(appData));
}

// --- 分頁切換邏輯 ---
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
}

// --- 番茄鐘邏輯 ---
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
  timeLeft = isWorkMode ? 25 * 60 : 5 * 60;
  updateTimerDisplay();
  const startBtn = document.getElementById('start-btn');
  startBtn.textContent = '開始專注';
  startBtn.className = "px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-600/30";
}

function handleTimerComplete() {
  if (isWorkMode) {
    appData.pomodoroCount++;
    const now = new Date().toLocaleString('zh-TW', { hour12: false });
    appData.history.unshift(`完成一次 25 分鐘專注 (${now})`);
    saveData();
    renderHistory();
    alert('🎉 太棒了！完成了 25 分鐘的專注，休息 5 分鐘吧！');
    isWorkMode = false;
    timeLeft = 5 * 60;
    document.getElementById('timer-mode').textContent = '休息時間';
  } else {
    alert('🔔 休息結束，準備好開始下一次專注了嗎？');
    isWorkMode = true;
    timeLeft = 25 * 60;
    document.getElementById('timer-mode').textContent = '專注時間';
  }
  resetTimer();
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

function renderHistory() {
  document.getElementById('total-pomodoros').textContent = `${appData.pomodoroCount} 次`;
  const list = document.getElementById('history-list');
  list.innerHTML = appData.history.slice(0, 10).map(item => `
    <div class="p-2 bg-slate-900/30 rounded border border-slate-800">${item}</div>
  `).join('');
}

// --- 背景音效模擬 ---
function toggleAudio(type) {
  alert(`音效 [${type === 'rain' ? '窗外雨聲' : '咖啡廳氛圍'}] 播放狀態已切換`);
}
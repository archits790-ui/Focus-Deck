document.addEventListener('DOMContentLoaded', () => {

  /* ===== STATE MANAGEMENT ===== */
  const STATE_KEY = 'ppd_v7';

  const DEFAULT = () => ({
    version: 7,
    theme: 'dark',
    accent: '#6ea8fe',
    workspaces: [{
      name: 'Default',
      tasks: [],
      done: [],
      recurringTasks: [],
      lastRecurringCheck: null,
      syllabusPages: [{
        id: uid(),
        title: 'Main',
        subjects: []
      }],
      syllabusCurrentPage: 0,
      stats: {},
      timetable: {
        rows: ['09:00-10:00', '10:00-11:00', '11:00-12:00'],
        cells: {},
        weekStartDate: null,
        lastUsedColor: '#ffd36b'
      },
      stickyNotes: [],
      reminders: {},
      flashcards: [], // Structure: [{id, title, cards: [{front, back}]}] - title is Category
      journal: [],
      taskCategories: [
          {id: 'urgent', name: 'Urgent', color: '#ff6b6b'},
          {id: 'casual', name: 'Casual', color: '#59d18c'}
      ],
      timer: {
        dur: {
          focus: 25,
          short: 5,
          long: 15
        },
        currentCycle: 1,
        longBreakInterval: 4,
        autoStart: true
      },
      focusStreak: {
        current: 0,
        lastSessionDate: null,
        dailyGoal: 4,
        longest: 0,
        totalDays: 0
      },
      unlockedBadges: [],
      customColors: {}
    }],
    current: 0
  });

  function loadState() {
    try {
      // 1. Try to load current version
      let raw = localStorage.getItem(STATE_KEY);
      
      // 2. If missing, try to migrate from legacy v6
      if (!raw) {
        const legacyRaw = localStorage.getItem('ppd_v6');
        if (legacyRaw) {
          console.log("Migrating from v6 to v7...");
          const legacyObj = JSON.parse(legacyRaw);
          const migratedObj = migrate(legacyObj);
          migratedObj.version = 7;
          localStorage.setItem(STATE_KEY, JSON.stringify(migratedObj));
          return migratedObj;
        }
      }

      // 3. If still nothing, return default
      if (!raw) {
        const s = DEFAULT();
        localStorage.setItem(STATE_KEY, JSON.stringify(s));
        return s;
      }

      let obj = JSON.parse(raw);
      if (!obj.version || obj.version < 7) obj = migrate(obj);
      return obj;
    } catch (e) {
      console.error("Failed to load state:", e);
      return DEFAULT();
    }
  }

  function migrate(old) {
    console.warn("Migrating data...");
    const def = DEFAULT();
    const s = { ...def }; 
    
    s.theme = old.theme || def.theme;
    s.accent = old.accent || def.accent;
    s.current = old.current || 0;

    if (Array.isArray(old.workspaces)) {
      s.workspaces = old.workspaces.map(ws => {
        const newWs = { ...def.workspaces[0], ...ws };

        if (!newWs.timer) newWs.timer = { ...def.workspaces[0].timer };
        if (newWs.timer.alarmDur) delete newWs.timer.alarmDur;
        if (typeof newWs.timer.autoStart === 'undefined') newWs.timer.autoStart = true;
        
        if (!newWs.customColors) newWs.customColors = {};
        
        if (newWs.timetable) {
            if (!newWs.timetable.lastUsedColor) newWs.timetable.lastUsedColor = '#ffd36b';
            if (!newWs.timetable.weekStartDate) newWs.timetable.weekStartDate = getWeekStartDate(new Date());
        }

        if (!newWs.flashcards) newWs.flashcards = [];
        if (!newWs.journal) newWs.journal = [];
        if (!newWs.taskCategories) newWs.taskCategories = [...def.workspaces[0].taskCategories];
        if (!newWs.recurringTasks) newWs.recurringTasks = [];
        
        if (newWs.tasks) {
          newWs.tasks.forEach(task => {
             if (typeof task.isCompletedToday === 'undefined') task.isCompletedToday = false;
             if (typeof task.category === 'undefined') task.category = null;
          });
        }

        if (!newWs.focusStreak) {
          newWs.focusStreak = { ...def.workspaces[0].focusStreak };
        } else {
            if (!newWs.focusStreak.totalDays) {
                newWs.focusStreak.totalDays = Object.keys(newWs.stats || {}).length;
            }
        }
        
        if (!newWs.unlockedBadges) newWs.unlockedBadges = [];

        if (Array.isArray(ws.syllabus)) {
          newWs.syllabusPages = [{
            id: uid(),
            title: 'Main',
            subjects: ws.syllabus
          }];
          newWs.syllabusCurrentPage = 0;
          delete newWs.syllabus;
          newWs.syllabusPages[0].subjects.forEach(subj => {
            subj.topics.forEach(topic => {
              if (topic.done && !topic.completionDate) {
                  topic.completionDate = getLocalTodayDate();
              }
              delete topic.done;
            });
          });
        }
        
        return newWs;
      });
    }

    localStorage.setItem(STATE_KEY, JSON.stringify(s));
    return s;
  }

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Save failed", e);
    }
  }

  function backupAuto() {}

  let state = loadState();
  let calendarCurrentDate = new Date();

  function currentWS() {
    if (!state.workspaces[state.current]) state.current = 0;
    return state.workspaces[state.current];
  }

  function currentSyllabusPage() {
    const ws = currentWS();
    if (!ws.syllabusPages || !ws.syllabusPages[ws.syllabusCurrentPage]) {
        ws.syllabusPages = [{ id: uid(), title: 'Main', subjects: [] }];
        ws.syllabusCurrentPage = 0;
    }
    return ws.syllabusPages[ws.syllabusCurrentPage];
  }

  /* ===== HELPER UTILITIES ===== */
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function uid() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    } [m]));
  }
  
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function debounce(fn, ms = 200) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function darkenHexColor(hex, amount) {
    if (!hex.startsWith('#')) return hex;
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);
    R = parseInt(R * (1 - amount));
    G = parseInt(G * (1 - amount));
    B = parseInt(B * (1 - amount));
    R = (R < 255) ? R : 255;
    G = (G < 255) ? G : 255;
    B = (B < 255) ? B : 255;
    const RR = ((R.toString(16).length == 1) ? "0" + R.toString(16) : R.toString(16));
    const GG = ((G.toString(16).length == 1) ? "0" + G.toString(16) : G.toString(16));
    const BB = ((B.toString(16).length == 1) ? "0" + B.toString(16) : B.toString(16));
    return "#" + RR + GG + BB;
  }

  function getWeekStartDate(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));
    return weekStart.toLocaleDateString('en-CA');
  }

  function getLocalTodayDate() {
    return new Date().toLocaleDateString('en-CA');
  }

  /* ===== EXPAND/MINIMIZE CARD ===== */
  function expandCard(cardId) {
    const card = $(`#${cardId}`);
    if (!card) return;
    card.classList.add('expanded');
    $('body').classList.add('modal-open');
    const expandBtn = card.querySelector('.expand-btn');
    if (expandBtn) expandBtn.style.display = 'none';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✖';
    closeBtn.className = 'icon-btn close-expanded';
    closeBtn.title = 'Minimize';

    const header = card.querySelector('.card-header');
    if (header && cardId !== 'stickyNotesCard') {
      header.querySelector('.row').appendChild(closeBtn);
    } else if (cardId === 'stickyNotesCard' || cardId === 'calendarCard') {
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '10px';
      closeBtn.style.right = '15px';
      closeBtn.style.zIndex = '150';
      card.appendChild(closeBtn);
    } else {
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '10px';
      closeBtn.style.right = '15px';
      closeBtn.style.zIndex = '150';
      card.appendChild(closeBtn);
    }
    closeBtn.onclick = () => minimizeCard(cardId);

    if (cardId === 'analyticsCard' || cardId === 'timetableCard') {
      setTimeout(() => {
        drawCharts();
      }, 50);
    }
    if (cardId === 'timerCard') {
      initTimerSettingsInputs();
    }
    if (cardId === 'streakInfoCard') {
      renderStreakInfo();
    }
  }

  function minimizeCard(cardId) {
    const card = $(`#${cardId}`);
    if (!card) return;
    card.classList.remove('expanded');
    $('body').classList.remove('modal-open');
    const expandBtn = card.querySelector('.expand-btn');
    if (expandBtn) expandBtn.style.display = '';
    card.querySelector('.close-expanded')?.remove();

    if (cardId === 'analyticsCard' || cardId === 'timetableCard') {
      setTimeout(() => {
        drawCharts();
      }, 50);
    }
    if (cardId === 'streakInfoCard') {
      renderStreakInfo();
    }
  }

  function initExpandButtons() {
    $$('.expand-btn').forEach(btn => {
      btn.onclick = null;
      btn.addEventListener('click', (e) => {
        const targetId = e.currentTarget.dataset.target;
        expandCard(targetId);
      });
    });
  }

  /* ===== HEADER, THEME, WORKSPACES ===== */
  function tickClock() {
    const d = new Date();
    const timeString = d.toLocaleString('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
    $('#clock').textContent = `${timeString} • ${d.toDateString()}`;
    const h = d.getHours();
    $('#greet').textContent = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
  }
  setInterval(tickClock, 1000);
  tickClock();

  function renderWorkspaceSelect() {
    const sel = $('#workspaceSelect');
    sel.innerHTML = '';
    state.workspaces.forEach((w, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = w.name;
      sel.appendChild(o);
    });
    sel.value = state.current;
  }
  $('#workspaceSelect').addEventListener('change', e => {
    state.current = Number(e.target.value);
    saveState();
    renderAll();
  });
  $('#addWorkspace').addEventListener('click', () => {
    const name = prompt('Workspace name') || `WS ${state.workspaces.length + 1}`;
    state.workspaces.push(JSON.parse(JSON.stringify(DEFAULT().workspaces[0])));
    state.workspaces[state.workspaces.length - 1].name = name;
    state.current = state.workspaces.length - 1;
    saveState();
    renderAll();
  });
  $('#delWorkspace').addEventListener('click', () => {
    if (state.workspaces.length === 1) {
      alert('Cannot delete last workspace');
      return;
    }
    if (confirm(`Are you sure you want to delete workspace "${currentWS().name}"? This cannot be undone.`)) {
      state.workspaces.splice(state.current, 1);
      state.current = 0;
      saveState();
      renderAll();
    }
  });

  function applyTheme() {
    document.body.className = state.theme === 'light' ? 'light' : '';
    document.documentElement.style.setProperty('--accent', state.accent);
    document.documentElement.style.setProperty('--accent-2', state.accent);

    const themeIcon = (state.theme === 'light') ? '🌙' : '☀️';
    const themeTitle = (state.theme === 'light') ? 'Switch to Dark Mode' : 'Switch to Light Mode';
    const themeBtn = $('#themeToggleBtn');
    if (themeBtn) {
      themeBtn.textContent = themeIcon;
      themeBtn.title = themeTitle;
    }

    applyCustomColors();
  }

  $('#themeToggleBtn').onclick = () => {
    state.theme = (state.theme === 'light') ? 'dark' : 'light';
    saveState();
    applyTheme();
  };

  function applyCustomColors() {
    const ws = currentWS();
    if (!ws.customColors) ws.customColors = {};
    const styles = Object.entries(ws.customColors).map(([key, value]) => {
      if (!value) return '';
      const selectorMap = {
        todoCardAccent: '#todoCard',
        syllabusCardAccent: '#syllabusCard',
        timetableCardAccent: '#timetableCard',
        analyticsCardAccent: '#analyticsCard',
        timerCardAccent: '#timerCard',
      };

      if (key.endsWith('Accent')) {
        const selector = selectorMap[key];
        if (selector) {
          const baseSelector = `${state.theme === 'light' ? '.light' : ''} ${selector}`;
          return `
                        ${baseSelector} .accent, 
                        ${baseSelector} .tab.active { 
                            background: ${value} !important; 
                            background-image: none !important; 
                        }
                    `;
        }
      } else if (key.endsWith('AccentText')) {
        const baseKey = key.replace('Text', '');
        const selector = selectorMap[baseKey];
        if (selector) {
          const baseSelector = `${state.theme === 'light' ? '.light' : ''} ${selector}`;
          return `
                        ${baseSelector} .accent, 
                        ${baseSelector} .tab.active { 
                            color: ${value} !important;
                        }
                    `;
        }
      }
      return '';
    }).join('\n');

    $('#custom-colors-style').innerHTML = styles;
  }

  const defaultAccentChoices = ['#6ea8fe', '#8bd5ff', '#9b59b6', '#ff6b6b', '#59d18c', '#ffcc66', '#00d1b2', '#ff7ab2', '#36cfc9'];

  function renderAccentPalette() {
    const wrap = $('#accentPalette');
    if (!wrap) return;
    wrap.innerHTML = '';
    defaultAccentChoices.forEach(c => {
      const d = document.createElement('div');
      d.className = 'color-dot';
      d.style.background = c;
      d.title = c;
      d.onclick = () => {
        state.accent = c;
        saveState();
        applyTheme();
      };
      wrap.appendChild(d);
    });
    const expandBtn = document.createElement('button');
    expandBtn.className = 'ghost';
    expandBtn.textContent = '🎨';
    expandBtn.title = 'More Colors & Options';
    expandBtn.onclick = openColorPickerModal;
    wrap.appendChild(expandBtn);
  }

  function openColorPickerModal() {
    const moreColors = [
        {name:"White",hex:"#ffffff"},{name:"Silver",hex:"#bdc3c7"},{name:"Gray",hex:"#7f8c8d"},
        {name:"Black",hex:"#000000"},{name:"Dark Background",hex:"#0f1115"},{name:"Maroon",hex:"#c0392b"},
        {name:"Red",hex:"#e74c3c"},{name:"Orange",hex:"#e67e22"},{name:"Yellow",hex:"#f1c40f"},
        {name:"Olive",hex:"#808000"},{name:"Lime",hex:"#2ecc71"},{name:"Green",hex:"#27ae60"},
        {name:"Aqua",hex:"#1abc9c"},{name:"Teal",hex:"#16a085"},{name:"Blue",hex:"#3498db"},
        {name:"Navy",hex:"#2980b9"},{name:"Fuchsia",hex:"#d35400"},{name:"Purple",hex:"#8e44ad"},
        {name:"Pink",hex:"#fd79a8"},{name:"Hot Pink",hex:"#ff7675"},{name:"Gold",hex:"#ffd700"},
        {name:"Crimson",hex:"#dc143c"},{name:"Brown",hex:"#964B00"},{name:"Coral",hex:"#ff7f50"},
        {name:"Indigo",hex:"#4B0082"},{name:"Violet",hex:"#EE82EE"},{name:"Turquoise",hex:"#40E0D0"},
        {name:"Salmon",hex:"#FA8072"},{name:"Plum",hex:"#DDA0DD"}
    ];

    const customColorTargets = [{
      key: 'todoCardAccent',
      label: 'To-Do Buttons'
    }, {
      key: 'syllabusCardAccent',
      label: 'Syllabus Buttons'
    }, {
      key: 'timetableCardAccent',
      label: 'Timetable Buttons'
    }, {
      key: 'analyticsCardAccent',
      label: 'Analytics Buttons'
    }, {
      key: 'timerCardAccent',
      label: 'Timer Buttons'
    }, ];

    let colorGridHtml = moreColors.map(c => `<div class="color-dot" style="background:${c.hex}" title="${c.name}" data-hex="${c.hex}"></div>`).join('');

    let advancedOptionsHtml = customColorTargets.map(t => {
      const bgColor = currentWS().customColors[t.key] || '#000000';
      const textColorKey = t.key + 'Text';
      const textColor = currentWS().customColors[textColorKey] || '#000000';
      return `<div class="item">
                <label>${t.label}</label>
                <div class="row">
                    <label title="Background Color"><input type="color" data-key="${t.key}" value="${bgColor}"></label>
                    <label title="Text Color"><input type="color" data-key="${textColorKey}" value="${textColor}"></label>
                    <button class="ghost" data-reset-key="${t.key}" title="Reset to default">✖</button>
                </div>
            </div>`;
    }).join('');

    const modalContent = html `
            <div class="color-picker-modal">
                <h3>Accent Color</h3>
                <div class="color-grid">${colorGridHtml}</div>
                <hr style="border-color: rgba(255,255,255,0.1); margin: 20px 0;">
                <h3>Advanced Options</h3>
                <p style="color:var(--muted); font-size: 12px; margin-top: -8px; margin-bottom: 12px;">Customize button colors for specific cards.</p>
                <div class="advanced-options list">${advancedOptionsHtml}</div>
                <button id="closeColorModal" class="accent" style="width: 100%; margin-top: 16px;">Done</button>
            </div>
        `;
    openModal(modalContent);

    $('#closeColorModal').onclick = closeModal;

    $('#modalCard .color-grid').addEventListener('click', e => {
      if (e.target.dataset.hex) {
        state.accent = e.target.dataset.hex;
        saveState();
        applyTheme();
      }
    });

    $('#modalCard .advanced-options').addEventListener('input', e => {
      if (e.target.type === 'color' && e.target.dataset.key) {
        const key = e.target.dataset.key;
        const value = e.target.value;
        currentWS().customColors[key] = value;
        saveState();
        applyCustomColors();
      }
    });

    $('#modalCard .advanced-options').addEventListener('click', e => {
      if (e.target.dataset.resetKey) {
        const key = e.target.dataset.resetKey;
        const textKey = key + 'Text';
        delete currentWS().customColors[key];
        delete currentWS().customColors[textKey];
        saveState();
        applyCustomColors();
        const colorInputs = e.target.parentElement.querySelectorAll('input[type="color"]');
        colorInputs.forEach(input => input.value = '#000000');
      }
    });
  }

  $('#toggleSettingsBtn').addEventListener('click', () => {
    const settingsBar = $('#settingsBar');
    const toggleBtn = $('#toggleSettingsBtn');
    const isVisible = settingsBar.classList.toggle('visible');

    if (isVisible) {
      toggleBtn.title = 'Close Settings';
    } else {
      toggleBtn.title = 'Open Settings';
    }
  });

  /* ===== Right Column Tab Navigation ===== */
  function initRightColumnTabs() {
    const tabs = $$('.right-nav-tabs .tab');
    const cards = $$('.right-content-area .card');

    function showTab(targetId) {
      tabs.forEach(t => t.classList.remove('active'));
      cards.forEach(c => c.classList.remove('active'));

      const tab = $(`.right-nav-tabs .tab[data-target="${targetId}"]`);
      const card = $(`#${targetId}`);

      if (tab) tab.classList.add('active');
      if (card) card.classList.add('active');

      if (targetId === 'analyticsCard' || targetId === 'timetableCard') {
        setTimeout(() => {
          drawCharts();
        }, 50);
      }
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        showTab(tab.dataset.target);
      });
    });

    if (tabs.length > 0) {
        // Try to stay on current tab if state reload
        const visibleCard = $('.right-content-area .card.active');
        if (visibleCard) return;
        showTab(tabs[0].dataset.target);
    }
  }


  /* ===== FOCUS TIMER & STREAK ===== */
  let timerInt = null,
    remaining = 0,
    running = false,
    timerEndTime = 0;

  function modeDur(m) {
    return (currentWS().timer?.dur?.[m] ?? 25) * 60 * 1000;
  }

  function setModeUI() {
    const m = $('#mode').value;
    remaining = modeDur(m);
    updateDisplay(remaining);
    $('#timerStatus').textContent = 'Idle';
    updateCycleDisplay();
  }

  function updateDisplay(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    $('#display').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    
    // UPDATED LINE: Use your full title when the timer is not running
    document.title = running ? `${$('#display').textContent} - Focus-Deck` : 'Focus-Deck | Free Productivity Dashboard & Pomodoro Timer';
  }

  function timerTick() {
    if (!running) return;
    remaining = timerEndTime - Date.now();
    if (remaining <= 0) {
      remaining = 0;
      updateDisplay(remaining);
      completeSession();
    } else {
      updateDisplay(remaining);
    }
  }

  function startTimer() {
    if (running) return;
    running = true;
    $('#timerStatus').textContent = `Running ${$('#mode').value}`;
    const duration = (remaining > 0 && remaining < modeDur($('#mode').value)) ? remaining : modeDur($('#mode').value);
    timerEndTime = Date.now() + duration;
    clearInterval(timerInt);
    timerInt = setInterval(timerTick, 500);
    timerTick();
  }

  function pauseTimer() {
    if (!running) return;
    running = false;
    clearInterval(timerInt);
    timerInt = null;
    remaining = timerEndTime - Date.now();
    $('#timerStatus').textContent = 'Paused';
    updateDisplay(remaining);
  }

  function resetTimer() {
    pauseTimer();
    timerEndTime = 0;
    remaining = 0;
    const ws = currentWS();
    ws.timer.currentCycle = 1;
    saveState();
    setModeUI();
  }

  function flashDisplay() {
    const el = $('#display');
    let t = 0;
    const id = setInterval(() => {
      el.style.transform = (t++ % 2) ? 'scale(1.02)' : 'none';
      if (t > 6) {
        clearInterval(id);
        el.style.transform = 'none';
      }
    }, 180);
  }

  function checkStreakDecay() {
    const ws = currentWS();
    const streak = ws.focusStreak;
    const today = getLocalTodayDate();
    const last = streak.lastSessionDate;

    // If never used, do nothing
    if (!last) return;

    // If already used today, do nothing
    if (last === today) return;

    // Calculate difference in days
    const d1 = new Date(last);
    const d2 = new Date(today);
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // If gap is more than 1 day (meaning yesterday was skipped), reset streak
    if (diffDays > 1) {
      streak.current = 0;
      saveState();
    }
  }

  function updateStreak() {
    const ws = currentWS();
    const streak = ws.focusStreak;
    const today = getLocalTodayDate();
    const last = streak.lastSessionDate;

    if (!ws.stats[today]) {
      ws.stats[today] = {
        tasks: 0,
        focus: 0
      };
      streak.totalDays = (streak.totalDays || 0) + 1;
    }

    if (last === today) {
      return;
    }

    if (!last) {
      streak.current = 1;
      streak.lastSessionDate = today;
      streak.longest = Math.max(streak.longest || 0, 1);
      saveState();
      return;
    }

    const d1 = new Date(today);
    const d2 = new Date(last);
    const diffTime = Math.abs(d1 - d2);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streak.current++;
    } else {
      streak.current = 1;
    }

    streak.lastSessionDate = today;

    if (streak.current > (streak.longest || 0)) {
      streak.longest = streak.current;
    }

    saveState();
  }

  function renderStreakCounter() {
    const streak = currentWS().focusStreak;
    $('#streakCounter').innerHTML = `🔥 ${streak.current}`;
    $('#streakCounter').title = `Current focus streak: ${streak.current} day(s). Goal: ${streak.dailyGoal} sessions/day.`;
  }

  function renderStreakInfo() {
    const ws = currentWS();
    if (!ws.focusStreak.longest) ws.focusStreak.longest = 0;
    if (!ws.focusStreak.totalDays) ws.focusStreak.totalDays = Object.keys(ws.stats).length;

    $('#currentStreakDisplay').textContent = `${ws.focusStreak.current} Day(s)`;
    $('#longestStreakDisplay').textContent = `${ws.focusStreak.longest} Day(s)`;
    $('#totalDaysDisplay').textContent = `${ws.focusStreak.totalDays} Day(s)`;
  }

  function completeSession() {
    clearInterval(timerInt);
    timerInt = null;
    running = false;
    remaining = 0;
    timerEndTime = 0;

    flashDisplay();
    $('#alarmSound').play().catch(() => {});

    const ws = currentWS();
    const currentMode = $('#mode').value;

    if (currentMode === 'focus') {
      updateStreak();
      const key = getLocalTodayDate();
      if (!ws.stats[key]) ws.stats[key] = {
        tasks: 0,
        focus: 0
      };
      ws.stats[key].focus++;

      if (ws.timer.currentCycle >= ws.timer.longBreakInterval) {
        $('#mode').value = 'long';
        ws.timer.currentCycle = 1;
      } else {
        $('#mode').value = 'short';
        ws.timer.currentCycle++;
      }
    } else {
      $('#mode').value = 'focus';
    }

    saveState();
    setModeUI();
    drawCharts();
    renderStreakCounter();
    renderStreakInfo();
    checkAndUnlockBadges();

    if (ws.timer.autoStart) {
      startTimer();
    }
  }

  function updateCycleDisplay() {
    const ws = currentWS();
    $('#cycleDisplay').textContent = `Cycle ${ws.timer.currentCycle} / ${ws.timer.longBreakInterval}`;
  }

  $('#mode').addEventListener('change', () => {
    pauseTimer();
    timerEndTime = 0;
    setModeUI();
  });
  $('#start').addEventListener('click', startTimer);
  $('#pause').addEventListener('click', pauseTimer);
  $('#reset').addEventListener('click', resetTimer);

  function initTimerSettingsInputs() {
    const ws = currentWS();
    $('#longBreakInterval').value = ws.timer.longBreakInterval;
  }
  $('#saveTimerSettings').addEventListener('click', () => {
    const ws = currentWS();
    ws.timer.longBreakInterval = Math.max(1, Number($('#longBreakInterval').value));
    saveState();
    updateCycleDisplay();
    openModal(html `<p>Timer settings saved!</p><button id="closeAlertModal" class="accent">OK</button>`);
    $('#closeAlertModal').onclick = closeModal;
  });

  /* ===== SOUND MIXER ===== */
  $$('.sound-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
          const soundName = btn.dataset.sound;
          const audio = $(`#audio-${soundName}`);
          if (audio.paused) {
              audio.play();
              btn.classList.add('active');
          } else {
              audio.pause();
              btn.classList.remove('active');
          }
      });
  });

  $$('.volume-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
          const soundName = e.target.dataset.sound;
          const audio = $(`#audio-${soundName}`);
          audio.volume = e.target.value;
      });
  });


  /* ===== BADGES ===== */
  const ALL_BADGES = {
    'streak1': {
      title: 'Beginner',
      icon: '🌱',
      desc: 'Complete a 1-day focus streak.',
      unlock: (ws) => ws.focusStreak.current >= 1
    },
    'streak7': {
      title: 'Weekly Warrior',
      icon: '📅',
      desc: 'Complete a 7-day focus streak.',
      unlock: (ws) => ws.focusStreak.current >= 7
    },
    'streak30': {
      title: 'Month Master',
      icon: '🗓️',
      desc: 'Complete a 30-day focus streak.',
      unlock: (ws) => ws.focusStreak.current >= 30
    },
    'longest10': {
      title: 'Dedicated',
      icon: '🎯',
      desc: 'Achieve a 10-day longest streak.',
      unlock: (ws) => (ws.focusStreak.longest || 0) >= 10
    },
    'total10': {
      title: 'Getting Started',
      icon: '🚀',
      desc: 'Use the app for 10 total days.',
      unlock: (ws) => (ws.focusStreak.totalDays || 0) >= 10
    },
    'total100': {
      title: 'Veteran',
      icon: '🏆',
      desc: 'Use the app for 100 total days.',
      unlock: (ws) => (ws.focusStreak.totalDays || 0) >= 100
    }
  };

  function checkAndUnlockBadges() {
    const ws = currentWS();
    if (!ws.unlockedBadges) ws.unlockedBadges = [];
    let newBadgeUnlocked = false;
    let unlockedBadgeTitle = '';
    let unlockedBadgeIcon = '';

    Object.keys(ALL_BADGES).forEach(key => {
      if (!ws.unlockedBadges.includes(key)) {
        const badge = ALL_BADGES[key];
        if (badge.unlock(ws)) {
          ws.unlockedBadges.push(key);
          newBadgeUnlocked = true;
          unlockedBadgeTitle = badge.title;
          unlockedBadgeIcon = badge.icon;
        }
      }
    });

    if (newBadgeUnlocked) {
      saveState();
      renderBadges();
      openModal(html `
            <div style="text-align: center;">
                <h2 style="color: var(--ok);">Badge Unlocked!</h2>
                <p>You've earned the <strong>${escapeHtml(unlockedBadgeTitle)}</strong> badge!</p>
                <span style="font-size: 40px; margin: 10px 0; display: block;">${unlockedBadgeIcon}</span>
                <button id="closeBadgeModal" class="accent">Awesome!</button>
            </div>
          `);
      $('#closeBadgeModal').onclick = closeModal;
    }
  }

  function renderBadges() {
    const ws = currentWS();
    if (!ws.unlockedBadges) ws.unlockedBadges = [];
    const container = $('#badgesCard .card-body');
    if (!container) return;
    container.innerHTML = '';

    Object.keys(ALL_BADGES).forEach(key => {
      const badge = ALL_BADGES[key];
      const isUnlocked = ws.unlockedBadges.includes(key);

      const el = document.createElement('div');
      el.className = 'flip-card' + (isUnlocked ? '' : ' badge-locked');

      el.innerHTML = `
            <div class="flip-card-inner">
                <div class="flip-card-front">
                    <span class="badge-icon">${badge.icon}</span>
                    <span class="badge-title">${badge.title}</span>
                </div>
                <div class="flip-card-back">
                    <strong>${badge.title}</strong>
                    <p style="margin: 4px 0;">${escapeHtml(badge.desc)}</p>
                    ${isUnlocked ? '<span class="badge" style="background:var(--ok)">Unlocked!</span>' : '<span class="badge" style="background:var(--muted)">Locked</span>'}
                </div>
            </div>
        `;
      el.onclick = () => {
        el.classList.toggle('flipped');
      };
      container.appendChild(el);
    });
  }

  /* ===== TO-DO LIST ===== */
  function addTask() {
    const v = $('#todoInput').value.trim();
    if (!v) return;
    currentWS().tasks.push({
      id: uid(),
      text: v,
      created: Date.now(),
      subtasks: [],
      isCollapsed: true,
      isCompletedToday: false,
      category: null // New category field
    });
    saveState();
    $('#todoInput').value = '';
    renderTasks();
  }
  $('#addTask').addEventListener('click', addTask);
  $('#todoInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTask();
  });

  function addSubtask(taskId) {
    const name = prompt("New subtask name:");
    if (!name || !name.trim()) return;
    const task = currentWS().tasks.find(t => t.id === taskId);
    if (task) {
      if (!task.subtasks) task.subtasks = [];
      task.subtasks.push({
        id: uid(),
        text: name.trim(),
        done: false
      });
      task.isCollapsed = false;
      saveState();
      renderTasks();
    }
  }

  function editSubtask(taskId, subtaskId) {
    const task = currentWS().tasks.find(t => t.id === taskId);
    if (!task) return;
    const subtask = task.subtasks.find(st => st.id === subtaskId);
    if (!subtask) return;

    const newText = prompt('Edit subtask:', subtask.text);
    if (newText !== null && newText.trim() !== '') {
      subtask.text = newText.trim();
      saveState();
      renderTasks();
    }
  }

  function deleteSubtask(taskId, subtaskId) {
    const task = currentWS().tasks.find(t => t.id === taskId);
    if (task && confirm('Are you sure you want to delete this subtask?')) {
      task.subtasks = task.subtasks.filter(st => st.id !== subtaskId);
      saveState();
      renderTasks();
    }
  }


  function toggleSubtask(taskId, subtaskId) {
    const task = currentWS().tasks.find(t => t.id === taskId);
    if (task) {
      const subtask = task.subtasks.find(st => st.id === subtaskId);
      if (subtask) {
        subtask.done = !subtask.done;
        saveState();
        renderTasks();
      }
    }
  }

  function toggleTaskCompletion(taskId, isChecked) {
    const ws = currentWS();
    const taskIndex = ws.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    const task = ws.tasks[taskIndex];
    const key = getLocalTodayDate();

    if (!ws.stats[key]) {
      ws.stats[key] = {
        tasks: 0,
        focus: 0
      };
    }

    if (task.recurringId) {
      task.isCompletedToday = isChecked;
      if (isChecked) {
        updateStreak();
        ws.stats[key].tasks++;
        ws.done.unshift({
          id: uid(),
          text: task.text,
          when: Date.now(),
          recurringId: task.recurringId
        });
      } else {
        // Find done entry for today (local time)
        const doneIndex = ws.done.findIndex(d =>
          d.recurringId === task.recurringId &&
          new Date(d.when).toLocaleDateString('en-CA') === key
        );

        if (doneIndex > -1) {
          ws.done.splice(doneIndex, 1);
          if (ws.stats[key] && ws.stats[key].tasks > 0) {
            ws.stats[key].tasks--;
          }
        }
      }
    } else {
      if (isChecked) {
        updateStreak();
        ws.stats[key].tasks++;
        const [t] = ws.tasks.splice(taskIndex, 1);
        ws.done.unshift({
          id: uid(),
          text: t.text,
          when: Date.now()
        });
      }
    }

    saveState();
    renderTasks();
    drawCharts();

    if (isChecked) {
      renderStreakCounter();
      renderStreakInfo();
      checkAndUnlockBadges();
    }
  }


  function deleteTask(id, done = false) {
    const ws = currentWS();
    const arr = done ? ws.done : ws.tasks;
    const i = arr.findIndex(x => x.id === id);
    if (i < 0) return;

    const task = arr[i];

    if (!done && task.recurringId) {
      openModal(html `
                <h3>Delete Recurring Task</h3>
                <p>This is a recurring task. How would you like to delete it?</p>
                <div class="row" style="justify-content: flex-end;">
                    <button id="delOnce" class="ghost">Delete Just This Once</button>
                    <button id="delPerm" class="accent">Stop Recurring & Delete All</button>
                </div>
            `);
      $('#delOnce').onclick = () => {
        arr.splice(i, 1);
        saveState();
        renderTasks();
        closeModal();
      };
      $('#delPerm').onclick = () => {
        ws.recurringTasks = ws.recurringTasks.filter(rt => rt.id !== task.recurringId);
        ws.tasks = ws.tasks.filter(t => t.recurringId !== task.recurringId);
        ws.done = ws.done.filter(t => t.recurringId !== task.recurringId);
        saveState();
        renderTasks();
        closeModal();
      }
    } else {
      arr.splice(i, 1);
      saveState();
      renderTasks();
    }
  }

  function editTask(id) {
    const ws = currentWS();
    const t = ws.tasks.find(x => x.id === id) || ws.done.find(x => x.id === id);
    if (!t) return;
    const nv = prompt('Edit', t.text);
    if (nv === null) return;
    t.text = nv.trim();
    saveState();
    renderTasks();
  }

  function manageTaskCategory(taskId) {
      const ws = currentWS();
      const task = ws.tasks.find(t => t.id === taskId);
      if(!task) return;

      const cats = ws.taskCategories || [];
      
      const catListHtml = cats.map(c => `
          <div class="row" style="margin-bottom: 4px;">
              <button class="ghost" style="flex-grow:1; text-align:left; border-left: 4px solid ${c.color};" data-cat-id="${c.id}">
                  ${escapeHtml(c.name)}
              </button>
              <button class="icon-btn delete-cat-btn" data-cat-id="${c.id}" title="Delete Category" style="color:var(--muted);">🗑</button>
          </div>
      `).join('');

      openModal(html`
          <h3>Task Category</h3>
          <p>Select a category for: <strong>${escapeHtml(task.text)}</strong></p>
          <div class="column" style="margin-bottom:16px;">
              ${catListHtml}
              <button class="ghost" style="width:100%; text-align:left; color:var(--muted);" data-cat-id="none">None (Remove Category)</button>
          </div>
          <hr style="border-color:rgba(255,255,255,0.1);">
          <h4>Create New Category</h4>
          <div class="row">
              <input type="text" id="newCatName" placeholder="Category Name (e.g. Work, Hobby)" style="flex-grow:1;">
              <input type="color" id="newCatColor" value="#59d18c" style="width:40px;">
              <button id="addNewCatBtn" class="accent">Add</button>
          </div>
      `);

      const modal = $('#modalCard');
      
      // Category Selection
      modal.querySelectorAll('button[data-cat-id]').forEach(btn => {
          if(btn.classList.contains('delete-cat-btn')) return; // Skip delete buttons
          btn.onclick = () => {
              const catId = btn.dataset.catId;
              task.category = catId === 'none' ? null : catId;
              saveState();
              renderTasks();
              closeModal();
          };
      });

      // Category Deletion
      modal.querySelectorAll('.delete-cat-btn').forEach(btn => {
          btn.onclick = (e) => {
              e.stopPropagation();
              const catId = btn.dataset.catId;
              if(confirm('Delete this category? Tasks will lose this label.')) {
                  // Remove from categories list
                  ws.taskCategories = ws.taskCategories.filter(c => c.id !== catId);
                  
                  // Scrub from all tasks
                  ws.tasks.forEach(t => { if(t.category === catId) t.category = null; });
                  ws.done.forEach(t => { if(t.category === catId) t.category = null; });
                  
                  saveState();
                  renderTasks();
                  closeModal();
                  manageTaskCategory(taskId); // Re-open modal to refresh list
              }
          };
      });

      $('#addNewCatBtn').onclick = () => {
          const name = $('#newCatName').value.trim();
          const color = $('#newCatColor').value;
          if(name) {
              const newId = 'custom_' + uid();
              ws.taskCategories.push({id: newId, name, color});
              saveState();
              closeModal();
              manageTaskCategory(taskId); // Re-open to show new cat
          }
      };
  }

  let dragSrc = null;
  const ctxMenu = $('#context-menu');

  function showContextMenu(x, y, items) {
    ctxMenu.innerHTML = '';
    items.forEach(it => {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.onclick = () => {
        try {
          it.action();
        } catch (e) {
          console.error(e);
        }
        hideContextMenu();
      };
      ctxMenu.appendChild(b);
    });
    const mx = window.innerWidth - 12 - ctxMenu.offsetWidth;
    const my = window.innerHeight - 12 - ctxMenu.offsetHeight;
    ctxMenu.style.left = Math.min(x, mx) + 'px';
    ctxMenu.style.top = Math.min(y, my) + 'px';
    ctxMenu.style.display = 'flex';
    ctxMenu.setAttribute('aria-hidden', 'true');
  }

  function hideContextMenu() {
    ctxMenu.style.display = 'none';
    ctxMenu.setAttribute('aria-hidden', 'true');
  }
  document.addEventListener('click', e => {
    if (!ctxMenu.contains(e.target)) hideContextMenu();
  });

  function renderTasks(searchQuery = '') {
    const ws = currentWS();
    const todo = $('#todoList');
    const done = $('#doneList');
    todo.innerHTML = '';
    done.innerHTML = '';

    const filteredTasks = ws.tasks.filter(t => t.text.toLowerCase().includes(searchQuery));

    filteredTasks.forEach(t => {
      if (typeof t.isCollapsed === 'undefined') t.isCollapsed = true;

      const isRecurring = !!t.recurringId;
      const isCompletedRec = isRecurring && t.isCompletedToday;

      const el = document.createElement('div');
      el.className = 'task-item' + (t.isCollapsed ? ' collapsed' : '') + (isCompletedRec ? ' recurring-completed' : '');
      el.dataset.id = t.id;

      // Category Pill Logic
      let catPill = '';
      if(t.category) {
          const cat = (ws.taskCategories || []).find(c => c.id === t.category);
          if(cat) {
              catPill = `<span class="category-pill" style="background:${cat.color}; color:#fff;">${escapeHtml(cat.name)}</span>`;
          }
      }

      const doneSubtasks = (t.subtasks || []).filter(st => st.done).length;
      const totalSubtasks = (t.subtasks || []).length;
      const progress = totalSubtasks > 0 ? (doneSubtasks / totalSubtasks) * 100 : 0;

      let subtaskHTML = '';
      if (totalSubtasks > 0) {
        subtaskHTML = '<div class="list" style="padding-left: 20px; margin-top: 8px;">';
        t.subtasks.forEach(st => {
          subtaskHTML += `
                <div class="item" style="padding: 4px; grid-template-columns: auto 1fr auto;">
                    <input type="checkbox" ${st.done ? 'checked' : ''} data-task-id="${t.id}" data-subtask-id="${st.id}">
                    <div class="text">${escapeHtml(st.text)}</div>
                    <div class="row">
                        <button class="icon-btn edit-subtask-btn" data-subtask-id="${st.id}" title="Edit Subtask">✎</button>
                        <button class="icon-btn delete-subtask-btn" data-subtask-id="${st.id}" title="Delete Subtask">🗑</button>
                    </div>
                </div>`;
        });
        subtaskHTML += '</div>';
      }

      el.innerHTML = `
            <div class="item" style="padding: 8px; background: transparent; border: none; grid-template-columns: auto 1fr auto auto;">
                <input type="checkbox" title="Complete task" ${isCompletedRec ? 'checked' : ''}>
                <div class="text" title="Double-click to categorize" style="display:flex; align-items:center;">
                    ${isRecurring ? '<span style="margin-right:4px;">📌</span>' : ''}
                    ${catPill}
                    ${escapeHtml(t.text)}
                </div>
                <div class="row">
                    ${totalSubtasks > 0 ? `<button class="icon-btn toggle-subtasks-btn" title="Toggle Subtasks">${t.isCollapsed ? '▾' : '▴'}</button>` : ''}
                    <button class="icon-btn toggle-recurring-btn" title="${isRecurring ? 'Make One-Time (Unpin)' : 'Make Recurring (Pin)'}" style="${isRecurring ? `color: var(--accent);` : ''}">📌</button>
                    <button class="icon-btn add-subtask-btn" title="Add Subtask">➕</button>
                    <button class="icon-btn edit-task-btn" title="Edit">✎</button>
                    <button class="icon-btn delete-task-btn" title="Delete">🗑</button>
                </div>
                 <div class="drag-handle" draggable="true">::</div>
            </div>
            ${totalSubtasks > 0 ? `<div class="progress" style="margin: 0 8px 8px;"><span style="width: ${progress}%"></span></div>` : ''}
            <div class="subtask-list-container" style="padding: 0 8px 8px;">${subtaskHTML}</div>
        `;

      el.querySelector('input[type="checkbox"]').onchange = function() {
        toggleTaskCompletion(t.id, this.checked)
      };
      el.querySelector('.toggle-recurring-btn').onclick = () => toggleRecurring(t.id);
      el.querySelector('.add-subtask-btn').onclick = () => addSubtask(t.id);
      el.querySelector('.edit-task-btn').onclick = () => editTask(t.id);
      el.querySelector('.delete-task-btn').onclick = () => deleteTask(t.id);
      
      // Double click to categorize
      el.querySelector('.text').ondblclick = () => manageTaskCategory(t.id);

      const toggleSubtasksBtn = el.querySelector('.toggle-subtasks-btn');
      if (toggleSubtasksBtn) {
        toggleSubtasksBtn.onclick = (e) => {
          e.stopPropagation();
          t.isCollapsed = !t.isCollapsed;
          saveState();
          renderTasks();
        };
      }

      el.querySelectorAll('.edit-subtask-btn').forEach(btn => {
        btn.onclick = () => editSubtask(t.id, btn.dataset.subtaskId);
      });
      el.querySelectorAll('.delete-subtask-btn').forEach(btn => {
        btn.onclick = () => deleteSubtask(t.id, btn.dataset.subtaskId);
      });

      el.querySelectorAll('.subtask-list-container input[type="checkbox"]').forEach(subtaskCheckbox => {
        subtaskCheckbox.onchange = (e) => {
          toggleSubtask(e.target.dataset.taskId, e.target.dataset.subtaskId);
        };
      });

      el.querySelector('.drag-handle').addEventListener('dragstart', e => {
        dragSrc = el;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
      });
      el.addEventListener('dragend', e => {
        if (dragSrc) dragSrc.classList.remove('dragging');
        dragSrc = null;
        saveOrder();
      });
      el.addEventListener('dragover', e => {
        e.preventDefault();
        const target = e.currentTarget;
        if (target === dragSrc) return;
        const rect = target.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        target.parentNode.insertBefore(dragSrc, after ? target.nextSibling : target);
      });
      todo.appendChild(el);
    });

    ws.done.forEach(t => {
      const el = document.createElement('div');
      el.className = 'item';
      const when = new Date(t.when).toLocaleString();
      el.innerHTML = `<span class="badge">✓</span><div class="text" title="${escapeHtml(t.text)}">${t.recurringId ? '📌 ' : ''}${escapeHtml(t.text)}</div><span class="badge" title="${when}">${when}</span><div><button class="icon-btn" title="Delete">🗑</button></div>`;
      el.querySelector('button').onclick = () => deleteTask(t.id, true);
      done.appendChild(el);
    });
    // Kept the filtering function for search usage
  }

  function saveOrder() {
    const wrap = $('#todoList');
    const ids = Array.from(wrap.children).map(c => c.dataset.id);
    const ws = currentWS();
    ws.tasks = ids.map(id => ws.tasks.find(t => t.id === id)).filter(Boolean);
    saveState();
  }
  $$('#todoCard .tab').forEach(tab => {
    tab.onclick = () => {
      $$('#todoCard .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isTodo = tab.dataset.tab === 'todo';
      $('#todoInputRow').style.display = isTodo ? '' : 'none';
      $('#todoList').style.display = isTodo ? '' : 'none';
      $('#doneList').style.display = isTodo ? 'none' : '';
      $('#doneActions').style.display = isTodo ? 'none' : 'flex';
      $('#todoSearchRow').style.display = isTodo ? 'flex' : 'none';
    };
  });
  $('#clearDone').onclick = () => {
    currentWS().done = [];
    saveState();
    renderTasks();
  };

  $('#todoSearch').addEventListener('input', e => {
    const query = e.target.value.toLowerCase();
    renderTasks(query);
  });

  function toggleRecurring(taskId) {
    const ws = currentWS();
    const task = ws.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (task.recurringId) {
      const recurringTask = ws.recurringTasks.find(rt => rt.id === task.recurringId);
      if (recurringTask) {
        ws.recurringTasks = ws.recurringTasks.filter(rt => rt.id !== task.recurringId);
      }
      delete task.recurringId;
      task.isCompletedToday = false;
    } else {
      const newRecurring = {
        id: uid(),
        text: task.text
      };
      ws.recurringTasks.push(newRecurring);
      task.recurringId = newRecurring.id;
    }
    saveState();
    renderTasks();
  }

  function checkAndResetRecurringTasks() {
    const ws = currentWS();
    if (!ws.recurringTasks) ws.recurringTasks = [];

    const today = getLocalTodayDate();

    if (ws.lastRecurringCheck !== today) {
      let changed = false;

      // 1. Uncheck recurring tasks that were marked done yesterday
      ws.tasks.forEach(task => {
        if (task.recurringId && task.isCompletedToday) {
          task.isCompletedToday = false;
          changed = true;
        }
      });

      // 2. Resurrect recurring tasks if they were deleted (optional safety)
      ws.recurringTasks.forEach(recurringTask => {
        const existsInTodo = ws.tasks.some(t => t.recurringId === recurringTask.id);
        if (!existsInTodo) {
          ws.tasks.push({
            id: uid(),
            text: recurringTask.text,
            created: Date.now(),
            subtasks: [],
            recurringId: recurringTask.id,
            isCollapsed: true,
            isCompletedToday: false,
            category: null
          });
          changed = true;
        }
      });

      ws.lastRecurringCheck = today;
      if (changed) {
        saveState();
        renderTasks();
      }
    }
  }

  /* ===== REMINDERS ===== */
  function getReminders(dateString) {
    const ws = currentWS();
    if (!ws.reminders) ws.reminders = {};
    return ws.reminders[dateString] || [];
  }

  function addReminder(dateString, text) {
    const ws = currentWS();
    if (!ws.reminders) ws.reminders = {};
    if (!ws.reminders[dateString]) ws.reminders[dateString] = [];
    ws.reminders[dateString].push({
      id: uid(),
      text: text.trim()
    });
    saveState();
    renderCalendar();
  }

  function editReminder(dateString, id, newText) {
    const ws = currentWS();
    if (!ws.reminders || !ws.reminders[dateString]) return;
    const reminder = ws.reminders[dateString].find(r => r.id === id);
    if (reminder) {
      reminder.text = newText.trim();
      saveState();
    }
  }

  function deleteReminder(dateString, id) {
    const ws = currentWS();
    if (!ws.reminders || !ws.reminders[dateString]) return;
    ws.reminders[dateString] = ws.reminders[dateString].filter(r => r.id !== id);
    if (ws.reminders[dateString].length === 0) {
      delete ws.reminders[dateString];
    }
    saveState();
    renderCalendar();
  }

  function hasReminderForDate(dateString) {
    const ws = currentWS();
    return ws.reminders && ws.reminders[dateString] && ws.reminders[dateString].length > 0;
  }

  function openReminderModal(dateString) {
    const modalContent = html `
        <h3>Reminders for ${dateString}</h3>
        <div id="reminderListModal" class="list" style="max-height: 250px; overflow-y: auto; margin-bottom: 16px;">
        </div>
        <div class="column">
            <input id="newReminderText" type="text" placeholder="New reminder...">
            <button id="addReminderBtn" class="accent">Add Reminder</button>
        </div>
      `;
    openModal(modalContent);

    const listEl = $('#reminderListModal');
    renderReminderListInModal(dateString, listEl);

    $('#addReminderBtn').onclick = () => {
      const input = $('#newReminderText');
      const text = input.value.trim();
      if (text) {
        addReminder(dateString, text);
        input.value = '';
        renderReminderListInModal(dateString, listEl);
      }
    };

    $('#newReminderText').onkeydown = (e) => {
      if (e.key === 'Enter') {
        $('#addReminderBtn').click();
      }
    };
  }

  function renderReminderListInModal(dateString, listEl) {
    const reminders = getReminders(dateString);
    if (reminders.length === 0) {
      listEl.innerHTML = `<p style="color: var(--muted); text-align: center;">No reminders for this date.</p>`;
      return;
    }

    listEl.innerHTML = '';
    reminders.forEach(r => {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
            <div class="text">${escapeHtml(r.text)}</div>
            <div class="row">
                <button class="icon-btn edit-reminder-btn" title="Edit">✎</button>
                <button class="icon-btn delete-reminder-btn" title="Delete">🗑</button>
            </div>
        `;

      item.querySelector('.edit-reminder-btn').onclick = () => {
        const newText = prompt('Edit reminder:', r.text);
        if (newText !== null && newText.trim() !== '') {
          editReminder(dateString, r.id, newText);
          renderReminderListInModal(dateString, listEl);
        }
      };

      item.querySelector('.delete-reminder-btn').onclick = () => {
        deleteReminder(dateString, r.id);
        renderReminderListInModal(dateString, listEl);
      };
      listEl.appendChild(item);
    });
  }


  /* ===== SYLLABUS ===== */
  function addSubject() {
    const v = $('#subjectName').value.trim();
    if (!v) return;
    currentSyllabusPage().subjects.push({
      id: uid(),
      name: v,
      topics: []
    });
    saveState();
    $('#subjectName').value = '';
    renderSyllabus();
    populateAnalyticsSubjectSelect();
  }
  $('#addSubject').addEventListener('click', addSubject);
  $('#subjectName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSubject();
  });

  $('#syllabusSearch').addEventListener('input', e => {
    const query = e.target.value.toLowerCase();
    filterSyllabus(query);
  });

  function addTopic(subjId, name) {
    if (!name) return;
    const s = currentSyllabusPage().subjects.find(x => x.id === subjId);
    if (!s) return;
    s.topics.push({
      id: uid(),
      name,
      completionDate: null
    });
    saveState();
    renderSyllabus();
  }

  function toggleTopic(subjId, topicId) {
    const s = currentSyllabusPage().subjects.find(x => x.id === subjId);
    if (!s) return;
    const t = s.topics.find(x => x.id === topicId);
    if (!t) return;

    const wasCompleted = !!t.completionDate;
    t.completionDate = wasCompleted ? null : getLocalTodayDate();

    let topicWasJustCompleted = !wasCompleted;

    if (topicWasJustCompleted) {
      updateStreak();
    }

    saveState();
    renderSyllabus();
    drawCharts();
    renderCalendar();

    if (topicWasJustCompleted) {
      renderStreakCounter();
      renderStreakInfo();
      checkAndUnlockBadges();
    }
  }

  function renderSyllabus() {
    const page = currentSyllabusPage();
    const wrap = $('#subjects');
    wrap.innerHTML = '';
    page.subjects.forEach(s => {
      if (typeof s.isCollapsed === 'undefined') s.isCollapsed = true;
      const doneCnt = s.topics.filter(t => t.completionDate).length;
      const total = s.topics.length;
      const pct = total > 0 ? Math.round(doneCnt / total * 100) : 0;

      const el = document.createElement('div');
      el.className = 'subj' + (s.isCollapsed ? ' collapsed' : '');
      el.dataset.id = s.id;

      el.innerHTML = `<div class="subj-header item" style="padding: 8px; background: transparent; border: none; grid-template-columns: auto 1fr auto;">
            <div class="drag-handle" draggable="true">::</div>
            <div style="display:flex;gap:12px;align-items:center; overflow:hidden;">
                <div style="width:40px;height:40px; flex-shrink: 0;">
                    <svg viewBox="0 0 36 36" style="width:100%;height:100%;transform:rotate(-90deg);">
                        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="3.8"></circle>
                        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--accent)" stroke-width="3.8" stroke-dasharray="${pct}, 100" pathLength="100" style="transition: stroke-dasharray 0.3s ease;"></circle>
                    </svg>
                </div>
                 <div class="subj-title" style="font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(s.name)}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
                <div class="badge">${pct}%</div>
                <button class="icon-btn subj-add" title="Add Topic">＋</button>
                <button class="icon-btn subj-rename" title="Rename Subject">✎</button>
                <button class="icon-btn subj-del" title="Delete Subject">🗑</button>
                <button class="icon-btn toggle-topics-btn" title="Toggle Topics">${s.isCollapsed ? '▾' : '▴'}</button>
            </div>
        </div>
        <div class="topics" style="padding:8px 4px"></div>`;

      const topicsEl = el.querySelector('.topics');
      s.topics.forEach(t => {
        const row = document.createElement('div');
        row.className = 'topic item';
        row.innerHTML = `<input type="checkbox" ${t.completionDate ? 'checked' : ''} data-sid="${s.id}" data-tid="${t.id}"><div class="text">${escapeHtml(t.name)}</div><div style="display:flex;gap:6px"><button class="icon-btn">✎</button><button class="icon-btn">🗑</button></div>`;
        row.querySelector('input').onchange = (e) => {
          const subjId = e.target.dataset.sid;
          const topicId = e.target.dataset.tid;
          toggleTopic(subjId, topicId);
        };
        row.querySelectorAll('button')[0].onclick = () => {
          const nv = prompt('Edit topic', t.name);
          if (nv === null) return;
          t.name = nv.trim();
          saveState();
          renderSyllabus();
        };
        row.querySelectorAll('button')[1].onclick = () => {
          s.topics = s.topics.filter(x => x.id !== t.id);
          saveState();
          renderSyllabus();
          populateAnalyticsSubjectSelect();
        };
        topicsEl.appendChild(row);
      });

      const header = el.querySelector('.subj-header');

      header.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.classList.contains('drag-handle')) return;
        s.isCollapsed = !s.isCollapsed;
        saveState();
        renderSyllabus();
      });

      // Added stopPropagation to ensure button click doesn't conflict with header click
      el.querySelector('.toggle-topics-btn').onclick = (e) => {
        e.stopPropagation();
        s.isCollapsed = !s.isCollapsed;
        saveState();
        renderSyllabus();
      };

      el.querySelector('.drag-handle').addEventListener('dragstart', e => {
        dragSrc = el;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
      });
      el.addEventListener('dragend', e => {
        if (dragSrc) dragSrc.classList.remove('dragging');
        dragSrc = null;
        saveSyllabusOrder();
      });
      el.addEventListener('dragover', e => {
        e.preventDefault();
        const target = e.currentTarget;
        if (target === dragSrc) return;
        const rect = target.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        target.parentNode.insertBefore(dragSrc, after ? target.nextSibling : target);
      });

      el.querySelector('.subj-add').onclick = (e) => {
        e.stopPropagation();
        const name = prompt('Topic name');
        if (name) addTopic(s.id, name);
      };
      el.querySelector('.subj-rename').onclick = (e) => {
        e.stopPropagation();
        const nv = prompt('Rename subject', s.name);
        if (nv === null) return;
        s.name = nv.trim();
        saveState();
        renderSyllabus();
        populateAnalyticsSubjectSelect();
      };
      el.querySelector('.subj-del').onclick = (e) => {
        e.stopPropagation();
        page.subjects = page.subjects.filter(x => x.id !== s.id);
        saveState();
        renderSyllabus();
        populateAnalyticsSubjectSelect();
      };
      wrap.appendChild(el);
    });
    // Removed old in-line filter call
  }

  function saveSyllabusOrder() {
    const wrap = $('#subjects');
    const ids = Array.from(wrap.children).map(c => c.dataset.id);
    const page = currentSyllabusPage();
    page.subjects = ids.map(id => page.subjects.find(s => s.id === id)).filter(Boolean);
    saveState();
  }

  function renderSyllabusNav() {
    const ws = currentWS();
    const pageTitleInput = $('#syllabusPageTitle');
    pageTitleInput.value = currentSyllabusPage().title;
    pageTitleInput.title = currentSyllabusPage().title;
    $('#syllabusNavPrev').disabled = ws.syllabusCurrentPage === 0;
    $('#syllabusNavNext').disabled = ws.syllabusCurrentPage >= ws.syllabusPages.length - 1;
  }

  function navigateSyllabus(dir) {
    const ws = currentWS();
    const newIndex = ws.syllabusCurrentPage + dir;
    if (newIndex >= 0 && newIndex < ws.syllabusPages.length) {
      ws.syllabusCurrentPage = newIndex;
      saveState();
      renderSyllabusNav();
      renderSyllabus();
      populateAnalyticsSubjectSelect();
      drawCharts();
    }
  }
  $('#syllabusNavPrev').addEventListener('click', () => navigateSyllabus(-1));
  $('#syllabusNavNext').addEventListener('click', () => navigateSyllabus(1));
  $('#syllabusPageTitle').addEventListener('change', e => {
    currentSyllabusPage().title = e.target.value.trim();
    saveState();
    renderSyllabusNav();
  });

  $('#manageSyllabusPages').addEventListener('click', () => {
    const ws = currentWS();
    openModal(html `<h3>Manage Syllabus Pages</h3><div id="pagesWrap" class="list" style="max-height: 50vh; overflow-y: auto;"></div><div class="row" style="margin-top:10px"><button id="addPage" class="accent">Add New Page</button></div>`);
    const pagesWrap = $('#pagesWrap');

    function paint() {
      pagesWrap.innerHTML = '';
      ws.syllabusPages.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'item';
        row.innerHTML = `<span class="badge">#${i + 1}</span><div class="text">${escapeHtml(p.title)}</div><button class="icon-btn" ${i === 0 ? 'disabled' : ''}>🗑</button>`;
        row.querySelector('button').onclick = () => {
          ws.syllabusPages.splice(i, 1);
          if (ws.syllabusCurrentPage >= i) ws.syllabusCurrentPage = Math.max(0, ws.syllabusCurrentPage - 1);
          saveState();
          navigateSyllabus(0);
          paint();
        };
        pagesWrap.appendChild(row);
      });
    }
    paint();
    $('#addPage').onclick = () => {
      const name = prompt('New page name', `Page ${ws.syllabusPages.length + 1}`);
      if (!name) return;
      ws.syllabusPages.push({
        id: uid(),
        title: name,
        subjects: []
      });
      saveState();
      paint();
      renderSyllabusNav();
    };
  });

  /* ===== FLASHCARDS (UPDATED V7.1: Immediate Add + Bigger Cards) ===== */
  function createFlashcard() {
      // Step 1: Just ask for Category
      const category = prompt("Deck Category (e.g. 'Math', 'History'):", "General");
      if(!category) return;
      
      const ws = currentWS();
      
      // Find or Create Deck
      let deck = ws.flashcards.find(d => d.title.toLowerCase() === category.toLowerCase());
      if(!deck) {
          deck = { id: uid(), title: category, cards: [] };
          ws.flashcards.push(deck);
      }
      
      // Step 2: Immediate Creation with Placeholder text
      deck.cards.push({ 
          id: uid(), 
          front: "Double-click to Edit Question", 
          back: "Double-click to Edit Answer" 
      });
      
      saveState();
      renderFlashcards();
  }
  
  const addFlashBtn = $('#createFlashcardDeckBtn');
  if(addFlashBtn) {
      addFlashBtn.textContent = '+ Add Flashcard';
      addFlashBtn.onclick = createFlashcard;
  }

  function renderFlashcards() {
      const ws = currentWS();
      const container = $('#flashcardsContainer');
      container.innerHTML = '';
      
      const query = $('#flashcardSearch').value.trim().toLowerCase();

      ws.flashcards.forEach(deck => {
          deck.cards.forEach((card, idx) => {
              if(query && !card.front.toLowerCase().includes(query) && !card.back.toLowerCase().includes(query) && !deck.title.toLowerCase().includes(query)) return;

              const el = document.createElement('div');
              el.className = 'flip-card';
              
              // Inline styles for bigger cards as requested
              el.style.width = '300px';
              el.style.height = '200px';

              el.innerHTML = `
                  <div class="flip-card-inner">
                      <div class="flip-card-front" style="padding:16px; padding-top: 30px; text-align:center; overflow-y:auto; display:flex; flex-direction:column; justify-content:flex-start;">
                          <div style="font-size:11px; color:var(--accent); margin-bottom:8px; font-weight:bold; position:sticky; top:0; background:var(--panel);">(${escapeHtml(deck.title)})</div>
                          <div style="font-size:15px; font-weight:600;">${escapeHtml(card.front)}</div>
                          <div style="font-size:10px; color:var(--muted); margin-top:12px;">(Click to Flip, Double-click to Edit)</div>
                      </div>
                      <div class="flip-card-back" style="padding:16px; padding-top: 30px; text-align:center; background:var(--panel); overflow-y:auto; display:flex; flex-direction:column; justify-content:flex-start;">
                           <div style="font-size:14px;">${escapeHtml(card.back)}</div>
                      </div>
                  </div>
              `;
              
              el.onclick = () => el.classList.toggle('flipped');
              el.ondblclick = (e) => {
                  e.stopPropagation();
                  editFlashcard(deck.id, idx);
              }
              
              container.appendChild(el);
          });
      });
  }
  $('#flashcardSearch').addEventListener('input', debounce(renderFlashcards, 200));

  function editFlashcard(deckId, cardIndex) {
      const ws = currentWS();
      const deck = ws.flashcards.find(d => d.id === deckId);
      if(!deck || !deck.cards[cardIndex]) return;
      const card = deck.cards[cardIndex];

      const modalContent = html`
          <h3>Edit Flashcard</h3>
          <div class="column">
              <label>Question (Front)</label>
              <textarea id="editFront" rows="5" style="resize:vertical;">${escapeHtml(card.front)}</textarea>
              <label>Answer (Back)</label>
              <textarea id="editBack" rows="5" style="resize:vertical;">${escapeHtml(card.back)}</textarea>
              <div class="row" style="margin-top:12px; justify-content: flex-end;">
                  <button id="delCard" class="ghost" style="color:var(--danger); border-color:var(--danger);">Delete</button>
                  <button id="saveCard" class="accent">Save</button>
              </div>
          </div>
      `;
      openModal(modalContent);

      $('#delCard').onclick = () => {
          // No confirmation as requested
          deck.cards.splice(cardIndex, 1);
          if(deck.cards.length === 0) {
              ws.flashcards = ws.flashcards.filter(d => d.id !== deckId);
          }
          saveState();
          renderFlashcards();
          closeModal();
      };

      $('#saveCard').onclick = () => {
          card.front = $('#editFront').value.trim();
          card.back = $('#editBack').value.trim();
          saveState();
          renderFlashcards();
          closeModal();
      };
  }


  /* ===== JOURNAL ===== */
  function renderJournal() {
      const ws = currentWS();
      const list = $('#journalEntriesList');
      list.innerHTML = '';

      // Sort by date descending
      const sorted = [...ws.journal].sort((a,b) => new Date(b.date) - new Date(a.date));

      sorted.forEach(entry => {
          const el = document.createElement('div');
          el.className = 'journal-entry';
          // Format date nicely
          const dateStr = new Date(entry.date).toDateString();
          
          el.innerHTML = `
              <div class="journal-header">
                  <strong>${dateStr}</strong>
                  <div class="row">
                      <button class="icon-btn edit-journal">✎</button>
                      <button class="icon-btn delete-journal">🗑</button>
                      <span>▼</span>
                  </div>
              </div>
              <div class="journal-content">${escapeHtml(entry.text)}</div>
          `;

          el.querySelector('.journal-header').onclick = (e) => {
              if(e.target.tagName === 'BUTTON') return;
              el.classList.toggle('expanded');
          };

          el.querySelector('.delete-journal').onclick = () => {
              if(confirm('Delete this entry?')) {
                  ws.journal = ws.journal.filter(j => j.id !== entry.id);
                  saveState();
                  renderJournal();
              }
          };

          el.querySelector('.edit-journal').onclick = () => {
              $('#journalDate').value = entry.date;
              $('#journalText').value = entry.text;
              ws.journal = ws.journal.filter(j => j.id !== entry.id); // Remove old to be re-added on save
              // Scroll to top
              document.querySelector('#journalCard .card-body').scrollTop = 0;
          };

          list.appendChild(el);
      });
  }

  $('#saveJournalEntry').onclick = () => {
      const date = $('#journalDate').value;
      const text = $('#journalText').value.trim();
      if(!date || !text) {
          alert("Please select a date and write something.");
          return;
      }
      
      const ws = currentWS();
      // Remove existing entry for same date if any (overwrite logic, or append?) 
      // Let's allow multiple entries per day but usually one log per day is better.
      // We will just push a new one.
      ws.journal.push({
          id: uid(),
          date: date,
          text: text
      });
      saveState();
      $('#journalText').value = '';
      renderJournal();
  };

  // Set default journal date to today
  $('#journalDate').value = new Date().toISOString().slice(0, 10);


  /* ===== ANALYTICS ===== */
  let barChartHoverData = {
    rects: [],
    canvas: null
  };
  const chartTooltip = $('#chartTooltip');

  function draw3dDonutChart(canvas, chartData, title) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    canvas.onmousemove = null;
    canvas.onmouseout = null;

    const w = rect.width;
    const h = rect.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.min(w, h) * 0.35;
    const innerRadius = radius * 0.6;
    const depth = 10;

    const completedColor = getComputedStyle(document.documentElement).getPropertyValue('--ok').trim();
    const remainingColor = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
    const panelColor = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();

    const remaining = chartData.total - chartData.completed;
    const percentage = chartData.total > 0 ? Math.round((chartData.completed / chartData.total) * 100) : 0;

    const slices = [{
      label: 'Completed',
      value: chartData.completed,
      color: completedColor
    }, {
      label: 'Remaining',
      value: remaining,
      color: remainingColor
    }];

    let startAngle = -Math.PI / 2;
    const hoverAreas = [];

    for (let i = depth; i > 0; i--) {
      let currentAngle = startAngle;
      slices.forEach(slice => {
        if (slice.value <= 0) return;
        const sliceAngle = (slice.value / chartData.total) * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY + i);
        ctx.arc(centerX, centerY + i, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = darkenHexColor(slice.color, 0.25);
        ctx.fill();
        currentAngle += sliceAngle;
      });
    }

    let currentAngle = startAngle;
    slices.forEach(slice => {
      if (slice.value <= 0) return;
      const sliceAngle = (slice.value / chartData.total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();

      hoverAreas.push({
        startAngle: currentAngle,
        endAngle: currentAngle + sliceAngle,
        data: slice
      });
      currentAngle += sliceAngle;
    });

    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI, false);
    ctx.fillStyle = panelColor;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    if (chartData.total === 0) {
      ctx.font = '16px system-ui';
      ctx.fillText('No Data', centerX, centerY);
    } else {
      ctx.font = 'bold 32px system-ui';
      ctx.fillText(`${percentage}%`, centerX, centerY - 10);
      ctx.font = '14px system-ui';
      ctx.fillText(title, centerX, centerY + 20);
    }

    canvas.onmousemove = (e) => {
      const mouseRect = canvas.getBoundingClientRect();
      const x = e.clientX - mouseRect.left;
      const y = e.clientY - mouseRect.top;
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dy, dx);
      if (angle < -Math.PI / 2) {
        angle += 2 * Math.PI;
      }
      let foundSlice = null;
      if (distance > innerRadius && distance < radius) {
        for (const area of hoverAreas) {
          if (angle >= area.startAngle && angle <= area.endAngle) {
            foundSlice = area.data;
            break;
          }
        }
      }
      if (foundSlice) {
        chartTooltip.style.display = 'block';
        chartTooltip.style.left = `${e.clientX + 15}px`;
        chartTooltip.style.top = `${e.clientY}px`;
        chartTooltip.innerHTML = `<strong>${foundSlice.label}</strong>: ${foundSlice.value}`;
        canvas.style.cursor = 'pointer';
      } else {
        chartTooltip.style.display = 'none';
        canvas.style.cursor = 'default';
      }
    };
    canvas.onmouseout = () => {
      chartTooltip.style.display = 'none';
      canvas.style.cursor = 'default';
    };
  }

  function setupBarChartInteractions(canvas) {
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let found = null;
      for (const bar of barChartHoverData.rects) {
        if (x >= bar.x && x <= bar.x + bar.w && y >= bar.y && y <= bar.y + bar.h) {
          found = bar;
          break;
        }
      }
      if (found) {
        chartTooltip.style.display = 'block';
        chartTooltip.style.left = `${e.clientX + 15}px`;
        chartTooltip.style.top = `${e.clientY}px`;
        chartTooltip.innerHTML = `<strong>${found.label}</strong>\nCompleted: ${found.completed}\nRemaining: ${found.total - found.completed}\nTotal: ${found.total}`;
      } else {
        chartTooltip.style.display = 'none';
      }
    };
    canvas.onmouseout = () => {
      chartTooltip.style.display = 'none';
    };
  }

  function drawStackedBarChart(canvas, labels, data) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.onmousemove = null;
    canvas.onmouseout = null;
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const PADDING = {
      top: 20,
      bottom: 40,
      left: 40,
      right: 20
    };
    const chartWidth = w - PADDING.left - PADDING.right;
    const chartHeight = h - PADDING.top - PADDING.bottom;
    const maxVal = Math.max(1, ...data.map(d => d.total));
    const barGroupWidth = chartWidth / labels.length;
    const barWidth = Math.min(barGroupWidth * 0.7, 50);
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
    const remainingColor = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
    const completedColor = getComputedStyle(document.documentElement).getPropertyValue('--ok').trim();
    const panelColor = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, PADDING.top);
    ctx.lineTo(PADDING.left, PADDING.top + chartHeight);
    ctx.lineTo(PADDING.left + chartWidth, PADDING.top + chartHeight);
    ctx.stroke();

    const newRects = [];
    labels.forEach((label, i) => {
      const item = data[i];
      const totalHeight = (item.total / maxVal) * chartHeight;
      const x = PADDING.left + (i * barGroupWidth) + (barGroupWidth - barWidth) / 2;
      const y = PADDING.top + chartHeight;
      const yStart = y - totalHeight;
      if (item.total > 0) {
        const gradient = ctx.createLinearGradient(x, yStart, x, y);
        const completionRatio = item.completed / item.total;
        const stopPosition = 1 - completionRatio;
        gradient.addColorStop(0, remainingColor);
        if (stopPosition > 0.01 && stopPosition < 0.99) {
          gradient.addColorStop(stopPosition - 0.01, remainingColor);
          gradient.addColorStop(stopPosition + 0.01, completedColor);
        } else {
          gradient.addColorStop(stopPosition, remainingColor);
          gradient.addColorStop(stopPosition, completedColor);
        }
        gradient.addColorStop(1, completedColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, yStart, barWidth, totalHeight);
      } else {
        ctx.fillStyle = panelColor;
        ctx.fillRect(x, y - 2, barWidth, 2);
      }
      newRects.push({
        x: x,
        y: yStart,
        w: barWidth,
        h: totalHeight,
        label,
        ...item
      });
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x + barWidth / 2, y + 10);
      ctx.rotate(labels.length > 10 ? Math.PI / 4 : 0);
      ctx.fillText(label.length > 10 ? label.slice(0, 8) + '...' : label, 0, 0);
      ctx.restore();
    });
    barChartHoverData = {
      rects: newRects,
      canvas
    };
  }

  function drawCharts() {
    const canvas = $('#mainChart');
    if (!canvas) return;
    const activeTab = $('#analyticsCard .tabs .tab.active')?.dataset.tab;
    const subjectSelect = $('#analyticsSubjectSelect');
    if (!activeTab || !subjectSelect) return;

    subjectSelect.style.display = 'none';
    canvas.style.cursor = 'default';
    if (activeTab === 'syllabus') {
      subjectSelect.style.display = 'block';
      const subjectId = subjectSelect.value;
      const subject = currentSyllabusPage().subjects.find(s => s.id === subjectId);
      let chartData = {
        completed: 0,
        total: 0
      };
      let title = "No Subject Selected";
      if (subject) {
        title = subject.name;
        chartData.total = subject.topics.length;
        chartData.completed = subject.topics.filter(t => t.completionDate).length;
      }
      draw3dDonutChart(canvas, chartData, title);
    } else if (activeTab === 'todo') {
      let completed = currentWS().done.length;
      let total = completed + currentWS().tasks.length;
      draw3dDonutChart(canvas, {
        completed,
        total
      }, "To-Do Progress");
    } else if (activeTab === 'timetable') {
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const data = labels.map((day, dayIndex) => {
        let total = 0,
          completed = 0;
        Object.keys(currentWS().timetable.cells).forEach(key => {
          if (key.endsWith(`:${dayIndex}`)) {
            total++;
            if (currentWS().timetable.cells[key].completed) {
              completed++;
            }
          }
        });
        return {
          total,
          completed
        };
      });
      drawStackedBarChart(canvas, labels, data);
      setupBarChartInteractions(canvas);
    }
  }

  function populateAnalyticsSubjectSelect() {
    const sel = $('#analyticsSubjectSelect');
    sel.innerHTML = '';
    if (currentSyllabusPage().subjects.length === 0) {
      sel.innerHTML = '<option>No subjects yet</option>';
    }
    currentSyllabusPage().subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
  }
  $('#analyticsSubjectSelect').addEventListener('change', drawCharts);
  $$('#analyticsCard .tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('#analyticsCard .tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      drawCharts();
    });
  });

  /* ===== TIMETABLE ===== */
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const timetableTooltip = $('#timetableTooltip');
  let timetableTooltipTimeout = null;
  let timetableTooltipHideTimeout = null;

  function handleTimetableInput(textarea, saveCallback) {
    let lastEnterPress = 0;
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        const now = Date.now();
        if (now - lastEnterPress < 300) {
          event.preventDefault();
          const value = textarea.value;
          const cursorPos = textarea.selectionStart;
          if (cursorPos > 0 && value[cursorPos - 1] === '\n') {
            textarea.value = value.substring(0, cursorPos - 1) + value.substring(cursorPos);
            textarea.selectionStart = textarea.selectionEnd = cursorPos - 1;
          }
          saveCallback();
          lastEnterPress = 0;
        } else {
          lastEnterPress = now;
        }
      } else {
        lastEnterPress = 0;
      }
    });
  }

  function checkAndResetTimetable() {
    const ws = currentWS();
    const today = new Date();
    const currentWeekStart = getWeekStartDate(today);
    if (ws.timetable.weekStartDate !== currentWeekStart) {
      Object.values(ws.timetable.cells).forEach(cell => {
        cell.completed = false;
      });
      ws.timetable.weekStartDate = currentWeekStart;
      saveState();
    }
  }

  function renderTimetable() {
    const ws = currentWS();
    const tbl = $('#timetable');
    tbl.innerHTML = '';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    hr.innerHTML = '<th></th>' + DAYS.map(d => `<th>${d}</th>`).join('');
    thead.appendChild(hr);
    tbl.appendChild(thead);
    const tb = document.createElement('tbody');
    ws.timetable.rows.forEach((r, ri) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<th>${escapeHtml(r)}</th>` + DAYS.map((d, di) => {
        const key = `${ri}:${di}`;
        const cell = ws.timetable.cells[key];
        const text = cell?.text || '';
        const color = cell?.color || '';
        const isCompleted = cell?.completed || false;
        return `<td data-key="${key}"><div class="cell" style="position:relative"><input type="checkbox" title="Mark as done" ${isCompleted ? 'checked' : ''} style="margin-right: 4px;" ${!text ? 'disabled' : ''}><span class="activity-pill" style="${color ? `background:${color};color:#fff;` : 'background:rgba(255,255,255,.03)'}">${escapeHtml(text)}</span></div></td>`;
      }).join('');
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);

    tbl.querySelectorAll('td[data-key]').forEach(td => {
      if (ws.timetable.cells[td.dataset.key]?.text) {
        td.addEventListener('mouseenter', (e) => {
          clearTimeout(timetableTooltipTimeout);
          clearTimeout(timetableTooltipHideTimeout);
          const key = e.currentTarget.dataset.key;
          const fullText = ws.timetable.cells[key]?.text || '';
          timetableTooltipTimeout = setTimeout(() => {
            timetableTooltip.innerHTML = `<div class="tooltip-content">${escapeHtml(fullText)}</div>`;
            timetableTooltip.style.display = 'block';
            const mx = window.innerWidth - 12 - timetableTooltip.offsetWidth;
            const my = window.innerHeight - 12 - timetableTooltip.offsetHeight;
            timetableTooltip.style.left = Math.min(e.clientX + 15, mx) + 'px';
            timetableTooltip.style.top = Math.min(e.clientY, my) + 'px';
          }, 200);
        });

        td.addEventListener('mouseleave', () => {
          clearTimeout(timetableTooltipTimeout);
          timetableTooltipHideTimeout = setTimeout(() => {
            timetableTooltip.style.display = 'none';
          }, 200);
        });
      }

      td.querySelector('input[type="checkbox"]').onchange = (e) => {
        const key = e.target.closest('td').dataset.key;
        const isChecked = e.target.checked;
        if (ws.timetable.cells[key]) {
          ws.timetable.cells[key].completed = isChecked;

          if (isChecked) {
            updateStreak();
          }

          saveState();

          if ($('#analyticsCard .tabs .tab[data-tab="timetable"]').classList.contains('active')) {
            drawCharts();
          }

          if (isChecked) {
            renderStreakCounter();
            renderStreakInfo();
            checkAndUnlockBadges();
          }
        }
      };

      td.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const key = td.dataset.key;
        showContextMenu(e.clientX, e.clientY, [{
          label: 'Edit',
          action: () => {
            const cell = ws.timetable.cells[key] || {};
            const lastColor = ws.timetable.lastUsedColor;
            openModal(html `
                      <h3>Edit activity</h3>
                      <div class="column">
                          <textarea id="modalText" rows="1" placeholder="Activity..." style="width: 100%; overflow-y: hidden; white-space: pre; overflow-x: auto; resize: vertical; margin-bottom: 8px;">${escapeHtml(cell.text || '')}</textarea>
                          <div class="row">
                              <input id="modalColor" type="color" value="${cell.color || lastColor}" style="width:44px;height:36px;padding:2px; flex-shrink: 0;">
                              <button id="saveModal" class="accent" style="flex-grow: 1;">Save</button>
                              <button id="delModal" class="ghost">Delete</button>
                          </div>
                          <small style="color:var(--muted); margin-top: 4px;">Press Enter for a new line, double-press Enter to save.</small>
                      </div>`);

            const modalInput = $('#modalText');
            modalInput.addEventListener('input', () => autoResizeTextarea(modalInput));
            setTimeout(() => {
              autoResizeTextarea(modalInput);
              modalInput.focus();
              modalInput.selectionStart = modalInput.selectionEnd = modalInput.value.length;
            }, 0);

            const saveFn = () => $('#saveModal').click();
            handleTimetableInput(modalInput, saveFn);

            $('#saveModal').onclick = () => {
              const txt = $('#modalText').value;
              const col = $('#modalColor').value;
              if (txt) {
                ws.timetable.cells[key] = {
                  text: txt,
                  color: col,
                  completed: cell.completed || false
                };
                ws.timetable.lastUsedColor = col;
              } else {
                delete ws.timetable.cells[key];
              }
              saveState();
              renderTimetable();
              closeModal();
            };
            $('#delModal').onclick = () => {
              delete ws.timetable.cells[key];
              saveState();
              renderTimetable();
              closeModal();
            };
          }
        }, {
          label: 'Delete',
          action: () => {
            delete ws.timetable.cells[key];
            saveState();
            renderTimetable();
          }
        }]);
      });
    });
  }

  function formatTimeInput(e) {
    let input = e.target;
    let value = input.value;
    if (/^\d{1,2}$/.test(value)) {
      if (value.length === 2 && parseInt(value) <= 23) {
        input.value = value + ':';
      }
    }
    if (/^\d{1,2}:\d{2}$/.test(value)) {
      input.value = value + ' - ';
    }
    if (/^\d{1,2}:\d{2} - \d{1,2}$/.test(value)) {
      const parts = value.split(' - ');
      if (parts[1].length === 2 && parseInt(parts[1]) <= 23) {
        input.value = value + ':';
      }
    }
  }

  $('#manageRows').onclick = () => {
    const ws = currentWS();
    openModal(html `<h3>Manage Rows</h3><div id="rowsWrap" style="max-height: 50vh; overflow-y: auto;"></div><div class="row" style="margin-top:10px"><input type="text" id="newRow" placeholder="e.g., 09:00 - 10:30"><button id="addRow" class="accent">Add Row</button></div>`);
    const newRowInput = $('#newRow');
    newRowInput.addEventListener('input', formatTimeInput);

    const rowsWrap = $('#rowsWrap');

    function paint() {
      rowsWrap.innerHTML = '';
      ws.timetable.rows.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'item';
        row.innerHTML = `<span class="badge">#${i + 1}</span><div class="text">${escapeHtml(r)}</div><button class="icon-btn">✎</button><button class="icon-btn">🗑</button>`;
        row.querySelectorAll('button')[0].onclick = () => {
          const nv = prompt('Rename', r);
          if (nv === null) return;
          ws.timetable.rows[i] = nv.trim();
          saveState();
          paint();
        };
        row.querySelectorAll('button')[1].onclick = () => {
          ws.timetable.rows.splice(i, 1);
          Object.keys(ws.timetable.cells).forEach(k => {
            if (k.startsWith(i + ':')) delete ws.timetable.cells[k];
          });
          saveState();
          paint();
        };
        rowsWrap.appendChild(row);
      });
    }
    paint();
    $('#addRow').onclick = () => {
      const v = newRowInput.value.trim();
      if (!v) return;
      ws.timetable.rows.push(v);
      newRowInput.value = '';
      saveState();
      paint();
    };
  };

  $('#resetTimetable').onclick = () => {
    if (confirm('Are you sure you want to delete all activities for this week?')) {
      currentWS().timetable.cells = {};
      saveState();
      renderTimetable();
    }
  };

  $('#uncheckTimetable').onclick = () => {
    const ws = currentWS();
    Object.keys(ws.timetable.cells).forEach(key => {
      if (ws.timetable.cells[key]) {
        ws.timetable.cells[key].completed = false;
      }
    });
    saveState();
    renderTimetable();

    if ($('#analyticsCard .tabs .tab[data-tab="timetable"]').classList.contains('active')) {
      drawCharts();
    }
  };

  $('#addBlock').onclick = () => {
    const ws = currentWS();
    const lastColor = ws.timetable.lastUsedColor;
    openModal(html `
            <h3>Add Activity</h3>
            <div class="column">
                <div class="row">
                    <label>Row <select id="rowIdx" style="flex-grow:1;">${ws.timetable.rows.map((r, i) => `<option value="${i}">${escapeHtml(r)}</option>`).join('')}</select></label>
                    <label>Day <select id="dayIdx" style="flex-grow:1;">${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></label>
                </div>
                <textarea id="blockText" placeholder="Activity name..." rows="1" style="width: 100%; overflow-y: hidden; white-space: pre; overflow-x: auto; resize: vertical;"></textarea>
                <div class="row">
                    <input id="blockColor" type="color" value="${lastColor}" style="width:44px;height:36px;padding:2px; flex-shrink:0;">
                    <button id="saveBlock" class="accent" style="flex-grow: 1;">Save</button>
                    <button id="delBlock" class="ghost">Delete</button>
                </div>
                <small style="color:var(--muted); margin-top: 4px;">Press Enter for a new line, double-press Enter to save.</small>
            </div>`);

    const blockTextarea = $('#blockText');
    blockTextarea.addEventListener('input', () => autoResizeTextarea(blockTextarea));
    setTimeout(() => {
      autoResizeTextarea(blockTextarea);
      blockTextarea.focus();
    }, 0);

    const saveFn = () => {
      $('#saveBlock').click();
    };
    handleTimetableInput(blockTextarea, saveFn);

    $('#saveBlock').onclick = () => {
      const k = `${$('#rowIdx').value}:${$('#dayIdx').value}`;
      const existing = currentWS().timetable.cells[k];
      const col = $('#blockColor').value;
      currentWS().timetable.cells[k] = {
        text: $('#blockText').value,
        color: col,
        completed: existing?.completed || false
      };
      currentWS().timetable.lastUsedColor = col;
      saveState();
      renderTimetable();
      closeModal();
    };
    $('#delBlock').onclick = () => {
      const k = `${$('#rowIdx').value}:${$('#dayIdx').value}`;
      delete currentWS().timetable.cells[k];
      saveState();
      renderTimetable();
      closeModal();
    };
  };

  /* ===== STICKY NOTES ===== */
  const stickyCanvas = $('#stickyNotesCanvas');
  let activeNote = null;
  let offsetX, offsetY;
  let scrollInterval = null;

  function renderStickyNotes() {
    stickyCanvas.innerHTML = '';
    currentWS().stickyNotes.forEach(note => {
      const el = document.createElement('div');
      el.className = 'sticky-note';
      el.dataset.id = note.id;
      el.style.left = `${note.x}px`;
      el.style.top = `${note.y}px`;
      el.style.background = note.color || 'var(--warn)';

      const fileHtml = (note.files || []).map(file => {
        return `<a class="file-link" href="${escapeHtml(file.url)}" target="_blank" title="${escapeHtml(file.url)}">📄 ${escapeHtml(file.name)}</a>`;
      }).join('');

      el.innerHTML = `
                <button class="delete-sticky-note" title="Delete Note">×</button>
                <textarea class="sticky-note-text" spellcheck="false">${escapeHtml(note.text)}</textarea>
                <div class="sticky-note-files">
                    ${fileHtml}
                </div>
            `;

      el.querySelector('.delete-sticky-note').onclick = (e) => {
        e.stopPropagation();
        const ws = currentWS();
        ws.stickyNotes = ws.stickyNotes.filter(n => n.id !== note.id);
        saveState();
        renderStickyNotes();
      };

      const textarea = el.querySelector('.sticky-note-text');
      textarea.addEventListener('input', debounce(() => {
        const noteToUpdate = currentWS().stickyNotes.find(n => n.id === note.id);
        if (noteToUpdate && noteToUpdate.text !== textarea.value) {
          noteToUpdate.text = textarea.value;
          saveState();
        }
      }, 500));
      textarea.addEventListener('mousedown', e => e.stopPropagation());

      el.addEventListener('mousedown', startDrag);
      el.addEventListener('dblclick', (e) => {
        if (e.target.tagName !== 'TEXTAREA' && !e.target.classList.contains('file-link')) {
          editStickyNoteFiles(note.id)
        }
      });

      stickyCanvas.appendChild(el);
    });
  }

  function startDrag(e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.classList.contains('delete-sticky-note') || e.target.classList.contains('file-link')) return;
    activeNote = e.currentTarget;
    activeNote.classList.add('dragging');

    const rect = activeNote.getBoundingClientRect();

    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
  }

  function drag(e) {
    if (!activeNote) return;
    e.preventDefault();

    const canvasContainer = stickyCanvas.parentElement;
    const canvasContainerRect = canvasContainer.getBoundingClientRect();

    let newX = e.clientX - canvasContainerRect.left + canvasContainer.scrollLeft - offsetX;
    let newY = e.clientY - canvasContainerRect.top + canvasContainer.scrollTop - offsetY;

    const noteStyle = window.getComputedStyle(activeNote);
    const noteWidth = parseFloat(noteStyle.width);
    const canvasWidth = 3000;

    newX = Math.max(10, Math.min(newX, canvasWidth - noteWidth - 10));
    newY = Math.max(10, newY);

    activeNote.style.left = `${newX}px`;
    activeNote.style.top = `${newY}px`;

    const scrollSpeed = 15;
    const edgeSize = 60;

    clearInterval(scrollInterval);
    scrollInterval = null;

    let scrollX = 0;
    let scrollY = 0;

    if (e.clientY < canvasContainerRect.top + edgeSize) scrollY = -scrollSpeed;
    else if (e.clientY > canvasContainerRect.top + canvasContainerRect.height - edgeSize) scrollY = scrollSpeed;

    if (e.clientX < canvasContainerRect.left + edgeSize) scrollX = -scrollSpeed;
    else if (e.clientX > canvasContainerRect.left + canvasContainerRect.width - edgeSize) scrollX = scrollSpeed;

    if (scrollX !== 0 || scrollY !== 0) {
      scrollInterval = setInterval(() => {
        canvasContainer.scrollBy(scrollX, scrollY);
        let currentX = parseInt(activeNote.style.left, 10);
        let currentY = parseInt(activeNote.style.top, 10);
        let nextX = currentX + scrollX;
        let nextY = currentY + scrollY;

        nextX = Math.max(10, Math.min(nextX, canvasWidth - noteWidth - 10));
        nextY = Math.max(10, nextY);

        activeNote.style.left = `${nextX}px`;
        activeNote.style.top = `${nextY}px`;
      }, 16);
    }
  }

  function endDrag() {
    if (!activeNote) return;

    clearInterval(scrollInterval);
    scrollInterval = null;

    const id = activeNote.dataset.id;
    const note = currentWS().stickyNotes.find(n => n.id === id);

    if (note) {
      note.x = parseInt(activeNote.style.left, 10);
      note.y = parseInt(activeNote.style.top, 10);
      saveState();
    }

    activeNote.classList.remove('dragging');
    activeNote = null;

    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', endDrag);
  }

  function addStickyNote() {
    const canvasContainer = stickyCanvas.parentElement;
    const newNote = {
      id: uid(),
      x: 20 + canvasContainer.scrollLeft,
      y: 20 + canvasContainer.scrollTop,
      text: 'New Note',
      files: [],
      color: defaultAccentChoices[Math.floor(Math.random() * defaultAccentChoices.length)]
    };
    currentWS().stickyNotes.push(newNote);
    saveState();
    renderStickyNotes();
  }
  $('#addStickyNoteBtn').onclick = addStickyNote;

  function editStickyNoteFiles(id) {
    const note = currentWS().stickyNotes.find(n => n.id === id);
    if (!note) return;
    if (!note.files) note.files = [];

    openModal(html `
            <h3>Manage Links</h3>
            <h4>Attached Links:</h4>
            <div id="stickyEditFiles" class="list" style="margin-bottom:10px; max-height: 200px; overflow-y:auto;"></div>
            <div class="row" style="justify-content:space-between;">
                 <button id="addWebLinkBtn" class="ghost">Add Web URL</button>
                 <button id="closeStickyModal" class="accent">Close</button>
            </div>
        `);

    const filesContainer = $('#stickyEditFiles');

    function renderLinks() {
      filesContainer.innerHTML = (note.files || []).map((file, index) => {
        return `
                <div class="item">
                    <span class="badge">🔗</span>
                    <div class="text" title="${escapeHtml(file.url)}">${escapeHtml(file.name)}</div>
                    <button class="icon-btn" data-index="${index}" title="Remove link">🗑</button>
                </div>
            `
      }).join('');

      filesContainer.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
          note.files.splice(Number(btn.dataset.index), 1);
          saveState();
          renderLinks();
          renderStickyNotes();
        };
      });
    }
    renderLinks();

    $('#addWebLinkBtn').onclick = () => {
      const name = prompt("Enter a name for the link:");
      if (!name || !name.trim()) return;
      const url = prompt("Enter the full web URL:", "https://");
      if (url && url.trim()) {
        note.files.push({
          name: name.trim(),
          url: url.trim(),
          type: 'url'
        });
        saveState();
        renderLinks();
        renderStickyNotes();
      }
    };

    $('#closeStickyModal').onclick = () => {
      closeModal();
    };
  }

  /* ===== CALENDAR (FIXED) ===== */
  const dateTooltip = $('#dateTooltip');
  let tooltipTimeout = null;
  let tooltipHideTimeout = null;

  function renderCalendar() {
    const grid = $('#calendarGrid');
    const monthYearEl = $('#calendarMonthYear');
    grid.innerHTML = '';

    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();

    monthYearEl.textContent = `${calendarCurrentDate.toLocaleString('default', { month: 'long' })} ${year}`;

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dayOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    'Mon,Tue,Wed,Thu,Fri,Sat,Sun'.split(',').forEach(day => {
      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day';
      dayEl.textContent = day;
      grid.appendChild(dayEl);
    });

    for (let i = 0; i < dayOffset; i++) {
      const emptyCell = document.createElement('div');
      grid.appendChild(emptyCell);
    }

    const today = new Date().toISOString().slice(0, 10);

    for (let day = 1; day <= daysInMonth; day++) {
      const dateCell = document.createElement('div');
      dateCell.className = 'date-cell';
      dateCell.textContent = day;
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      dateCell.dataset.date = dateString;

      if (dateString === today) {
        dateCell.classList.add('today');
      }

      if (hasReminderForDate(dateString)) dateCell.classList.add('has-reminder');
      if (hasDataForDate(dateString)) dateCell.classList.add('has-data');

      dateCell.addEventListener('mouseenter', (e) => {
        clearTimeout(tooltipTimeout);
        clearTimeout(tooltipHideTimeout);
        tooltipTimeout = setTimeout(() => {
          showDateTooltip(dateString, e.clientX, e.clientY);
        }, 150);
      });
      dateCell.addEventListener('mouseleave', () => {
        clearTimeout(tooltipTimeout);
        tooltipHideTimeout = setTimeout(() => {
          dateTooltip.style.display = 'none';
        }, 200);
      });

      dateCell.addEventListener('dblclick', () => {
        openReminderModal(dateString);
      });

      grid.appendChild(dateCell);
    }
  }

  function hasDataForDate(dateString) {
    const ws = currentWS();
    
    // Check Completed Tasks
    const doneTasks = ws.done.some(t => new Date(t.when).toLocaleDateString('en-CA') === dateString);
    if (doneTasks) return true;

    // Check Syllabus
    const completedTopics = ws.syllabusPages.some(page =>
      page.subjects.some(s =>
        s.topics.some(t => t.completionDate === dateString)
      )
    );
    if (completedTopics) return true;
    
    // Check Journal (New for v7)
    const journalEntries = ws.journal.some(j => j.date === dateString);
    if(journalEntries) return true;

    return false;
  }

  function showDateTooltip(dateString, x, y) {
    const ws = currentWS();
    let content = `<div class="tooltip-content"><strong>${dateString}</strong>`;
    let foundData = false;

    const reminders = getReminders(dateString);
    if (reminders.length > 0) {
      foundData = true;
      content += '<h4>Reminders</h4>';
      reminders.forEach(r => content += `<p style="color: var(--warn); margin-left: 8px;">★ ${escapeHtml(r.text)}</p>`);
    }

    const doneTasks = ws.done.filter(t => new Date(t.when).toLocaleDateString('en-CA') === dateString);
    if (doneTasks.length > 0) {
      foundData = true;
      content += '<h4>To-Do Completed</h4>';
      doneTasks.forEach(t => content += `<p>- ${escapeHtml(t.text)}</p>`);
    }

    let completedTopics = [];
    ws.syllabusPages.forEach(page =>
      page.subjects.forEach(s =>
        s.topics.forEach(t => {
          if (t.completionDate === dateString) {
            completedTopics.push(`[${s.name}] ${t.name}`);
          }
        })
      )
    );
    if (completedTopics.length > 0) {
      foundData = true;
      content += '<h4>Syllabus Topics</h4>';
      completedTopics.forEach(t => content += `<p>- ${escapeHtml(t)}</p>`);
    }

    const journalEntries = ws.journal.filter(j => j.date === dateString);
    if (journalEntries.length > 0) {
        foundData = true;
        content += '<h4>Journal</h4>';
        journalEntries.forEach(j => content += `<p style="font-style:italic;">"${escapeHtml(j.text.substring(0,30))}${j.text.length>30?'...':''}"</p>`);
    }

    if (!foundData) {
      content += '<p style="color: var(--muted); margin-top: 8px;">No activity recorded.</p>';
    }

    content += '</div>';
    dateTooltip.innerHTML = content;
    dateTooltip.style.display = 'block';
    const mx = window.innerWidth - 12 - dateTooltip.offsetWidth;
    const my = window.innerHeight - 12 - dateTooltip.offsetHeight;
    dateTooltip.style.left = Math.min(x + 15, mx) + 'px';
    dateTooltip.style.top = Math.min(y, my) + 'px';
  }

  function navigateCalendar(dir) {
    const grid = $('#calendarGrid');
    grid.classList.remove('flip-next', 'flip-prev');
    void grid.offsetWidth;

    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + dir);

    if (dir > 0) {
      grid.classList.add('flip-next');
    } else {
      grid.classList.add('flip-prev');
    }

    setTimeout(() => {
      renderCalendar();
      grid.classList.remove('flip-next', 'flip-prev');
    }, 300);
  }
  $('#calendarPrev').onclick = () => navigateCalendar(-1);
  $('#calendarNext').onclick = () => navigateCalendar(1);


  /* ===== UTILS & INIT ===== */
  function html(strings, ...vals) {
    return strings.map((s, i) => s + (vals[i] ?? '')).join('');
  }

  function openModal(content) {
    $('#modalCard').innerHTML = content;
    $('#modal').style.display = 'flex';
  }

  function closeModal() {
    $('#modal').style.display = 'none';
    $('#modalCard').innerHTML = '';
  }
  $('#modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
  });

  $('#openResetSettings').onclick = openResetModal;

  function openResetModal() {
    openModal(html `
            <h3>Reset or Clear Data</h3>
            <p style="color:var(--muted); font-size: 12px;">Be careful, these actions cannot be undone.</p>
            <div class="column" style="gap: 12px; margin-top: 16px;">
              <button id="resetCurrent" class="ghost" style="border-color: var(--warn); color: var(--warn);">Reset <strong>${escapeHtml(currentWS().name)}</strong> Workspace</button>
              <button id="resetAll" class="ghost" style="border-color: var(--danger); color: var(--danger);">Factory Reset (Delete All Data)</button>
            </div>
          `);

    $('#resetCurrent').onclick = () => {
      confirmAndReset('current');
    };

    $('#resetAll').onclick = () => {
      confirmAndReset('all');
    };
  }

  function confirmAndReset(type) {
    const messages = {
      current: `Are you sure you want to reset the "${escapeHtml(currentWS().name)}" workspace?\nAll its data (tasks, syllabus, etc.) will be lost.`,
      all: 'WARNING: This will delete ALL data in every workspace and reset the entire app. This action cannot be undone. Are you sure?'
    };

    openModal(html `
            <h3>Confirmation</h3>
            <p style="white-space: pre-wrap;">${messages[type]}</p>
            <div class="row" style="justify-content: flex-end;">
                <button id="confirmCancel" class="ghost">Cancel</button>
                <button id="confirmYes" class="accent" style="background: var(--danger);">Yes, Reset</button>
            </div>
        `);

    $('#confirmCancel').onclick = () => openResetModal();
    $('#confirmYes').onclick = () => {
      resetLogic(type);
      closeModal();
    };
  }

  function resetLogic(type) {
    if (type === 'all') {
      localStorage.removeItem(STATE_KEY);
      state = loadState();
      renderAll();
      return;
    }
    if (type === 'current') {
      state.workspaces[state.current] = { ...DEFAULT().workspaces[0],
        name: currentWS().name
      };
    }
    saveState();
    renderAll();
  }

  function exportData() {
    try {
      const dataStr = JSON.stringify(state, null, 2);
      const dataBlob = new Blob([dataStr], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(dataBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `focus-deck_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
      alert('Could not export data.');
    }
  }
  $('#exportData').onclick = exportData;

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = readEvent => {
        try {
          const newState = JSON.parse(readEvent.target.result);
          if (newState && newState.version && newState.workspaces) {
            if (confirm('Import successful. Replace current data?')) {
              state = newState;
              if (!state.version || state.version < DEFAULT().version) {
                state = migrate(state);
              }
              saveState();
              renderAll();
            }
          } else {
            alert('Invalid file format.');
          }
        } catch (err) {
          console.error('Import failed:', err);
          alert('Could not import file. Is it a valid JSON backup?');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
  $('#importData').onclick = importData;

  function filterTodo(query) {
    const todoItems = $$('#todoList .task-item');
    todoItems.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(query)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }

  function filterSyllabus(query) {
    const subjectItems = $$('#subjects .subj');
    subjectItems.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(query)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }

  /* ===== GLOBAL SEARCH SYSTEM ===== */
  let searchMatches = [];
  let searchSelectIndex = -1;

  function getAllSearchableItems() {
      const ws = currentWS();
      const items = [];

      // 1. To-Do Items
      ws.tasks.forEach(t => {
          items.push({ id: t.id, text: t.text, type: 'todo', context: 'To-Do', tabId: 'todoCard' });
          (t.subtasks || []).forEach(st => {
              items.push({ id: st.id, text: st.text, type: 'subtask', context: 'To-Do (Subtask)', parentId: t.id, tabId: 'todoCard' });
          });
      });
      ws.done.forEach(t => {
          items.push({ id: t.id, text: t.text, type: 'done', context: 'To-Do (Done)', tabId: 'todoCard' });
      });

      // 2. Syllabus
      ws.syllabusPages.forEach((page, pageIdx) => {
          page.subjects.forEach(s => {
              items.push({ id: s.id, text: s.name, type: 'subject', context: 'Syllabus', tabId: 'syllabusCard', pageIdx });
              s.topics.forEach(t => {
                  items.push({ id: t.id, text: t.name, type: 'topic', context: 'Syllabus (Topic)', parentId: s.id, tabId: 'syllabusCard', pageIdx });
              });
          });
      });

      // 3. Sticky Notes
      ws.stickyNotes.forEach(n => {
          items.push({ id: n.id, text: n.text, type: 'sticky', context: 'Sticky Note', tabId: 'stickyNotesCard' });
      });

      // 4. Flashcards
      ws.flashcards.forEach(deck => {
          deck.cards.forEach(c => {
              items.push({ id: c.id, text: c.front, type: 'flashcard', context: 'Flashcard (Front)', tabId: 'flashcardsCard', deckId: deck.id });
              items.push({ id: c.id, text: c.back, type: 'flashcard', context: 'Flashcard (Back)', tabId: 'flashcardsCard', deckId: deck.id });
          });
      });

      // 5. Journal
      ws.journal.forEach(j => {
          items.push({ id: j.id, text: j.text, type: 'journal', context: 'Journal', tabId: 'journalCard', date: j.date });
      });

      // 6. Timetable
      Object.entries(ws.timetable.cells).forEach(([key, cell]) => {
          items.push({ id: key, text: cell.text, type: 'timetable', context: 'Timetable', tabId: 'timetableCard' });
      });

      return items;
  }

  function renderSearchSuggestions(matches) {
      const container = $('#searchSuggestions');
      if (matches.length === 0) {
          container.classList.remove('visible');
          return;
      }
      
      container.innerHTML = matches.map((m, i) => `
          <div class="suggestion-item ${i === searchSelectIndex ? 'selected' : ''}" data-index="${i}">
              <div class="suggestion-text">${escapeHtml(m.text)}</div>
              <div class="suggestion-context">${escapeHtml(m.context)}</div>
          </div>
      `).join('');
      
      container.classList.add('visible');

      // Click handling
      container.querySelectorAll('.suggestion-item').forEach(el => {
          el.onclick = () => {
              navigateToResult(matches[el.dataset.index]);
              container.classList.remove('visible');
              $('#globalSearch').value = '';
          };
      });
  }

  function navigateToResult(item) {
      if (!item) return;

      // 1. Switch Tab
      const tabBtn = $(`.right-nav-tabs .tab[data-target="${item.tabId}"]`);
      if (tabBtn) tabBtn.click();

      // 2. Specific Handling based on type
      setTimeout(() => {
          let el = null;
          const ws = currentWS();

          if (item.type === 'todo' || item.type === 'subtask') {
              // Ensure we are on To-Do tab, not Done
              if (item.type === 'todo' || item.type === 'subtask') {
                  $$('#todoCard .tab[data-tab="todo"]').forEach(b => b.click());
              }
              // Force Render
              renderTasks();
              
              // If subtask, ensure parent is expanded
              if (item.type === 'subtask') {
                  const parentTask = ws.tasks.find(t => t.id === item.parentId);
                  if (parentTask) {
                      parentTask.isCollapsed = false;
                      saveState();
                      renderTasks(); // Re-render to show expanded
                  }
              }
              
              // Find Element (Subtask logic tricky as IDs are on checkbox, not container)
              if (item.type === 'subtask') {
                   // Find the wrapper of the checkbox with data-subtask-id
                   const checkbox = $(`input[data-subtask-id="${item.id}"]`);
                   if(checkbox) el = checkbox.closest('.item');
              } else {
                   el = $(`.task-item[data-id="${item.id}"]`);
              }
          } 
          else if (item.type === 'done') {
               $$('#todoCard .tab[data-tab="done"]').forEach(b => b.click());
               renderTasks(); // Updates Done list visibility
               // Done items don't have data-id on wrapper in current renderTasks, need to search text
               const doneItems = $$('#doneList .item');
               el = doneItems.find(div => div.textContent.includes(item.text));
          }
          else if (item.type === 'subject' || item.type === 'topic') {
              // Switch Syllabus Page if needed
              if (ws.syllabusCurrentPage !== item.pageIdx) {
                  ws.syllabusCurrentPage = item.pageIdx;
                  saveState();
                  renderSyllabusNav();
                  renderSyllabus();
              }
              
              if (item.type === 'topic') {
                  const subject = ws.syllabusPages[ws.syllabusCurrentPage].subjects.find(s => s.id === item.parentId);
                  if (subject) {
                      subject.isCollapsed = false;
                      saveState();
                      renderSyllabus();
                  }
                  // Find checkbox
                  const checkbox = $(`input[data-tid="${item.id}"]`);
                  if(checkbox) el = checkbox.closest('.topic');
              } else {
                  el = $(`.subj[data-id="${item.id}"]`);
              }
          }
          else if (item.type === 'sticky') {
              // Sticky notes are absolute positioned. 
              // We need to scroll the container to the note.
              const note = ws.stickyNotes.find(n => n.id === item.id);
              if (note) {
                  const container = $('#stickyNotesCanvas').parentElement;
                  container.scrollTo({
                      left: note.x - 100,
                      top: note.y - 100,
                      behavior: 'smooth'
                  });
                  el = $(`.sticky-note[data-id="${item.id}"]`);
              }
          }
          else if (item.type === 'flashcard') {
              // Filter to show just this deck or card?
              // Existing filter function:
              $('#flashcardSearch').value = item.text;
              renderFlashcards();
              // Try to find the card
              const cards = $$('.flip-card');
              el = cards.find(c => c.innerHTML.includes(item.text));
          }
          else if (item.type === 'journal') {
              // Scroll journal list
              const entries = $$('.journal-entry');
              el = entries.find(e => e.innerHTML.includes(item.text));
              if(el && !el.classList.contains('expanded')) {
                  el.classList.add('expanded');
              }
          }
          else if (item.type === 'timetable') {
              el = $(`td[data-key="${item.id}"]`);
          }

          // 3. Highlight
          if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('highlight-pulse');
              setTimeout(() => el.classList.remove('highlight-pulse'), 2000);
          }
      }, 100);
  }

  $('#globalSearch').addEventListener('input', debounce(e => {
      const query = e.target.value.trim();
      
      if($('#flashcardsCard').classList.contains('active')) {
          $('#flashcardSearch').value = query;
          renderFlashcards();
      }

      if (!query) {
          renderSearchSuggestions([]);
          searchMatches = [];
          return;
      }

      const allItems = getAllSearchableItems();
      const regex = new RegExp(`\\b${escapeRegExp(query)}\\b`, 'i');
      
      searchMatches = allItems.filter(item => regex.test(item.text));
      searchSelectIndex = -1; // Reset selection
      
      renderSearchSuggestions(searchMatches);
  }, 200));

  $('#globalSearch').addEventListener('keydown', e => {
      const suggestions = $('#searchSuggestions');
      
      if (!suggestions.classList.contains('visible') && searchMatches.length > 0) {
          suggestions.classList.add('visible');
      }

      if (e.key === 'ArrowDown') {
          e.preventDefault();
          searchSelectIndex++;
          if (searchSelectIndex >= searchMatches.length) searchSelectIndex = 0;
          renderSearchSuggestions(searchMatches);
      } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          searchSelectIndex--;
          if (searchSelectIndex < 0) searchSelectIndex = searchMatches.length - 1;
          renderSearchSuggestions(searchMatches);
      } else if (e.key === 'Enter') {
          e.preventDefault();
          if (searchSelectIndex >= 0 && searchMatches[searchSelectIndex]) {
              // Select specific suggestion
              navigateToResult(searchMatches[searchSelectIndex]);
              suggestions.classList.remove('visible');
              $('#globalSearch').value = '';
          } else if (searchMatches.length > 0) {
              // Cycle through results if none selected
              // Use a separate static index for cycling to not interfere with arrow keys
              if(typeof this.cycleIndex === 'undefined') this.cycleIndex = -1;
              this.cycleIndex++;
              if(this.cycleIndex >= searchMatches.length) this.cycleIndex = 0;
              
              const match = searchMatches[this.cycleIndex];
              navigateToResult(match);
              
              // Visual feedback in dropdown?
              searchSelectIndex = this.cycleIndex;
              renderSearchSuggestions(searchMatches);
          }
      } else if (e.key === 'Escape') {
          suggestions.classList.remove('visible');
      }
  });

  // Hide suggestions on outside click
  document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrapper')) {
          $('#searchSuggestions').classList.remove('visible');
      }
  });

  function renderDurations() {
    const dur = currentWS().timer.dur;
    $('#durFocus').value = dur.focus;
    $('#durShort').value = dur.short;
    $('#durLong').value = dur.long;
  }
  $('#saveDur').addEventListener('click', () => {
    const ws = currentWS();
    ws.timer.dur.focus = Number($('#durFocus').value);
    ws.timer.dur.short = Number($('#durShort').value);
    ws.timer.dur.long = Number($('#durLong').value);
    saveState();
    setModeUI();
  });

  function renderAll() {
    checkAndResetRecurringTasks();
    checkAndResetTimetable();
    checkStreakDecay(); 

    applyTheme();
    renderAccentPalette();

    renderWorkspaceSelect();
    renderStreakCounter();

    renderDurations();

    setModeUI();
    renderStreakInfo();
    renderBadges();

    initRightColumnTabs();
    renderTasks();
    renderSyllabusNav();
    renderSyllabus();
    populateAnalyticsSubjectSelect();
    drawCharts();
    renderTimetable();
    renderStickyNotes();
    renderFlashcards();
    renderJournal();
    renderCalendar();

    initExpandButtons();
  }

  function init() {
    renderAll();
    backupAuto();

    setInterval(checkAndResetRecurringTasks, 60 * 1000);
    setInterval(checkAndResetTimetable, 60 * 1000);

    dateTooltip.addEventListener('mouseenter', () => {
      clearTimeout(tooltipHideTimeout);
    });
    dateTooltip.addEventListener('mouseleave', () => {
      tooltipHideTimeout = setTimeout(() => {
        dateTooltip.style.display = 'none';
      }, 200);
    });

    timetableTooltip.addEventListener('mouseenter', () => {
      clearTimeout(tooltipHideTimeout);
    });
    timetableTooltip.addEventListener('mouseleave', () => {
      timetableTooltipHideTimeout = setTimeout(() => {
        timetableTooltip.style.display = 'none';
      }, 200);
    });

    window.addEventListener('scroll', () => {
      hideContextMenu();
    });
    window.addEventListener('resize', debounce(() => {
      hideContextMenu();
      renderTimetable();
      drawCharts();
    }, 100));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeModal();
        hideContextMenu();
        $$('.card.expanded').forEach(c => minimizeCard(c.id));
      }
      
      // Hotkeys
      if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if(e.code === 'Space') {
          e.preventDefault();
          if(running) pauseTimer();
          else startTimer();
      }
      if(e.key.toLowerCase() === 'n') {
          e.preventDefault();
          const btn = document.querySelector('.right-nav-tabs .tab[data-target="todoCard"]');
          if(btn) btn.click();
          setTimeout(() => $('#todoInput').focus(), 100);
      }
    });
  }

  init();

});
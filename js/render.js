/**
 * 日积跬步 - UI 渲染模块
 * 负责所有页面的 DOM 渲染
 * 版本: V1.1
 */

// ==================== 首页渲染 ====================

/**
 * 渲染首页
 * @param {boolean} keepDatePickerOpen 是否保持日期选择器打开状态
 */
function renderHomePage(keepDatePickerOpen = false) {
  const page = document.getElementById('page-home');
  if (!page) return;

  const activeHabits = AppState.habits.filter((h) => h.status === 'active');
  const frozenHabits = AppState.habits.filter((h) => h.status === 'frozen');

  // 获取当前查看日期的打卡数据
  const viewCheckins = AppState.viewCheckins || AppState.todayCheckins;
  const completedCount = Object.values(viewCheckins).filter((c) => c.completed).length;
  const totalActive = activeHabits.length;

  // 四叶草只追踪4个默认习惯（按order排序取前4个default类别）
  const defaultHabits = AppState.habits
    .filter((h) => h.category === 'default')
    .sort((a, b) => a.order - b.order)
    .slice(0, 4);
  const defaultCompleted = defaultHabits.filter((h) => {
    const c = viewCheckins[h.id];
    return c && c.completed;
  }).length;

  // 判断是否在查看今天
  const isToday = AppState.viewDate === AppState.today;
  const isFuture = AppState.viewDate > AppState.today;

  // 计算连续打卡天数
  const streakDays = calculateStreakDays();

  // 获取道家经典句子
  const taoQuote = getDailyTaoistQuote();

  // 视图日期显示
  const viewDateObj = new Date(AppState.viewDate);
  const viewWeekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][viewDateObj.getDay()];
  const viewDateChinese = `${viewDateObj.getFullYear()}年${viewDateObj.getMonth() + 1}月${viewDateObj.getDate()}日`;

  page.innerHTML = `
    <!-- 日期选择器 -->
    <div class="date-picker">
      <button class="date-picker__arrow" id="btn-date-prev">◀</button>
      <div class="date-picker__display" id="btn-date-picker">
        <div class="date-picker__weekday">${viewWeekday}</div>
        <div class="date-picker__date">
          ${viewDateChinese}
          ${isToday ? '<span class="date-picker__today-badge">今天</span>' : ''}
        </div>
      </div>
      <button class="date-picker__arrow" id="btn-date-next" ${isToday ? 'disabled' : ''}>▶</button>
    </div>

    <!-- 隐藏的日期输入框 -->
    <input type="date" id="input-date-picker" style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;"
           value="${AppState.viewDate}" max="${AppState.today}">

    <!-- 四叶草进度（华为风格：上下两片大叶子） -->
    <div class="clover-section">
      <div class="clover-wrapper">
        ${renderCloverSVG(defaultHabits, viewCheckins)}
        <div class="clover-center">
          <div class="clover-center__count">${defaultCompleted}/4</div>
          <div class="clover-center__label">必修完成</div>
        </div>
      </div>
    </div>

    <!-- 道家经典句子 -->
    <div class="tao-quote">
      <div class="tao-quote__text">「${taoQuote.text}」</div>
      <div class="tao-quote__source">—— ${taoQuote.source}</div>
    </div>

    <!-- 周历条 -->
    <div class="week-strip">
      ${renderWeekStrip()}
    </div>

    <!-- 活跃习惯 -->
    <div class="habits-section">
      <div class="section-header">
        <span class="section-header__title">${isToday ? '今日习惯' : '当日习惯'}</span>
        <span style="font-size:12px;color:var(--text-muted);">
          连续 ${streakDays} 天 · ${totalActive > 0 ? Math.round(completedCount / totalActive * 100) : 0}%
          ${isToday ? '' : ' · <span style="color:var(--color-warning);">查看历史</span>'}
        </span>
      </div>

      ${activeHabits.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state__icon">🌱</div>
          <div class="empty-state__text">开始你的第一个习惯吧</div>
        </div>
      ` : activeHabits.map((habit) => renderHabitCard(habit, viewCheckins, isToday, isFuture)).join('')}
    </div>

    <!-- 冻结习惯 -->
    ${frozenHabits.length > 0 ? `
      <div class="habits-section">
        <div class="section-header">
          <span class="section-header__title">已冻结</span>
        </div>
        ${frozenHabits.map((habit) => renderHabitCard(habit, viewCheckins, isToday, isFuture)).join('')}
      </div>
    ` : ''}

    <!-- 底部间距 -->
    <div style="height:var(--space-xxl);"></div>
  `;

  // 绑定事件
  bindHomeEvents();
}

/**
 * 渲染四叶草 SVG（华为风格：上下两片大椭圆叶子，渐变+发光效果）
 * @param {Array} defaultHabits 4个必修习惯
 * @param {Object} checkins 当日打卡数据
 * @returns {string}
 */
function renderCloverSVG(defaultHabits, checkins) {
  // 计算每个习惯的完成状态（顺序：叩齿→跪坐→抖功→握固）
  const statuses = defaultHabits.map((h) => {
    const c = checkins[h.id];
    return !!(c && c.completed);
  });

  const topLeftDone = statuses[0] || false;
  const topRightDone = statuses[1] || false;
  const bottomLeftDone = statuses[2] || false;
  const bottomRightDone = statuses[3] || false;

  const topCompleted = (topLeftDone ? 1 : 0) + (topRightDone ? 1 : 0);
  const bottomCompleted = (bottomLeftDone ? 1 : 0) + (bottomRightDone ? 1 : 0);
  const totalCompleted = topCompleted + bottomCompleted;

  const h = defaultHabits;
  const ringOpacity = 0.25 + (totalCompleted / 4) * 0.75;
  const h0 = h[0], h1 = h[1], h2 = h[2], h3 = h[3];

  // 上叶填充样式（蓝系渐变）
  const topFill = topCompleted >= 1
    ? (topCompleted === 2 ? 'url(#topGradFull)' : 'url(#topGradHalf)')
    : 'url(#topGradEmpty)';
  const topStrokeColor = topCompleted >= 1 ? 'none' : 'rgba(96,165,250,0.25)';
  const topStrokeWidth = topCompleted >= 1 ? '0' : '1.5';
  const topDashArray = topCompleted >= 1 ? 'none' : '4,3';

  // 下叶填充样式（紫系渐变）
  const botFill = totalCompleted >= 3
    ? (bottomCompleted === 2 ? 'url(#botGradFull)' : 'url(#botGradHalf)')
    : (totalCompleted >= 2 ? 'url(#botGradHalf)' : 'url(#botGradEmpty)');
  const botStrokeColor = (totalCompleted >= 2 && bottomCompleted > 0) ? 'none' : 'rgba(167,139,250,0.25)';
  const botStrokeWidth = (totalCompleted >= 2 && bottomCompleted > 0) ? '0' : '1.5';
  const botDashArray = (totalCompleted >= 2 && bottomCompleted > 0) ? 'none' : '4,3';

  // 整体透明度
  const topOpacity = '1';
  const botOpacity = '1';

  // 单个叶子透明度
  const topLeftAlpha = topLeftDone ? '1' : '1';
  const topRightAlpha = topRightDone ? '1' : '1';
  const botLeftAlpha = bottomLeftDone ? '1' : '1';
  const botRightAlpha = bottomRightDone ? '1' : '1';

  // 单个叶子发光
  const topLeftGlow = topLeftDone ? 'filter="url(#leafGlow)"' : '';
  const topRightGlow = topRightDone ? 'filter="url(#leafGlow)"' : '';
  const botLeftGlow = bottomLeftDone ? 'filter="url(#leafGlow)"' : '';
  const botRightGlow = bottomRightDone ? 'filter="url(#leafGlow)"' : '';

  // 叶子填充色（已完成时使用对应的亮色，未完成时使用空渐变）
  const topLeftFill = topLeftDone ? (topCompleted === 2 ? '#60A5FA' : 'rgba(96,165,250,0.55)') : 'url(#topGradEmpty)';
  const topRightFill = topRightDone ? (topCompleted === 2 ? '#3B82F6' : 'rgba(59,130,246,0.55)') : 'url(#topGradEmpty)';
  const botLeftFill = bottomLeftDone ? (bottomCompleted === 2 ? '#A78BFA' : 'rgba(167,139,250,0.55)') : 'url(#botGradEmpty)';
  const botRightFill = bottomRightDone ? (bottomCompleted === 2 ? '#8B5CF6' : 'rgba(139,92,246,0.55)') : 'url(#botGradEmpty)';

  // 叶子描边
  const topLeftStroke = topLeftDone ? 'none' : 'rgba(96,165,250,0.25)';
  const topRightStroke = topRightDone ? 'none' : 'rgba(59,130,246,0.25)';
  const botLeftStroke = bottomLeftDone ? 'none' : 'rgba(167,139,250,0.25)';
  const botRightStroke = bottomRightDone ? 'none' : 'rgba(139,92,246,0.25)';

  // 图标颜色
  const topLeftIconColor = topLeftDone ? '#fff' : 'rgba(96,165,250,0.4)';
  const topRightIconColor = topRightDone ? '#fff' : 'rgba(59,130,246,0.4)';
  const botLeftIconColor = bottomLeftDone ? '#fff' : 'rgba(167,139,250,0.4)';
  const botRightIconColor = bottomRightDone ? '#fff' : 'rgba(139,92,246,0.4)';

  // 图标发光
  const topLeftIconGlow = topLeftDone ? '0 0 10px rgba(96,165,250,0.9)' : 'none';
  const topRightIconGlow = topRightDone ? '0 0 10px rgba(59,130,246,0.9)' : 'none';
  const botLeftIconGlow = bottomLeftDone ? '0 0 10px rgba(167,139,250,0.9)' : 'none';
  const botRightIconGlow = bottomRightDone ? '0 0 10px rgba(139,92,246,0.9)' : 'none';

  return `
    <svg class="clover-svg" viewBox="0 0 280 340">
      <defs>
        <!-- 上叶（蓝系）渐变 -->
        <linearGradient id="topGradFull" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stop-color="#93C5FD" stop-opacity="0.95"/>
          <stop offset="35%" stop-color="#60A5FA" stop-opacity="0.8"/>
          <stop offset="70%" stop-color="#3B82F6" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#2563EB" stop-opacity="0.25"/>
        </linearGradient>
        <linearGradient id="topGradHalf" x1="40%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%" stop-color="#60A5FA" stop-opacity="0.55"/>
          <stop offset="50%" stop-color="#3B82F6" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#1D4ED8" stop-opacity="0.15"/>
        </linearGradient>
        <linearGradient id="topGradEmpty" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stop-color="#1E3A5F" stop-opacity="0.35"/>
          <stop offset="50%" stop-color="#172554" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#0A0E17" stop-opacity="0.15"/>
        </linearGradient>
        <!-- 下叶（紫系）渐变 -->
        <linearGradient id="botGradFull" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stop-color="#DDD6FE" stop-opacity="0.9"/>
          <stop offset="30%" stop-color="#C084FC" stop-opacity="0.75"/>
          <stop offset="65%" stop-color="#A78BFA" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#7C3AED" stop-opacity="0.9"/>
        </linearGradient>
        <linearGradient id="botGradHalf" x1="40%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%" stop-color="#C084FC" stop-opacity="0.5"/>
          <stop offset="50%" stop-color="#A78BFA" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#6D28D9" stop-opacity="0.15"/>
        </linearGradient>
        <linearGradient id="botGradEmpty" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stop-color="#2D1B69" stop-opacity="0.35"/>
          <stop offset="50%" stop-color="#1E1145" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#0A0E17" stop-opacity="0.15"/>
        </linearGradient>
        <!-- 叶子发光滤镜 -->
        <filter id="leafGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur1"/>
          <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur2"/>
          <feComponentTransfer in="blur2" result="glow">
            <feFuncA type="linear" slope="0.6"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="glow"/>
            <feMergeNode in="blur1"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <!-- 柔光滤镜（未完成叶子的微弱光晕） -->
        <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- ===== 上叶片 ===== -->
      <!-- 左叶（叩齿） -->
      <ellipse cx="140" cy="95" rx="90" ry="75"
               fill="${topLeftFill}"
               stroke="${topLeftStroke}"
               stroke-width="1.5"
               stroke-dasharray="${topLeftDone ? 'none' : '4,3'}"
               ${topLeftGlow}
               transform="rotate(-14 140 170)"/>
      <!-- 左上图标 -->
      <text x="72" y="60" text-anchor="middle" font-size="17" font-weight="600"
            fill="${topLeftIconColor}"
            style="text-shadow:${topLeftIconGlow}">${h0.icon}</text>

      <!-- 右叶（跪坐） -->
      <ellipse cx="140" cy="95" rx="90" ry="75"
               fill="${topRightFill}"
               stroke="${topRightStroke}"
               stroke-width="1.5"
               stroke-dasharray="${topRightDone ? 'none' : '4,3'}"
               ${topRightGlow}
               transform="rotate(14 140 170)"/>
      <!-- 右上图标 -->
      <text x="208" y="60" text-anchor="middle" font-size="17" font-weight="600"
            fill="${topRightIconColor}"
            style="text-shadow:${topRightIconGlow}">${h1.icon}</text>

      <!-- 上叶中缝线 -->
      <line x1="140" y1="40" x2="140" y2="165"
            stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>

      <!-- ===== 下叶片 ===== -->
      <!-- 左叶（抖功） -->
      <ellipse cx="140" cy="245" rx="90" ry="75"
               fill="${botLeftFill}"
               stroke="${botLeftStroke}"
               stroke-width="1.5"
               stroke-dasharray="${bottomLeftDone ? 'none' : '4,3'}"
               ${botLeftGlow}
               transform="rotate(12 140 170)"/>
      <!-- 左下图标 -->
      <text x="72" y="258" text-anchor="middle" font-size="17" font-weight="600"
            fill="${botLeftIconColor}"
            style="text-shadow:${botLeftIconGlow}">${h2.icon}</text>

      <!-- 右叶（握固） -->
      <ellipse cx="140" cy="245" rx="90" ry="75"
               fill="${botRightFill}"
               stroke="${botRightStroke}"
               stroke-width="1.5"
               stroke-dasharray="${bottomRightDone ? 'none' : '4,3'}"
               ${botRightGlow}
               transform="rotate(-12 140 170)"/>
      <!-- 右下图标 -->
      <text x="208" y="258" text-anchor="middle" font-size="17" font-weight="600"
            fill="${botRightIconColor}"
            style="text-shadow:${botRightIconGlow}">${h3.icon}</text>

      <!-- 下叶中缝线 -->
      <line x1="140" y1="175" x2="140" y2="290"
            stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>

      <!-- ===== 中心装饰环 ===== -->
      <!-- 外环背景 -->
      <circle cx="140" cy="170" r="42" fill="#0A0E17"
              stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <!-- 外光环 -->
      <circle cx="140" cy="170" r="41" fill="none"
              stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
      <!-- 进度环 -->
      <circle cx="140" cy="170" r="35" fill="none"
              stroke="var(--color-primary, #4ADE80)" stroke-width="2.5"
              stroke-linecap="round"
              opacity="${ringOpacity}"
              stroke-dasharray="${2 * Math.PI * 35}"
              stroke-dashoffset="${2 * Math.PI * 35 * (1 - totalCompleted / 4)}"
              transform="rotate(-90 140 170)"
              style="transition: all 0.6s ease;"/>
      <!-- 内环背景 -->
      <circle cx="140" cy="170" r="28" fill="#0A0E17"
              stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>
  `;
}


function renderWeekStrip() {
  const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
  const monday = new Date(AppState.weekStart);

  return dayLabels.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = formatDate(d);
    const stats = AppState.weekStats[dateStr];
    const isViewDate = dateStr === AppState.viewDate;
    const isToday = dateStr === AppState.today;
    const isFuture = dateStr > AppState.today;

    let dotClass = '';
    let dotContent = '';

    if (isFuture) {
      dotClass = 'future';
      dotContent = '·';
    } else if (stats && stats.total > 0) {
      if (stats.completed === stats.total) {
        dotClass = 'completed';
        dotContent = '✓';
      } else if (stats.completed > 0) {
        dotClass = 'completed';
        dotContent = '◐';
      } else {
        dotClass = 'missed';
        dotContent = '✗';
      }
    } else {
      dotClass = 'missed';
      dotContent = '—';
    }

    if (isViewDate) dotClass += ' today';
    if (isToday) dotClass += ' today';

    return `
      <div class="week-day" data-date="${dateStr}" ${!isFuture ? 'style="cursor:pointer;"' : ''}>
        <span class="week-day__label">${label}</span>
        <span class="week-day__dot ${dotClass}">${dotContent}</span>
      </div>
    `;
  }).join('');
}

/**
 * 渲染习惯卡片
 * @param {Object} habit 习惯对象
 * @param {Object} checkins 打卡数据
 * @param {boolean} isToday 是否今天
 * @param {boolean} isFuture 是否未来
 * @returns {string}
 */
function renderHabitCard(habit, checkins, isToday = true, isFuture = false) {
  const checkin = checkins[habit.id];
  const isCompleted = checkin && checkin.completed;
  const isFrozen = habit.status === 'frozen';

  let progressPercent = 0;
  if (isCompleted) progressPercent = 100;

  const cardClass = [
    'habit-card',
    isFrozen ? 'habit-card--frozen' : '',
    isCompleted ? 'habit-card--completed' : 'habit-card--pending',
    !isToday && !isFuture ? 'habit-card--history' : '',
    isFuture ? 'habit-card--future' : '',
  ].filter(Boolean).join(' ');

  const infoText = getHabitDisplayInfo(habit);
  const reminderText = habit.reminderTimes.length > 0 ? `⏰ ${habit.reminderTimes[0]}` : '';

  // 未来日期或冻结且非今天不显示打卡按钮
  const showCheckBtn = isToday && !isFrozen;

  return `
    <div class="${cardClass}" data-habit-id="${habit.id}">
      <div class="habit-card__icon">${habit.icon}</div>
      <div class="habit-card__content">
        <div class="habit-card__name">${habit.name}</div>
        <div class="habit-card__info">${infoText} ${reminderText ? '· ' + reminderText : ''}</div>
        <div class="habit-card__progress">
          <div class="habit-card__progress-bar" style="width:${progressPercent}%"></div>
        </div>
      </div>
      ${showCheckBtn ? `
        <div class="habit-card__check ${isCompleted ? 'habit-card__check--done' : ''}"
             data-habit-id="${habit.id}">
          ${isCompleted ? '✓' : '○'}
        </div>
      ` : `
        <div class="habit-card__check habit-card__check--disabled"
             data-habit-id="${habit.id}">
          ${isCompleted ? '✓' : isFuture ? '·' : '—'}
        </div>
      `}
      ${isFrozen ? '<div class="habit-card__badge">已冻结</div>' : ''}
    </div>
  `;
}

/**
 * 绑定首页事件
 */
function bindHomeEvents() {
  // 日期切换
  document.getElementById('btn-date-prev')?.addEventListener('click', () => {
    changeViewDate(-1);
  });
  document.getElementById('btn-date-next')?.addEventListener('click', () => {
    changeViewDate(1);
  });

  // 日期选择器
  document.getElementById('btn-date-picker')?.addEventListener('click', () => {
    const input = document.getElementById('input-date-picker');
    if (input) {
      input.style.position = '';
      input.style.opacity = '';
      input.style.pointerEvents = '';
      input.showPicker ? input.showPicker() : input.click();
    }
  });

  document.getElementById('input-date-picker')?.addEventListener('change', (e) => {
    const newDate = e.target.value;
    if (newDate && newDate <= AppState.today) {
      setViewDate(newDate);
    }
    // 隐藏input
    e.target.style.position = 'absolute';
    e.target.style.opacity = '0';
    e.target.style.pointerEvents = 'none';
    e.target.style.width = '0';
    e.target.style.height = '0';
  });

  // 打卡事件
  document.querySelectorAll('.habit-card__check:not(.habit-card__check--disabled)').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const habitId = btn.dataset.habitId;
      doCheckin(habitId);
    });
  });

  // 卡片点击跳转详情
  document.querySelectorAll('.habit-card').forEach((card) => {
    card.addEventListener('click', () => {
      const habitId = card.dataset.habitId;
      showHabitDetailModal(habitId);
    });
  });

  // 周历日期点击
  document.querySelectorAll('.week-day').forEach((day) => {
    const dateStr = day.dataset.date;
    if (dateStr && dateStr <= AppState.today) {
      day.addEventListener('click', () => {
        setViewDate(dateStr);
      });
    }
  });
}

/**
 * 切换查看日期
 * @param {number} deltaDays 天数偏移
 */
async function changeViewDate(deltaDays) {
  const current = new Date(AppState.viewDate);
  current.setDate(current.getDate() + deltaDays);
  const newDate = formatDate(current);

  // 不能超过今天
  if (newDate > AppState.today) return;

  await setViewDate(newDate);
}

/**
 * 设置查看日期
 * @param {string} dateStr YYYY-MM-DD
 */
async function setViewDate(dateStr) {
  AppState.viewDate = dateStr;

  if (dateStr === AppState.today) {
    // 切换回今天，使用今天的数据
    AppState.viewCheckins = AppState.todayCheckins;
    await loadTodayCheckins(); // 刷新最新数据
    AppState.viewCheckins = AppState.todayCheckins;
  } else {
    // 加载指定日期的打卡数据
    AppState.viewCheckins = await getCheckinsByDate(dateStr);
  }

  renderHomePage();
}

// ==================== 习惯管理页渲染 ====================

function renderManagePage() {
  const page = document.getElementById('page-manage');
  if (!page) return;

  page.innerHTML = `
    <div class="section-header" style="padding: 0 0 var(--space-md) 0;">
      <span class="section-header__title">管理习惯</span>
      <button class="section-header__action" id="btn-add-habit-manage">+ 新增</button>
    </div>

    <div style="margin-bottom:var(--space-lg);">
      <div class="settings-group__title">默认习惯</div>
      ${AppState.habits.filter((h) => h.category === 'default').map((h) => renderManageCard(h)).join('')}
    </div>

    <div style="margin-bottom:var(--space-lg);">
      <div class="settings-group__title">自定义习惯</div>
      ${AppState.habits.filter((h) => h.category !== 'default').map((h) => renderManageCard(h)).join('')}
    </div>

    <div style="margin-bottom:var(--space-lg);">
      <div class="settings-group__title">添加可选习惯</div>
      ${OPTIONAL_HABIT_TEMPLATES.filter(
        (t) => !AppState.habits.find((h) => h.name === t.name)
      ).map((t) => `
        <div class="settings-item" data-template="${t.name}">
          <span class="settings-item__label">${t.icon} ${t.name}</span>
          <span style="color:var(--color-primary);font-size:13px;">添加</span>
        </div>
      `).join('')}
    </div>

    <div style="height:var(--space-xxl);"></div>
  `;

  bindManageEvents();
}

function renderManageCard(habit) {
  return `
    <div class="habit-manage-card" data-habit-id="${habit.id}">
      <div class="habit-manage-card__drag">⋮⋮</div>
      <div class="habit-card__icon" style="width:36px;height:36px;font-size:18px;">${habit.icon}</div>
      <div class="habit-card__content">
        <div class="habit-card__name" style="font-size:14px;">${habit.name}</div>
        <div class="habit-card__info">${getHabitDisplayInfo(habit)}</div>
      </div>
      <div class="habit-manage-card__actions">
        ${habit.status === 'active'
          ? `<button class="habit-manage-card__action" data-action="freeze" data-habit-id="${habit.id}" title="冻结">❄️</button>`
          : `<button class="habit-manage-card__action" data-action="unfreeze" data-habit-id="${habit.id}" title="解冻">🔥</button>`
        }
        <button class="habit-manage-card__action" data-action="edit" data-habit-id="${habit.id}" title="编辑">✏️</button>
        <button class="habit-manage-card__action habit-manage-card__action--danger"
                data-action="delete" data-habit-id="${habit.id}" title="删除">🗑</button>
      </div>
    </div>
  `;
}

function bindManageEvents() {
  document.getElementById('btn-add-habit-manage')?.addEventListener('click', showAddHabitModal);

  document.querySelectorAll('.habit-manage-card__action').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const habitId = btn.dataset.habitId;

      switch (action) {
        case 'freeze': await toggleFreeze(habitId, 'frozen'); break;
        case 'unfreeze': await toggleFreeze(habitId, 'active'); break;
        case 'edit': showEditHabitModal(habitId); break;
        case 'delete': confirmDeleteHabit(habitId); break;
      }
    });
  });

  document.querySelectorAll('[data-template]').forEach((item) => {
    item.addEventListener('click', async () => {
      const templateName = item.dataset.template;
      const template = OPTIONAL_HABIT_TEMPLATES.find((t) => t.name === templateName);
      if (template) {
        await saveHabit({ ...template, order: AppState.habits.length });
        await loadHabits();
        await loadTodayCheckins();
        showToast(`✅ 已添加「${templateName}」`);
        renderManagePage();
      }
    });
  });
}

async function toggleFreeze(habitId, newStatus) {
  const habit = AppState.habits.find((h) => h.id === habitId);
  if (!habit) return;
  habit.status = newStatus;
  await saveHabit(habit);
  await loadHabits();
  const statusText = newStatus === 'frozen' ? '已冻结' : '已解冻';
  showToast(`${habit.icon} ${habit.name} ${statusText}`);
  renderManagePage();
}

async function confirmDeleteHabit(habitId) {
  const habit = AppState.habits.find((h) => h.id === habitId);
  if (!habit) return;
  showConfirmModal(
    `确认删除「${habit.name}」？`,
    '删除后历史打卡数据仍保留，但习惯将被移除。',
    async () => {
      await deleteHabit(habitId);
      await loadHabits();
      await loadTodayCheckins();
      showToast(`已删除「${habit.name}」`, 'error');
      renderManagePage();
      closeModal();
    }
  );
}

// ==================== 日历视图页渲染 ====================

/** @type {{ year: number, month: number }} 日历页当前查看年月 */
let CalendarView = { year: 0, month: 0 };

/**
 * 渲染日历视图页面
 * @param {number} [year] 年份
 * @param {number} [month] 月份 0-11
 */
async function renderCalendarPage(year, month) {
  const page = document.getElementById('page-calendar');
  if (!page) return;

  const now = new Date();
  if (year === undefined) {
    if (CalendarView.year === 0) {
      CalendarView.year = now.getFullYear();
      CalendarView.month = now.getMonth();
    }
    year = CalendarView.year;
    month = CalendarView.month;
  } else {
    CalendarView.year = year;
    CalendarView.month = month;
  }

  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const todayStr = AppState.today;
  const isCurrentMonth = (year === now.getFullYear() && month === now.getMonth());

  // 获取当月所有打卡数据
  const monthCheckins = await getCheckinsByDateRange(monthStart, monthEnd);

  // 获取当月活跃习惯数
  const activeHabits = AppState.habits.filter((h) => h.status === 'active');
  const totalHabits = activeHabits.length;

  // 按日期聚合
  const dateMap = {};
  monthCheckins.forEach((c) => {
    if (!dateMap[c.date]) dateMap[c.date] = { total: 0, completed: 0 };
    dateMap[c.date].total++;
    if (c.completed) dateMap[c.date].completed++;
  });

  // 月度统计
  const daysWithData = Object.keys(dateMap).length;
  let totalMonthCompletions = 0;
  let totalMonthTargets = 0;
  Object.values(dateMap).forEach((v) => {
    totalMonthCompletions += v.completed;
    totalMonthTargets += v.total;
  });
  const monthCompletionRate = totalMonthTargets > 0 ? Math.round((totalMonthCompletions / totalMonthTargets) * 100) : 0;

  // 日历网格
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
  const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Mon=0

  let calendarHTML = '';
  for (let i = 0; i < adjustedFirstDay; i++) {
    calendarHTML += '<div class="calendar-day calendar-day--empty"></div>';
  }

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayData = dateMap[dateStr];
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;

    let cellClass = 'calendar-day';
    let indicatorHTML = '';

    // 计算四叶草状态（基于4个必修习惯）
    if (!isFuture && totalHabits > 0) {
      const completed = dayData ? dayData.completed : 0;
      const total = dayData ? dayData.total : 0;

      if (total > 0) {
        if (completed === total) {
          cellClass += ' calendar-day--full';
          indicatorHTML = `<span class="calendar-day__clover">🍀</span>`;
        } else if (completed > 0) {
          cellClass += ' calendar-day--partial';
          const pc = Math.round((completed / total) * 100);
          indicatorHTML = `<span class="calendar-day__rate">${pc}%</span>`;
        } else {
          cellClass += ' calendar-day--missed';
          indicatorHTML = `<span class="calendar-day__dot">✗</span>`;
        }
      } else {
        cellClass += ' calendar-day--empty-data';
      }
    } else if (isFuture) {
      cellClass += ' calendar-day--future';
    } else {
      cellClass += ' calendar-day--empty-data';
    }

    if (isToday) cellClass += ' calendar-day--today';

    calendarHTML += `
      <div class="${cellClass}" data-date="${dateStr}" ${!isFuture ? 'style="cursor:pointer;"' : ''}>
        <span class="calendar-day__num">${d}</span>
        ${indicatorHTML}
      </div>
    `;
  }

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const canGoNext = isCurrentMonth ? false : !(year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth()));

  page.innerHTML = `
    <!-- 月份选择器 -->
    <div class="cal-month-picker">
      <button class="cal-month-picker__arrow" id="btn-cal-prev-month">◀</button>
      <div class="cal-month-picker__display" id="btn-cal-month-select">
        <span class="cal-month-picker__year">${year}年</span>
        <span class="cal-month-picker__month">${monthNames[month]}</span>
        <span class="cal-month-picker__chevron">▼</span>
      </div>
      <button class="cal-month-picker__arrow" id="btn-cal-next-month" ${canGoNext ? '' : 'disabled'}>▶</button>
    </div>

    <!-- 隐藏月份输入 -->
    <input type="month" id="input-month-picker"
           style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;"
           value="${year}-${String(month + 1).padStart(2, '0')}" max="${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}">

    <!-- 统计卡片 -->
    <div class="cal-stats">
      <div class="cal-stats__item">
        <div class="cal-stats__value cal-stats__value--accent">${monthCompletionRate}%</div>
        <div class="cal-stats__label">完成率</div>
      </div>
      <div class="cal-stats__item">
        <div class="cal-stats__value">${totalMonthCompletions}</div>
        <div class="cal-stats__label">已完成</div>
      </div>
      <div class="cal-stats__item">
        <div class="cal-stats__value">${totalMonthTargets}</div>
        <div class="cal-stats__label">总目标</div>
      </div>
      <div class="cal-stats__item" id="btn-goto-reports" style="cursor:pointer;">
        <div class="cal-stats__value" style="font-size:20px;">📊</div>
        <div class="cal-stats__label">报表</div>
      </div>
    </div>

    <!-- 图例 -->
    <div class="cal-legend">
      <span class="cal-legend__item"><span class="cal-legend__dot cal-legend__dot--full"></span> 全完成</span>
      <span class="cal-legend__item"><span class="cal-legend__dot cal-legend__dot--partial"></span> 部分完成</span>
      <span class="cal-legend__item"><span class="cal-legend__dot cal-legend__dot--missed"></span> 未完成</span>
    </div>

    <!-- 日历网格 -->
    <div class="cal-grid">
      <!-- 星期头 -->
      <div class="cal-grid__weekdays">
        <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
      </div>
      <div class="cal-grid__days">
        ${calendarHTML}
      </div>
    </div>

    <div style="height:var(--space-xxl);"></div>
  `;

  bindCalendarEvents();
}

function bindCalendarEvents() {
  // 上月
  document.getElementById('btn-cal-prev-month')?.addEventListener('click', () => {
    let { year, month } = CalendarView;
    month--;
    if (month < 0) { month = 11; year--; }
    renderCalendarPage(year, month);
  });

  // 下月
  document.getElementById('btn-cal-next-month')?.addEventListener('click', () => {
    const now = new Date();
    let { year, month } = CalendarView;
    month++;
    if (month > 11) { month = 0; year++; }
    // 不能超过当前月
    if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth())) return;
    renderCalendarPage(year, month);
  });

  // 月份选择器
  document.getElementById('btn-cal-month-select')?.addEventListener('click', () => {
    const input = document.getElementById('input-month-picker');
    if (input) {
      input.style.position = '';
      input.style.opacity = '';
      input.style.pointerEvents = '';
      input.showPicker ? input.showPicker() : input.click();
    }
  });

  document.getElementById('input-month-picker')?.addEventListener('change', (e) => {
    const val = e.target.value; // YYYY-MM
    if (val) {
      const [y, m] = val.split('-').map(Number);
      renderCalendarPage(y, m - 1);
    }
    e.target.style.position = 'absolute';
    e.target.style.opacity = '0';
    e.target.style.pointerEvents = 'none';
    e.target.style.width = '0';
    e.target.style.height = '0';
  });

  // 报表按钮
  document.getElementById('btn-goto-reports')?.addEventListener('click', () => {
    navigateTo('reports');
  });

  // 日期格子点击 -> 跳转到首页查看当天
  document.querySelectorAll('.calendar-day:not(.calendar-day--empty):not(.calendar-day--future)').forEach((cell) => {
    cell.addEventListener('click', async () => {
      const dateStr = cell.dataset.date;
      if (dateStr && dateStr <= AppState.today) {
        await setViewDate(dateStr);
        navigateTo('home');
      }
    });
  });
}

// ==================== 报表页渲染 ====================

async function renderReportsPage() {
  const page = document.getElementById('page-reports');
  if (!page) return;

  const weeklyReports = await getReports('weekly');
  const monthlyReports = await getReports('monthly');
  const annualReports = await getReports('annual');

  page.innerHTML = `
    <div class="section-header" style="padding: 0 0 var(--space-md) 0;">
      <span class="section-header__title">报表中心</span>
    </div>

    <div class="report-card" style="margin-bottom:var(--space-lg);">
      <div class="report-card__header">
        <span class="report-card__title">📊 今日概览</span>
        <span class="report-card__period">${AppState.today}</span>
      </div>
      <div class="report-stat">
        <div class="report-stat__item">
          <div class="report-stat__value">${Object.values(AppState.todayCheckins).filter((c) => c.completed).length}</div>
          <div class="report-stat__label">已完成</div>
        </div>
        <div class="report-stat__item">
          <div class="report-stat__value">${AppState.habits.filter((h) => h.status === 'active').length}</div>
          <div class="report-stat__label">活跃习惯</div>
        </div>
        <div class="report-stat__item">
          <div class="report-stat__value">${calculateStreakDays()}</div>
          <div class="report-stat__label">连续天数</div>
        </div>
      </div>
    </div>

    <div class="settings-group__title">📅 周报</div>
    ${weeklyReports.length === 0 ? '<div class="empty-state"><div class="empty-state__text">暂无周报</div></div>'
      : weeklyReports.slice(0, 4).map((r) => renderReportCard(r)).join('')}

    <div class="settings-group__title">📆 月报</div>
    ${monthlyReports.length === 0 ? '<div class="empty-state"><div class="empty-state__text">暂无月报</div></div>'
      : monthlyReports.slice(0, 4).map((r) => renderReportCard(r)).join('')}

    <div class="settings-group__title">🗓 年报</div>
    ${annualReports.length === 0 ? '<div class="empty-state"><div class="empty-state__text">暂无年报</div></div>'
      : annualReports.map((r) => renderReportCard(r)).join('')}

    <div style="height:var(--space-xxl);"></div>
  `;
}

function renderReportCard(report) {
  const typeLabels = { weekly: '周报', monthly: '月报', annual: '年报' };
  const rate = Math.round(report.completionRate * 100);
  return `
    <div class="report-card">
      <div class="report-card__header">
        <span class="report-card__title">${typeLabels[report.type]}</span>
        <span class="report-card__period">${report.period}</span>
      </div>
      <div style="font-size:36px;font-weight:700;color:var(--color-primary);">${rate}%</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
        完成 ${report.totalCompletions}/${report.totalTarget} · 最佳连续 ${report.bestStreak} 天
      </div>
    </div>
  `;
}

// ==================== 设置页渲染 ====================

function renderSettingsPage() {
  const page = document.getElementById('page-settings');
  if (!page) return;

  const config = reminderService.channelConfig;

  page.innerHTML = `
    <div class="section-header" style="padding: 0 0 var(--space-md) 0;">
      <span class="section-header__title">设置</span>
    </div>

    ${renderAccountCard()}
    ${renderLoginEntry()}
    ${renderSyncStatus()}

    <div class="settings-group">
      <div class="settings-group__title">提醒渠道</div>

      <div class="settings-item" id="setting-browser-reminder">
        <span class="settings-item__label">🔔 浏览器通知</span>
        <span class="settings-item__value ${config.browser.enabled ? 'settings-item__value--on' : ''}">
          ${config.browser.enabled ? '已开启' : '点击开启 →'}
        </span>
      </div>

      <div class="settings-item" id="setting-wechat-reminder">
        <span class="settings-item__label">💬 微信订阅消息</span>
        <span class="settings-item__value ${config.wechat.enabled ? 'settings-item__value--on' : ''}">
          ${config.wechat.enabled ? '已配置' : '配置 →'}
        </span>
      </div>

      <div class="settings-item" id="setting-webhook-reminder">
        <span class="settings-item__label">🔗 Webhook通知（元宝等）</span>
        <span class="settings-item__value ${config.webhook.enabled ? 'settings-item__value--on' : ''}">
          ${config.webhook.enabled ? '已配置' : '配置 →'}
        </span>
      </div>
    </div>

    ${renderUpcomingReminders()}

    <div class="settings-group">
      <div class="settings-group__title">数据管理</div>
      <div class="settings-item" id="setting-export">
        <span class="settings-item__label">📤 导出数据</span>
        <span class="settings-item__value">JSON →</span>
      </div>
      <div class="settings-item" id="setting-email-export">
        <span class="settings-item__label">✉️ 邮件发送备份</span>
        <span class="settings-item__value" id="email-export-status">一键发送 →</span>
      </div>
      <div class="settings-item" id="setting-import">
        <span class="settings-item__label">📥 导入数据</span>
        <span class="settings-item__value">选择文件 →</span>
      </div>
      <div class="settings-item" id="setting-reset">
        <span class="settings-item__label" style="color:var(--color-danger);">⚠️ 重置所有数据</span>
        <span class="settings-item__value"></span>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group__title">提醒说明</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;padding:var(--space-sm) 0;">
        • 每个习惯可单独设置提醒时间<br>
        • 在「管理」页面编辑习惯即可修改提醒<br>
        • 已完成打卡的习惯不会重复提醒<br>
        • 微信提醒需配置服务号 AppID<br>
        • 浏览器通知首次使用需授权
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group__title">关于</div>
      <div class="settings-item">
        <span class="settings-item__label">版本</span>
        <span class="settings-item__value">V2.0</span>
      </div>
      <div class="settings-item">
        <span class="settings-item__label">口号</span>
        <span class="settings-item__value">不积跬步，无以至千里</span>
      </div>
    </div>

    <div style="height:var(--space-xxl);"></div>
  `;

  bindSettingsEvents();

  // 异步更新同步状态
  updateSyncStatusUI().catch(() => {});
}

/**
 * 渲染即将到来的提醒列表
 */
function renderUpcomingReminders() {
  const upcoming = reminderService.getUpcomingReminders();
  if (upcoming.length === 0) return '';

  return `
    <div class="settings-group">
      <div class="settings-group__title">⏰ 今日待提醒</div>
      ${upcoming.slice(0, 5).map((u) => `
        <div class="settings-item" style="cursor:default;">
          <span class="settings-item__label">${u.habit.icon} ${u.habit.name}</span>
          <span class="settings-item__value">${u.time}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function bindSettingsEvents() {
  // 手动同步按钮
  document.getElementById('setting-sync-now')?.addEventListener('click', async () => {
    const btn = document.getElementById('sync-status-text');
    if (btn) btn.textContent = '同步中...';
    try {
      const result = await authService.syncNow();
      if (result.success) {
        showToast(`☁️ 同步完成: 推送 ${result.pushed} 条`, 'success');
      } else {
        showToast(`⚠️ 同步部分失败: ${result.failed} 条`, 'error');
      }
    } catch (e) {
      showToast('同步失败: ' + e.message, 'error');
    }
    await updateSyncStatusUI();
  });

  // 邮件发送备份
  document.getElementById('setting-email-export')?.addEventListener('click', async () => {
    const status = document.getElementById('email-export-status');
    if (status) status.textContent = '准备中...';
    try {
      const data = await exportAllData();
      const json = JSON.stringify(data);
      const date = formatDate();
      const subject = `日积跬步数据备份 ${date}`;
      const body = `这是我的日积跬步数据备份，请妥善保存。\n\n${json}`;

      // Android APK 环境：调用原生桥接发送邮件附件
      if (typeof HabitTrackerAndroid !== 'undefined' && HabitTrackerAndroid.isAndroidApp && HabitTrackerAndroid.isAndroidApp()) {
        HabitTrackerAndroid.exportDataViaEmail(json, date);
        showToast('✉️ 已打开邮件客户端', 'success');
      } else {
        // 浏览器环境：mailto 回退
        const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
        showToast('✉️ 请手动发送邮件', 'info');
      }
    } catch (e) {
      showToast('导出失败: ' + e.message, 'error');
    }
    if (status) status.textContent = '一键发送 →';
  });

  // 登录入口
  document.getElementById('setting-login')?.addEventListener('click', () => {
    AppState.currentPage = 'home';
    navigateTo('home');
  });

  // 退出登录
  document.getElementById('setting-logout')?.addEventListener('click', async () => {
    showConfirmModal('退出登录', '退出后本地数据不会丢失，但云端同步将暂停。确定退出吗？', async () => {
      await authService.logout();
      AppState.currentPage = 'home';
      navigateTo('home');
    });
  });

  // 浏览器通知开关
  document.getElementById('setting-browser-reminder')?.addEventListener('click', async () => {
    const enabled = !reminderService.channelConfig.browser.enabled;
    await reminderService.setChannelConfig('browser', enabled);
    showToast(enabled ? '🔔 浏览器通知已开启' : '浏览器通知已关闭', enabled ? 'success' : '');
    renderSettingsPage();
  });

  // 微信提醒配置
  document.getElementById('setting-wechat-reminder')?.addEventListener('click', () => {
    showWechatConfigModal();
  });

  // Webhook配置
  document.getElementById('setting-webhook-reminder')?.addEventListener('click', () => {
    showWebhookConfigModal();
  });

  // 数据导出
  document.getElementById('setting-export')?.addEventListener('click', async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habit-tracker-backup-${AppState.today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据导出成功', 'success');
  });

  document.getElementById('setting-import')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await importAllData(data);
        await loadHabits();
        await loadTodayCheckins();
        showToast('数据导入成功，页面将刷新', 'success');
        setTimeout(() => location.reload(), 1500);
      } catch (err) {
        showToast('导入失败，请检查文件格式', 'error');
      }
    };
    input.click();
  });

  document.getElementById('setting-reset')?.addEventListener('click', () => {
    showConfirmModal('重置所有数据？', '此操作不可恢复，所有习惯和打卡记录将被删除。', async () => {
      const db = await openDB();
      for (const storeName of db.objectStoreNames) {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        await new Promise((resolve) => { tx.oncomplete = resolve; });
      }
      db.close();
      location.reload();
    });
  });
}

// ==================== Modal 弹窗 ====================

function showAddHabitModal() {
  showModal(`
    <div class="modal__title">新增习惯</div>
    <div class="form-group">
      <label class="form-label">习惯名称</label>
      <input class="form-input" id="modal-habit-name" placeholder="输入习惯名称" maxlength="20">
    </div>
    <div class="form-group">
      <label class="form-label">类型</label>
      <select class="form-select" id="modal-habit-type">
        <option value="boolean">完成/未完成（打卡）</option>
        <option value="count">按次数（如100次）</option>
        <option value="duration">按时长（如15分钟）</option>
      </select>
    </div>
    <div class="form-row" id="modal-habit-value-row" style="display:none;">
      <div class="form-group">
        <label class="form-label">数值</label>
        <input class="form-input" id="modal-habit-value" type="number" min="1" value="1">
      </div>
      <div class="form-group" id="modal-habit-unit-group">
        <label class="form-label">单位</label>
        <select class="form-select" id="modal-habit-unit">
          <option value="次">次</option>
          <option value="分钟">分钟</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">图标（Emoji）</label>
      <input class="form-input" id="modal-habit-icon" placeholder="选择一个图标" maxlength="4" value="📌">
    </div>
    <div class="form-group">
      <label class="form-label">提醒时间</label>
      <input class="form-input" id="modal-habit-reminder" type="time" value="07:00">
    </div>
    <div class="form-group">
      <label class="form-label">年度目标类型</label>
      <select class="form-select" id="modal-habit-target-type">
        <option value="days">按打卡天数</option>
        <option value="count">按完成次数</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">年度目标值</label>
      <input class="form-input" id="modal-habit-target" type="number" min="1" value="300">
    </div>
    <button class="btn btn--primary" id="btn-save-habit">保存习惯</button>
  `);

  const typeSelect = document.getElementById('modal-habit-type');
  const valueRow = document.getElementById('modal-habit-value-row');
  const unitGroup = document.getElementById('modal-habit-unit-group');

  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'boolean') {
      valueRow.style.display = 'none';
    } else {
      valueRow.style.display = 'flex';
      if (typeSelect.value === 'count') {
        unitGroup.querySelector('select').value = '次';
      } else {
        unitGroup.querySelector('select').value = '分钟';
      }
    }
  });

  document.getElementById('btn-save-habit').addEventListener('click', async () => {
    const name = document.getElementById('modal-habit-name').value.trim();
    if (!name) { showToast('请输入习惯名称', 'error'); return; }

    const type = document.getElementById('modal-habit-type').value;
    const value = parseInt(document.getElementById('modal-habit-value').value) || 1;
    const unit = document.getElementById('modal-habit-unit').value;
    const icon = document.getElementById('modal-habit-icon').value || '📌';
    const reminder = document.getElementById('modal-habit-reminder').value;
    const targetType = document.getElementById('modal-habit-target-type').value;
    const targetValue = parseInt(document.getElementById('modal-habit-target').value) || 300;

    const habit = {
      name, category: 'custom', type,
      defaultCount: type === 'count' ? value : 0,
      defaultDuration: type === 'duration' ? value : 0,
      durationTimes: 1,
      reminderTimes: reminder ? [reminder] : [],
      status: 'active',
      annualTarget: { enabled: true, type: targetType, target: targetValue },
      color: getRandomColor(), icon,
      order: AppState.habits.length,
    };

    await saveHabit(habit);
    await loadHabits();
    await loadTodayCheckins();
    closeModal();
    showToast(`✅ 已添加「${name}」`);
    renderManagePage();
  });
}

function showEditHabitModal(habitId) {
  const habit = AppState.habits.find((h) => h.id === habitId);
  if (!habit) return;

  showModal(`
    <div class="modal__title">编辑习惯</div>
    <div class="form-group">
      <label class="form-label">名称</label>
      <input class="form-input" id="modal-edit-name" value="${habit.name}" maxlength="20">
    </div>
    <div class="form-group">
      <label class="form-label">图标</label>
      <input class="form-input" id="modal-edit-icon" value="${habit.icon}" maxlength="4">
    </div>
    ${habit.type !== 'boolean' ? `
      <div class="form-group">
        <label class="form-label">${habit.type === 'count' ? '次数' : '时长（分钟）'}</label>
        <input class="form-input" id="modal-edit-value" type="number" min="1"
               value="${habit.type === 'count' ? habit.defaultCount : habit.defaultDuration}">
      </div>
    ` : ''}
    <div class="form-group">
      <label class="form-label">提醒时间</label>
      <input class="form-input" id="modal-edit-reminder" type="time"
             value="${habit.reminderTimes[0] || ''}">
    </div>
    <div class="form-group">
      <label class="form-label">年度目标类型</label>
      <select class="form-select" id="modal-edit-target-type">
        <option value="days" ${habit.annualTarget.type === 'days' ? 'selected' : ''}>按打卡天数</option>
        <option value="count" ${habit.annualTarget.type === 'count' ? 'selected' : ''}>按完成次数</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">年度目标值</label>
      <input class="form-input" id="modal-edit-target" type="number" min="1" value="${habit.annualTarget.target}">
    </div>
    <button class="btn btn--primary" id="btn-update-habit">保存修改</button>
  `);

  document.getElementById('btn-update-habit').addEventListener('click', async () => {
    habit.name = document.getElementById('modal-edit-name').value.trim() || habit.name;
    habit.icon = document.getElementById('modal-edit-icon').value || habit.icon;
    if (habit.type !== 'boolean') {
      const value = parseInt(document.getElementById('modal-edit-value').value) || 1;
      if (habit.type === 'count') habit.defaultCount = value;
      else habit.defaultDuration = value;
    }
    const reminder = document.getElementById('modal-edit-reminder').value;
    habit.reminderTimes = reminder ? [reminder] : [];
    habit.annualTarget.type = document.getElementById('modal-edit-target-type').value;
    habit.annualTarget.target = parseInt(document.getElementById('modal-edit-target').value) || 300;

    await saveHabit(habit);
    await loadHabits();
    closeModal();
    showToast(`✅ 已更新「${habit.name}」`);
    renderManagePage();
  });
}

async function showHabitDetailModal(habitId) {
  const habit = AppState.habits.find((h) => h.id === habitId);
  if (!habit) return;

  const checkins = await getCheckinsByHabit(habitId);
  const completedCount = checkins.filter((c) => c.completed).length;
  const totalDays = checkins.length;
  const rate = totalDays > 0 ? Math.round((completedCount / totalDays) * 100) : 0;

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearCheckins = checkins.filter((c) => c.date >= yearStart && c.date <= AppState.today);

  let annualProgress = 0;
  if (habit.annualTarget.enabled && habit.annualTarget.target > 0) {
    if (habit.annualTarget.type === 'days') {
      annualProgress = yearCheckins.filter((c) => c.completed).length;
    } else {
      annualProgress = yearCheckins.reduce((sum, c) => sum + (c.actualValue || 0), 0);
    }
  }
  const annualPercent = Math.round((annualProgress / Math.max(habit.annualTarget.target, 1)) * 100);

  showModal(`
    <div class="modal__title">${habit.icon} ${habit.name}</div>
    <div class="report-stat" style="padding: var(--space-sm) 0;">
      <div class="report-stat__item">
        <div class="report-stat__value">${rate}%</div>
        <div class="report-stat__label">总完成率</div>
      </div>
      <div class="report-stat__item">
        <div class="report-stat__value">${completedCount}</div>
        <div class="report-stat__label">完成天数</div>
      </div>
      <div class="report-stat__item">
        <div class="report-stat__value">${totalDays}</div>
        <div class="report-stat__label">总记录</div>
      </div>
    </div>
    ${habit.annualTarget.enabled ? `
      <div class="annual-goal-section">
        <div class="annual-goal__header">
          <span style="font-weight:600;">🎯 年度目标</span>
          <span style="font-size:12px;color:var(--text-muted);">${habit.annualTarget.type === 'days' ? '按天数' : '按次数'}</span>
        </div>
        <div class="annual-goal__progress-ring">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-primary)" stroke-width="8"
                    stroke-linecap="round"
                    stroke-dasharray="${2 * Math.PI * 52}"
                    stroke-dashoffset="${2 * Math.PI * 52 * (1 - Math.min(annualPercent, 100) / 100)}"
                    transform="rotate(-90 60 60)"/>
          </svg>
          <div class="annual-goal__center">
            <div class="annual-goal__percentage">${annualPercent}%</div>
            <div class="annual-goal__current">${annualProgress}/${habit.annualTarget.target}</div>
          </div>
        </div>
      </div>
    ` : ''}
    <div style="margin-top:var(--space-md);">
      <div class="settings-group__title">配置信息</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:2;">
        类型：${habit.type === 'count' ? '按次数' : habit.type === 'duration' ? '按时长' : '打卡'} ·
        ${getHabitDisplayInfo(habit)}
      </div>
      ${habit.reminderTimes.length > 0 ? `<div style="font-size:13px;color:var(--text-secondary);">提醒：⏰ ${habit.reminderTimes.join(', ')}</div>` : ''}
    </div>
    <button class="btn btn--secondary" style="margin-top:var(--space-lg);width:100%;" id="btn-edit-from-detail">✏️ 编辑习惯</button>
  `);

  document.getElementById('btn-edit-from-detail')?.addEventListener('click', () => {
    closeModal();
    showEditHabitModal(habitId);
  });
}

function showConfirmModal(title, message, onConfirm) {
  showModal(`
    <div class="modal__title">${title}</div>
    <p style="color:var(--text-secondary);font-size:14px;margin-bottom:var(--space-lg);">${message}</p>
    <div style="display:flex;gap:var(--space-sm);">
      <button class="btn btn--secondary" style="flex:1;" id="btn-cancel">取消</button>
      <button class="btn btn--danger" style="flex:1;" id="btn-confirm">确认</button>
    </div>
  `, true);

  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-confirm').addEventListener('click', onConfirm);
}

function showModal(content, centered = false) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  const modalContent = document.createElement('div');
  modalContent.className = `modal-content ${centered ? 'modal-content--center' : ''}`;
  modalContent.innerHTML = `<button class="modal__close" id="btn-close-modal">✕</button>${content}`;
  overlay.appendChild(modalContent);
  document.body.appendChild(overlay);

  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.remove();
}

// ==================== 工具函数 ====================

function getWeekdayText() {
  const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return days[new Date().getDay()];
}

function formatDateChinese() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

function calculateStreakDays() {
  const activeHabits = AppState.habits.filter((h) => h.status === 'active');
  if (activeHabits.length === 0) return 0;

  let streak = 0;
  const today = new Date();

  while (true) {
    const d = new Date(today);
    d.setDate(d.getDate() - streak);
    const dateStr = formatDate(d);

    if (streak === 0) {
      const completed = Object.values(AppState.todayCheckins).filter((c) => c.completed).length;
      if (completed > 0) streak++;
      else break;
    } else {
      const stats = AppState.weekStats[dateStr];
      if (!stats && dateStr < AppState.weekStart) break;
      if (stats && stats.total > 0 && stats.completed > 0) streak++;
      else if (!stats) streak++;
      else break;
    }
    if (streak > 365) break;
  }
  return streak;
}

function getRandomEncouragement() {
  return ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
}

function getRandomColor() {
  const colors = ['#F59E0B', '#60A5FA', '#4ADE80', '#A78BFA', '#FB923C',
                   '#818CF8', '#C084FC', '#6EE7B7', '#F472B6', '#FBBF24'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ==================== 登录模块渲染 ====================

/**
 * 渲染登录页面
 * 支持微信扫码登录 + 手机号验证码登录
 */
function renderLoginPage() {
  return `
    <div class="login-page">
      <!-- Logo & 标题 -->
      <div class="login-header">
        <div class="login-logo">🌱</div>
        <h1 class="login-title">日积跬步</h1>
        <p class="login-subtitle">不积跬步，无以至千里</p>
      </div>

      <!-- 登录方式选择 -->
      <div class="login-methods">
        <!-- 微信扫码登录 -->
        <div class="login-card" id="login-wechat">
          <div class="login-card__icon">💬</div>
          <div class="login-card__title">微信登录</div>
          <div class="login-card__desc">使用微信扫码，安全快捷</div>
          <div class="login-card__arrow">→</div>
        </div>

        <!-- 手机号登录 -->
        <div class="login-card" id="login-phone">
          <div class="login-card__icon">📱</div>
          <div class="login-card__title">手机号登录</div>
          <div class="login-card__desc">验证码登录，无需注册</div>
          <div class="login-card__arrow">→</div>
        </div>
      </div>

      <!-- 未登录也可试用 -->
      <div class="login-skip" id="login-skip">
        <span>跳过登录，先体验</span>
      </div>

      <!-- 协议提示 -->
      <p class="login-agreement">
        登录即表示同意
        <span class="login-agreement__link">《用户协议》</span>和
        <span class="login-agreement__link">《隐私政策》</span>
      </p>
    </div>
  `;
}

/**
 * 渲染微信扫码登录弹窗
 * @param {string} qrcodeUrl 二维码图片URL（Mock模式为空字符串）
 * @param {boolean} loading 是否正在加载二维码
 */
function renderWechatQRModal(qrcodeUrl, loading = true) {
  const qrContent = loading
    ? `<div class="wechat-qr__loading">
        <div class="wechat-qr__spinner"></div>
        <p>正在生成二维码...</p>
      </div>`
    : qrcodeUrl
      ? `<img class="wechat-qr__image" src="${qrcodeUrl}" alt="微信扫码登录二维码" />`
      : `<div class="wechat-qr__mock">
          <div class="wechat-qr__mock-icon">📱</div>
          <div class="wechat-qr__mock-badge">微信</div>
          <div class="wechat-qr__mock-hint">开发模式<br/>点击「模拟扫码」登录</div>
        </div>`;

  return `
    <div class="modal-overlay" id="modal-wechat-qr">
      <div class="modal-content wechat-modal">
        <div class="modal-header">
          <span class="modal-header__title">微信扫码登录</span>
          <button class="modal-btn-close" id="btn-close-qr">✕</button>
        </div>
        <div class="wechat-qr__body">
          <div class="wechat-qr__container">
            ${qrContent}
          </div>
          <p class="wechat-qr__tip">请使用微信扫描二维码</p>
          ${!qrcodeUrl && !loading ? `
            <button class="btn btn-primary btn-block" id="btn-mock-wechat-scan" style="margin-top:16px;">
              模拟扫码登录
            </button>
          ` : ''}
        </div>
        <div class="wechat-qr__footer">
          <button class="btn btn-ghost" id="btn-back-to-login">← 返回其他登录方式</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染手机号登录面板
 */
function renderPhoneLoginPanel() {
  return `
    <div class="modal-overlay" id="modal-phone-login">
      <div class="modal-content phone-modal">
        <div class="modal-header">
          <span class="modal-header__title">手机号登录</span>
          <button class="modal-btn-close" id="btn-close-phone">✕</button>
        </div>
        <div class="phone-login__body">
          <!-- 手机号输入 -->
          <div class="phone-login__field">
            <label class="phone-login__label">手机号码</label>
            <div class="phone-login__input-group">
              <span class="phone-login__prefix">+86</span>
              <input type="tel" class="phone-login__input" id="input-phone"
                     placeholder="请输入手机号" maxlength="11" />
            </div>
          </div>

          <!-- 验证码输入 -->
          <div class="phone-login__field">
            <label class="phone-login__label">验证码</label>
            <div class="phone-login__input-group">
              <input type="text" class="phone-login__input" id="input-sms-code"
                     placeholder="请输入验证码" maxlength="6" />
              <button class="phone-login__sms-btn" id="btn-send-sms">
                获取验证码
              </button>
            </div>
          </div>

          <!-- 错误提示 -->
          <div class="phone-login__error" id="phone-error" style="display:none;"></div>

          <!-- 提交按钮 -->
          <button class="btn btn-primary btn-block" id="btn-phone-login-submit" style="margin-top:24px;">
            登录
          </button>

          <!-- Mock模式提示 -->
          <p class="phone-login__mock-hint">
            💡 开发模式：输入任意手机号 + 6位验证码即可登录
          </p>
        </div>
        <div class="wechat-qr__footer">
          <button class="btn btn-ghost" id="btn-back-from-phone">← 返回其他登录方式</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染账号信息卡片（设置页中显示）
 */
function renderAccountCard() {
  if (!authService.isLoggedIn()) return '';

  const profile = authService.getProfile();
  const providerLabel = profile.provider === 'wechat' ? '微信' : '手机号';
  const providerIcon = profile.provider === 'wechat' ? '💬' : '📱';

  return `
    <div class="settings-group">
      <div class="settings-group__title">账号信息</div>
      <div class="account-card">
        <div class="account-card__header">
          <div class="account-card__avatar">
            ${profile.avatar
              ? `<img src="${profile.avatar}" alt="头像" />`
              : `<span>${profile.name.charAt(0)}</span>`
            }
          </div>
          <div class="account-card__info">
            <div class="account-card__name">${profile.name}</div>
            <div class="account-card__meta">
              <span>${providerIcon} ${providerLabel}登录</span>
              ${profile.phone ? `<span>· ${profile.phone}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="settings-group">
      <div class="settings-item settings-item--danger" id="setting-logout">
        <span class="settings-item__label">退出登录</span>
        <span class="settings-item__value">→</span>
      </div>
    </div>
  `;
}

/**
 * 渲染设置页的登录入口（未登录时显示）
 */
function renderLoginEntry() {
  if (authService.isLoggedIn()) return '';
  return `
    <div class="settings-group">
      <div class="settings-group__title">账号</div>
      <div class="settings-item" id="setting-login">
        <span class="settings-item__label">🔐 登录 / 注册</span>
        <span class="settings-item__value">同步数据 →</span>
      </div>
    </div>
  `;
}

/**
 * 渲染同步状态卡片（设置页中显示）
 */
function renderSyncStatus() {
  if (!authService.isLoggedIn()) return '';

  // 同步状态在渲染时动态更新
  return `
    <div class="settings-group" id="sync-status-group">
      <div class="settings-group__title">☁️ 数据同步</div>
      <div class="settings-item" id="setting-sync-now">
        <span class="settings-item__label">🔄 立即同步</span>
        <span class="settings-item__value" id="sync-status-text">检查中...</span>
      </div>
      <div class="settings-item" style="cursor:default;">
        <span class="settings-item__label">上次同步</span>
        <span class="settings-item__value" id="sync-last-time" style="font-size:12px;">-</span>
      </div>
      <div class="settings-item" style="cursor:default;">
        <span class="settings-item__label">自动同步</span>
        <span class="settings-item__value settings-item__value--on">每5分钟</span>
      </div>
    </div>
  `;
}

/**
 * 更新同步状态显示
 */
async function updateSyncStatusUI() {
  const statusText = document.getElementById('sync-status-text');
  const lastTime = document.getElementById('sync-last-time');
  if (!statusText && !lastTime) return;

  try {
    const status = await authService.getSyncStatus();
    if (statusText) {
      if (status.status === 'not_logged_in') {
        statusText.textContent = '未登录';
      } else if (status.syncInProgress) {
        statusText.textContent = '同步中...';
      } else if (status.totalUnsynced > 0) {
        statusText.textContent = `${status.totalUnsynced} 条待同步`;
        statusText.style.color = 'var(--color-warning)';
      } else {
        statusText.textContent = '✅ 已同步';
        statusText.style.color = 'var(--color-success)';
      }
    }
    if (lastTime && status.lastSyncTime) {
      const d = new Date(status.lastSyncTime);
      lastTime.textContent = d.toLocaleString('zh-CN');
    }
  } catch (e) {
    if (statusText) statusText.textContent = '未知';
  }
}

/**
 * 绑定登录页面事件
 */
function bindLoginEvents() {
  const loginPage = document.getElementById('page-home');
  if (!loginPage) return;

  // 微信扫码登录入口
  const wechatBtn = document.getElementById('login-wechat');
  if (wechatBtn) {
    wechatBtn.addEventListener('click', function () {
      showWechatQRModal();
    });
  }

  // 手机号登录入口
  const phoneBtn = document.getElementById('login-phone');
  if (phoneBtn) {
    phoneBtn.addEventListener('click', function () {
      showPhoneLoginModal();
    });
  }

  // 跳过登录
  const skipBtn = document.getElementById('login-skip');
  if (skipBtn) {
    skipBtn.addEventListener('click', function () {
      document.getElementById('page-home').innerHTML = '';
      renderCurrentPage();
    });
  }
}

/**
 * 显示微信扫码弹窗
 */
async function showWechatQRModal() {
  const app = document.getElementById('app');
  if (!app) return;

  // 插入弹窗HTML
  const modalContainer = document.createElement('div');
  modalContainer.id = 'modal-container';
  modalContainer.innerHTML = renderWechatQRModal('', true);
  app.appendChild(modalContainer);

  // 绑定关闭按钮
  document.getElementById('btn-close-qr')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-back-to-login')?.addEventListener('click', closeAllModals);

  // 发起微信登录（获取二维码URL）
  const result = await authService.loginWithWechat();

  // 更新弹窗内容
  if (result.success) {
    // 登录成功，onAuthChange 会处理后续流程
    closeAllModals();
  } else if (result.qrcodeUrl) {
    // 显示真实二维码
    modalContainer.innerHTML = renderWechatQRModal(result.qrcodeUrl, false);
    document.getElementById('btn-close-qr')?.addEventListener('click', closeAllModals);
    document.getElementById('btn-back-to-login')?.addEventListener('click', closeAllModals);
  } else {
    // Mock模式：显示模拟二维码 + 模拟扫码按钮
    modalContainer.innerHTML = renderWechatQRModal('', false);
    document.getElementById('btn-close-qr')?.addEventListener('click', closeAllModals);
    document.getElementById('btn-back-to-login')?.addEventListener('click', closeAllModals);
    document.getElementById('btn-mock-wechat-scan')?.addEventListener('click', async function () {
      const btn = document.getElementById('btn-mock-wechat-scan');
      if (btn) {
        btn.textContent = '正在登录...';
        btn.disabled = true;
      }
      await authService._wechatLoginMock();
      closeAllModals();
      // onAuthChange 会处理后续流程
    });
  }
}

/**
 * 显示手机号登录面板
 */
function showPhoneLoginModal() {
  const app = document.getElementById('app');
  if (!app) return;

  const modalContainer = document.createElement('div');
  modalContainer.id = 'modal-container';
  modalContainer.innerHTML = renderPhoneLoginPanel();
  app.appendChild(modalContainer);

  // 绑定事件
  document.getElementById('btn-close-phone')?.addEventListener('click', closeAllModals);
  document.getElementById('btn-back-from-phone')?.addEventListener('click', closeAllModals);

  // 发送验证码
  document.getElementById('btn-send-sms')?.addEventListener('click', async function () {
    const phone = document.getElementById('input-phone')?.value || '';
    const btn = document.getElementById('btn-send-sms');
    const errorEl = document.getElementById('phone-error');

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      if (errorEl) { errorEl.textContent = '请输入有效的手机号'; errorEl.style.display = 'block'; }
      return;
    }

    const result = await authService.sendPhoneCode(phone);
    if (result.success) {
      if (errorEl) { errorEl.style.display = 'none'; }
      // 倒计时60秒
      let countdown = 60;
      btn.disabled = true;
      btn.textContent = countdown + 's后重发';
      const timer = setInterval(function () {
        countdown--;
        if (countdown <= 0) {
          clearInterval(timer);
          btn.disabled = false;
          btn.textContent = '获取验证码';
        } else {
          btn.textContent = countdown + 's后重发';
        }
      }, 1000);
    } else {
      if (errorEl) { errorEl.textContent = result.message; errorEl.style.display = 'block'; }
    }
  });

  // 提交登录
  document.getElementById('btn-phone-login-submit')?.addEventListener('click', async function () {
    const phone = document.getElementById('input-phone')?.value || '';
    const code = document.getElementById('input-sms-code')?.value || '';
    const errorEl = document.getElementById('phone-error');
    const btn = document.getElementById('btn-phone-login-submit');

    if (!phone || !code) {
      if (errorEl) { errorEl.textContent = '请输入手机号和验证码'; errorEl.style.display = 'block'; }
      return;
    }

    btn.disabled = true;
    btn.textContent = '登录中...';

    const result = await authService.loginWithPhone(phone, code);
    if (result.success) {
      closeAllModals();
      // onAuthChange 会在数据加载完成后自动触发 renderCurrentPage()
    } else {
      btn.disabled = false;
      btn.textContent = '登录';
      if (errorEl) { errorEl.textContent = result.message; errorEl.style.display = 'block'; }
    }
  });
}

/**
 * 关闭所有模态弹窗
 */
function closeAllModals() {
  const container = document.getElementById('modal-container');
  if (container) container.remove();

  // 也关闭内嵌的 modal-overlay
  document.querySelectorAll('.modal-overlay').forEach(function (el) {
    el.remove();
  });
}

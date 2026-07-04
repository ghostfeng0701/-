/**
 * 日积跬步 - 主应用入口
 * 管理应用状态、页面路由、核心业务流程
 *
 * 版本: V2.0
 * 日期: 2025-07-16
 */

// ==================== 应用状态 ====================

/** @type {Object} 应用全局状态 */
const AppState = {
  /** @type {Array} 所有习惯 */
  habits: [],
  /** @type {Object} 今日打卡状态 { habitId: CheckIn } */
  todayCheckins: {},
  /** @type {Object} 当前查看日期的打卡状态 */
  viewCheckins: {},
  /** @type {Object} 本周打卡统计 */
  weekStats: {},
  /** @type {string} 当前页面 */
  currentPage: 'home',
  /** @type {string} 今天日期 YYYY-MM-DD */
  today: formatDate(),
  /** @type {string} 当前查看日期 YYYY-MM-DD */
  viewDate: formatDate(),
  /** @type {string} 本周一日期 */
  weekStart: '',
  /** @type {string} 本周日日期 */
  weekEnd: '',
};

// ==================== 初始化 ====================

/** 防止 initApp 并发执行 */
let _isInitRunning = false;

/**
 * 应用入口：初始化数据并渲染首页
 */
async function initApp() {
  if (_isInitRunning) {
    console.log('[日积跬步] initApp 已在执行中，跳过重复调用');
    return;
  }
  _isInitRunning = true;

  try {
    // ========== 步骤0: 初始化认证服务 ==========
    await authService.init({
      supabaseUrl: '',
      supabaseKey: '',
      wechatAppId: '',
      wechatRedirectUri: '',
      onAuthChange: function (event) {
        if (event.type === 'login') {
          console.log('[日积跬步] 用户登录:', event.user?.id);
          // 先关闭所有弹窗
          if (typeof closeAllModals === 'function') closeAllModals();
          // 加载数据 + 启动同步 + 渲染
          authService.pullFromCloud().then(() => {
            return initAppData();
          }).then(() => {
            authService.startAutoSync();
            setupEventListeners();
            updateBottomNav();
            renderCurrentPage();
          }).catch(e => {
            console.warn('[日积跬步] 登录后同步失败:', e);
            renderCurrentPage();
          });
        } else if (event.type === 'logout') {
          console.log('[日积跬步] 用户登出');
          authService.stopAutoSync();
          // 清空当前数据
          AppState.habits = [];
          AppState.todayCheckins = {};
          AppState.viewCheckins = {};
          AppState.weekStats = {};
          renderCurrentPage();
        }
      },
    });

    // 未登录时显示登录页
    if (!authService.isLoggedIn()) {
      renderLoginCheckpoint();
      _isInitRunning = false;
      return;
    }

    // 初始化查看日期
    AppState.viewDate = AppState.today;

    // 计算本周范围
    computeWeekRange();

    // 加载数据
    await loadHabits().catch((e) => {
      console.error('[日积跬步] 加载习惯失败:', e);
      return [];
    });

    // 清理重复习惯（如果之前版本产生过重复）
    await deduplicateHabits().catch((e) => {
      console.error('[日积跬步] 去重失败:', e);
    });

    await loadTodayCheckins().catch((e) => {
      console.error('[日积跬步] 加载打卡记录失败:', e);
      return {};
    });
    await loadWeekStats().catch((e) => {
      console.error('[日积跬步] 加载周统计失败:', e);
      return {};
    });

    // 设置当前查看的打卡数据
    AppState.viewCheckins = AppState.todayCheckins;

    // 首次使用：初始化默认习惯（严格检查是否已存在）
    const hasDefaults = await _hasDefaultHabits();
    if (AppState.habits.length === 0 && !hasDefaults) {
      await initDefaultHabits().catch((e) => {
        console.error('[日积跬步] 初始化默认习惯失败:', e);
      });
      // 重新加载习惯数据（initDefaultHabits只写DB，不更新AppState）
      await loadHabits();
      await loadTodayCheckins();
      AppState.viewCheckins = AppState.todayCheckins;
    }

    // 检查并处理跨日未完成
    await processMissedCheckins().catch((e) => {
      console.error('[日积跬步] 处理跨日数据失败:', e);
    });

    // 检查并生成报表
    await checkAndGenerateReports().catch((e) => {
      console.error('[日积跬步] 生成报表失败:', e);
    });

    console.log('[日积跬步] 数据加载完成，准备渲染', {
      habits: AppState.habits.length,
      todayCheckins: Object.keys(AppState.todayCheckins).length,
      today: AppState.today,
    });

    // 渲染页面
    await renderCurrentPage();
    updateBottomNav();

    // 设置事件监听
    setupEventListeners();

    // 启动提醒服务
    reminderService.init().catch((e) => {
      console.error('[日积跬步] 提醒服务启动失败:', e);
    });

    // 设置定时器：每分钟检查是否跨日
    setupMidnightChecker();

    // 启动自动同步（已登录用户）
    authService.startAutoSync();

    console.log('[日积跬步] 初始化完成 ✅');
  } catch (error) {
    console.error('[日积跬步] 初始化失败:', error);
    // 即使失败也尝试渲染空状态
    try {
      renderFallbackHome();
    } catch (e) {
      console.error('Fallback render failed:', e);
    }
  } finally {
    _isInitRunning = false;
  }
}

/**
 * 登录检查点：未登录时显示登录页面
 */
function renderLoginCheckpoint() {
  const page = document.getElementById('page-home');
  if (!page) return;
  page.innerHTML = renderLoginPage();
  bindLoginEvents();
}

/**
 * 降级渲染：当数据加载失败时显示基本界面
 */
function renderFallbackHome() {
  const page = document.getElementById('page-home');
  if (!page) return;
  page.innerHTML = `
    <div class="date-display">
      <div class="date-display__weekday">${getWeekdayText()}</div>
      <div class="date-display__date">${formatDateChinese()}</div>
    </div>
    <div class="empty-state">
      <div class="empty-state__icon">🌱</div>
      <div class="empty-state__text">正在加载数据...</div>
      <div class="empty-state__text" style="font-size:12px;">如果长时间未响应，请刷新页面</div>
    </div>
  `;
}

/**
 * 计算本周日期范围
 */
function computeWeekRange() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=周日, 1=周一...
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  AppState.weekStart = formatDate(monday);
  AppState.weekEnd = formatDate(sunday);
}

// ==================== 数据加载 ====================

/** 防止 initAppData 并发执行 */
let _isInitDataRunning = false;

/**
 * 重新加载应用数据（登录后使用，跳过认证初始化）
 */
async function initAppData() {
  if (_isInitDataRunning) {
    console.log('[日积跬步] initAppData 已在执行中，跳过重复调用');
    return;
  }
  _isInitDataRunning = true;

  try {
    // 初始化查看日期
    AppState.viewDate = AppState.today;

    // 计算本周范围
    computeWeekRange();

    // 加载数据
    await loadHabits().catch((e) => {
      console.error('[日积跬步] 加载习惯失败:', e);
      return [];
    });

    // 清理重复习惯（如果之前版本产生过重复）
    await deduplicateHabits().catch((e) => {
      console.error('[日积跬步] 去重失败:', e);
    });

    await loadTodayCheckins().catch((e) => {
      console.error('[日积跬步] 加载打卡记录失败:', e);
      return {};
    });
    await loadWeekStats().catch((e) => {
      console.error('[日积跬步] 加载周统计失败:', e);
      return {};
    });

    AppState.viewCheckins = AppState.todayCheckins;

    // 首次使用：初始化默认习惯（严格检查是否已存在）
    const hasDefaults = await _hasDefaultHabits();
    if (AppState.habits.length === 0 && !hasDefaults) {
      await initDefaultHabits().catch((e) => {
        console.error('[日积跬步] 初始化默认习惯失败:', e);
      });
      await loadHabits();
      await loadTodayCheckins();
      AppState.viewCheckins = AppState.todayCheckins;
    }

    // 检查并处理跨日未完成
    await processMissedCheckins().catch((e) => {
      console.error('[日积跬步] 处理跨日数据失败:', e);
    });

    // 检查并生成报表
    await checkAndGenerateReports().catch((e) => {
      console.error('[日积跬步] 生成报表失败:', e);
    });

    console.log('[日积跬步] 数据重新加载完成', {
      habits: AppState.habits.length,
      todayCheckins: Object.keys(AppState.todayCheckins).length,
    });
  } finally {
    _isInitDataRunning = false;
  }
}

/**
 * 防抖同步触发器：数据变更后延迟同步
 */
let _syncDebounceTimer = null;
function triggerSyncDebounce() {
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(() => {
    if (authService.isLoggedIn()) {
      authService.pushToCloud().catch(e => console.warn('[日积跬步] 延迟同步失败:', e));
    }
  }, 3000); // 3秒防抖
}

/**
 * 加载所有习惯
 */
async function loadHabits() {
  AppState.habits = await getHabits();
}

/**
 * 加载今日打卡记录
 */
async function loadTodayCheckins() {
  AppState.todayCheckins = await getCheckinsByDate(AppState.today);
}

/**
 * 加载本周打卡统计
 */
async function loadWeekStats() {
  AppState.weekStats = await getCheckinStats(AppState.weekStart, AppState.weekEnd);
}

// ==================== 默认习惯初始化 ====================

/**
 * 检查是否已存在默认习惯（通过名称匹配）
 */
async function _hasDefaultHabits() {
  try {
    const habits = await getHabits();
    const defaultNames = new Set(DEFAULT_HABITS.map(h => h.name));
    const existingDefaults = habits.filter(h => defaultNames.has(h.name));
    return existingDefaults.length >= DEFAULT_HABITS.length;
  } catch (e) {
    return false;
  }
}

/**
 * 清理重复的习惯（按名称去重，保留第一个）
 */
async function deduplicateHabits() {
  try {
    const habits = await getHabits();
    const seenNames = new Set();
    const duplicates = [];

    habits.forEach(h => {
      if (seenNames.has(h.name)) {
        duplicates.push(h.id);
      } else {
        seenNames.add(h.name);
      }
    });

    if (duplicates.length > 0) {
      console.log(`[日积跬步] 发现 ${duplicates.length} 个重复习惯，正在清理...`);
      for (const id of duplicates) {
        await deleteHabit(id);
      }
      await loadHabits();
    }
  } catch (e) {
    console.error('[日积跬步] 清理重复习惯失败:', e);
  }
}

/**
 * 首次使用时初始化默认习惯
 */
async function initDefaultHabits() {
  // 双重检查：避免任何情况下重复初始化
  const existingHabits = await getHabits();
  const existingNames = new Set(existingHabits.map(h => h.name));

  for (const habitData of DEFAULT_HABITS) {
    if (!existingNames.has(habitData.name)) {
      await saveHabit({ ...habitData });
    } else {
      console.log(`[日积跬步] 默认习惯 "${habitData.name}" 已存在，跳过创建`);
    }
  }
  await loadHabits();
  console.log('[日积跬步] 已初始化默认习惯');
}

// ==================== 打卡逻辑 ====================

/**
 * 执行打卡
 * @param {string} habitId
 */
async function doCheckin(habitId) {
  const habit = AppState.habits.find((h) => h.id === habitId);
  if (!habit || habit.status === 'frozen') return;

  const existing = AppState.todayCheckins[habitId];

  // 如果已经完成，撤销打卡
  if (existing && existing.completed) {
    await undoCheckin(habitId);
    return;
  }

  // 执行打卡
  const now = new Date().toISOString();
  let actualValue = 0;

  if (habit.type === 'count') {
    actualValue = habit.defaultCount;
  } else if (habit.type === 'duration') {
    actualValue = habit.defaultDuration;
  } else {
    actualValue = 1;
  }

  const checkin = {
    id: existing ? existing.id : undefined,
    habitId,
    date: AppState.today,
    completed: true,
    actualValue,
    completedAt: now,
    notes: '',
  };

  await saveCheckin(checkin);
  AppState.todayCheckins[habitId] = checkin;

  // 显示完成动画
  showCheckAnimation(habitId);
  showToast(`✅ ${habit.name} 已完成！`, 'success');

  // 触发延迟同步
  triggerSyncDebounce();

  // 更新视图
  renderHomePage();
}

/**
 * 撤销打卡
 * @param {string} habitId
 */
async function undoCheckin(habitId) {
  const existing = AppState.todayCheckins[habitId];
  if (!existing) return;

  existing.completed = false;
  existing.completedAt = null;
  existing.actualValue = 0;
  await saveCheckin(existing);

  const habit = AppState.habits.find((h) => h.id === habitId);
  showToast(`已撤销「${habit?.name || '习惯'}」的打卡`, 'error');
  triggerSyncDebounce();
  renderHomePage();
}

/**
 * 处理跨日未完成的习惯（0点自动标记）
 */
async function processMissedCheckins() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  const activeHabits = AppState.habits.filter((h) => h.status === 'active');
  const yesterdayCheckins = await getCheckinsByDate(yesterdayStr);
  // getCheckinsByDate 返回 { habitId: CheckIn } 格式
  const checkedIds = new Set(Object.keys(yesterdayCheckins));

  // 为未打卡的习惯创建"未完成"记录
  for (const habit of activeHabits) {
    if (!checkedIds.has(habit.id)) {
      await saveCheckin({
        habitId: habit.id,
        date: yesterdayStr,
        completed: false,
        actualValue: 0,
        completedAt: null,
        notes: '系统自动标记：未完成',
      });
    }
  }
}

// ==================== 报表生成 ====================

/**
 * 检查并生成到期报表
 */
async function checkAndGenerateReports() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // 22:00-23:59 期间检查
  if (hour < 22) return;

  const today = formatDate(now);

  // 周报：周日22:00
  if (now.getDay() === 0) {
    const weekPeriod = `W${getWeekNumber(now)}`;
    const existingWeek = await getReports('weekly');
    if (!existingWeek.find((r) => r.period === `${now.getFullYear()}-${weekPeriod}`)) {
      await generateWeeklyReport();
    }
  }

  // 月报：月末22:00
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() === lastDayOfMonth) {
    const monthPeriod = formatDate(now).substring(0, 7);
    const existingMonth = await getReports('monthly');
    if (!existingMonth.find((r) => r.period === monthPeriod)) {
      await generateMonthlyReport();
    }
  }

  // 年报：12月31日22:00
  if (now.getMonth() === 11 && now.getDate() === 31) {
    const yearPeriod = String(now.getFullYear());
    const existingYear = await getReports('annual');
    if (!existingYear.find((r) => r.period === yearPeriod)) {
      await generateAnnualReport();
    }
  }
}

/**
 * 生成周报
 */
async function generateWeeklyReport() {
  const days = getWeekDays();
  let totalCompletions = 0;
  let totalTarget = 0;

  for (const day of days) {
    const checkins = await getCheckinsByDate(day);
    Object.values(checkins).forEach((c) => {
      if (c.completed) totalCompletions++;
      totalTarget++;
    });
  }

  const report = {
    type: 'weekly',
    period: `${new Date().getFullYear()}-W${getWeekNumber(new Date())}`,
    generatedAt: new Date().toISOString(),
    completionRate: totalTarget > 0 ? totalCompletions / totalTarget : 0,
    totalCompletions,
    totalTarget,
    bestStreak: await calculateBestStreak(),
    summary: `本周完成率 ${Math.round((totalCompletions / Math.max(totalTarget, 1)) * 100)}%`,
  };

  await saveReport(report);
}

/**
 * 生成月报
 */
async function generateMonthlyReport() {
  // 简化实现：计算本月数据
  const now = new Date();
  const monthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = formatDate(now);

  let totalCompletions = 0;
  let totalTarget = 0;

  let current = new Date(monthStart);
  const end = new Date(monthEnd);
  while (current <= end) {
    const dateStr = formatDate(current);
    const checkins = await getCheckinsByDate(dateStr);
    Object.values(checkins).forEach((c) => {
      if (c.completed) totalCompletions++;
      totalTarget++;
    });
    current.setDate(current.getDate() + 1);
  }

  const report = {
    type: 'monthly',
    period: formatDate(now).substring(0, 7),
    generatedAt: new Date().toISOString(),
    completionRate: totalTarget > 0 ? totalCompletions / totalTarget : 0,
    totalCompletions,
    totalTarget,
    bestStreak: await calculateBestStreak(),
    summary: `本月完成率 ${Math.round((totalCompletions / Math.max(totalTarget, 1)) * 100)}%`,
  };

  await saveReport(report);
}

/**
 * 生成年报
 */
async function generateAnnualReport() {
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  let totalCompletions = 0;
  let totalTarget = 0;

  // 统计全年
  let current = new Date(yearStart);
  const end = new Date(Math.min(new Date(), new Date(yearEnd)));
  while (current <= end) {
    const dateStr = formatDate(current);
    const checkins = await getCheckinsByDate(dateStr);
    Object.values(checkins).forEach((c) => {
      if (c.completed) totalCompletions++;
      totalTarget++;
    });
    current.setDate(current.getDate() + 1);
  }

  const report = {
    type: 'annual',
    period: String(year),
    generatedAt: new Date().toISOString(),
    completionRate: totalTarget > 0 ? totalCompletions / totalTarget : 0,
    totalCompletions,
    totalTarget,
    bestStreak: await calculateBestStreak(),
    summary: `年度完成率 ${Math.round((totalCompletions / Math.max(totalTarget, 1)) * 100)}%`,
  };

  await saveReport(report);
}

/**
 * 计算最佳连续打卡天数
 */
async function calculateBestStreak() {
  const activeHabits = AppState.habits.filter((h) => h.status === 'active');
  if (activeHabits.length === 0) return 0;

  let maxStreak = 0;

  for (const habit of activeHabits) {
    const checkins = await getCheckinsByHabit(habit.id);
    const completedDates = new Set(
      checkins.filter((c) => c.completed).map((c) => c.date)
    );

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (completedDates.has(formatDate(d))) {
        streak++;
        if (streak > maxStreak) maxStreak = streak;
      } else {
        if (i === 0) continue; // 今天可能还没打卡
        streak = 0;
      }
    }
  }

  return maxStreak;
}

// ==================== 工具函数 ====================

/**
 * 获取本周每天日期
 */
function getWeekDays() {
  const days = [];
  const monday = new Date(AppState.weekStart);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(formatDate(d));
  }
  return days;
}

/**
 * 获取ISO周数
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * 跨日检测器：每分钟检查一次
 */
function setupMidnightChecker() {
  setInterval(() => {
    const now = formatDate();
    if (now !== AppState.today) {
      console.log('[日积跬步] 检测到跨日，刷新数据');
      AppState.today = now;
      computeWeekRange();
      initApp();
    }
  }, 60000);
}

// ==================== 页面导航 ====================

/**
 * 切换到指定页面
 * @param {string} pageName
 */
function navigateTo(pageName) {
  // 切换页面显示
  document.querySelectorAll('.page').forEach((p) => {
    p.classList.remove('page--active');
  });
  const targetPage = document.getElementById(`page-${pageName}`);
  if (targetPage) {
    targetPage.classList.add('page--active');
  }

  AppState.currentPage = pageName;
  // renderCurrentPage 内部可能异步，这里不阻塞导航
  renderCurrentPage().catch((e) => {
    console.error('页面渲染失败:', e);
  });
  updateBottomNav();
}

/**
 * 渲染当前页面
 */
async function renderCurrentPage() {
  // 首页未登录时显示登录页面
  if (AppState.currentPage === 'home' && !authService.isLoggedIn()) {
    renderLoginCheckpoint();
    return;
  }

  switch (AppState.currentPage) {
    case 'home':
      renderHomePage();
      break;
    case 'manage':
      renderManagePage();
      break;
    case 'calendar':
      await renderCalendarPage();
      break;
    case 'reports':
      await renderReportsPage();
      break;
    case 'settings':
      renderSettingsPage();
      break;
    default:
      renderHomePage();
  }
}

/**
 * 更新底部导航栏高亮
 */
function updateBottomNav() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    const page = item.dataset.page;
    item.classList.toggle('nav-item--active', page === AppState.currentPage);
  });
}

// ==================== Toast 提示 ====================

/**
 * 显示 Toast 提示
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type = 'info') {
  // 移除已有 toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ==================== 打卡动画 ====================

/**
 * 显示打卡完成动画
 * @param {string} habitId
 */
function showCheckAnimation(habitId) {
  const card = document.querySelector(`[data-habit-id="${habitId}"]`);
  if (!card) return;

  const checkBtn = card.querySelector('.habit-card__check');
  if (checkBtn) {
    checkBtn.classList.add('check-animation');
    setTimeout(() => checkBtn.classList.remove('check-animation'), 400);
  }
}

// ==================== 事件监听 ====================

/**
 * 设置全局事件监听
 */
function setupEventListeners() {
  // 底部导航
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      navigateTo(item.dataset.page);
    });
  });

  // 设置按钮
  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => navigateTo('settings'));
  }

  // 报表按钮
  const reportsBtn = document.getElementById('btn-reports');
  if (reportsBtn) {
    reportsBtn.addEventListener('click', () => navigateTo('reports'));
  }

  // 添加习惯按钮
  const addHabitBtn = document.getElementById('btn-add-habit');
  if (addHabitBtn) {
    addHabitBtn.addEventListener('click', () => showAddHabitModal());
  }
}

// ==================== 启动应用 ====================

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);

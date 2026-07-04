/**
 * 日积跬步 - 定时提醒服务
 * 支持浏览器通知、微信订阅消息等多渠道提醒
 * 版本: V1.2
 */

// ==================== 提醒渠道 ====================

const ReminderChannels = {
  browser: 'browser', // 浏览器通知（免费，即用）
  wechat: 'wechat',   // 微信订阅消息（需配置服务号）
  webhook: 'webhook', // 自定义Webhook（如元宝等）
};

/**
 * 提醒服务主类
 */
class ReminderService {
  constructor() {
    /** @type {Array} 已发送提醒缓存，避免重复 */
    this.sentToday = new Set();
    /** @type {number} 定时器ID */
    this.timerId = null;
    /** @type {Object} 渠道配置 */
    this.channelConfig = {
      browser: { enabled: false },
      wechat: { enabled: false, appId: '', templateId: '', accessToken: '' },
      webhook: { enabled: false, url: '' },
    };
    /** @type {Array} 提醒队列 */
    this.queue = [];
  }

  /**
   * 初始化提醒服务
   */
  async init() {
    // 加载渠道配置
    const saved = await getSetting('reminder-channels', null);
    if (saved) {
      this.channelConfig = { ...this.channelConfig, ...saved };
    }

    // 初始化浏览器通知
    if (this.channelConfig.browser.enabled && 'Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    }

    // 开始定时检查
    this.startPolling();
    console.log('[提醒服务] 已启动，检查间隔: 60秒');
  }

  /**
   * 开启定时轮询（每60秒检查一次）
   */
  startPolling() {
    this.stopPolling();
    this.checkAndRemind(); // 立即检查一次
    this.timerId = setInterval(() => this.checkAndRemind(), 60000);
  }

  /**
   * 停止轮询
   */
  stopPolling() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * 检查并发送提醒
   */
  async checkAndRemind() {
    const now = new Date();
    const todayKey = this.getDateKey(now);
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 获取活跃习惯
    const activeHabits = AppState.habits.filter((h) => h.status === 'active');
    if (activeHabits.length === 0) return;

    for (const habit of activeHabits) {
      if (!habit.reminderTimes || habit.reminderTimes.length === 0) continue;

      for (const reminderTime of habit.reminderTimes) {
        // 检查是否到时间（允许1分钟误差）
        const reminderKey = `${todayKey}|${habit.id}|${reminderTime}`;
        if (this.sentToday.has(reminderKey)) continue;

        if (currentTime === reminderTime) {
          // 检查是否已经打卡
          const checkin = AppState.todayCheckins[habit.id];
          if (checkin && checkin.completed) continue;

          // 标记已发送
          this.sentToday.add(reminderKey);

          // 发送提醒
          await this.dispatchReminder(habit, reminderTime);
        }
      }
    }

    // 午夜清理标记
    if (currentTime === '00:01') {
      this.sentToday.clear();
    }
  }

  /**
   * 分发提醒到各渠道
   * @param {Object} habit
   * @param {string} time
   */
  async dispatchReminder(habit, time) {
    const title = '日积跬步提醒';
    const body = `${habit.icon} ${habit.name} · ${getHabitDisplayInfo(habit)}`;

    // 渠道1: 浏览器通知
    if (this.channelConfig.browser.enabled) {
      this.sendBrowserNotification(title, body);
    }

    // 渠道2: 微信订阅消息
    if (this.channelConfig.wechat.enabled) {
      await this.sendWechatMessage(habit, time);
    }

    // 渠道3: Webhook
    if (this.channelConfig.webhook.enabled) {
      await this.sendWebhook(habit, time);
    }

    // 应用内toast提示
    if (AppState.currentPage === 'home') {
      showToast(`⏰ ${body}`, 'info');
    }

    console.log(`[提醒服务] ${time} → ${habit.name} (${body})`);
  }

  /**
   * 发送浏览器通知
   * @param {string} title
   * @param {string} body
   */
  sendBrowserNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    // 使用Service Worker（如果注册了）或直接发送
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body,
          icon: '/assets/icon-192.png',
          badge: '/assets/icon-192.png',
          vibrate: [200, 100, 200],
          tag: 'habit-reminder',
          requireInteraction: true,
        });
      });
    } else {
      new Notification(title, { body, icon: '/assets/icon-192.png' });
    }
  }

  /**
   * 发送微信订阅消息（需配置服务号）
   * @param {Object} habit
   * @param {string} time
   */
  async sendWechatMessage(habit, time) {
    const config = this.channelConfig.wechat;
    if (!config.accessToken || !config.templateId) {
      console.warn('[微信提醒] 未配置 accessToken 或 templateId，跳过');
      return;
    }

    // 获取用户微信openId（需要先有微信登录）
    const wechatOpenId = await getSetting('wechat-openid', null);
    if (!wechatOpenId) return;

    try {
      const response = await fetch(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${config.accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            touser: wechatOpenId,
            template_id: config.templateId,
            page: 'pages/index/index',
            data: {
              thing2: { value: habit.name },
              thing3: { value: getHabitDisplayInfo(habit) },
              time4: { value: time },
              thing5: { value: '点击进入小程序打卡' },
            },
          }),
        }
      );

      const result = await response.json();
      if (result.errcode !== 0) {
        console.error('[微信提醒] 发送失败:', result.errmsg);
      } else {
        console.log('[微信提醒] 发送成功');
      }
    } catch (error) {
      console.error('[微信提醒] 网络错误:', error.message);
    }
  }

  /**
   * 发送Webhook通知（支持元宝等平台）
   * @param {Object} habit
   * @param {string} time
   */
  async sendWebhook(habit, time) {
    const config = this.channelConfig.webhook;
    if (!config.url) return;

    try {
      await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'habit_reminder',
          title: '日积跬步提醒',
          habitName: habit.name,
          habitIcon: habit.icon,
          habitInfo: getHabitDisplayInfo(habit),
          time,
          timestamp: new Date().toISOString(),
        }),
      });
      console.log('[Webhook] 发送成功');
    } catch (error) {
      console.error('[Webhook] 发送失败:', error.message);
    }
  }

  /**
   * 启用/禁用渠道
   * @param {string} channel
   * @param {boolean} enabled
   * @param {Object} [config]
   */
  async setChannelConfig(channel, enabled, config = {}) {
    this.channelConfig[channel] = { ...this.channelConfig[channel], enabled, ...config };
    await saveSetting('reminder-channels', this.channelConfig);

    if (channel === 'browser' && enabled && 'Notification' in window) {
      await Notification.requestPermission();
    }
  }

  /**
   * 生成日期key
   */
  getDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * 获取下一次提醒时间
   * @returns {Array<{habit: Object, time: string}>}
   */
  getUpcomingReminders() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const upcoming = [];

    const activeHabits = AppState.habits.filter((h) => h.status === 'active');
    for (const habit of activeHabits) {
      // 已打卡则跳过
      const checkin = AppState.todayCheckins[habit.id];
      if (checkin && checkin.completed) continue;

      if (!habit.reminderTimes) continue;
      for (const rt of habit.reminderTimes) {
        const [h, m] = rt.split(':').map(Number);
        const reminderMinutes = h * 60 + m;

        // 当天还未到的提醒
        if (reminderMinutes > currentMinutes) {
          upcoming.push({ habit, time: rt, minutes: reminderMinutes });
        }
      }
    }

    // 按时间排序
    upcoming.sort((a, b) => a.minutes - b.minutes);
    return upcoming;
  }
}

// 全局实例
const reminderService = new ReminderService();

/**
 * 渲染提醒设置面板
 * @returns {string}
 */
function renderReminderSettings() {
  const config = reminderService.channelConfig;
  const upcoming = reminderService.getUpcomingReminders();

  let upcomingHTML = '';
  if (upcoming.length > 0) {
    upcomingHTML = `
      <div class="settings-group__title">⏰ 即将到来的提醒</div>
      ${upcoming.slice(0, 5).map((u) => `
        <div class="settings-item" style="cursor:default;">
          <span class="settings-item__label">${u.habit.icon} ${u.habit.name}</span>
          <span class="settings-item__value">${u.time} ${u.habit.reminderTimes.length > 1 ? '等' + u.habit.reminderTimes.length + '个' : ''}</span>
        </div>
      `).join('')}
    `;
  }

  return `
    <div class="settings-group">
      <div class="settings-group__title">提醒渠道</div>

      <div class="settings-item" id="setting-browser-reminder">
        <span class="settings-item__label">🔔 浏览器通知</span>
        <span class="settings-item__value" style="color:${config.browser.enabled ? 'var(--color-primary)' : 'var(--text-muted)'};">
          ${config.browser.enabled ? '已开启' : '已关闭'}
        </span>
      </div>

      <div class="settings-item" id="setting-wechat-reminder">
        <span class="settings-item__label">💬 微信订阅消息</span>
        <span class="settings-item__value" style="color:${config.wechat.enabled ? 'var(--color-primary)' : 'var(--text-muted)'};">
          ${config.wechat.enabled ? '已配置' : '待配置'}
        </span>
      </div>

      <div class="settings-item" id="setting-webhook-reminder">
        <span class="settings-item__label">🔗 Webhook通知（元宝等）</span>
        <span class="settings-item__value" style="color:${config.webhook.enabled ? 'var(--color-primary)' : 'var(--text-muted)'};">
          ${config.webhook.enabled ? '已配置' : '待配置'}
        </span>
      </div>
    </div>

    ${upcomingHTML}

    <div class="settings-group">
      <div class="settings-group__title">提醒说明</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;padding:var(--space-sm) 0;">
        • 每个习惯可单独设置提醒时间<br>
        • 在"管理"页编辑习惯即可修改提醒<br>
        • 已完成打卡的习惯不会重复提醒<br>
        • 微信提醒需配置服务号<br>
        • 浏览器通知需授权
      </div>
    </div>
  `;
}

/**
 * 显示微信配置弹窗
 */
function showWechatConfigModal() {
  const config = reminderService.channelConfig.wechat;
  showModal(`
    <div class="modal__title">💬 微信提醒配置</div>
    <div class="form-group">
      <label class="form-label">微信公众号 AppID</label>
      <input class="form-input" id="wechat-appid" value="${config.appId || ''}" placeholder="wx...">
    </div>
    <div class="form-group">
      <label class="form-label">订阅消息模板ID</label>
      <input class="form-input" id="wechat-template-id" value="${config.templateId || ''}" placeholder="消息模板ID">
    </div>
    <div class="form-group">
      <label class="form-label">Access Token（服务端获取）</label>
      <input class="form-input" id="wechat-access-token" value="${config.accessToken || ''}" placeholder="access_token">
    </div>
    <p style="font-size:12px;color:var(--text-muted);margin:var(--space-sm) 0 var(--space-md);">
      配置后需用户微信登录授权，方可发送订阅消息。<br>
      参考文档: <a href="https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html" target="_blank" style="color:var(--color-primary);">微信订阅消息文档</a>
    </p>
    <button class="btn btn--primary" id="btn-save-wechat">保存配置</button>
  `);

  document.getElementById('btn-save-wechat').addEventListener('click', async () => {
    const appId = document.getElementById('wechat-appid').value.trim();
    const templateId = document.getElementById('wechat-template-id').value.trim();
    const accessToken = document.getElementById('wechat-access-token').value.trim();

    await reminderService.setChannelConfig('wechat', !!appId, { appId, templateId, accessToken });
    closeModal();
    showToast('微信配置已保存', 'success');
    renderSettingsPage();
  });
}

/**
 * 显示Webhook配置弹窗
 */
function showWebhookConfigModal() {
  const config = reminderService.channelConfig.webhook;
  showModal(`
    <div class="modal__title">🔗 Webhook 通知配置</div>
    <div class="form-group">
      <label class="form-label">Webhook URL</label>
      <input class="form-input" id="webhook-url" value="${config.url || ''}" placeholder="https://your-webhook.com/api/remind">
    </div>
    <p style="font-size:12px;color:var(--text-muted);margin:var(--space-sm) 0 var(--space-md);">
      支持任意兼容的Webhook服务（如：元宝、企业微信机器人、钉钉机器人等）。
      POST请求体包含: type, habitName, habitIcon, time, timestamp。
    </p>
    <button class="btn btn--primary" id="btn-save-webhook">保存配置</button>
  `);

  document.getElementById('btn-save-webhook').addEventListener('click', async () => {
    const url = document.getElementById('webhook-url').value.trim();
    await reminderService.setChannelConfig('webhook', !!url, { url });
    closeModal();
    showToast('Webhook配置已保存', 'success');
    renderSettingsPage();
  });
}

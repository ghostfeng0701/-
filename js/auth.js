/**
 * 日积跬步 - 用户认证模块 + 数据同步
 * 支持：微信开放平台扫码登录 + 手机号验证码登录
 * 后端：Supabase（开发模式可切换为 Mock）
 * 数据策略：本地缓存 + 定期同步到云端
 * 
 * 版本: V2.0
 */

// ==================== 认证服务 + 同步服务 ====================

class AuthService {
  constructor() {
    /** @type {Object|null} 当前用户信息 */
    this.user = null;
    /** @type {Object|null} JWT 会话 */
    this.session = null;
    /** @type {string|null} 登录方式 */
    this.provider = null;
    /** @type {'supabase'|'mock'} 运行模式 */
    this.mode = 'mock';

    // Supabase 配置
    this.supabaseUrl = '';
    this.supabaseKey = '';
    /** @type {Object|null} */
    this.supabase = null;

    // 微信开放平台配置
    this.wechatAppId = '';
    this.wechatRedirectUri = '';

    // 回调
    this.onAuthChange = null;

    // 同步配置
    this._syncTimer = null;
    this._syncInterval = 5 * 60 * 1000; // 5分钟自动同步
    this._syncInProgress = false;
    this._mockCloudPrefix = 'ht_cloud_';
  }

  // ==================== 初始化 ====================

  /**
   * 初始化认证服务
   */
  async init(config = {}) {
    this.supabaseUrl = config.supabaseUrl || '';
    this.supabaseKey = config.supabaseKey || '';
    this.wechatAppId = config.wechatAppId || '';
    this.wechatRedirectUri = config.wechatRedirectUri || '';
    this.onAuthChange = config.onAuthChange || null;

    // 检测运行模式
    if (this.supabaseUrl && this.supabaseKey) {
      this.mode = 'supabase';
      try {
        await this._initSupabase();
      } catch (e) {
        console.warn('[Auth] Supabase 初始化失败，切换到 Mock 模式:', e.message);
        this.mode = 'mock';
      }
    } else {
      console.log('[Auth] 未配置 Supabase，使用 Mock 开发模式');
    }

    // 恢复本地会话
    await this._restoreSession();

    // 设置当前用户ID到数据库层
    if (this.isLoggedIn()) {
      if (typeof setCurrentUserId === 'function') {
        setCurrentUserId(this.getUserId());
      }
    }

    console.log(`[Auth] 初始化完成 (${this.mode}), 登录状态: ${this.isLoggedIn()}`);
    return this;
  }

  async _initSupabase() {
    if (typeof supabase === 'undefined') {
      await this._loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
    }
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      this.supabase = supabase.createClient(this.supabaseUrl, this.supabaseKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          storageKey: 'habit-tracker-auth',
        },
      });
    }
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(script);
    });
  }

  async _restoreSession() {
    try {
      if (this.mode === 'supabase' && this.supabase) {
        const { data } = await this.supabase.auth.getSession();
        if (data?.session) {
          this.session = data.session;
          this.user = data.session.user;
          this.provider = this.user?.app_metadata?.provider || null;
          return;
        }
      }
      // Mock 模式：从 localStorage 恢复
      const saved = localStorage.getItem('habit-tracker-user');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.user = parsed.user || null;
        this.session = parsed.session || null;
        this.provider = parsed.provider || null;
      }
    } catch (e) {
      console.warn('[Auth] 恢复会话失败:', e.message);
    }
  }

  async _persistSession() {
    try {
      const data = {
        user: this.user,
        session: this.session,
        provider: this.provider,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('habit-tracker-user', JSON.stringify(data));
    } catch (e) {
      console.warn('[Auth] 持久化会话失败:', e.message);
    }
  }

  // ==================== 登录方法 ====================

  async loginWithWechat() {
    console.log('[Auth] 发起微信扫码登录...');
    if (this.mode === 'supabase') {
      return this._wechatLoginSupabase();
    }
    return this._wechatLoginMock();
  }

  async _wechatLoginSupabase() {
    try {
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: 'wechat',
        options: {
          redirectTo: this.wechatRedirectUri || window.location.origin + '/?auth=callback',
          queryParams: { appid: this.wechatAppId },
        },
      });
      if (error) throw error;
      return { success: true, qrcodeUrl: data?.url || null };
    } catch (e) {
      console.error('[Auth] 微信登录失败:', e.message);
      return { success: false, message: e.message };
    }
  }

  async _wechatLoginMock() {
    await this._delay(1500);

    const mockOpenId = 'wx_' + this._randomStr(16);
    const mockUnionId = 'union_' + this._randomStr(16);

    this.user = {
      id: mockOpenId,
      email: null,
      phone: null,
      user_metadata: {
        name: '微信用户',
        avatar_url: null,
        provider: 'wechat',
        openid: mockOpenId,
        unionid: mockUnionId,
      },
      app_metadata: { provider: 'wechat' },
      created_at: new Date().toISOString(),
    };

    this.session = {
      access_token: 'mock_at_' + this._randomStr(32),
      refresh_token: 'mock_rt_' + this._randomStr(32),
      expires_at: Date.now() + 3600000,
    };

    this.provider = 'wechat';
    await this._persistSession();
    if (typeof setCurrentUserId === 'function') {
      setCurrentUserId(this.getUserId());
    }

    // 登录后自动拉取云端数据
    await this.pullFromCloud().catch(e => console.warn('[Auth] 初始拉取失败:', e));

    if (this.onAuthChange) {
      this.onAuthChange({ type: 'login', user: this.user, provider: 'wechat' });
    }

    console.log('[Auth] Mock 微信登录成功:', this.user.id);
    return { success: true };
  }

  async loginWithPhone(phone, code) {
    console.log('[Auth] 手机号登录:', phone);

    if (!this._validatePhone(phone)) {
      return { success: false, message: '请输入有效的手机号' };
    }

    if (this.mode === 'supabase') {
      return this._phoneLoginSupabase(phone, code);
    }
    return this._phoneLoginMock(phone, code);
  }

  async _phoneLoginSupabase(phone, code) {
    try {
      const { data, error } = await this.supabase.auth.verifyOtp({
        phone: phone, token: code, type: 'sms',
      });
      if (error) throw error;

      this.user = data.user;
      this.session = data.session;
      this.provider = 'phone';
      await this._persistSession();

      if (this.onAuthChange) {
        this.onAuthChange({ type: 'login', user: this.user, provider: 'phone' });
      }
      return { success: true };
    } catch (e) {
      console.error('[Auth] 手机号登录失败:', e.message);
      return { success: false, message: e.message };
    }
  }

  async _phoneLoginMock(phone, code) {
    await this._delay(800);

    if (!/^\d{6}$/.test(code) || code === '000000') {
      return { success: false, message: '验证码错误，请重新输入' };
    }

    const mockUserId = 'phone_' + phone.replace(/[^0-9]/g, '');

    this.user = {
      id: mockUserId,
      email: null,
      phone: phone,
      user_metadata: {
        name: '手机用户' + phone.slice(-4),
        avatar_url: null,
        provider: 'phone',
      },
      app_metadata: { provider: 'phone' },
      created_at: new Date().toISOString(),
    };

    this.session = {
      access_token: 'mock_at_' + this._randomStr(32),
      refresh_token: 'mock_rt_' + this._randomStr(32),
      expires_at: Date.now() + 3600000,
    };

    this.provider = 'phone';
    await this._persistSession();
    if (typeof setCurrentUserId === 'function') {
      setCurrentUserId(this.getUserId());
    }

    // 登录后自动拉取云端数据
    await this.pullFromCloud().catch(e => console.warn('[Auth] 初始拉取失败:', e));

    if (this.onAuthChange) {
      this.onAuthChange({ type: 'login', user: this.user, provider: 'phone' });
    }

    console.log('[Auth] Mock 手机号登录成功:', this.user.id);
    return { success: true };
  }

  async sendPhoneCode(phone) {
    if (!this._validatePhone(phone)) {
      return { success: false, message: '请输入有效的手机号' };
    }

    if (this.mode === 'supabase') {
      try {
        const { error } = await this.supabase.auth.signInWithOtp({ phone: phone });
        if (error) throw error;
        return { success: true };
      } catch (e) {
        return { success: false, message: e.message };
      }
    }

    console.log('[Auth] Mock 发送验证码到:', phone);
    return { success: true, message: '验证码已发送（Mock模式：输入任意6位数字即可登录）' };
  }

  // ==================== 登出 ====================

  async logout() {
    console.log('[Auth] 退出登录');

    // 退出前先同步数据
    try {
      await this.pushToCloud();
    } catch (e) {
      console.warn('[Auth] 退出前同步失败:', e.message);
    }

    // 清除同步定时器
    this.stopAutoSync();

    if (this.mode === 'supabase' && this.supabase) {
      try {
        await this.supabase.auth.signOut();
      } catch (e) {
        console.warn('[Auth] Supabase 登出失败:', e.message);
      }
    }

    this.user = null;
    this.session = null;
    this.provider = null;
    localStorage.removeItem('habit-tracker-user');
    if (typeof setCurrentUserId === 'function') {
      setCurrentUserId(null);
    }

    if (this.onAuthChange) {
      this.onAuthChange({ type: 'logout' });
    }

    console.log('[Auth] 已登出');
  }

  // ==================== 用户信息 ====================

  getProfile() {
    if (!this.user) return null;
    return {
      id: this.user.id,
      name: this.user.user_metadata?.name || '未设置昵称',
      phone: this.user.phone || null,
      avatar: this.user.user_metadata?.avatar_url || null,
      provider: this.provider,
      createdAt: this.user.created_at,
    };
  }

  async updateProfile(updates) {
    if (this.mode === 'supabase' && this.supabase) {
      const { data, error } = await this.supabase.auth.updateUser({ data: updates });
      if (error) throw error;
      this.user = data.user;
    } else {
      if (!this.user) return;
      if (!this.user.user_metadata) this.user.user_metadata = {};
      Object.assign(this.user.user_metadata, updates);
    }
    await this._persistSession();
  }

  // ==================== 状态查询 ====================

  isLoggedIn() {
    return !!(this.user && this.session);
  }

  getUserId() {
    return this.user?.id || null;
  }

  getAccessToken() {
    return this.session?.access_token || null;
  }

  isTokenExpired() {
    return this.session?.expires_at
      ? Date.now() > this.session.expires_at * 1000 - 60000
      : true;
  }

  // ==================== 数据同步 ====================

  /**
   * 推送本地数据到云端
   * @param {Object} [data] 可指定待同步数据，不传则自动收集所有未同步记录
   * @returns {Promise<Object>} { pushed: number, failed: number, errors: [] }
   */
  async pushToCloud(data) {
    if (!this.isLoggedIn()) {
      return { pushed: 0, failed: 0, errors: ['未登录'] };
    }
    if (this._syncInProgress) {
      console.log('[Sync] 同步进行中，跳过本次推送');
      return { pushed: 0, failed: 0, errors: ['同步进行中'] };
    }

    this._syncInProgress = true;
    const result = { pushed: 0, failed: 0, errors: [] };

    try {
      // 收集待同步数据
      const unsynced = data || (typeof getUnsyncedRecords === 'function'
        ? await getUnsyncedRecords()
        : { habits: [], checkins: [], reports: [] });

      const allRecords = [
        ...(unsynced.habits || []).map(r => ({ ...r, _store: 'habits' })),
        ...(unsynced.checkins || []).map(r => ({ ...r, _store: 'checkins' })),
        ...(unsynced.reports || []).map(r => ({ ...r, _store: 'reports' })),
      ];

      if (allRecords.length === 0) {
        console.log('[Sync] 无待同步数据');
        this._syncInProgress = false;
        return result;
      }

      console.log(`[Sync] 推送 ${allRecords.length} 条记录到云端...`);

      if (this.mode === 'supabase' && this.supabase) {
        // Supabase 模式：逐表 upsert
        result.pushed = await this._pushToSupabase(unsynced, result);
      } else {
        // Mock 模式：写入 localStorage
        result.pushed = await this._pushToMockCloud(allRecords, result);
      }

      // 标记为已同步
      const syncedIds = {};
      for (const r of allRecords) {
        if (!syncedIds[r._store]) syncedIds[r._store] = [];
        syncedIds[r._store].push(r.id);
      }

      for (const [store, ids] of Object.entries(syncedIds)) {
        if (typeof markSynced === 'function') {
          await markSynced(store, ids).catch(() => {});
        }
      }

      await this._updateLastSyncTime();

      console.log(`[Sync] 推送完成: ${result.pushed} 成功, ${result.failed} 失败`);
    } catch (e) {
      console.error('[Sync] 推送失败:', e.message);
      result.errors.push(e.message);
      result.failed++;
    }

    this._syncInProgress = false;
    return result;
  }

  /**
   * Mock 云端推送（写入 localStorage）
   */
  async _pushToMockCloud(records, result) {
    let pushed = 0;
    const cloudData = {};

    // 读取现有云端数据
    for (const store of ['habits', 'checkins', 'reports']) {
      cloudData[store] = this._readMockCloud(store);
    }

    for (const record of records) {
      try {
        const store = record._store || 'habits';
        // 移除内部标记
        const cleanRecord = { ...record };
        delete cleanRecord._store;

        const storeData = cloudData[store];
        const existingIdx = storeData.findIndex(r => r.id === cleanRecord.id);
        if (existingIdx >= 0) {
          storeData[existingIdx] = cleanRecord;
        } else {
          storeData.push(cleanRecord);
        }
        pushed++;
      } catch (e) {
        console.error(`[Sync] 推送记录失败:`, e.message);
        result.errors.push(e.message);
        result.failed++;
      }
    }

    // 写入 localStorage
    for (const [store, data] of Object.entries(cloudData)) {
      this._writeMockCloud(store, data);
    }

    return pushed;
  }

  /**
   * Supabase 云端推送
   */
  async _pushToSupabase(unsynced, result) {
    let pushed = 0;

    for (const store of ['habits', 'checkins', 'reports']) {
      const records = unsynced[store];
      if (!records || records.length === 0) continue;

      try {
        const { error } = await this.supabase
          .from(store)
          .upsert(records, { onConflict: 'id' });

        if (error) throw error;
        pushed += records.length;
      } catch (e) {
        console.error(`[Sync] Supabase ${store} 推送失败:`, e.message);
        result.errors.push(`${store}: ${e.message}`);
        result.failed += records.length;
      }
    }

    return pushed;
  }

  /**
   * 从云端拉取数据
   * @returns {Promise<Object>} { pulled: number, merged: number, conflicts: number }
   */
  async pullFromCloud() {
    if (!this.isLoggedIn()) {
      return { pulled: 0, merged: 0, conflicts: 0 };
    }
    if (this._syncInProgress) {
      console.log('[Sync] 同步进行中，跳过本次拉取');
      return { pulled: 0, merged: 0, conflicts: 0 };
    }

    this._syncInProgress = true;
    const result = { pulled: 0, merged: 0, conflicts: 0 };

    try {
      console.log('[Sync] 从云端拉取数据...');

      let cloudData;

      if (this.mode === 'supabase' && this.supabase) {
        cloudData = await this._pullFromSupabase();
      } else {
        cloudData = this._pullFromMockCloud();
      }

      // 计算拉取数量
      result.pulled =
        (cloudData.habits?.length || 0) +
        (cloudData.checkins?.length || 0) +
        (cloudData.reports?.length || 0);

      if (result.pulled === 0) {
        console.log('[Sync] 云端无新数据');
        this._syncInProgress = false;
        return result;
      }

      // 合并到本地
      if (typeof mergeCloudData === 'function') {
        const mergeResult = await mergeCloudData(cloudData);
        result.merged = mergeResult.merged;
        result.conflicts = mergeResult.conflicts;
      }

      await this._updateLastSyncTime();

      console.log(`[Sync] 拉取完成: ${result.pulled} 远程, ${result.merged} 合并, ${result.conflicts} 冲突`);
    } catch (e) {
      console.error('[Sync] 拉取失败:', e.message);
    }

    this._syncInProgress = false;
    return result;
  }

  /**
   * Mock 云端拉取（从 localStorage 读取）
   */
  _pullFromMockCloud() {
    return {
      habits: this._readMockCloud('habits'),
      checkins: this._readMockCloud('checkins'),
      reports: this._readMockCloud('reports'),
    };
  }

  /**
   * Supabase 云端拉取
   */
  async _pullFromSupabase() {
    const result = { habits: [], checkins: [], reports: [] };

    // 获取上次同步时间，增量拉取
    let lastSync = null;
    if (typeof getLastSyncTime === 'function') {
      lastSync = await getLastSyncTime();
    }

    for (const store of ['habits', 'checkins', 'reports']) {
      try {
        let query = this.supabase.from(store).select('*');

        if (lastSync) {
          query = query.gt('updatedAt', lastSync);
        }

        const { data, error } = await query;
        if (error) throw error;
        result[store] = data || [];
      } catch (e) {
        console.error(`[Sync] Supabase ${store} 拉取失败:`, e.message);
      }
    }

    return result;
  }

  /**
   * 全量同步：先推后拉
   * @returns {Promise<Object>}
   */
  async syncNow() {
    if (!this.isLoggedIn()) {
      return { success: false, message: '未登录' };
    }

    console.log('[Sync] === 开始全量同步 ===');
    const pushResult = await this.pushToCloud();
    const pullResult = await this.pullFromCloud();

    const summary = {
      success: pushResult.failed === 0,
      pushed: pushResult.pushed,
      failed: pushResult.failed,
      pulled: pullResult.pulled,
      merged: pullResult.merged,
      conflicts: pullResult.conflicts,
      errors: [...pushResult.errors],
      timestamp: new Date().toISOString(),
    };

    console.log('[Sync] === 同步完成 ===', summary);

    // 触发回调
    if (this.onSyncComplete) {
      this.onSyncComplete(summary);
    }

    return summary;
  }

  /**
   * 启动自动同步定时器
   */
  startAutoSync() {
    if (!this.isLoggedIn()) return;

    this.stopAutoSync();
    console.log(`[Sync] 启动自动同步 (间隔: ${this._syncInterval / 1000}s)`);

    this._syncTimer = setInterval(() => {
      if (this.isLoggedIn() && !this._syncInProgress) {
        this.syncNow().catch(e => console.error('[Sync] 自动同步失败:', e));
      }
    }, this._syncInterval);

    // 首次立即同步
    setTimeout(() => {
      if (this.isLoggedIn()) {
        this.syncNow().catch(e => console.error('[Sync] 首次同步失败:', e));
      }
    }, 2000);
  }

  /**
   * 停止自动同步
   */
  stopAutoSync() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
      console.log('[Sync] 已停止自动同步');
    }
  }

  /**
   * 获取同步状态
   */
  async getSyncStatus() {
    if (!this.isLoggedIn()) return { status: 'not_logged_in' };

    if (typeof getSyncStats !== 'function') {
      return { status: 'ok', totalUnsynced: 0 };
    }

    const stats = await getSyncStats();
    const lastSyncTime = stats.lastSyncTime || null;

    return {
      status: stats.totalUnsynced > 0 ? 'pending' : 'synced',
      totalUnsynced: stats.totalUnsynced,
      queuePending: stats.queuePending,
      lastSyncTime: lastSyncTime,
      syncInProgress: this._syncInProgress,
    };
  }

  // ==================== Mock 云端存储 ====================

  _readMockCloud(store) {
    try {
      const key = this._mockCloudPrefix + store;
      const data = localStorage.getItem(key);
      const parsed = data ? JSON.parse(data) : [];
      // 过滤当前用户数据
      const userId = this.getUserId();
      return userId ? parsed.filter(r => !r.userId || r.userId === userId) : parsed;
    } catch (e) {
      return [];
    }
  }

  _writeMockCloud(store, data) {
    try {
      const key = this._mockCloudPrefix + store;
      // 读取所有用户的数据，保留其他用户的
      let allData = [];
      try {
        allData = JSON.parse(localStorage.getItem(key) || '[]');
      } catch (e) { /* ignore */ }

      const userId = this.getUserId();
      // 移除当前用户的旧数据
      allData = allData.filter(r => r.userId !== userId);
      // 合并新数据
      allData = allData.concat(data);

      localStorage.setItem(key, JSON.stringify(allData));
    } catch (e) {
      console.warn('[Auth] Mock 云端写入失败:', e.message);
    }
  }

  async _updateLastSyncTime() {
    const now = new Date().toISOString();
    if (typeof setLastSyncTime === 'function') {
      await setLastSyncTime(now);
    }
  }

  // ==================== 工具方法 ====================

  _validatePhone(phone) {
    return /^1[3-9]\d{9}$/.test(phone.replace(/\s/g, ''));
  }

  _randomStr(len) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== 全局实例 ====================

/** @type {AuthService} 全局认证服务实例 */
const authService = new AuthService();

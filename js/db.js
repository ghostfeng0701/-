/**
 * 日积跬步 - 数据库层
 * 使用 IndexedDB 实现本地数据持久化
 * 数据库名: habit_tracker_db
 * 版本: 2
 *
 * V2 变更:
 *  - 新增 sync_queue 表 (同步队列)
 *  - habits/checkins/reports 新增 user_id, sync_status, synced_at 字段
 *  - 支持多用户隔离和云端同步
 */

const DB_NAME = 'habit_tracker_db';
const DB_VERSION = 2;
const DB_TIMEOUT = 5000; // IndexedDB 操作超时时间 (ms)

/** 同步状态常量 */
const SYNC_STATUS = {
  LOCAL: 'local',       // 仅本地，未同步
  PENDING: 'pending',   // 同步中
  SYNCED: 'synced',     // 已同步
  CONFLICT: 'conflict', // 冲突待解决
};

/** 当 IndexedDB 不可用时，使用内存降级存储 */
let dbUnavailable = false;
const MEMORY_STORE = {
  habits: [],
  checkins: [],
  reports: [],
  settings: {},
  sync_queue: [],
  _meta: { lastSyncTime: null, lastUserId: null }
};

/** 当前活跃用户ID（由 auth.js 设置） */
let currentUserId = null;

/**
 * 设置当前用户ID（供 auth.js 调用）
 * @param {string|null} userId
 */
function setCurrentUserId(userId) {
  currentUserId = userId;
  MEMORY_STORE._meta.lastUserId = userId;
}

/**
 * 获取当前用户ID
 * @returns {string|null}
 */
function getCurrentUserId() {
  return currentUserId;
}

/**
 * 带超时的 Promise 包装器
 */
function withTimeout(promise, ms, label = 'DB') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`[${label}] 操作超时 (${ms}ms)`)), ms)
    )
  ]);
}

/**
 * 打开数据库连接（带超时保护 + V2迁移）
 */
function openDB() {
  if (dbUnavailable) {
    return Promise.reject(new Error('IndexedDB 不可用，使用内存模式'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    const timeoutId = setTimeout(() => {
      dbUnavailable = true;
      reject(new Error('IndexedDB 连接超时，切换到内存模式'));
    }, DB_TIMEOUT);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // V1 初始创建
      if (oldVersion < 1) {
        // 习惯表
        if (!db.objectStoreNames.contains('habits')) {
          const habitStore = db.createObjectStore('habits', { keyPath: 'id' });
          habitStore.createIndex('status', 'status', { unique: false });
          habitStore.createIndex('order', 'order', { unique: false });
        }

        // 打卡记录表
        if (!db.objectStoreNames.contains('checkins')) {
          const checkinStore = db.createObjectStore('checkins', { keyPath: 'id' });
          checkinStore.createIndex('habitId', 'habitId', { unique: false });
          checkinStore.createIndex('date', 'date', { unique: false });
          checkinStore.createIndex('habitDate', ['habitId', 'date'], { unique: true });
        }

        // 报表表
        if (!db.objectStoreNames.contains('reports')) {
          const reportStore = db.createObjectStore('reports', { keyPath: 'id' });
          reportStore.createIndex('type', 'type', { unique: false });
          reportStore.createIndex('period', 'period', { unique: false });
        }

        // 设置表
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      }

      // V2 迁移：新增同步字段和 sync_queue
      if (oldVersion < 2) {
        // 为现有 stores 添加 V2 索引
        ['habits', 'checkins', 'reports'].forEach((storeName) => {
          if (db.objectStoreNames.contains(storeName)) {
            const tx = event.target.transaction; // 使用升级事务
            const store = tx.objectStore(storeName);

            // 添加 V2 索引（如果不存在）
            if (!store.indexNames.contains('userId')) {
              store.createIndex('userId', 'userId', { unique: false });
            }
            if (!store.indexNames.contains('syncStatus')) {
              store.createIndex('syncStatus', 'syncStatus', { unique: false });
            }
            if (!store.indexNames.contains('updatedAt')) {
              store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
          }
        });

        // 创建 sync_queue 表
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          syncStore.createIndex('userId', 'userId', { unique: false });
          syncStore.createIndex('createdAt', 'createdAt', { unique: false });
          syncStore.createIndex('status', 'status', { unique: false });
        }
      }
    };

    request.onsuccess = () => {
      clearTimeout(timeoutId);
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timeoutId);
      dbUnavailable = true;
      reject(request.error);
    };
  });
}

/**
 * 获取/创建持久 DB 连接（带重试 & 降级）
 */
async function getDB() {
  if (dbUnavailable) return null;
  try {
    return await withTimeout(openDB(), DB_TIMEOUT, 'openDB');
  } catch (e) {
    console.warn('[日积跬步] IndexedDB 不可用，切换到内存模式:', e.message);
    dbUnavailable = true;
    return null;
  }
}

/**
 * 生成 UUID v4
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 为记录添加用户ID和同步元数据
 */
function _stampRecord(record, isNew) {
  const now = new Date().toISOString();
  if (isNew && !record.id) {
    record.id = generateId();
    record.createdAt = now;
  }
  record.updatedAt = now;
  if (currentUserId && !record.userId) {
    record.userId = currentUserId;
  }
  if (!record.syncStatus) {
    record.syncStatus = SYNC_STATUS.LOCAL;
  }
  return record;
}

/**
 * 过滤当前用户的记录
 */
function _filterByUser(records) {
  if (!currentUserId) return records;
  return records.filter(r => !r.userId || r.userId === currentUserId);
}

// ==================== 习惯 CRUD ====================

async function getHabits() {
  if (dbUnavailable) return _filterByUser([...MEMORY_STORE.habits]);

  const db = await getDB();
  if (!db) return _filterByUser([...MEMORY_STORE.habits]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('habits', 'readonly');
    const store = tx.objectStore('habits');
    const index = store.index('order');
    const request = index.getAll();

    request.onsuccess = () => resolve(_filterByUser(request.result));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function getActiveHabits() {
  const habits = await getHabits();
  return habits.filter((h) => h.status === 'active');
}

async function getHabitById(id) {
  if (dbUnavailable) {
    const h = MEMORY_STORE.habits.find(h => h.id === id);
    return (h && (!h.userId || h.userId === currentUserId)) ? h : null;
  }

  const db = await getDB();
  if (!db) {
    const h = MEMORY_STORE.habits.find(h => h.id === id);
    return (h && (!h.userId || h.userId === currentUserId)) ? h : null;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('habits', 'readonly');
    const store = tx.objectStore('habits');
    const request = store.get(id);

    request.onsuccess = () => {
      const r = request.result;
      if (r && currentUserId && r.userId && r.userId !== currentUserId) {
        resolve(null);
      } else {
        resolve(r || null);
      }
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveHabit(habit) {
  const isNew = !habit.id;
  _stampRecord(habit, isNew);

  if (dbUnavailable) {
    const idx = MEMORY_STORE.habits.findIndex(h => h.id === habit.id);
    if (idx >= 0) MEMORY_STORE.habits[idx] = habit;
    else MEMORY_STORE.habits.push(habit);
    return habit.id;
  }

  const db = await getDB();
  if (!db) {
    const idx = MEMORY_STORE.habits.findIndex(h => h.id === habit.id);
    if (idx >= 0) MEMORY_STORE.habits[idx] = habit;
    else MEMORY_STORE.habits.push(habit);
    return habit.id;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('habits', 'readwrite');
    const store = tx.objectStore('habits');
    store.put(habit);
    tx.oncomplete = () => {
      db.close();
      // 加入同步队列
      _enqueueSync('habits', habit.id, isNew ? 'create' : 'update', habit);
      resolve(habit.id);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteHabit(id) {
  if (dbUnavailable) {
    MEMORY_STORE.habits = MEMORY_STORE.habits.filter(h => h.id !== id);
    _enqueueSync('habits', id, 'delete', { id });
    return;
  }

  const db = await getDB();
  if (!db) {
    MEMORY_STORE.habits = MEMORY_STORE.habits.filter(h => h.id !== id);
    _enqueueSync('habits', id, 'delete', { id });
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('habits', 'readwrite');
    const store = tx.objectStore('habits');
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      _enqueueSync('habits', id, 'delete', { id });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// ==================== 打卡记录 ====================

async function getCheckinsByDate(date) {
  if (dbUnavailable) {
    const result = {};
    MEMORY_STORE.checkins
      .filter(c => c.date === date)
      .filter(c => !currentUserId || !c.userId || c.userId === currentUserId)
      .forEach(c => { result[c.habitId] = c; });
    return result;
  }

  const db = await getDB();
  if (!db) {
    const result = {};
    MEMORY_STORE.checkins
      .filter(c => c.date === date)
      .filter(c => !currentUserId || !c.userId || c.userId === currentUserId)
      .forEach(c => { result[c.habitId] = c; });
    return result;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('checkins', 'readonly');
    const store = tx.objectStore('checkins');
    const index = store.index('date');
    const request = index.getAll(date);

    request.onsuccess = () => {
      const map = {};
      _filterByUser(request.result).forEach((c) => {
        map[c.habitId] = c;
      });
      resolve(map);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function getCheckinsByDateRange(startDate, endDate) {
  if (dbUnavailable) {
    return _filterByUser(
      MEMORY_STORE.checkins.filter(c => c.date >= startDate && c.date <= endDate)
    );
  }

  const db = await getDB();
  if (!db) {
    return _filterByUser(
      MEMORY_STORE.checkins.filter(c => c.date >= startDate && c.date <= endDate)
    );
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('checkins', 'readonly');
    const store = tx.objectStore('checkins');
    const index = store.index('date');
    const range = IDBKeyRange.bound(startDate, endDate);
    const request = index.getAll(range);

    request.onsuccess = () => resolve(_filterByUser(request.result));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function getCheckinsByHabit(habitId, startDate, endDate) {
  if (dbUnavailable) {
    return _filterByUser(
      MEMORY_STORE.checkins.filter(c =>
        c.habitId === habitId &&
        (!startDate || c.date >= startDate) &&
        (!endDate || c.date <= endDate)
      )
    );
  }

  const db = await getDB();
  if (!db) {
    return _filterByUser(
      MEMORY_STORE.checkins.filter(c =>
        c.habitId === habitId &&
        (!startDate || c.date >= startDate) &&
        (!endDate || c.date <= endDate)
      )
    );
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('checkins', 'readonly');
    const store = tx.objectStore('checkins');
    const index = store.index('habitId');
    const request = index.getAll(habitId);

    request.onsuccess = () => {
      let results = _filterByUser(request.result);
      if (startDate) results = results.filter((c) => c.date >= startDate);
      if (endDate) results = results.filter((c) => c.date <= endDate);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function getCheckin(habitId, date) {
  if (dbUnavailable) {
    const c = MEMORY_STORE.checkins.find(c => c.habitId === habitId && c.date === date);
    return (c && (!c.userId || c.userId === currentUserId)) ? c : null;
  }

  const db = await getDB();
  if (!db) {
    const c = MEMORY_STORE.checkins.find(c => c.habitId === habitId && c.date === date);
    return (c && (!c.userId || c.userId === currentUserId)) ? c : null;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('checkins', 'readonly');
    const store = tx.objectStore('checkins');
    const index = store.index('habitDate');
    const request = index.get([habitId, date]);

    request.onsuccess = () => {
      const r = request.result;
      if (r && currentUserId && r.userId && r.userId !== currentUserId) {
        resolve(null);
      } else {
        resolve(r || null);
      }
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveCheckin(checkin) {
  const isNew = !checkin.id;
  _stampRecord(checkin, isNew);

  if (dbUnavailable) {
    const existingIdx = MEMORY_STORE.checkins.findIndex(
      c => c.habitId === checkin.habitId && c.date === checkin.date
    );
    if (existingIdx >= 0) MEMORY_STORE.checkins[existingIdx] = checkin;
    else MEMORY_STORE.checkins.push(checkin);
    return;
  }

  const db = await getDB();
  if (!db) {
    const existingIdx = MEMORY_STORE.checkins.findIndex(
      c => c.habitId === checkin.habitId && c.date === checkin.date
    );
    if (existingIdx >= 0) MEMORY_STORE.checkins[existingIdx] = checkin;
    else MEMORY_STORE.checkins.push(checkin);
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('checkins', 'readwrite');
    const store = tx.objectStore('checkins');
    store.put(checkin);
    tx.oncomplete = () => {
      db.close();
      _enqueueSync('checkins', checkin.id, isNew ? 'create' : 'update', checkin);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function getCheckinStats(startDate, endDate) {
  if (dbUnavailable) {
    const stats = {};
    _filterByUser(
      MEMORY_STORE.checkins.filter(c => c.date >= startDate && c.date <= endDate)
    ).forEach(c => {
      if (!stats[c.date]) stats[c.date] = { completed: 0, total: 0 };
      stats[c.date].total++;
      if (c.completed) stats[c.date].completed++;
    });
    return stats;
  }

  const db = await getDB();
  if (!db) {
    const stats = {};
    _filterByUser(
      MEMORY_STORE.checkins.filter(c => c.date >= startDate && c.date <= endDate)
    ).forEach(c => {
      if (!stats[c.date]) stats[c.date] = { completed: 0, total: 0 };
      stats[c.date].total++;
      if (c.completed) stats[c.date].completed++;
    });
    return stats;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('checkins', 'readonly');
    const store = tx.objectStore('checkins');
    const index = store.index('date');
    const range = IDBKeyRange.bound(startDate, endDate);
    const request = index.getAll(range);

    request.onsuccess = () => {
      const stats = {};
      _filterByUser(request.result).forEach((c) => {
        if (!stats[c.date]) stats[c.date] = { completed: 0, total: 0 };
        stats[c.date].total++;
        if (c.completed) stats[c.date].completed++;
      });
      resolve(stats);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

// ==================== 报表 ====================

async function saveReport(report) {
  const isNew = !report.id;
  _stampRecord(report, isNew);

  if (dbUnavailable) { MEMORY_STORE.reports.push(report); return; }

  const db = await getDB();
  if (!db) { MEMORY_STORE.reports.push(report); return; }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('reports', 'readwrite');
    const store = tx.objectStore('reports');
    store.put(report);
    tx.oncomplete = () => {
      db.close();
      _enqueueSync('reports', report.id, isNew ? 'create' : 'update', report);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function getReports(type) {
  if (dbUnavailable) {
    const filtered = type
      ? MEMORY_STORE.reports.filter(r => r.type === type)
      : [...MEMORY_STORE.reports];
    return _filterByUser(filtered);
  }

  const db = await getDB();
  if (!db) {
    const filtered = type
      ? MEMORY_STORE.reports.filter(r => r.type === type)
      : [...MEMORY_STORE.reports];
    return _filterByUser(filtered);
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reports', 'readonly');
    const store = tx.objectStore('reports');
    let request;

    if (type) {
      const index = store.index('type');
      request = index.getAll(type);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      const results = _filterByUser(request.result).sort(
        (a, b) => new Date(b.generatedAt) - new Date(a.generatedAt)
      );
      resolve(results);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

// ==================== 设置 ====================

async function getSetting(key, defaultValue = null) {
  if (dbUnavailable) return MEMORY_STORE.settings[key] !== undefined ? MEMORY_STORE.settings[key] : defaultValue;

  const db = await getDB();
  if (!db) return MEMORY_STORE.settings[key] !== undefined ? MEMORY_STORE.settings[key] : defaultValue;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result ? request.result.value : defaultValue);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveSetting(key, value) {
  if (dbUnavailable) { MEMORY_STORE.settings[key] = value; return; }

  const db = await getDB();
  if (!db) { MEMORY_STORE.settings[key] = value; return; }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    store.put({ key, value });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

// ==================== 同步队列 ====================

/**
 * 将操作加入同步队列（内部方法）
 */
function _enqueueSync(storeName, recordId, operation, data) {
  if (!currentUserId) return; // 未登录不同步

  const entry = {
    id: generateId(),
    userId: currentUserId,
    store: storeName,
    recordId: recordId,
    operation: operation,
    data: data,
    status: 'pending',
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  if (dbUnavailable) {
    MEMORY_STORE.sync_queue.push(entry);
    return;
  }

  // 异步写入队列，不阻塞主流程
  getDB().then(db => {
    if (!db) {
      MEMORY_STORE.sync_queue.push(entry);
      return;
    }
    try {
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      store.put(entry);
      tx.oncomplete = () => db.close();
    } catch (e) {
      MEMORY_STORE.sync_queue.push(entry);
    }
  }).catch(() => {
    MEMORY_STORE.sync_queue.push(entry);
  });
}

/**
 * 获取所有待同步的队列项
 * @returns {Promise<Array>}
 */
async function getPendingSyncQueue() {
  if (dbUnavailable) {
    return MEMORY_STORE.sync_queue.filter(q =>
      q.status === 'pending' && (!currentUserId || q.userId === currentUserId)
    );
  }

  const db = await getDB();
  if (!db) {
    return MEMORY_STORE.sync_queue.filter(q =>
      q.status === 'pending' && (!currentUserId || q.userId === currentUserId)
    );
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result.filter(q =>
        q.status === 'pending' && (!currentUserId || q.userId === currentUserId)
      ));
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * 获取所有未同步的记录（直接从数据表查询）
 * @returns {Promise<Object>} { habits: [], checkins: [], reports: [] }
 */
async function getUnsyncedRecords() {
  if (dbUnavailable) {
    return {
      habits: MEMORY_STORE.habits.filter(h => h.syncStatus !== SYNC_STATUS.SYNCED),
      checkins: MEMORY_STORE.checkins.filter(c => c.syncStatus !== SYNC_STATUS.SYNCED),
      reports: MEMORY_STORE.reports.filter(r => r.syncStatus !== SYNC_STATUS.SYNCED),
    };
  }

  const db = await getDB();
  if (!db) {
    return {
      habits: MEMORY_STORE.habits.filter(h => h.syncStatus !== SYNC_STATUS.SYNCED),
      checkins: MEMORY_STORE.checkins.filter(c => c.syncStatus !== SYNC_STATUS.SYNCED),
      reports: MEMORY_STORE.reports.filter(r => r.syncStatus !== SYNC_STATUS.SYNCED),
    };
  }

  const result = { habits: [], checkins: [], reports: [] };

  for (const storeName of ['habits', 'checkins', 'reports']) {
    try {
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {};
      });
      result[storeName] = _filterByUser(records).filter(
        r => !r.syncStatus || r.syncStatus !== SYNC_STATUS.SYNCED
      );
    } catch (e) {
      console.warn(`[DB] 读取 ${storeName} 未同步记录失败:`, e.message);
    }
  }

  db.close();
  return result;
}

/**
 * 标记记录为已同步
 * @param {string} storeName
 * @param {string[]} recordIds
 */
async function markSynced(storeName, recordIds) {
  if (!recordIds || recordIds.length === 0) return;

  if (dbUnavailable) {
    recordIds.forEach(id => {
      const record = MEMORY_STORE[storeName]?.find(r => r.id === id);
      if (record) {
        record.syncStatus = SYNC_STATUS.SYNCED;
        record.syncedAt = new Date().toISOString();
      }
    });
    return;
  }

  const db = await getDB();
  if (!db) {
    recordIds.forEach(id => {
      const record = MEMORY_STORE[storeName]?.find(r => r.id === id);
      if (record) {
        record.syncStatus = SYNC_STATUS.SYNCED;
        record.syncedAt = new Date().toISOString();
      }
    });
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    let completed = 0;
    recordIds.forEach(id => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          record.syncStatus = SYNC_STATUS.SYNCED;
          record.syncedAt = new Date().toISOString();
          store.put(record);
        }
        completed++;
        if (completed >= recordIds.length) {
          // all done
        }
      };
      getReq.onerror = () => {
        completed++;
      };
    });

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 标记同步队列项为已完成
 * @param {string[]} queueIds
 */
async function markSyncQueueDone(queueIds) {
  if (!queueIds || queueIds.length === 0) return;

  if (dbUnavailable) {
    MEMORY_STORE.sync_queue = MEMORY_STORE.sync_queue.filter(
      q => !queueIds.includes(q.id)
    );
    return;
  }

  const db = await getDB();
  if (!db) {
    MEMORY_STORE.sync_queue = MEMORY_STORE.sync_queue.filter(
      q => !queueIds.includes(q.id)
    );
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    queueIds.forEach(id => store.delete(id));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取上次同步时间
 */
async function getLastSyncTime() {
  if (dbUnavailable) return MEMORY_STORE._meta.lastSyncTime;
  return await getSetting('last_sync_time', null);
}

/**
 * 设置上次同步时间
 */
async function setLastSyncTime(time) {
  MEMORY_STORE._meta.lastSyncTime = time;
  await saveSetting('last_sync_time', time);
}

/**
 * 获取同步统计信息
 * @returns {Promise<Object>}
 */
async function getSyncStats() {
  try {
    const unsynced = await getUnsyncedRecords();
    const totalUnsynced =
      unsynced.habits.length + unsynced.checkins.length + unsynced.reports.length;

    let queuePending = 0;
    try {
      const queue = await getPendingSyncQueue();
      queuePending = queue.length;
    } catch (e) { /* ignore */ }

    const lastSync = await getLastSyncTime();

    return {
      totalUnsynced,
      queuePending,
      lastSyncTime: lastSync,
      habits: unsynced.habits.length,
      checkins: unsynced.checkins.length,
      reports: unsynced.reports.length,
    };
  } catch (e) {
    return { totalUnsynced: 0, queuePending: 0, lastSyncTime: null, habits: 0, checkins: 0, reports: 0 };
  }
}

/**
 * 批量合并云端数据到本地（用于 pullFromCloud）
 * @param {Object} cloudData { habits: [], checkins: [], reports: [] }
 * @returns {Promise<Object>} { merged: number, conflicts: number }
 */
async function mergeCloudData(cloudData) {
  let merged = 0;
  let conflicts = 0;

  for (const [storeName, records] of Object.entries(cloudData)) {
    if (!records || records.length === 0) continue;
    if (!['habits', 'checkins', 'reports'].includes(storeName)) continue;

    if (dbUnavailable) {
      for (const remoteRecord of records) {
        const localRecord = MEMORY_STORE[storeName].find(r => r.id === remoteRecord.id);
        if (!localRecord) {
          remoteRecord.syncStatus = SYNC_STATUS.SYNCED;
          MEMORY_STORE[storeName].push(remoteRecord);
          merged++;
        } else if (!localRecord.updatedAt || new Date(remoteRecord.updatedAt) > new Date(localRecord.updatedAt)) {
          // 远程更新，覆盖本地
          Object.assign(localRecord, remoteRecord, { syncStatus: SYNC_STATUS.SYNCED });
          merged++;
        } else if (new Date(remoteRecord.updatedAt) < new Date(localRecord.updatedAt)) {
          // 本地更新，保留本地（将在下次push时上传）
          conflicts++;
        }
      }
      continue;
    }

    const db = await getDB();
    if (!db) {
      // 降级到内存
      for (const remoteRecord of records) {
        const localRecord = MEMORY_STORE[storeName].find(r => r.id === remoteRecord.id);
        if (!localRecord) {
          remoteRecord.syncStatus = SYNC_STATUS.SYNCED;
          MEMORY_STORE[storeName].push(remoteRecord);
          merged++;
        } else if (!localRecord.updatedAt || new Date(remoteRecord.updatedAt) > new Date(localRecord.updatedAt)) {
          Object.assign(localRecord, remoteRecord, { syncStatus: SYNC_STATUS.SYNCED });
          merged++;
        } else {
          conflicts++;
        }
      }
      continue;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      for (const remoteRecord of records) {
        const getReq = store.get(remoteRecord.id);
        getReq.onsuccess = () => {
          const localRecord = getReq.result;
          if (!localRecord) {
            remoteRecord.syncStatus = SYNC_STATUS.SYNCED;
            store.put(remoteRecord);
            merged++;
          } else if (!localRecord.updatedAt || new Date(remoteRecord.updatedAt) > new Date(localRecord.updatedAt)) {
            Object.assign(localRecord, remoteRecord, { syncStatus: SYNC_STATUS.SYNCED });
            store.put(localRecord);
            merged++;
          } else {
            conflicts++;
          }
        };
      }

      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  }

  return { merged, conflicts };
}

// ==================== 数据导出/导入 ====================

async function exportAllData() {
  if (dbUnavailable) {
    return {
      habits: _filterByUser([...MEMORY_STORE.habits]),
      checkins: _filterByUser([...MEMORY_STORE.checkins]),
      reports: _filterByUser([...MEMORY_STORE.reports]),
      settings: { ...MEMORY_STORE.settings },
      exportedAt: new Date().toISOString(),
    };
  }

  const db = await getDB();
  if (!db) {
    return {
      habits: _filterByUser([...MEMORY_STORE.habits]),
      checkins: _filterByUser([...MEMORY_STORE.checkins]),
      reports: _filterByUser([...MEMORY_STORE.reports]),
      settings: { ...MEMORY_STORE.settings },
      exportedAt: new Date().toISOString(),
    };
  }
  const data = {};

  for (const storeName of db.objectStoreNames) {
    if (storeName === 'sync_queue') continue;
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    data[storeName] = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 过滤当前用户数据
  for (const key of ['habits', 'checkins', 'reports']) {
    if (data[key]) data[key] = _filterByUser(data[key]);
  }

  db.close();
  data.exportedAt = new Date().toISOString();
  return data;
}

async function importAllData(data) {
  if (dbUnavailable) {
    if (data.habits) MEMORY_STORE.habits = data.habits.map(r => _stampRecord(r, false));
    if (data.checkins) MEMORY_STORE.checkins = data.checkins.map(r => _stampRecord(r, false));
    if (data.reports) MEMORY_STORE.reports = data.reports.map(r => _stampRecord(r, false));
    if (data.settings) {
      if (Array.isArray(data.settings)) {
        data.settings.forEach(s => { MEMORY_STORE.settings[s.key] = s.value; });
      } else {
        Object.assign(MEMORY_STORE.settings, data.settings);
      }
    }
    return;
  }

  const db = await getDB();
  if (!db) {
    if (data.habits) MEMORY_STORE.habits = data.habits.map(r => _stampRecord(r, false));
    if (data.checkins) MEMORY_STORE.checkins = data.checkins.map(r => _stampRecord(r, false));
    if (data.reports) MEMORY_STORE.reports = data.reports.map(r => _stampRecord(r, false));
    if (data.settings) {
      if (Array.isArray(data.settings)) {
        data.settings.forEach(s => { MEMORY_STORE.settings[s.key] = s.value; });
      } else {
        Object.assign(MEMORY_STORE.settings, data.settings);
      }
    }
    return;
  }

  for (const [storeName, records] of Object.entries(data)) {
    if (!db.objectStoreNames.contains(storeName)) continue;
    if (storeName === 'sync_queue') continue;

    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      if (storeName === 'settings' && Array.isArray(records)) {
        // settings are in array format [{key, value}]
        store.clear();
        records.forEach((record) => store.put(record));
      } else if (Array.isArray(records)) {
        // 不清理现有数据，只做 upsert
        records.forEach((record) => {
          record.syncStatus = SYNC_STATUS.LOCAL;
          store.put(record);
        });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  db.close();
}

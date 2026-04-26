// ===== Local-first Firebase Sync Store =====
const STORAGE_KEY = 'tododash-todos';
const META_KEY = 'tododash-sync-meta';
const CLIENT_ID_KEY = 'tododash-client-id';
const FIREBASE_CONFIG = window.FIREBASE_CONFIG || null;
const FIREBASE_COLLECTION = 'todoDashUsers';

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function generateId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeTodo(todo) {
  const stamp = todo.updatedAtMs || todo.createdAtMs || Date.parse(todo.updatedAt || todo.createdAt || '') || nowMs();
  const createdAtMs = todo.createdAtMs || Date.parse(todo.createdAt || '') || stamp;
  const updatedAtMs = todo.updatedAtMs || stamp;
  return {
    id: todo.id || generateId(),
    title: todo.title || '',
    description: todo.description || '',
    category: todo.category || 'General',
    status: todo.status || 'todo',
    priority: todo.priority || 'medium',
    due: todo.due || '',
    createdAt: todo.createdAt || new Date(createdAtMs).toISOString(),
    createdAtMs,
    updatedAt: todo.updatedAt || new Date(updatedAtMs).toISOString(),
    updatedAtMs
  };
}

function cloneTodos(todos) {
  return todos.map(todo => ({ ...todo }));
}

function readLocalTodos() {
  return safeParse(localStorage.getItem(STORAGE_KEY), []).map(normalizeTodo);
}

function writeLocalTodos(todos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos.map(normalizeTodo)));
}

function readMeta() {
  return safeParse(localStorage.getItem(META_KEY), {
    lastLocalChangeAt: 0,
    lastRemoteSyncAt: 0
  });
}

function writeMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function compareTodoLists(a, b) {
  return JSON.stringify(a.map(normalizeTodo)) === JSON.stringify(b.map(normalizeTodo));
}

function mergeTodoLists(localTodos, remoteTodos) {
  const map = new Map();
  const push = (todo) => {
    const normalized = normalizeTodo(todo);
    const existing = map.get(normalized.id);
    if (!existing || normalized.updatedAtMs >= existing.updatedAtMs) {
      map.set(normalized.id, normalized);
    }
  };

  remoteTodos.forEach(push);
  localTodos.forEach(push);

  return Array.from(map.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

const APP_STATE = {
  todos: readLocalTodos(),
  listeners: new Set(),
  clientId: localStorage.getItem(CLIENT_ID_KEY) || generateId(),
  firebaseEnabled: !!FIREBASE_CONFIG,
  firebaseReady: false,
  remoteReady: false,
  online: navigator.onLine,
  user: null,
  syncing: false,
  pendingSync: false,
  syncError: '',
  lastLocalChangeAt: readMeta().lastLocalChangeAt || 0,
  lastRemoteSyncAt: readMeta().lastRemoteSyncAt || 0,
  remoteDocRef: null,
  remoteUnsubscribe: null,
  syncTimer: null,
  auth: null,
  db: null
};

localStorage.setItem(CLIENT_ID_KEY, APP_STATE.clientId);
writeLocalTodos(APP_STATE.todos);
writeMeta({
  lastLocalChangeAt: APP_STATE.lastLocalChangeAt,
  lastRemoteSyncAt: APP_STATE.lastRemoteSyncAt
});

function hasFirebaseRuntime() {
  return typeof firebase !== 'undefined' && firebase && typeof firebase.initializeApp === 'function' && typeof firebase.auth === 'function' && typeof firebase.firestore === 'function';
}

function canSyncToCloud() {
  return APP_STATE.firebaseEnabled && APP_STATE.firebaseReady && !!APP_STATE.user && APP_STATE.online && !!APP_STATE.remoteDocRef;
}

function getSyncLabel() {
  if (!APP_STATE.firebaseEnabled || !hasFirebaseRuntime() || !APP_STATE.firebaseReady) {
    return { label: 'Local only', tone: 'local', detail: 'Stored in this browser' };
  }

  if (!APP_STATE.user) {
    return APP_STATE.online
      ? { label: 'Firebase ready', tone: 'local', detail: 'Sign in to sync across devices' }
      : { label: 'Offline', tone: 'offline', detail: 'Connect to sync across devices' };
  }

  if (!APP_STATE.online) {
    return { label: 'Offline', tone: 'offline', detail: 'Changes will sync when you are back online' };
  }

  if (APP_STATE.syncing) {
    return { label: 'Syncing', tone: 'syncing', detail: 'Updating cloud copy now' };
  }

  if (APP_STATE.pendingSync) {
    return { label: 'Pending sync', tone: 'syncing', detail: 'Saving local changes to Firebase' };
  }

  if (APP_STATE.remoteReady) {
    return { label: 'Synced', tone: 'online', detail: 'Signed in as ' + (APP_STATE.user.displayName || APP_STATE.user.email || 'Google user') };
  }

  return { label: 'Connecting', tone: 'local', detail: 'Preparing cloud sync' };
}

function emitChange() {
  const snapshot = TodoStore.getSyncState();
  APP_STATE.listeners.forEach(listener => listener(snapshot));
}

function persistTodos(nextTodos, options = {}) {
  const {
    markDirty = true,
    touchedAt = nowMs(),
    remoteSyncAt = null
  } = options;

  APP_STATE.todos = nextTodos.map(normalizeTodo).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  writeLocalTodos(APP_STATE.todos);

  if (markDirty) {
    APP_STATE.lastLocalChangeAt = touchedAt;
    APP_STATE.pendingSync = true;
  }

  if (remoteSyncAt !== null) {
    APP_STATE.lastRemoteSyncAt = remoteSyncAt;
  }

  writeMeta({
    lastLocalChangeAt: APP_STATE.lastLocalChangeAt,
    lastRemoteSyncAt: APP_STATE.lastRemoteSyncAt
  });

  emitChange();

  if (markDirty) {
    scheduleCloudSync();
  }
}

function scheduleCloudSync() {
  if (!canSyncToCloud()) {
    emitChange();
    return;
  }

  if (APP_STATE.syncTimer) {
    clearTimeout(APP_STATE.syncTimer);
  }

  APP_STATE.syncTimer = setTimeout(() => {
    pushLocalStateToCloud().catch(() => {});
  }, 350);

  emitChange();
}

async function pushLocalStateToCloud() {
  if (!canSyncToCloud()) {
    return;
  }

  APP_STATE.syncing = true;
  APP_STATE.syncError = '';
  emitChange();

  const payloadVersion = APP_STATE.lastLocalChangeAt || nowMs();
  const payload = {
    todos: cloneTodos(APP_STATE.todos),
    updatedAtMs: payloadVersion,
    clientId: APP_STATE.clientId,
    clientUpdatedAt: nowIso()
  };

  try {
    await APP_STATE.remoteDocRef.set(payload, { merge: true });
    APP_STATE.pendingSync = false;
    APP_STATE.lastRemoteSyncAt = payloadVersion;
    writeMeta({
      lastLocalChangeAt: APP_STATE.lastLocalChangeAt,
      lastRemoteSyncAt: APP_STATE.lastRemoteSyncAt
    });
  } catch (error) {
    APP_STATE.syncError = error && error.message ? error.message : 'Cloud sync failed';
    APP_STATE.pendingSync = true;
  } finally {
    APP_STATE.syncing = false;
    emitChange();
  }
}

function connectFirestoreUser(uid) {
  if (!APP_STATE.firebaseReady || !APP_STATE.db) {
    return;
  }

  if (APP_STATE.remoteUnsubscribe) {
    APP_STATE.remoteUnsubscribe();
    APP_STATE.remoteUnsubscribe = null;
  }

  APP_STATE.remoteDocRef = APP_STATE.db.collection(FIREBASE_COLLECTION).doc(uid).collection('state').doc('todos');
  APP_STATE.remoteReady = false;
  APP_STATE.syncError = '';

  APP_STATE.remoteUnsubscribe = APP_STATE.remoteDocRef.onSnapshot((doc) => {
    const data = doc.exists ? (doc.data() || {}) : {};
    const remoteTodos = Array.isArray(data.todos) ? data.todos.map(normalizeTodo) : [];
    const remoteVersion = Number(data.updatedAtMs || 0);
    const merged = mergeTodoLists(APP_STATE.todos, remoteTodos);
    const mergedDiffersFromRemote = !compareTodoLists(merged, remoteTodos);
    const mergedDiffersFromLocal = !compareTodoLists(merged, APP_STATE.todos);

    if (mergedDiffersFromLocal) {
      APP_STATE.todos = merged;
      writeLocalTodos(APP_STATE.todos);
    }

    APP_STATE.remoteReady = true;
    APP_STATE.lastRemoteSyncAt = remoteVersion || nowMs();
    APP_STATE.pendingSync = mergedDiffersFromRemote;
    writeMeta({
      lastLocalChangeAt: APP_STATE.lastLocalChangeAt,
      lastRemoteSyncAt: APP_STATE.lastRemoteSyncAt
    });
    emitChange();

    if (APP_STATE.pendingSync) {
      scheduleCloudSync();
    }
  }, (error) => {
    APP_STATE.syncError = error && error.message ? error.message : 'Cloud listener failed';
    APP_STATE.remoteReady = false;
    emitChange();
  });
}

function initFirebase() {
  if (!APP_STATE.firebaseEnabled || !hasFirebaseRuntime()) {
    APP_STATE.firebaseReady = false;
    emitChange();
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    APP_STATE.auth = firebase.auth();
    APP_STATE.db = firebase.firestore();
    APP_STATE.firebaseReady = true;

    if (APP_STATE.db && APP_STATE.db.enablePersistence) {
      APP_STATE.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    }

    APP_STATE.auth.onAuthStateChanged((user) => {
      APP_STATE.user = user || null;
      APP_STATE.remoteReady = false;
      APP_STATE.syncError = '';

      if (user) {
        connectFirestoreUser(user.uid);
        if (APP_STATE.pendingSync || APP_STATE.lastLocalChangeAt > APP_STATE.lastRemoteSyncAt) {
          scheduleCloudSync();
        }
      } else if (APP_STATE.remoteUnsubscribe) {
        APP_STATE.remoteUnsubscribe();
        APP_STATE.remoteUnsubscribe = null;
        APP_STATE.remoteDocRef = null;
      }

      emitChange();
    });
  } catch (error) {
    APP_STATE.firebaseReady = false;
    APP_STATE.syncError = error && error.message ? error.message : 'Firebase setup failed';
    emitChange();
  }
}

window.addEventListener('online', () => {
  APP_STATE.online = true;
  emitChange();
  if (canSyncToCloud() && APP_STATE.pendingSync) {
    scheduleCloudSync();
  }
});

window.addEventListener('offline', () => {
  APP_STATE.online = false;
  emitChange();
});

const TodoStore = {
  getAll() {
    return cloneTodos(APP_STATE.todos);
  },

  save(todos) {
    const stamp = nowMs();
    persistTodos(todos, { touchedAt: stamp, markDirty: true });
  },

  add(todo) {
    const stamp = nowMs();
    const item = normalizeTodo({
      ...todo,
      id: generateId(),
      createdAt: nowIso(),
      createdAtMs: stamp,
      updatedAt: nowIso(),
      updatedAtMs: stamp
    });
    persistTodos([item, ...APP_STATE.todos], { touchedAt: stamp, markDirty: true });
    return { ...item };
  },

  update(id, updates) {
    const stamp = nowMs();
    const next = APP_STATE.todos.map(todo => {
      if (todo.id !== id) {
        return todo;
      }
      return normalizeTodo({
        ...todo,
        ...updates,
        updatedAt: nowIso(),
        updatedAtMs: stamp
      });
    });
    const updated = next.find(todo => todo.id === id) || null;
    if (!updated) {
      return null;
    }
    persistTodos(next, { touchedAt: stamp, markDirty: true });
    return { ...updated };
  },

  remove(id) {
    const stamp = nowMs();
    const next = APP_STATE.todos.filter(todo => todo.id !== id);
    persistTodos(next, { touchedAt: stamp, markDirty: true });
  },

  toggleComplete(id) {
    const stamp = nowMs();
    let changed = null;
    const next = APP_STATE.todos.map(todo => {
      if (todo.id !== id) {
        return todo;
      }
      changed = normalizeTodo({
        ...todo,
        status: todo.status === 'done' ? 'todo' : 'done',
        updatedAt: nowIso(),
        updatedAtMs: stamp
      });
      return changed;
    });

    if (!changed) {
      return null;
    }

    persistTodos(next, { touchedAt: stamp, markDirty: true });
    return { ...changed };
  },

  subscribe(listener) {
    APP_STATE.listeners.add(listener);
    listener(this.getSyncState());
    return () => APP_STATE.listeners.delete(listener);
  },

  getSyncState() {
    const sync = getSyncLabel();
    return {
      mode: APP_STATE.firebaseEnabled ? 'firebase' : 'local',
      firebaseConfigured: APP_STATE.firebaseEnabled,
      firebaseReady: APP_STATE.firebaseReady,
      online: APP_STATE.online,
      authenticated: !!APP_STATE.user,
      user: APP_STATE.user ? {
        displayName: APP_STATE.user.displayName || '',
        email: APP_STATE.user.email || '',
        photoURL: APP_STATE.user.photoURL || ''
      } : null,
      syncing: APP_STATE.syncing,
      pendingSync: APP_STATE.pendingSync,
      remoteReady: APP_STATE.remoteReady,
      syncError: APP_STATE.syncError,
      label: sync.label,
      tone: sync.tone,
      detail: sync.detail
    };
  },

  isFirebaseConfigured() {
    return APP_STATE.firebaseEnabled && hasFirebaseRuntime();
  },

  signInWithGoogle() {
    if (!this.isFirebaseConfigured()) {
      return Promise.reject(new Error('Firebase is not configured yet.'));
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return APP_STATE.auth.signInWithPopup(provider);
  },

  signOut() {
    if (!APP_STATE.auth) {
      return Promise.resolve();
    }
    return APP_STATE.auth.signOut();
  },

  bootstrap() {
    initFirebase();
    emitChange();
  }
};

// ===== Category Colors =====
const CATEGORY_COLORS = {
  'General': '#60a5fa',
  'Work': '#6c63ff',
  'Personal': '#34d399',
  'Shopping': '#fbbf24',
  'Health': '#f87171'
};

function getCategoryColor(cat) {
  return CATEGORY_COLORS[cat] || '#9ca3af';
}

// ===== Filtering & Search =====
function filterTodos(todos, { status, category, search }) {
  return todos.filter(todo => {
    if (status && status !== 'all' && todo.status !== status) return false;
    if (category && category !== 'all' && todo.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchTitle = todo.title.toLowerCase().includes(q);
      const matchDesc = todo.description && todo.description.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    return true;
  });
}

function isOverdue(todo) {
  if (todo.status === 'done' || !todo.due) return false;
  return new Date(todo.due) < new Date(new Date().toDateString());
}

// ===== Stats Calculation =====
function calcStats(todos) {
  const total = todos.length;
  const done = todos.filter(t => t.status === 'done').length;
  const active = total - done;
  const overdue = todos.filter(isOverdue).length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, active, done, overdue, rate };
}

function categoryDistribution(todos) {
  const map = {};
  todos.forEach(t => {
    const cat = t.category || 'General';
    map[cat] = (map[cat] || 0) + 1;
  });
  return map;
}

TodoStore.bootstrap();

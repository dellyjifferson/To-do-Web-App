// ===== Todo Store (localStorage CRUD) =====
const STORAGE_KEY = 'tododash-todos';

const TodoStore = {
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },

  save(todos) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  },

  add(todo) {
    const todos = this.getAll();
    todo.id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    todo.createdAt = new Date().toISOString();
    todos.unshift(todo);
    this.save(todos);
    return todo;
  },

  update(id, updates) {
    const todos = this.getAll();
    const idx = todos.findIndex(t => t.id === id);
    if (idx === -1) return null;
    todos[idx] = { ...todos[idx], ...updates };
    this.save(todos);
    return todos[idx];
  },

  remove(id) {
    const todos = this.getAll().filter(t => t.id !== id);
    this.save(todos);
  },

  toggleComplete(id) {
    const todos = this.getAll();
    const todo = todos.find(t => t.id === id);
    if (!todo) return null;
    todo.status = todo.status === 'done' ? 'todo' : 'done';
    this.save(todos);
    return todo;
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

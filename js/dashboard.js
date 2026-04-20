// ===== Dashboard UI =====
(function () {
  let activeFilter = 'all';
  let activeCategory = 'all';
  let searchQuery = '';
  let editingId = null;

  const $ = (s) => document.querySelector(s);
  const todoList = $('#todo-list');
  const chartBars = $('#chart-bars');
  const categoryList = $('#category-list');
  const pageTitle = $('#page-title');
  const searchInput = $('#search-input');
  const sidebar = $('#sidebar');
  const menuToggle = $('#menu-toggle');
  const completionPct = $('#completion-pct');
  const completionBar = $('#completion-bar');
  const modalOverlay = $('#modal-overlay');
  const modalForm = $('#modal-form');
  const modalTitle = $('#modal-title');

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== Render Stats =====
  function renderStats() {
    const todos = TodoStore.getAll();
    const { total, active, done, overdue, rate } = calcStats(todos);
    $('#stat-total').textContent = total;
    $('#stat-active').textContent = active;
    $('#stat-done').textContent = done;
    $('#stat-overdue').textContent = overdue;
    completionPct.textContent = rate + '%';
    completionBar.style.width = rate + '%';
  }

  // ===== Render Category Chart =====
  function renderChart() {
    const todos = TodoStore.getAll();
    const dist = categoryDistribution(todos);
    const max = Math.max(...Object.values(dist), 1);
    chartBars.innerHTML = Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => {
        const pct = Math.round((count / max) * 100);
        const color = getCategoryColor(cat);
        return '<div class="chart-row">' +
          '<span class="chart-label">' + escapeHtml(cat) + '</span>' +
          '<div class="chart-bar-bg"><div class="chart-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
          '<span class="chart-count">' + count + '</span>' +
          '</div>';
      }).join('');
  }

  // ===== Render Sidebar Categories =====
  function renderCategories() {
    const todos = TodoStore.getAll();
    const cats = categoryDistribution(todos);
    const entries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const allBtn = '<button class="category-btn ' + (activeCategory === 'all' ? 'active' : '') + '" data-cat="all">' +
      '<span class="cat-dot" style="background:#e8eaed"></span>All' +
      '</button>';
    const items = entries.map(([cat, count]) => {
      const color = getCategoryColor(cat);
      const active = activeCategory === cat ? 'active' : '';
      return '<button class="category-btn ' + active + '" data-cat="' + escapeHtml(cat) + '">' +
        '<span class="cat-dot" style="background:' + color + '"></span>' +
        escapeHtml(cat) + ' (' + count + ')' +
        '</button>';
    }).join('');
    categoryList.innerHTML = allBtn + items;
  }

  // ===== Render Todo List =====
  function renderTodos() {
    const todos = TodoStore.getAll();
    const filtered = filterTodos(todos, { status: activeFilter, category: activeCategory, search: searchQuery });

    if (filtered.length === 0 && todos.length === 0) {
      todoList.innerHTML = '<div class="empty-state">' +
        '<div class="empty-state-icon">&#128203;</div>' +
        '<div class="empty-state-title">No tasks yet</div>' +
        '<div class="empty-state-text">Click "New Task" to get started.</div>' +
        '</div>';
      return;
    }

    if (filtered.length === 0) {
      todoList.innerHTML = '<div class="empty-state">' +
        '<div class="empty-state-icon">&#128269;</div>' +
        '<div class="empty-state-title">No matching tasks</div>' +
        '<div class="empty-state-text">Try changing your filters.</div>' +
        '</div>';
      return;
    }

    todoList.innerHTML = filtered.map(todo => {
      const overdue = isOverdue(todo);
      const done = todo.status === 'done';
      const statusLabel = todo.status === 'in-progress' ? 'In Progress' : todo.status.charAt(0).toUpperCase() + todo.status.slice(1);
      const statusClass = 'badge-' + todo.status;
      const prioClass = 'badge-' + todo.priority;
      const dueText = todo.due ? formatDate(todo.due) : '';
      const catColor = getCategoryColor(todo.category || 'General');

      return '<div class="todo-item' + (done ? ' is-done' : '') + '" data-id="' + todo.id + '">' +
        '<div class="todo-info">' +
          '<div class="todo-title">' +
            '<div class="todo-check">' +
              '<div class="toggle ' + (done ? 'checked' : '') + '" data-action="toggle" data-id="' + todo.id + '"></div>' +
            '</div>' +
            '<span class="todo-title-text ' + (done ? 'done' : '') + '" title="' + escapeHtml(todo.title) + '">' + escapeHtml(todo.title) + '</span>' +
            '<span class="badge ' + statusClass + '">' + statusLabel + '</span>' +
            '<span class="badge ' + prioClass + '">' + todo.priority + '</span>' +
            '<span class="cat-badge" style="background:' + catColor + '22;color:' + catColor + '">' + escapeHtml(todo.category || 'General') + '</span>' +
          '</div>' +
          (todo.description ? '<div class="todo-desc">' + escapeHtml(todo.description) + '</div>' : '') +
        '</div>' +
        '<div class="todo-meta">' +
          (overdue ? '<span class="todo-due overdue">Overdue</span>' : '') +
          (dueText ? '<span class="todo-due' + (overdue ? ' overdue' : '') + '">' + dueText + '</span>' : '') +
        '</div>' +
        '<div class="todo-actions">' +
          '<button class="action-btn edit" data-action="edit" data-id="' + todo.id + '" title="Edit">&#9998;</button>' +
          '<button class="action-btn delete" data-action="delete" data-id="' + todo.id + '" title="Delete">&#128465;</button>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  // ===== Full Render =====
  function render() {
    renderStats();
    renderChart();
    renderCategories();
    renderTodos();
  }

  // ===== Page Title =====
  function updateTitle() {
    if (activeFilter === 'all' && activeCategory === 'all') {
      pageTitle.textContent = 'All Tasks';
    } else if (activeCategory !== 'all') {
      pageTitle.textContent = activeCategory;
    } else {
      const label = activeFilter === 'in-progress' ? 'In Progress' : activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1);
      pageTitle.textContent = activeFilter === 'all' ? 'All Tasks' : label + ' Tasks';
    }
  }

  // ===== Modal =====
  function openModal(todo) {
    editingId = todo ? todo.id : null;
    modalTitle.textContent = todo ? 'Edit Task' : 'New Task';
    $('#todo-id').value = todo ? todo.id : '';
    $('#todo-title').value = todo ? todo.title : '';
    $('#todo-desc').value = todo ? (todo.description || '') : '';
    $('#todo-category').value = todo ? (todo.category || 'General') : 'General';
    $('#todo-status').value = todo ? todo.status : 'todo';
    $('#todo-priority').value = todo ? (todo.priority || 'medium') : 'medium';
    $('#todo-due').value = todo ? (todo.due || '') : '';
    modalOverlay.classList.add('visible');
  }

  function closeModal() {
    modalOverlay.classList.remove('visible');
    editingId = null;
    modalForm.reset();
  }

  // ===== Event Listeners =====

  // Nav filter buttons
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      updateTitle();
      render();
      sidebar.classList.remove('open');
    });
  });

  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Category buttons (delegated)
  categoryList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    activeCategory = btn.dataset.cat;
    updateTitle();
    render();
    sidebar.classList.remove('open');
  });

  // Search
  let searchTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      renderTodos();
    }, 200);
  });

  // Add button
  $('#btn-add-todo').addEventListener('click', () => openModal(null));

  // Modal close
  $('#modal-close').addEventListener('click', closeModal);
  $('#btn-cancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Todo list actions (delegated)
  todoList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'toggle') {
      TodoStore.toggleComplete(id);
      render();
    } else if (action === 'edit') {
      const todos = TodoStore.getAll();
      const todo = todos.find(t => t.id === id);
      if (todo) openModal(todo);
    } else if (action === 'delete') {
      TodoStore.remove(id);
      render();
    }
  });

  // Form submit
  modalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      title: $('#todo-title').value.trim(),
      description: $('#todo-desc').value.trim(),
      category: $('#todo-category').value,
      status: $('#todo-status').value,
      priority: $('#todo-priority').value,
      due: $('#todo-due').value
    };
    if (!data.title) return;

    if (editingId) {
      TodoStore.update(editingId, data);
    } else {
      TodoStore.add(data);
    }
    closeModal();
    render();
  });

  // Close sidebar on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalOverlay.classList.contains('visible')) closeModal();
    }
  });

  // ===== Init =====
  // Seed sample data if empty
  if (TodoStore.getAll().length === 0) {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

    TodoStore.add({ title: 'Review pull requests', description: 'Check open PRs in main repo', category: 'Work', status: 'todo', priority: 'high', due: fmt(addDays(today, 1)) });
    TodoStore.add({ title: 'Grocery shopping', description: 'Milk, eggs, bread, vegetables', category: 'Shopping', status: 'todo', priority: 'medium', due: fmt(today) });
    TodoStore.add({ title: 'Morning workout', description: '30 min run + stretching', category: 'Health', status: 'done', priority: 'medium', due: fmt(today) });
    TodoStore.add({ title: 'Update project docs', description: '', category: 'Work', status: 'in-progress', priority: 'low', due: fmt(addDays(today, 3)) });
    TodoStore.add({ title: 'Read current articles', description: 'Finish chapter 7', category: 'Personal', status: 'in-progress', priority: 'low', due: fmt(addDays(today, 5)) });
  }

  render();
})();

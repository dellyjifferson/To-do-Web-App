# TodoDash

A lightweight, responsive Todo dashboard built with vanilla HTML, CSS, and JavaScript.

## Overview

TodoDash is a single-page task manager focused on speed and simplicity. It includes task CRUD operations, filtering, search, status/priority tracking, analytics cards, and local persistence with `localStorage`.

## Features

- Add, edit, delete, and complete tasks
- Track task status: `todo`, `in-progress`, `done`
- Set task priority: `low`, `medium`, `high`
- Assign categories (General, Work, Personal, Shopping, Health)
- Set due dates with overdue highlighting
- Filter by status and category
- Search by title and description
- Dashboard stats:
  - Total tasks
  - Active tasks
  - Completed tasks
  - Overdue tasks
  - Completion rate progress bar
  - Category distribution chart
- Data persistence using browser `localStorage`
- Mobile-friendly responsive layout with sidebar toggle

## Tech Stack

- HTML5
- CSS3 (custom properties, responsive media queries)
- Vanilla JavaScript (no external dependencies)

## Project Structure

```text
.
├── index.html
├── README.md
├── css/
│   └── styles.css
└── js/
    ├── app.js
    └── dashboard.js
```

## How to Run

1. Open `index.html` directly in a browser.
2. Or use a local static server (recommended), for example with VS Code Live Server.

No build step or package installation is required.

## Data Storage

Tasks are stored in browser storage under the key:

- `tododash-todos`

If you want to reset data, clear this key from your browser's local storage.

## Notes

- On first load, sample tasks are automatically seeded if storage is empty.
- Task IDs are generated with `crypto.randomUUID()` when available, with a fallback for older environments.

## License

No license file is included yet. Add a `LICENSE` file if you plan to distribute this project. Note that this project is made by vibe coding.

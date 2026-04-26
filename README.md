# TodoDash

A lightweight, responsive Todo dashboard built with vanilla HTML, CSS, and JavaScript.

## Overview

TodoDash is a single-page task manager focused on speed and simplicity. It now works in a local-first mode by default, with optional Firebase sync for signing in and using the same tasks across phones, laptops, and other devices.

## Features

- Add, edit, delete, and complete tasks
- Track task status: `todo`, `in-progress`, `done`
- Set task priority: `low`, `medium`, `high`
- Assign categories: General, Work, Personal, Shopping, Health
- Set due dates with overdue highlighting
- Filter by status and category
- Search by title and description
- Calendar month view with date-based task previews
- Click a date to focus that day and manage its tasks
- Dashboard stats:
  - Total tasks
  - Active tasks
  - Completed tasks
  - Overdue tasks
  - Completion rate progress bar
  - Category distribution chart
- Local-first persistence with `localStorage`
- Optional Firebase Firestore sync across devices
- Optional Google sign-in for account-based security
- Works offline and syncs when the connection returns
- Mobile-friendly responsive layout with sidebar toggle

## Tech Stack

- HTML5
- CSS3 with custom properties and responsive media queries
- Vanilla JavaScript
- Firebase Auth and Firestore via CDN compat builds

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

## Local Run

1. Open `index.html` directly in a browser.
2. Or use a local static server, for example VS Code Live Server.

If Firebase is not configured, the app runs entirely locally using `localStorage`.

## Firebase Setup

Use this if you want the same tasks on multiple devices.

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a new project.
3. In the project, add a Web App.
4. Copy the Firebase config object shown by Firebase.
5. Open [index.html](index.html) and replace the `window.FIREBASE_CONFIG = null;` placeholder with your Firebase config object.
6. In Firebase Authentication, enable Google sign-in.
7. In Firestore Database, create the database and start in production mode.
8. Paste the Firestore rules below.
9. Save and deploy the files to Netlify.

### Firestore Rules

Use these rules to let each signed-in user read and write only their own tasks:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /todoDashUsers/{uid}/state/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## Netlify Deployment

1. Push the project to a GitHub repository.
2. Sign in to [Netlify](https://www.netlify.com/).
3. Click **Add new site** then **Import an existing project**.
4. Connect your GitHub repository.
5. Leave the build command empty because this is a static app.
6. Set the publish directory to the repository root.
7. Deploy the site.
8. Open the deployed site and sign in with Google.

### Updating the Site Later

1. Make your code changes locally.
2. Push them to GitHub.
3. Netlify redeploys automatically.

## Data Storage

Local browser cache uses the key:

- `tododash-todos`

Sync metadata uses:

- `tododash-sync-meta`
- `tododash-client-id`

If you want to reset local data, clear those keys from browser storage.

## Notes

- In local-only mode, sample tasks are seeded on first load if storage is empty.
- With Firebase configured, the app starts clean so your cloud data is not polluted with demo tasks.
- Task IDs are generated with `crypto.randomUUID()` when available, with a fallback for older environments.

## Optional Next Step

If you want, I can also add a small account chip in the header that shows the logged-in Google user and a manual sync button.

# Campus Found

A college lost-and-found portal built with HTML, CSS, vanilla JavaScript, Express, and MongoDB.

## Run locally

1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`. Set `MONGODB_URI`, choose a private `ADMIN_USERNAME` and strong `ADMIN_PASSWORD`, and set a random `SESSION_SECRET`. Generate a session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Run `npm run dev` for development or `npm start` for normal use.
5. Open `http://localhost:3000`.

## Features

- Browse, search, filter, and sort through lost and found reports.
- Create reports with category, date, campus location, description, and an optional photo.
- Compare lost and found reports using category, shared keywords, location, and date, with score explanations.
- Submit item claim requests and review them in the staff workspace.
- Track report status and update it from the admin review screen.

Reports, photos, claims, statuses, and admin sessions are stored in MongoDB and persist across server restarts. The app will not start when it cannot connect to MongoDB. Admin Review requires the configured username and password; claim approval and status changes are also protected by the server-side session. Activity lookup uses the college email entered with a report or claim and is not authenticated, so add email verification before using it with real student data.

# Fest Club — College Events Management Website

React + Vite + Firebase starter project for a college event site with an organizer dashboard, event CRUD, homepage content editor, student registration, organizer registration table, CSV export, and downloadable PDF passes.

## Important before you start

- `VITE_DEMO_MODE=true` is for **local UI testing only**. It stores demo data in your browser's local storage and uses the sample organizer credentials below. Never deploy the app with demo mode enabled.
- The Firebase-connected production flow requires Firebase setup, authorized organizer custom claims, Firestore rules, and a trusted registration/email backend. Do not publish student personal data until security rules are tested.
- The included email Cloud Function sends a styled HTML confirmation email. The downloadable PDF is generated on the student's device after registration; the Cloud Function currently does not attach that PDF to the email.
- The sample event dates and college branding are placeholders. Replace them with your college's real information.
- Student registration in demo mode is a prototype. Production registration should use Firebase Authentication or a trusted server flow and should enforce capacity and duplicate-registration checks transactionally.

## 1. Run locally in VS Code

Install Node.js LTS first: https://nodejs.org/

1. Extract the ZIP file.
2. Open the extracted `college-events-management` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:

```bash
npm install
npm run dev
```

5. Open the local URL printed by Vite, usually `http://localhost:5173`.

Demo organizer login:
- Email: `organizer@demo.local`
- Password: `FestDemo2026!`

This demo login is intentionally local-only. It is not a secure real authentication system.

## 2. Set up Firebase

1. Create a project at https://console.firebase.google.com/
2. Add a Web App and copy its configuration.
3. Enable Authentication → Email/Password.
4. Create Firestore Database.
5. Enable Firebase Storage if you want to upload images.
6. Copy `.env.example` to `.env` and paste the real Firebase config values.
7. Set `VITE_DEMO_MODE=false`.
8. Deploy rules after reviewing them:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

Restart Vite after changing `.env`.

## 3. Organizer authorization

The production app checks the Firebase custom claim `organizer: true`. A normal email/password account is not automatically an organizer.

Set the custom claim using a trusted Admin SDK environment only, never from browser code. Example server-side snippet for a trusted Node.js admin script:

```js
await getAuth().setCustomUserClaims("FIREBASE_AUTH_UID", { organizer: true });
```

Then sign out and sign in again to refresh the user's ID token. Restrict who can run that script.

## 4. Email confirmation Cloud Function

The `functions/` folder contains a Firestore-triggered email function using Resend.

1. Configure a verified sender/domain with Resend.
2. Set a secret:

```bash
firebase functions:secrets:set RESEND_API_KEY
```

3. Configure the sender environment variable `EVENTS_EMAIL_FROM` to your verified sender, e.g. `College Events <events@yourdomain.edu>`, using your chosen Firebase Functions environment configuration approach.
4. Install function dependencies:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Cloud Functions deployment may require a Firebase billing plan and enabled APIs. Follow the current Firebase console guidance.

## 5. Production checklist (do not skip)

- Move student registration creation into a trusted Cloud Function to enforce event capacity and prevent forged pass IDs.
- Add Firebase Authentication for students and allow students to view only their own registrations.
- Tighten `firestore.rules` after matching the final registration flow. Test with the Firebase Emulator Suite.
- Do not allow users to assign `organizer` custom claims or write role fields.
- Verify email sender/domain and protect API keys using Firebase secrets.
- Add transactional capacity checks, duplicate prevention, rate limiting, and abuse protection.
- Add a secure pass lookup mechanism; do not expose every student's registration to public visitors.
- Test event deletion behavior so registration history is retained or archived as required.
- Add image upload validation and size limits.
- Replace all sample data and branding before launch.

## Features included

- Colorful responsive home page and event filters
- Organizer dashboard
- Create, edit, publish/unpublish and delete events
- Homepage content editor
- Organizer registrations table and CSV export
- Student registration form
- Colorful event pass preview and PDF download
- Firebase configuration starter and security rules starter
- Email notification Cloud Function starter

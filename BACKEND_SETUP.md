# AutoCare Backend + Firebase Setup

## 1. Create the environment file

Copy `.env.example` to `.env`, then set your Firebase project values:

```bash
PORT=3000
NODE_ENV=development
JWT_SECRET=replace-with-a-long-random-secret
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
```

`serviceAccountKey.json` must be a Firebase Admin SDK service-account key, not the
Firebase web configuration object. In Firebase Console, open **Project settings →
Service accounts → Generate new private key**, then save the downloaded file as
`serviceAccountKey.json` in the project root.

Do not commit `.env` or the service account JSON file. Both are already ignored by
Git in this project.

## 2. Install dependencies

```bash
npm install
```

## 3. Seed Firestore demo data

The server seeds missing demo data automatically on startup. You can also run it manually:

```bash
npm run firebase:seed
```

Demo accounts:

- Admin: `admin@autocare.lk` / `admin123`
- Customer: `customer@autocare.lk` / `customer123`

## 4. Start the system

```bash
npm start
```

Open:

- Site: `http://localhost:3000/`
- Login: `http://localhost:3000/login.html`
- Admin dashboard: `http://localhost:3000/admin-dashboard.html`
- Customer dashboard: `http://localhost:3000/customer-dashboard.html`

## 5. Verify the installation

With the server running, use these commands in a second terminal:

```bash
npm run check
npm run test:connection
```

The first command validates every project JavaScript file. The second verifies the
API, Firestore, demo logins, authenticated sessions, and all three role dashboards.

## Security Note

Firestore is accessed through the server with Firebase Admin SDK. The browser only calls `/api/...` routes and never receives Firebase admin credentials.

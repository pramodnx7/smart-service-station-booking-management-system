# Smart Service Station Booking and Management System

A full-stack service-station management system for vehicle bookings, workshop
queues, service jobs, inventory, invoices, customer communication, and business
reporting.

The frontend is built with HTML, CSS, and browser JavaScript. The backend is a
Node.js and Express application. Firebase Firestore stores application data,
while Supabase Storage stores uploaded images and documents.

## Table of Contents

- [Main Features](#main-features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [User Roles](#user-roles)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Firebase Setup](#firebase-setup)
- [Supabase Storage Setup](#supabase-storage-setup)
- [Running the System](#running-the-system)
- [Authentication](#authentication)
- [API Overview](#api-overview)
- [Database Overview](#database-overview)
- [Testing and Validation](#testing-and-validation)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)
- [Additional Documentation](#additional-documentation)

## Main Features

### Customer Features

- Secure customer registration and role-based login
- Customer profile management
- Service-package selection with a persistent current package and applied benefits
- Free-package approval requests and receipt-based paid package approvals
- Bank-transfer receipt upload or cashier payment selection for paid packages
- Vehicle registration and management
- Service-first appointment booking with time-slot selection
- Structured vehicle details including type, make, model, plate, year, fuel, color, and optional image
- Appointment rescheduling
- Available booking-slot lookup
- Booking cancellation
- Live queue position and estimated waiting time
- Emergency roadside assistance requests
- Service progress and history
- Invoice viewing and PDF download
- Service feedback and ratings
- In-app notifications

### Administrator Features

- Operational dashboard and statistics
- Customer, vehicle, and technician management
- Service and pricing-plan management
- Booking approval that requires technician assignment, plus editing, rescheduling, and cancellation
- Service-job creation and technician assignment
- Appointment, walk-in, and emergency queue handling
- Service-bay management
- Spare-parts inventory and supplier management
- Low-stock monitoring
- Invoice generation and payment recording
- Image and document management
- Customer and technician notifications
- Sales, operational, inventory, and performance PDF reports
- Landing-page content and company settings management

### Technician Features

- Technician dashboard
- Assigned-job viewing and acceptance
- Service progress updates
- Technician notes
- Parts requests, usage, return, and replacement records
- Service photo and document uploads
- Job completion workflow
- In-app notifications

### Public Features

- Service ratings and pricing information
- Landing-page statistics and content
- Public workshop queue display
- Newsletter registration

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, JavaScript |
| Backend | Node.js, Express |
| Authentication | JSON Web Tokens, HTTP-only cookies, bcrypt |
| Main database | Firebase Firestore |
| File storage | Supabase Storage |
| Security middleware | Helmet |
| Development tools | npm, Nodemon, Firebase CLI |

## System Architecture

```text
Browser
  |
  | HTTPS/HTTP requests
  v
Node.js + Express server
  |-- Authentication and role authorization
  |-- Input validation and business logic
  |-- Static frontend delivery
  |-- PDF generation
  |
  |----> Firebase Admin SDK ----> Firestore
  |
  `----> Supabase client -------> Supabase Storage
```

The browser never receives Firebase Admin credentials or the Supabase service
role key. Protected operations pass through the Express API.

## User Roles

The system supports three roles:

| Role | Access |
| --- | --- |
| `customer` | Vehicles, bookings, queue, emergencies, invoices, and feedback |
| `admin` | Complete operational and management access |
| `technician` | Assigned service jobs, parts, uploads, and progress updates |

Dashboard pages are protected on the server. A user must have a valid signed
session, an active Firestore account, and the correct role.

## Project Structure

```text
.
|-- assets/                     Static images and project assets
|-- css/                        Page and component styles
|-- database/                   Database-related project files
|-- docs/                       Feature documentation
|-- js/                         Browser JavaScript
|   |-- api.js                  Shared frontend API client
|   |-- login.js                Login and customer registration
|   |-- admin-dashboard.js      Admin dashboard behavior
|   |-- customer-dashboard.js   Customer dashboard behavior
|   `-- technician-dashboard.js Technician dashboard behavior
|-- scripts/                    Validation, migration, and seed scripts
|-- src/
|   |-- firebase.js             Firebase Admin initialization
|   |-- firestore-store.js      Firestore data and business operations
|   |-- queue-store.js          Queue data and workflow operations
|   |-- supabase.js             Supabase client initialization
|   `-- utils/uploadImage.js    File-storage utilities
|-- uploads/                    Legacy/local uploaded service files
|-- admin-dashboard.html
|-- customer-dashboard.html
|-- technician-dashboard.html
|-- queue-management.html
|-- queue-display.html
|-- login.html
|-- index.html
|-- server.js                   Express application entry point
|-- package.json                npm metadata, scripts, and dependencies
|-- firebase.json               Firebase CLI configuration
|-- firestore.rules             Firestore security rules
|-- firestore.indexes.json      Firestore composite indexes
|-- .env.example                Environment-variable template
`-- README.md                   Main project documentation
```

## Requirements

- Node.js 18 or newer
- npm
- A Firebase project with a Firestore database
- A Firebase Admin SDK service-account key
- A Supabase project and storage bucket for file uploads
- Internet access when using cloud Firebase and Supabase services

Check the installed versions:

```powershell
node --version
npm --version
```

## Installation

1. Clone or download the project.
2. Open a terminal in the project directory.
3. Install the dependencies:

```powershell
npm install
```

4. Copy the environment template:

```powershell
Copy-Item .env.example .env
```

5. Configure `.env`, Firebase, and Supabase as described below.

## Environment Configuration

Never commit the completed `.env` file or service-account key.

```env
# Application
PORT=3000
NODE_ENV=development
JWT_SECRET=replace-with-a-long-random-secret

# Firebase
FIREBASE_PROJECT_ID=your-firebase-project-id
FIRESTORE_DATABASE_ID=(default)
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
DATABASE_TIMEOUT_MS=15000

# Supabase Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-private-service-role-key
SUPABASE_STORAGE_BUCKET=service-station

# Queue cache
QUEUE_CONTEXT_CACHE_MS=60000
QUEUE_REFERENCE_CACHE_MS=600000

# Optional automated login-test accounts
TEST_ADMIN_EMAIL=
TEST_ADMIN_PASSWORD=
TEST_CUSTOMER_EMAIL=
TEST_CUSTOMER_PASSWORD=
TEST_TECHNICIAN_EMAIL=
TEST_TECHNICIAN_PASSWORD=
```

The project also supports `FIREBASE_SERVICE_ACCOUNT`, containing direct JSON or
base64-encoded JSON, instead of `FIREBASE_SERVICE_ACCOUNT_PATH`.

Optional business, invoice, booking, and queue settings are documented in
[`.env.example`](.env.example).

## Firebase Setup

1. Create or select a Firebase project.
2. Enable Firestore.
3. Note the database ID. This project may use a named database rather than
   `(default)`.
4. In Firebase Console, open **Project settings > Service accounts**.
5. Generate a new private key.
6. Save it as `serviceAccountKey.json` in the project root, or store it securely
   elsewhere and update `FIREBASE_SERVICE_ACCOUNT_PATH`.
7. Set `FIREBASE_PROJECT_ID` and `FIRESTORE_DATABASE_ID` in `.env`.
8. Deploy the required indexes:

```powershell
npx -y firebase-tools@latest deploy --only firestore:indexes
```

The included Firestore rules deny direct client reads and writes because all
database operations use the trusted Node.js backend.

## Supabase Storage Setup

1. Create a Supabase project.
2. Create a storage bucket, normally named `service-station`.
3. Configure its access policy for the public URLs required by this application.
4. Add the project URL, server-side service-role key, and bucket name to `.env`.
5. Keep the service-role key on the server only.

Supabase is used for images and documents. Firestore stores the associated
metadata and public storage URLs.

## Running the System

### Production-style start

```powershell
npm start
```

### Development mode

```powershell
npm run dev
```

Open the application:

- Main site: <http://localhost:3000/>
- Login: <http://localhost:3000/login.html>
- Public queue: <http://localhost:3000/queue-display.html>

Protected dashboards:

- Admin: <http://localhost:3000/admin-dashboard.html>
- Customer: <http://localhost:3000/customer-dashboard.html>
- Technician: <http://localhost:3000/technician-dashboard.html>

Do not open the HTML files directly with a `file://` URL. Use the local Node.js
server so API requests, cookies, and protected dashboard routes work correctly.

## Authentication

Passwords are hashed with bcrypt and are never returned by the API. After a
successful login, the backend signs an eight-hour JSON Web Token and places it
in an HTTP-only, `SameSite=Lax` cookie.

Login requires:

- A valid email address
- A matching password
- An active user record
- An available Firestore connection

The user does not select a role during login. The backend reads the preset role
from the authenticated Firestore account and the frontend opens the matching
admin, customer, or technician dashboard automatically.

Public registration creates customer accounts only. Administrators create other
administrators or technicians through approved administrative workflows.

Core authentication endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Register a customer |
| `POST` | `/api/auth/login` | Authenticate a user |
| `POST` | `/api/auth/logout` | Clear the session |
| `GET` | `/api/auth/session` | Return the current user |
| `PUT` | `/api/profile` | Update the current profile |

Example login request:

```json
{
  "email": "customer@example.com",
  "password": "your-password"
}
```

## API Overview

All protected routes enforce authentication and role authorization on the
server. This section groups the main API areas; see `server.js` for the exact
request and response fields.

### System and Public API

- `GET /api/health`
- `GET /api/public/service-ratings`
- `GET /api/public/pricing-plans`
- `GET /api/public/stats`
- `GET /api/public/landing-content`
- `GET /api/public/queue-display`
- `POST /api/public/newsletter-subscriptions`

### Customer API

- Dashboard and live queue
- Current package selection and applied package benefits
- Notification reading
- Vehicle creation, update, and deletion
- Booking-slot lookup
- Booking creation, update, cancellation, and deletion
- Emergency requests
- Feedback
- Invoice PDF access

### Administrator API

- Dashboard and live queue operations
- Customer, technician, vehicle, service, and pricing management
- Package-payment verification, approval, and rejection
- Booking and service-job management
- Technician assignment
- Inventory items and suppliers
- Invoice creation and payment
- Notification and draft management
- Emergency-request handling
- Company and landing-page settings
- PDF reports

### Technician API

- Dashboard and assigned jobs
- Job acceptance and progress
- Notes and completion
- Inventory lookup
- Parts usage, request, return, and replacement
- Photo and document uploads
- Notifications

### Storage API

- `POST /api/images/upload`
- `POST /api/images/replace`
- `DELETE /api/images`
- Authenticated file and invoice downloads

## Database Overview

Important Firestore collections include:

- `users`
- `technicians`
- `vehicles`
- `servicePackages`
- `pricingPlans`
- `customerPackages`
- `customerPackageRequests`
- `bookings`
- `serviceJobs`
- `technicianNotes`
- `technicianProgress`
- `serviceJobParts`
- `replacedParts`
- `notifications`
- `notificationDrafts`
- `invoices`
- `emergencyRequests`
- `feedback`
- `newsletterSubscriptions`
- `inventoryCategories`
- `inventoryParts`
- `inventorySuppliers`
- `inventoryMovements`
- `servicePhotos`
- `documents`
- `uploadAuditLogs`
- `queueEntries`
- `serviceBays`
- `appSettings`
- `meta`

Numeric IDs are allocated through transactional metadata counters. Composite
indexes required by the application are defined in `firestore.indexes.json`.

## Testing and Validation

Run the project-wide JavaScript syntax check:

```powershell
npm run check
```

With the server running and all `TEST_<ROLE>_*` values configured, verify
Firestore, authentication, session cookies, and dashboards:

```powershell
npm run test:connection
```

Run the browser audit:

```powershell
npm run audit:browser
```

The connection test expects valid active accounts for all three roles.

Create the complete demonstration dataset once, or verify it without writing:

```powershell
npm run firebase:seed-system
npm run firebase:check-system
npm run firebase:seed-reviews
npm run firebase:check-reviews
npm run firebase:seed-customer-packages
npm run firebase:check-customer-packages
```

The comprehensive seed creates ten representative records for each operational
area. This includes bookings, jobs, queue entries, invoices, reviews,
emergencies, notifications, inventory activity, technician updates, and
replaced parts. It deliberately does not create or upload images, service
photos, documents, or upload audit records.

The review seed ensures every active service has at least three linked customer
reviews. The public **Our Services** cards display each service's average
rating, total review count, and two recent customer comments.

The customer-package seed assigns one active pricing plan to every active
customer that does not already have one. Existing choices are preserved.

Package activation uses an approval workflow. Free packages wait directly for
administrator approval. Online package payments show the configured bank
details and require a JPG, PNG, WebP, or PDF receipt upload; no package invoice
is generated. Cashier payments are confirmed directly by an administrator.
The administrator reviews the receipt or confirms cashier payment before
activating the package benefits. Payment bank details are managed from the
administrator dashboard under **System Settings**.

## Troubleshooting

### `EADDRINUSE: address already in use :::3000`

Another process is already listening on port 3000. The system may already be
running. Open <http://localhost:3000/> or stop the existing process before
starting another server.

To inspect the port on Windows:

```powershell
netstat -ano | Select-String ':3000'
```

### Login returns `DATABASE_QUOTA_EXCEEDED`

The backend cannot query Firestore because the database quota or billing limit
has been reached. This is not an invalid-password error.

1. Open Firebase Console.
2. Confirm the project and database IDs match `.env`.
3. Review Firestore usage, quota, billing, and disabled-service warnings.
4. Wait for a daily free quota to reset, or enable/adjust billing where
   appropriate.
5. Restart the Node.js server and request `/api/health`.

A healthy response resembles:

```json
{
  "ok": true,
  "database": "firebase-firestore"
}
```

### Firestore read optimization

The server uses short, in-memory caches for public landing-page projections and
stable reference collections. Relevant create, update, and delete operations
invalidate those entries immediately, so normal administrator changes do not
wait for the time-to-live value. Cache durations can be tuned with the
`*_CACHE_MS` variables in `.env.example`.

The customer dashboard refreshes queue data every minute only while the
customer has an active queue entry. When no entry is active, it refreshes every
five minutes, pauses while the tab is hidden, and refreshes immediately when
the tab becomes visible. Common booking and vehicle actions update local state
and fetch only queue/notification changes instead of reloading the full
dashboard.

An administrator can inspect cache hits, misses, invalidations, and active
entries at `GET /api/admin/firestore-read-cache`.
The complete findings, implemented changes, remaining high-risk work, and
measurement procedure are in [docs/PERFORMANCE_AUDIT.md](docs/PERFORMANCE_AUDIT.md).

### Login says the email, password, or role is invalid

- Select the account's actual role on the login page.
- Confirm the email is stored in lowercase-compatible form.
- Confirm the account status is `active`.
- Use the password assigned when the account was created.
- Do not manually store plain-text passwords in Firestore; the backend expects a
  bcrypt `passwordHash`.

### Database is temporarily unavailable

- Verify `FIREBASE_PROJECT_ID`.
- Verify `FIRESTORE_DATABASE_ID`.
- Verify that the service-account file exists and belongs to the correct
  project.
- Confirm Firestore is enabled and reachable.
- Check Firebase quota and billing status.
- Confirm the computer has internet access.

### Image upload is not configured

Verify `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`SUPABASE_STORAGE_BUCKET`. Confirm the bucket exists and the server-side key is
valid.

### Dashboard redirects to the home page

The user may not have a valid session, may have selected the wrong role, or may
be inactive. Log in again through `/login.html`.

## Security Notes

- Never commit `.env`, `serviceAccountKey.json`, or private API keys.
- Use a long random `JWT_SECRET`; production requires at least 32 characters.
- Run the production site over HTTPS.
- Keep the Supabase service-role key on the server.
- Validate and sanitize all user-controlled values.
- Keep Firestore direct-client access disabled unless a separately reviewed
  security model is introduced.
- Rotate any credential that has been exposed.
- Restrict Firebase and Supabase service accounts to the required permissions.
- Review uploaded-file type and size limits before changing them.

## Additional Documentation

- [Backend and Firebase setup](BACKEND_SETUP.md)
- [Queue management](docs/QUEUE_MANAGEMENT.md)
- [Technician module](docs/technician-module.md)
- [Inventory module](docs/inventory-module.md)
- [Photo and document module](docs/photo-document-module.md)
- [Firestore schema and provisioning](docs/FIRESTORE_SCHEMA.md)

## License

This project is intended for academic, educational, and demonstration purposes.

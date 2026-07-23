# Firestore Schema and Provisioning

## Target Database

- Firebase project: `smartmanagement-b07fa`
- Firestore database: `(default)`
- Edition: Standard
- Location: `asia-southeast1`

The runtime connection is configured through `.env`. Firebase CLI deployments
use `.firebaserc` and `firebase.json`. All three configurations must identify
the same project and database.

## Provisioning

Provision missing system records without overwriting existing operational data:

```powershell
npm run firebase:provision
```

Check whether the required records exist without writing:

```powershell
npm run firebase:check-schema
```

The provisioning command creates only missing records in:

- `meta`
- `servicePackages`
- `pricingPlans`
- `inventoryCategories`
- `serviceBays`
- `appSettings`

If all three `BOOTSTRAP_ADMIN_*` environment variables are supplied, it also
creates the first administrator when that administrator does not already exist.

## Collection Relationships

| Collection | Important links |
| --- | --- |
| `users` | Root account records for admins, customers, and technicians |
| `technicians` | `userId -> users.id` |
| `vehicles` | `userId -> users.id` |
| `bookings` | `userId -> users.id`, `vehicleId -> vehicles.id`, `servicePackageId -> servicePackages.id`, optional `assignedTechnicianId -> technicians.id` |
| `serviceJobs` | `bookingId -> bookings.id`, `customerId -> users.id`, `vehicleId -> vehicles.id`, `assignedTechnicianId -> technicians.id` |
| `invoices` | `userId -> users.id`, `servicePackageId -> servicePackages.id`, optional `serviceJobId -> serviceJobs.id` |
| `notifications` | `userId -> users.id`, optional `senderUserId -> users.id` |
| `serviceJobParts` | `serviceJobId -> serviceJobs.id`, `partId -> inventoryParts.id` |
| `servicePhotos` | `serviceJobId -> serviceJobs.id` |
| `documents` | `serviceJobId -> serviceJobs.id`, optional `customerId -> users.id` |
| `queueEntries` | Links customers, vehicles, bookings, services, technicians, jobs, and service bays |
| `inventoryParts` | Optional `supplierId -> inventorySuppliers.id` |
| `inventoryMovements` | `partId -> inventoryParts.id` |
| `feedback` | `userId -> users.id`, `servicePackageId -> servicePackages.id` |

The application uses numeric document IDs and matching numeric reference fields.
The `meta/counters` document allocates IDs transactionally.

## Security Model

Browser code does not connect directly to Firestore. Every database operation
passes through the Node.js server and Firebase Admin SDK. Therefore,
`firestore.rules` intentionally denies all direct client reads and writes.

## Indexes

Composite index definitions are stored in `firestore.indexes.json`. Deploy rules
and indexes after authenticating the Firebase CLI:

```powershell
npx -y firebase-tools@latest login --reauth
npx -y firebase-tools@latest deploy --only firestore
```

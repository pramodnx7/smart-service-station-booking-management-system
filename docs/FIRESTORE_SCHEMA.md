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

Create a comprehensive, linked demonstration dataset without adding images,
photos, documents, or signatures:

```powershell
npm run firebase:seed-system
npm run firebase:check-system
npm run firebase:seed-reviews
npm run firebase:check-reviews
npm run firebase:seed-customer-packages
npm run firebase:check-customer-packages
```

The comprehensive seed is idempotent. It uses the
`meta/comprehensive-demo-v1` marker and will not duplicate the dataset when
rerun.

The review seed is coverage-based and safe to rerun. It adds only the reviews
needed for every active `servicePackages` document to have at least three
linked `feedback` documents.

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
| `customerPackages` | `userId -> users.id`, `pricingPlanId -> pricingPlans.id`; stores the current benefit snapshot |
| `customerPackageRequests` | `userId -> users.id`, `pricingPlanId -> pricingPlans.id`; stores payment method, optional bank-receipt URL, verification state, and admin approval |
| `technicians` | `userId -> users.id` |
| `vehicles` | `userId -> users.id`; stores type, make, model, plate, year, fuel type, color, and optional image references |
| `servicePackages` | Stores editable `laborCost` and `serviceCharges`; `price` is their combined customer-facing amount |
| `bookings` | `userId -> users.id`, `vehicleId -> vehicles.id`, `servicePackageId -> servicePackages.id`, optional `assignedTechnicianId -> technicians.id` |
| `serviceJobs` | `bookingId -> bookings.id`, `customerId -> users.id`, `vehicleId -> vehicles.id`, `assignedTechnicianId -> technicians.id` |
| `invoices` | `userId -> users.id`; service invoices link to completed service work and snapshot labor, service, parts, tax, and discount totals |
| `notifications` | `userId -> users.id`, optional `senderUserId -> users.id`; actionable completion alerts may include `action`, `serviceJobId`, and `invoiceId` |
| `serviceJobParts` | `serviceJobId -> serviceJobs.id`, `partId -> inventoryParts.id` |
| `servicePhotos` | `serviceJobId -> serviceJobs.id` |
| `documents` | `serviceJobId -> serviceJobs.id`, optional `customerId -> users.id` |
| `queueEntries` | Links customers, vehicles, bookings, services, technicians, jobs, and service bays |
| `inventoryParts` | Optional `supplierId -> inventorySuppliers.id` |
| `inventoryMovements` | `partId -> inventoryParts.id` |
| `feedback` | `userId -> users.id`, `servicePackageId -> servicePackages.id` |
| `technicianNotes` | `serviceJobId -> serviceJobs.id`, `technicianId -> technicians.id` |
| `technicianProgress` | `serviceJobId -> serviceJobs.id`, `technicianId -> technicians.id` |
| `replacedParts` | `serviceJobId -> serviceJobs.id`, `technicianId -> technicians.id` |
| `emergencyRequests` | `userId -> users.id`, optional `vehicleId -> vehicles.id` |
| `notificationDrafts` | Optional `createdBy -> users.id` |
| `newsletterSubscriptions` | Public email subscriptions |

The application uses numeric document IDs and matching numeric reference fields.
The `meta/counters` document allocates IDs transactionally.

## Comprehensive Demo Dataset

The repeatable seed produces this verified baseline:

| Area | Records |
| --- | ---: |
| Active customers | 10 |
| Active technicians | 10 |
| Vehicles | 10 |
| Service packages, pricing plans, and inventory categories | 10 each |
| Inventory suppliers and parts | 10 each |
| Bookings and service jobs | 10 each |
| Queue entries and invoices | 10 each |
| Reviews and emergency requests | 10 each |
| Notifications and notification drafts | 10 each |
| Inventory movements and service-job part usage | 10 each |
| Technician notes and progress updates | 10 each |
| Replaced-part records | 10 |
| Newsletter subscriptions | 10 |
| Active customer packages | 10 |
| New media, service photos, documents, and upload logs | 0 |

Bookings include Pending, Approved, In Progress, Completed, Checked In, and
Cancelled examples. Service jobs and queue entries also include completed,
active, waiting, cancelled, skipped, and no-show variations. Invoices include
both paid and unpaid examples.

When an administrator tries to advance a `Pending` booking, the dashboard first
requires an active technician. Only a successful technician assignment changes
the booking to `Approved`; closing the popup leaves it `Pending`. The combined
action creates the linked `serviceJobs` document when needed, or updates the
existing job, and stores `assignedTechnicianId` on both records. The status API
also rejects direct attempts to approve a pending booking without a technician.
Server-side availability and specialization checks still apply.

## Customer Package Approval Workflow

1. A free package creates a `customerPackageRequests` document with payment
   marked `Not Required`.
2. For online payment, the customer sees the configured bank details and must
   upload a JPG, PNG, WebP, or PDF bank receipt. The receipt URL and verification
   state are stored on the request; no package invoice is created.
3. For cashier payment, an administrator confirms receipt of payment directly
   on the package request.
4. The administrator reviews an online receipt, or confirms cashier payment,
   before approving the request.
5. Administrator approval copies the package and its benefit snapshot into
   `customerPackages`, making it the customer's current active package.

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

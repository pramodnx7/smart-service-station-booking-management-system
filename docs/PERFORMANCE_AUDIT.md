# Firestore and Application Performance Audit

Date: 2026-07-23  
Scope: Express API, Firebase Admin/Firestore data layer, vanilla JavaScript dashboards, queue screens, and Supabase media uploads.

## Executive summary

The repository is not currently a React/Vite/Tailwind application. It is an
Express application with server-rendered static HTML and vanilla JavaScript
dashboards. Therefore React-specific findings such as `useEffect` loops,
unstable Context values, `React.memo`, `useMemo`, and `useCallback` do not
apply.

The largest Firestore costs came from:

1. complete collection scans used for record-detail operations;
2. repeated uncached authentication and reference lookups;
3. appointment-slot calculation reading all bookings and users;
4. admin notification loading reading notification collections for every user;
5. mutation helpers reading documents again after successful writes;
6. unbounded history collections being returned by the admin dashboard; and
7. client polling requests that could overlap.

Low- and medium-risk corrections have been implemented. For recurring traffic
within one running server process, the expected reduction is approximately
70–95%. The exact billed-read reduction depends on collection sizes, traffic
distribution, cache hit rate, process restarts, and how often data is mutated.
The first uncached load of the complete admin dashboard remains expensive; its
larger redesign is intentionally listed as high risk.

## Implemented safeguards

- Shared promise-aware collection, equality-query, `in`-query, and document
  caches with immediate invalidation after writes.
- Five-second authentication-user cache, preserving fast account-status
  revocation while deduplicating burst requests.
- Bounded cache sizes and expired-entry eviction.
- Scoped job-detail, upload-duplicate, invoice, deletion, feedback, and
  technician queries.
- Date-scoped appointment availability queries.
- `in` query batching in groups of 30 instead of one query per referenced ID.
- No post-write document reread in standard update helpers.
- Browser deduplication of concurrent identical GET requests.
- Public HTTP cache headers matching server projection cache durations.
- Queue-display refresh overlap protection.
- New admin and technician image uploads are sent to Supabase Storage; their
  Firestore records receive URLs.
- Explicit indexes for newly scoped service-job detail queries.
- Cache telemetry remains available at
  `GET /api/admin/firestore-read-cache`.

## Detailed findings

Estimated reductions refer to the affected operation, not necessarily the
whole application's bill.

| Location | Problem | Why it increased reads or resource use | Estimated reduction | Resolution / recommendation | Risk |
| --- | --- | --- | ---: | --- | --- |
| `src/firestore-store.js` read helpers | Dynamic collections and document lookups had no shared cache. Simultaneous callers repeated identical reads. | Every API route and reference join reached Firestore independently. | 60–95% for repeated reads inside cache windows | Implemented promise-aware collection, query, and document caching with write invalidation. | Low |
| `server.js` authentication middleware | Every authenticated API request reread the same user document. | A dashboard request plus queue/notification requests generated repeated account reads. | 30–70% for burst traffic | Implemented a five-second user-document cache. | Medium |
| `src/firestore-store.js:updateDocument` and `src/queue-store.js:updateDocument` | Successful updates performed a pre-write read and a second post-write read. | Every mutation paid for an avoidable extra document read. | One read per update; commonly 25–50% of mutation reads | Implemented return values by merging the validated snapshot with submitted changes. | Low |
| `src/firestore-store.js:getBookingSlots` / `bookingAvailability` | Every time slot recalculated availability using complete bookings and users collections. | A single slot request could repeat large reads for each hour in the service day. | 90–99% as collections grow | Implemented request-level cache reuse, date-scoped booking queries, and targeted technician-user reads. | Medium |
| `src/firestore-store.js:getAdminServiceJobDetails` | Opening one job scanned all notes, progress, usages, replaced parts, photos, documents, users, vehicles, bookings, and technicians. | Read cost grew with the entire system rather than the selected job. | 80–99% | Implemented `serviceJobId` queries and targeted reference lookups. | Medium |
| `src/firestore-store.js:getAssignedServiceJob` | Technician job detail used the same global scans. | Every job action could reload unrelated system history. | 80–99% | Implemented scoped queries and a job-specific context. | Medium |
| `src/firestore-store.js:getTechnicianDashboard` | Technician dashboards loaded global customer, vehicle, booking, and technician context. | A technician only needs references used by assigned jobs. | 50–95% | Implemented a context built from assigned job IDs only. | Medium |
| `src/firestore-store.js:getAdminDashboard` | The admin dashboard scanned all notifications and drafts, then filtered them in memory. | Reads included messages belonging to every account. | 70–99% for notification data | Implemented recipient/sender/creator queries. | Low |
| `src/firestore-store.js:allWhereAny` | One equality query was issued for every job ID. Empty queries still incur minimum read charges. | Customers or technicians with many jobs caused N separate queries for files and parts. | 0–97%, highest when many IDs return no documents | Implemented Firestore `in` queries chunked to 30 values. | Medium |
| Photo/document upload duplicate checks | Duplicate detection scanned complete `servicePhotos` or `documents` collections. | Upload cost grew with all historical files. | 80–99% | Implemented `serviceJobId` queries before checking file name/type. | Low |
| Invoice creation and PDF generation | Parts, vehicles, technicians, and users were globally loaded for one invoice. | A one-record output read unrelated history. | 80–99% | Implemented job-scoped parts and direct reference reads. | Medium |
| Customer and technician deletion checks | Dependency checks scanned complete operational collections. | Rare operations could still consume thousands of reads. | 70–99% | Implemented relationship queries and cache invalidation after batch writes. | Medium |
| Inventory item code and employee number checks | Uniqueness checks loaded complete collections. | Creation/update cost grew linearly with inventory and staff size. | 70–99% | Implemented equality queries, including legacy `sku` compatibility. | Low |
| Feedback eligibility | Submitting one review loaded all bookings. | Only the current customer's completed bookings are relevant. | 50–99% | Implemented a `userId` booking query. | Low |
| Direct Firestore transactions and batch writes | Several writes bypassed common invalidation helpers. | Cached queries could remain stale until TTL expiry. | Correctness safeguard | Added invalidation for booking queues, packages, account deletion, parts usage/returns, and service image arrays. | Medium |
| `js/api.js` | Concurrent identical GET requests were not deduplicated. | Visibility changes, timers, and initialization could hit the same route simultaneously. | Up to 50% for overlapping requests | Implemented an in-flight GET request map. | Low |
| `js/queue-display.js` | Interval and visibility refreshes could overlap. | Duplicate HTTP calls could reach queue assembly concurrently. | Up to 50% during slow requests or tab changes | Implemented a refresh-in-progress guard. | Low |
| Public landing endpoints | Every navigation requested pricing, ratings, statistics, and content again. | Server projection caching protected Firestore, but clients still caused avoidable API work. | 50–95% for repeat visits in HTTP cache windows | Added public `Cache-Control` and `stale-while-revalidate` headers. | Low |
| Firestore and queue caches | Cache key maps previously had no hard upper bound. | Long-lived servers could retain expired query keys and gradually consume memory. | Prevents long-term growth | Implemented maximum sizes and expired/oldest entry eviction. | Low |
| Admin/technician image workflows | Some images were converted to data URLs and stored in Firestore documents. | Large documents increase transfer size and latency for every document read. | Potentially 90%+ document payload reduction | New uploads now go to Supabase and Firestore receives URLs. Existing base64 records still need a controlled migration. | Medium |
| All client JavaScript | No `onSnapshot`, React effects, or React Context are present. | There are no duplicated realtime listeners or hook dependency loops to fix. | N/A | No change required. Continue using one-shot API reads for non-live modules. | Low |
| Dashboard event binding | Event handlers are registered once after `DOMContentLoaded`; modal handlers use stable page lifetime. | No accumulating listener pattern was found. | N/A | No change required. | Low |
| Object URL handling | Invoice/download object URLs are revoked after use. | No persistent object URL leak was found. | N/A | No change required. | Low |

## Polling and realtime assessment

| Screen | Current behavior | Assessment |
| --- | --- | --- |
| Public queue display | 15-second HTTP polling; pauses while hidden; server queue context cached for 60 seconds | Appropriate for a live display. Overlap is now blocked. |
| Admin queue management | 30-second HTTP polling; pauses while hidden; duplicate refreshes blocked | Appropriate for operational queue data. |
| Customer queue | 60 seconds with active entry, five minutes otherwise, hidden-tab pause | Appropriate and already adaptive. |
| Admin notifications/emergencies | Five-minute polling, hidden-tab pause | Conservative; no realtime listener required. |
| Customer notifications | Five-minute polling, hidden-tab pause | Conservative; no realtime listener required. |
| Technician notifications | Five-minute polling, hidden-tab pause | Conservative; no realtime listener required. |
| Other modules | Loaded on dashboard hydration or explicit action | Realtime listeners are unnecessary. |

No `onSnapshot()` listener exists, so there is no listener unsubscribe leak.
The interval timers live for the lifetime of their page and are destroyed with
the document on navigation. Toast/debounce timers are bounded and replaced or
expire naturally.

## Remaining high-risk recommendations (not implemented)

### 1. Split the admin dashboard bootstrap by module

Location: `src/firestore-store.js:getAdminDashboard`,
`js/admin-dashboard.js:hydrateFromApi`

The initial admin response still loads customers, vehicles, bookings, service
jobs, inventory, billing, reports, media, packages, feedback, and settings in
one request. This is the largest remaining first-load cost.

Recommended design: keep a small overview endpoint containing only aggregate
cards and recent actionable records, then load each existing module the first
time its current navigation item opens. Preserve module state in a shared
client cache and invalidate only the changed resource.

Estimated reduction: 40–85% of initial admin reads, depending on which module
the administrator uses. Risk: High because the large dashboard state and many
render functions currently assume every collection is immediately present.

### 2. Add cursor pagination to unbounded admin/customer history

Locations: customers, vehicles, bookings, inventory, services, invoices,
reports, notifications, photos, and documents in dashboard endpoints.

Recommended design: `orderBy` a stable field plus document ID, use `limit`, and
return a cursor. Preserve current filter controls and add transparent
next/previous or incremental loading.

Estimated reduction: 50–95% for large collections. Risk: High because current
search, metrics, dropdowns, and cross-module joins operate on complete local
arrays.

### 3. Replace client-side global search with indexed search fields

Locations: admin dashboard table filters and queue appointment search.

Recommended design: store normalized prefix/search fields or use a dedicated
search service. Firestore does not provide general substring search. Avoid
claiming that a simple `where` query can preserve current substring behavior.

Estimated reduction: 50–99% for large searchable datasets. Risk: High because
it requires indexed search data and changes result-loading behavior.

### 4. Create aggregate summary documents

Locations: public statistics, admin metrics, reports, technician performance,
inventory reports.

Recommended design: transactionally maintain daily/monthly summary documents
or update them with trusted backend triggers. Read those summaries for widgets;
retain full scans only for explicit detailed exports.

Estimated reduction: 80–99% for dashboard/report widgets. Risk: High because
every write path must update aggregates correctly and historical backfill is
required.

### 5. Replace full media-reference scans during deletion

Locations: `src/firestore-store.js:getReferencedMediaUrls`,
`server.js:cleanupDeletedEntityMedia`

Recommended design: maintain a media-reference collection keyed by storage
path, or use a delayed storage cleanup job that verifies references.

Estimated reduction: 80–99% when deleting or replacing media. Risk: High
because an incorrect reference index could delete a file still used elsewhere.

### 6. Migrate existing base64 image values

Locations: legacy `users.avatar`, pricing-plan images, and landing-content
documents may contain `data:image/...` values.

Recommended design: dry-run a migration that uploads each legacy value to
Supabase, updates the Firestore field to the public URL, verifies the object,
and only then removes the embedded value.

Estimated reduction: substantial document transfer reduction wherever legacy
images exist. Risk: High because live records and storage objects must be
updated atomically or with resumable migration markers.

### 7. Modular DOM rendering

Locations: `renderAll()` in admin, customer, and technician dashboard scripts.

The dashboards often rebuild every module after a local mutation. This does
not add Firestore reads, but it increases CPU work, image decoding, DOM
allocation, and layout cost.

Recommended design: render only the affected view/row and render inactive
modules when opened. Risk: High because many render functions share state and
must remain synchronized. React memoization is not applicable to this
vanilla-JavaScript codebase.

## Index review

The existing index file covers the relationship queries used by bookings,
notifications, service jobs, inventory, files, and queue management. Explicit
single-field entries were added for:

- `technicianNotes.serviceJobId`
- `technicianProgress.serviceJobId`
- `replacedParts.serviceJobId`

Standard Firestore normally creates single-field indexes automatically. Keeping
these entries in the project file documents the required query surface and
supports consistent environment provisioning.

## Verification

- JavaScript syntax validation: passed for 25 files.
- `firestore.indexes.json` parsing: passed.
- `git diff --check`: passed; only line-ending conversion warnings were
  reported.
- Static search confirmed no React hooks, `onSnapshot`, `getDocs`, or client
  Firebase SDK reads in application runtime code.
- Live billed-read measurement requires a working Firestore quota and realistic
  traffic. Use the cache telemetry endpoint plus Firebase Usage metrics before
  and after an equivalent test session.

## Measurement procedure

1. Restart the server to clear in-memory caches.
2. Record Firestore document reads in Firebase Usage.
3. Run one representative session: public landing load, one login, dashboard
   load, appointment-slot view, one job detail view, one notification refresh,
   and one queue refresh.
4. Repeat the same session without restarting the server.
5. Inspect `GET /api/admin/firestore-read-cache` for hits, misses, evictions,
   and invalidations.
6. Compare first-load and warm-cache reads separately. Do not use warm-cache
   results to hide the remaining admin bootstrap cost.


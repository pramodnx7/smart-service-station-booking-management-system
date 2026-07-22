# Queue Management Guide

## Overview

The queue module handles scheduled appointments, walk-in customers, and manager-approved emergencies without replacing the existing booking or service-job workflows.

- Appointment tokens use `A-001`, walk-ins use `W-001`, and emergencies use `E-001`. Sequences reset each day.
- Approved emergencies have the highest priority.
- On-time appointments receive appointment priority. Appointments arriving after the grace period receive reduced appointment priority.
- Walk-ins and late appointments gain priority while they wait, preventing indefinite delays.
- Queue positions and wait estimates use available bays, active technicians, and historical service duration.

## Admin workflow

1. Sign in as an admin and open **Queue Management** from the sidebar.
2. Use **Appointment Check-in** to search by booking ID, customer phone, customer name, or vehicle number.
3. Use **Register Walk-in** to select existing records or create a customer and vehicle during check-in.
4. Use **Emergency Override** only after manager approval and record the reason.
5. Call the recommended next customer. The system assigns an available service bay and mechanic, preferring specialization matches.
6. Skip or recall absent customers, manually adjust an assignment, start service, and complete or cancel the queue entry.
7. Mark an unoccupied bay as **Maintenance** when it must be removed from capacity.

The admin queue refreshes every 30 seconds, the customer queue every 60 seconds, and the public `queue-display.html` board every 15 seconds. Hidden pages pause their refreshes. The public board exposes tokens and workshop assignments only, not customer contact information.

Queue reads are shared through a short server-side cache. The backend queries only today's queue entries and loads only their referenced records; slow-changing customer, vehicle, service, technician, and bay data is cached separately. Any queue action invalidates the live cache immediately.

## Technician and customer flow

- The assigned technician receives a notification and sees the generated service job on the technician dashboard.
- The technician can accept the job, update progress, upload records, and complete the job.
- Technician progress and completion synchronize the linked queue entry and booking.
- Customers see their live token, position, estimated wait, bay, mechanic, and service status on their dashboard.
- Existing in-app notifications announce check-in, position changes, calls, skips, recalls, service start, and completion.

## Configuration

Optional environment variables:

```env
SERVICE_BAY_COUNT=8
QUEUE_APPOINTMENT_GRACE_MINUTES=15
QUEUE_DEFAULT_SERVICE_MINUTES=45
APP_TIME_ZONE=Asia/Colombo
QUEUE_CONTEXT_CACHE_MS=60000
QUEUE_REFERENCE_CACHE_MS=600000
```

The module uses the existing Firebase Admin configuration. No credentials are stored in source control.

## Firestore collections and indexes

New module-owned collections:

- `queueEntries`
- `serviceBays`

Daily token counters are stored in existing `meta` documents. Required indexes are included in `firestore.indexes.json`. Deploy them with an authenticated Firebase CLI session:

```powershell
npx -y firebase-tools@latest deploy --only firestore:indexes
```

## API summary

Public:

- `GET /api/public/queue-display`

Customer:

- `GET /api/customer/queue`

Admin:

- `GET /api/admin/queue`
- `GET /api/admin/queue/appointments?search=...`
- `POST /api/admin/queue/appointments/check-in`
- `POST /api/admin/queue/walk-ins`
- `POST /api/admin/queue/emergencies`
- `POST /api/admin/queue/call-next`
- `PUT /api/admin/queue/entries/:id/:action`
- `PUT /api/admin/queue/service-bays/:id`

Technician:

- `PUT /api/technician/jobs/:id/accept`
- Existing progress and completion endpoints synchronize linked queue records.

All non-public endpoints use the existing session authentication and role checks.

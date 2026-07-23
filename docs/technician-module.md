# Technician Management Module

## Firestore Collections

The running application stores the module in Firestore through the Express repository layer:

- `users` with `role = technician`
- `technicians`
- `serviceJobs`
- `technicianNotes`
- `technicianProgress`
- `serviceJobParts`
- `inventoryParts`
- `servicePhotos`
- `notifications`

Firestore does not enforce foreign keys natively. The API layer enforces ownership, assignment, stock, duplicate-job, duplicate-assignment, completion, and billing rules before each write.

## ER Diagram

```mermaid
erDiagram
  USERS ||--o| TECHNICIANS : "user_id"
  USERS ||--o{ VEHICLES : "customer owns"
  USERS ||--o{ BOOKINGS : "customer books"
  BOOKINGS ||--|| SERVICE_JOBS : "booking_id"
  VEHICLES ||--o{ SERVICE_JOBS : "vehicle_id"
  USERS ||--o{ SERVICE_JOBS : "customer_id"
  TECHNICIANS ||--o{ SERVICE_JOBS : "assigned_technician_id"
  SERVICE_JOBS ||--o{ TECHNICIAN_NOTES : "service_job_id"
  TECHNICIANS ||--o{ TECHNICIAN_NOTES : "technician_id"
  SERVICE_JOBS ||--o{ TECHNICIAN_PROGRESS : "service_job_id"
  TECHNICIANS ||--o{ TECHNICIAN_PROGRESS : "technician_id"
  SERVICE_JOBS ||--o{ SERVICE_JOB_PARTS : "service_job_id"
  INVENTORY_PARTS ||--o{ SERVICE_JOB_PARTS : "part_id"
  TECHNICIANS ||--o{ SERVICE_JOB_PARTS : "used_by_technician"
  SERVICE_JOBS ||--o{ SERVICE_PHOTOS : "service_job_id"
  TECHNICIANS ||--o{ SERVICE_PHOTOS : "technician_id"
```

## Firestore Setup Order

1. Run `npm run firebase:provision`.
2. Run `npm run firebase:seed-system`.
3. Run `npm run firebase:check-system`.

## Workflow

1. Customer books service.
2. Admin approves booking.
3. Admin creates a service job from the booking.
4. Admin assigns or reassigns an active technician.
5. Technician views assigned jobs only.
6. Technician updates progress, notes, images, and parts used.
7. Technician can complete a job only after progress reaches `100`.
8. Admin and customer receive notifications on key changes.
9. Billing is allowed only for completed service jobs.

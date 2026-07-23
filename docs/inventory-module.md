# Inventory & Spare Parts Management Module

## Firestore Collections

- `inventoryParts`
- `inventoryCategories`
- `inventorySuppliers`
- `inventoryMovements`
- `serviceJobParts`
- `replacedParts`
- `servicePhotos`
- `notifications`

Stock updates for part usage and returns are performed inside Firestore transactions to prevent negative stock and keep movement logs in sync.

## ER Diagram

```mermaid
erDiagram
  INVENTORY_CATEGORIES ||--o{ INVENTORY_PARTS : category
  INVENTORY_SUPPLIERS ||--o{ INVENTORY_PARTS : supplier
  INVENTORY_PARTS ||--o{ SERVICE_JOB_PARTS : used
  SERVICE_JOBS ||--o{ SERVICE_JOB_PARTS : records
  TECHNICIANS ||--o{ SERVICE_JOB_PARTS : uses
  INVENTORY_PARTS ||--o{ INVENTORY_MOVEMENTS : movement
  SERVICE_JOBS ||--o{ INVENTORY_MOVEMENTS : job
  TECHNICIANS ||--o{ INVENTORY_MOVEMENTS : technician
  VEHICLES ||--o{ INVENTORY_MOVEMENTS : vehicle
  SERVICE_JOBS ||--o{ REPLACED_PARTS : removed
  TECHNICIANS ||--o{ REPLACED_PARTS : records
  SERVICE_JOBS ||--o{ SERVICE_PHOTOS : photos
  SERVICE_JOBS ||--o{ INVOICES : billing
```

## Firestore Setup Order

1. Run `npm run firebase:provision`.
2. Run `npm run firebase:seed-system`.
3. Run `npm run firebase:check-system`.

## Reports

- Inventory report
- Low-stock report
- Stock movement report
- Technician usage report
- Vehicle parts report
- Monthly usage report
- Inventory value report

## API Coverage

- Admin inventory item create/update/delete
- Admin supplier create/update
- Admin inventory reports
- Technician inventory search/read
- Technician part usage
- Technician part return
- Technician parts request
- Technician replaced parts
- Customer used parts and service photos through customer dashboard

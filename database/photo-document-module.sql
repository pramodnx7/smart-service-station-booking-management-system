-- Photo & Document Management Module migration
-- Run after database/schema.sql, database/technician-module.sql, and database/inventory-module.sql.

create table if not exists service_photos (
  id bigserial primary key,
  service_job_id bigint not null references service_jobs(id) on delete restrict,
  vehicle_id bigint not null references vehicles(id) on delete restrict,
  customer_id bigint not null references users(id) on delete restrict,
  technician_id bigint references technicians(id) on delete restrict,
  photo_type text not null check (photo_type in ('Before Service', 'During Service', 'After Service', 'Replaced Part', 'Vehicle Inspection')),
  image_url text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null default 0,
  description text,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists documents (
  id bigserial primary key,
  service_job_id bigint not null references service_jobs(id) on delete restrict,
  vehicle_id bigint not null references vehicles(id) on delete restrict,
  customer_id bigint not null references users(id) on delete restrict,
  document_type text not null check (document_type in ('Service Report', 'Inspection Report', 'Warranty Document', 'Customer Attachment', 'Vehicle Registration Document', 'Insurance Document', 'Service Checklist', 'Invoice PDF')),
  file_name text not null,
  file_url text not null,
  mime_type text not null,
  size_bytes integer not null default 0,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists upload_audit_logs (
  id bigserial primary key,
  file_kind text not null,
  file_id bigint not null,
  action text not null,
  user_id bigint not null references users(id) on delete restrict,
  role text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_photos_job_id on service_photos(service_job_id);
create index if not exists idx_service_photos_vehicle_id on service_photos(vehicle_id);
create index if not exists idx_documents_job_id on documents(service_job_id);
create index if not exists idx_documents_customer_id on documents(customer_id);

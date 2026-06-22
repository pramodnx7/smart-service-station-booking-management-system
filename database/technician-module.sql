-- Technician Management Module migration
-- Run after database/schema.sql.

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'customer', 'technician'));

create table if not exists inventory_parts (
  id bigserial primary key,
  name text not null,
  sku text not null unique,
  stock integer not null default 0 check (stock >= 0),
  unit_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists technicians (
  id bigserial primary key,
  user_id bigint not null unique references users(id) on delete restrict,
  employee_no text not null unique,
  specialization text not null,
  phone text,
  experience_years integer not null default 0 check (experience_years >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_jobs (
  id bigserial primary key,
  booking_id bigint not null unique references bookings(id) on delete restrict,
  vehicle_id bigint not null references vehicles(id) on delete restrict,
  customer_id bigint not null references users(id) on delete restrict,
  assigned_technician_id bigint references technicians(id) on delete restrict,
  service_type text not null,
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  status text not null default 'Pending' check (status in ('Pending', 'Assigned', 'In Progress', 'Waiting For Parts', 'Quality Check', 'Completed', 'Cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  start_date date,
  expected_completion_date date,
  completion_date date,
  assigned_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists technician_notes (
  id bigserial primary key,
  service_job_id bigint not null references service_jobs(id) on delete restrict,
  technician_id bigint not null references technicians(id) on delete restrict,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists technician_progress (
  id bigserial primary key,
  service_job_id bigint not null references service_jobs(id) on delete restrict,
  technician_id bigint not null references technicians(id) on delete restrict,
  progress_percentage integer not null check (progress_percentage between 0 and 100),
  status text not null check (status in ('Pending', 'Assigned', 'In Progress', 'Waiting For Parts', 'Quality Check', 'Completed', 'Cancelled')),
  remarks text,
  created_at timestamptz not null default now()
);

create table if not exists service_job_parts (
  id bigserial primary key,
  service_job_id bigint not null references service_jobs(id) on delete restrict,
  part_id bigint not null references inventory_parts(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  used_by_technician bigint not null references technicians(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists service_images (
  id bigserial primary key,
  service_job_id bigint not null references service_jobs(id) on delete restrict,
  technician_id bigint not null references technicians(id) on delete restrict,
  image_url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists idx_technicians_user_id on technicians(user_id);
create index if not exists idx_service_jobs_booking_id on service_jobs(booking_id);
create index if not exists idx_service_jobs_vehicle_id on service_jobs(vehicle_id);
create index if not exists idx_service_jobs_customer_id on service_jobs(customer_id);
create index if not exists idx_service_jobs_technician_id on service_jobs(assigned_technician_id);
create index if not exists idx_technician_notes_job_id on technician_notes(service_job_id);
create index if not exists idx_technician_progress_job_id on technician_progress(service_job_id);
create index if not exists idx_service_job_parts_job_id on service_job_parts(service_job_id);

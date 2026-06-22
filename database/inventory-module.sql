-- Inventory & Spare Parts Management Module migration
-- Run after database/schema.sql and database/technician-module.sql.

create table if not exists inventory_categories (
  id bigserial primary key,
  name text not null unique,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists inventory_suppliers (
  id bigserial primary key,
  name text not null unique,
  phone text,
  email text,
  address text,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_parts (
  id bigserial primary key,
  item_code text not null unique,
  part_name text not null,
  category_id bigint not null references inventory_categories(id) on delete restrict,
  brand text not null,
  manufacturer text,
  supplier_id bigint references inventory_suppliers(id) on delete restrict,
  description text,
  purchase_price numeric(12,2) not null default 0 check (purchase_price >= 0),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  minimum_stock_level integer not null default 0 check (minimum_stock_level >= 0),
  location text,
  warranty_period text,
  warranty_provider text,
  status text not null default 'Active' check (status in ('Active', 'Low Stock', 'Out of Stock', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_movements (
  id bigserial primary key,
  part_id bigint references inventory_parts(id) on delete restrict,
  service_job_id bigint references service_jobs(id) on delete restrict,
  technician_id bigint references technicians(id) on delete restrict,
  vehicle_id bigint references vehicles(id) on delete restrict,
  customer_id bigint references users(id) on delete restrict,
  type text not null,
  quantity integer not null check (quantity > 0),
  condition text,
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

alter table service_job_parts add column if not exists condition text;
alter table service_job_parts add column if not exists unit_price numeric(12,2) not null default 0;
alter table service_job_parts add column if not exists total_price numeric(12,2) not null default 0;
alter table service_job_parts add column if not exists brand text;
alter table service_job_parts add column if not exists warranty_provider text;
alter table service_job_parts add column if not exists warranty_period text;
alter table service_job_parts add column if not exists warranty_start_date date;
alter table service_job_parts add column if not exists warranty_expiry_date date;
alter table service_job_parts add column if not exists note text;
alter table service_job_parts add column if not exists photo_url text;

create table if not exists replaced_parts (
  id bigserial primary key,
  service_job_id bigint not null references service_jobs(id) on delete restrict,
  technician_id bigint not null references technicians(id) on delete restrict,
  vehicle_id bigint not null references vehicles(id) on delete restrict,
  customer_id bigint not null references users(id) on delete restrict,
  removed_part_name text not null,
  condition text not null,
  replacement_reason text not null,
  photo_evidence text,
  note text,
  created_at timestamptz not null default now()
);

alter table invoices add column if not exists service_job_id bigint references service_jobs(id) on delete restrict;
alter table invoices add column if not exists parts_total numeric(12,2) not null default 0;
alter table invoices add column if not exists labor_cost numeric(12,2) not null default 0;
alter table invoices add column if not exists service_charges numeric(12,2) not null default 0;
alter table invoices add column if not exists tax numeric(12,2) not null default 0;
alter table invoices add column if not exists discount numeric(12,2) not null default 0;

create index if not exists idx_inventory_parts_category_id on inventory_parts(category_id);
create index if not exists idx_inventory_parts_supplier_id on inventory_parts(supplier_id);
create index if not exists idx_inventory_movements_part_id on inventory_movements(part_id);
create index if not exists idx_inventory_movements_service_job_id on inventory_movements(service_job_id);
create index if not exists idx_replaced_parts_service_job_id on replaced_parts(service_job_id);

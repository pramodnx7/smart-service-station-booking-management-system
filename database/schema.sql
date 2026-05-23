create extension if not exists pgcrypto;

create table if not exists users (
  id bigserial primary key,
  role text not null check (role in ('admin', 'customer')),
  name text not null,
  email text not null unique,
  phone text,
  password_hash text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vehicles (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  make text not null,
  model text not null,
  plate_number text not null,
  year text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists service_packages (
  id bigserial primary key,
  name text not null unique,
  price numeric(12,2) not null,
  duration text not null,
  description text not null,
  active boolean not null default true
);

create table if not exists bookings (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  vehicle_id bigint not null references vehicles(id) on delete cascade,
  service_package_id bigint not null references service_packages(id),
  booking_date date not null,
  booking_time time not null,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'In Progress', 'Completed', 'Cancelled')),
  queue_position integer not null default 1,
  progress integer not null default 10 check (progress between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists invoices (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  booking_id bigint references bookings(id) on delete set null,
  service_package_id bigint not null references service_packages(id),
  amount numeric(12,2) not null,
  payment_status text not null default 'Unpaid' check (payment_status in ('Paid', 'Unpaid')),
  invoice_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists emergency_requests (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  location text not null,
  problem text not null,
  status text not null default 'Open' check (status in ('Open', 'Assigned', 'Closed')),
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  type text not null,
  message text not null,
  unread boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists feedback (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_role on users(role);
create index if not exists idx_vehicles_user_id on vehicles(user_id);
create index if not exists idx_bookings_user_id on bookings(user_id);
create index if not exists idx_invoices_user_id on invoices(user_id);
create index if not exists idx_notifications_user_id on notifications(user_id);

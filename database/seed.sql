insert into users (role, name, email, phone, password_hash)
values
  ('admin', 'Admin Manager', 'admin@autocare.lk', '+94 77 023 4567', crypt('admin123', gen_salt('bf'))),
  ('customer', 'Demo Customer', 'customer@autocare.lk', '+94 77 345 6789', crypt('customer123', gen_salt('bf')))
on conflict (email) do nothing;

insert into service_packages (name, price, duration, description)
values
  ('Oil Change', 6000, '45 min', 'Engine oil, filter replacement and quick inspection.'),
  ('Brake Service', 7500, '1 hr', 'Brake pads, fluid check and safety testing.'),
  ('Full Service', 18500, '3 hr', 'Complete inspection, fluids, diagnostics and tune-up.'),
  ('Engine Diagnostics', 12000, '1.5 hr', 'Computer scan, issue report and repair estimate.'),
  ('General Service', 8500, '1 hr', 'Standard maintenance service and inspection.')
on conflict (name) do nothing;

insert into vehicles (user_id, make, model, plate_number, year, image_url)
select u.id, 'Toyota Corolla', 'Axio', 'ABC-854', '2019', 'assets/images/newsletter-red-sports-car.png'
from users u where u.email = 'customer@autocare.lk'
and not exists (
  select 1 from vehicles v where v.user_id = u.id and v.plate_number = 'ABC-854'
);

insert into vehicles (user_id, make, model, plate_number, year, image_url)
select u.id, 'Honda Civic', 'EX', 'XZ-5676', '2019', 'assets/images/hero-blue-workshop.png'
from users u where u.email = 'customer@autocare.lk'
and not exists (
  select 1 from vehicles v where v.user_id = u.id and v.plate_number = 'XZ-5676'
);

insert into bookings (user_id, vehicle_id, service_package_id, booking_date, booking_time, status, queue_position, progress)
select u.id, v.id, sp.id, current_date + interval '2 days', '10:00', 'Approved', 3, 35
from users u, vehicles v, service_packages sp
where u.email = 'customer@autocare.lk' and v.user_id = u.id and v.plate_number = 'ABC-854' and sp.name = 'General Service'
and not exists (
  select 1
  from bookings b
  where b.user_id = u.id
    and b.vehicle_id = v.id
    and b.service_package_id = sp.id
    and b.status = 'Approved'
)
limit 1;

insert into invoices (user_id, service_package_id, amount, payment_status, invoice_date)
select u.id, sp.id, sp.price, 'Paid', current_date - interval '5 days'
from users u, service_packages sp
where u.email = 'customer@autocare.lk' and sp.name = 'Oil Change'
and not exists (
  select 1
  from invoices i
  where i.user_id = u.id
    and i.service_package_id = sp.id
    and i.payment_status = 'Paid'
);

insert into notifications (user_id, type, message, unread)
select id, 'Booking Approved', 'Your General Service booking has been approved.', true
from users u
where u.email = 'customer@autocare.lk'
and not exists (
  select 1
  from notifications n
  where n.user_id = u.id
    and n.type = 'Booking Approved'
    and n.message = 'Your General Service booking has been approved.'
);

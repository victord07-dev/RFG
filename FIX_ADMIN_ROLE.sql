-- Run this once in Supabase SQL Editor to restore the official admin account.

update public.profiles
set role = 'sales',
    active = true,
    updated_at = now()
where lower(email) = 'borotechsolution@gmail.com';

update public.profiles
set role = 'admin',
    active = true,
    updated_at = now()
where lower(email) = 'info@rfg-financialgroup.com';

select id, email, full_name, role, active
from public.profiles
where lower(email) in (
  'borotechsolution@gmail.com',
  'info@rfg-financialgroup.com'
)
order by email;


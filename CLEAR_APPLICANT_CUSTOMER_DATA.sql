-- Clears applicant/customer test data while preserving staff accounts,
-- authentication users, payment settings, login logs, and archive records.

begin;

-- Child loan records are removed automatically through ON DELETE CASCADE.
delete from public.loan_applications;
delete from public.customers;

-- Seller/showroom rows in this project are created from applications.
delete from public.sellers;
delete from public.showrooms;

commit;

select
  (select count(*) from public.loan_applications) as applications_remaining,
  (select count(*) from public.customers) as customers_remaining,
  (select count(*) from public.sellers) as sellers_remaining,
  (select count(*) from public.showrooms) as showrooms_remaining;

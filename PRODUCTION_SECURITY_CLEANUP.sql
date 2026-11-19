-- Run once in the live Supabase SQL Editor before production handover.
-- Removes the temporary due-date manipulation helper used during penalty testing.

begin;

revoke all on function public.admin_shift_emi_due_dates_for_testing(uuid, integer)
from public, anon, authenticated;

drop function if exists public.admin_shift_emi_due_dates_for_testing(uuid, integer);

commit;

select 'Temporary EMI testing RPC removed' as result;

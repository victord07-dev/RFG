-- Run once in Supabase SQL Editor for the EMI payment workflow.

grant select, insert, update on public.emi_schedule to authenticated;
grant select, insert, update on public.payments to authenticated;

drop policy if exists "sales_submit_own_emi_for_verification" on public.emi_schedule;
create policy "sales_submit_own_emi_for_verification"
on public.emi_schedule for update
to authenticated
using (
  public.current_role() = 'sales'
  and status in ('pending', 'overdue')
  and exists (
    select 1
    from public.loan_applications la
    where la.id = application_id
      and la.created_by = auth.uid()
      and la.status = 'active'
  )
)
with check (
  public.current_role() = 'sales'
  and status = 'verification_pending'
  and exists (
    select 1
    from public.loan_applications la
    where la.id = application_id
      and la.created_by = auth.uid()
      and la.status = 'active'
  )
);

select 'EMI workflow permission ready' as result;

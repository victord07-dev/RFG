-- Read-only diagnosis for partial EMI payments. This changes no data.

select
  request.request_id,
  request.status as request_status,
  request.created_at as requested_at,
  request.reviewed_at,
  request.amount as collected_amount,
  request.emi_due_amount,
  request.short_amount,
  request.carry_forward_amount as carry_at_request,
  request.emi_schedule_id as request_emi_id,
  request.payment_id as request_payment_uuid,
  source_emi.emi_month as request_emi_month,
  source_emi.due_date as request_emi_due_date,
  source_emi.status as request_emi_status,
  source_emi.amount as request_emi_base,
  source_emi.paid_amount as request_emi_paid,
  source_emi.carry_forward_amount as request_emi_carry,
  (
    select count(*)
    from public.emi_schedule as duplicate_source
    where duplicate_source.application_id = request.application_id
      and duplicate_source.due_date = source_emi.due_date
  ) as source_due_date_row_count,
  payment.id as payment_uuid,
  payment.payment_id,
  payment.status as payment_status,
  payment.amount as payment_amount,
  payment.emi_schedule_id as payment_emi_id,
  payment.reference as payment_reference,
  next_emi.id as next_emi_id,
  next_emi.emi_month as next_emi_month,
  next_emi.status as next_emi_status,
  next_emi.amount as next_emi_base,
  next_emi.paid_amount as next_emi_paid,
  next_emi.carry_forward_amount as next_emi_carry,
  next_emi.amount + next_emi.carry_forward_amount as next_emi_due,
  (
    select count(*)
    from public.emi_schedule as duplicate_next
    where duplicate_next.application_id = request.application_id
      and duplicate_next.due_date = next_emi.due_date
  ) as next_due_date_row_count
from public.cash_payment_requests as request
left join public.emi_schedule as source_emi
  on source_emi.id = request.emi_schedule_id
left join public.payments as payment
  on payment.id = request.payment_id
  or payment.reference = request.request_id
left join lateral (
  select schedule.*
  from public.emi_schedule as schedule
  where schedule.application_id = request.application_id
    and source_emi.due_date is not null
    and schedule.due_date > source_emi.due_date
  order by schedule.due_date asc
  limit 1
) as next_emi on true
where request.request_id in ('CR-6262', 'CR-3142')
order by request.created_at asc;

-- Les fonctions de déclencheur n'ont pas à être appelées directement par l'application
revoke execute on function public.tg_log_plans(), public.tg_log_settings(), public.tg_order_before_insert(),
  public.tg_order_payment_notify(), public.tg_order_step(), public.tg_payment_request_before_insert(),
  public.tg_payment_request_notify(), public.tg_quote_before_insert(), public.tg_quote_notify(),
  public.tg_quote_before_update() from authenticated;

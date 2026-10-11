-- PlayXP: deshacer las migraciones 025 y 026 (seña con Mercado Pago).
-- NO es una migracion: esta fuera de supabase/migrations a proposito. Solo
-- se corre a mano, si despues de aplicar la 025 y la 026 hay que volver
-- atras. Deja la base como estaba con la 024.
--
-- OJO: borra las tablas de la seña con todo su contenido (señas, pagos
-- registrados, datos de jugadores y la conexion de Mercado Pago). Las
-- reservas, ventas y el resto no se tocan.

begin;

-- Tareas programadas (026).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname) from cron.job
    where jobname in ('playxp-senas-vencidas', 'playxp-mp-limpieza', 'playxp-mp-renovar');
  end if;
end $$;
drop function if exists mp_request_refresh();
drop function if exists mp_housekeeping();

-- Avisos en vivo.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservation_deposits'
  ) then
    alter publication supabase_realtime drop table public.reservation_deposits;
  end if;
end $$;

-- Reglas sobre reservas y configuracion.
drop trigger if exists reservations_track_deposit on reservations;
drop trigger if exists reservations_normalize_public on reservations;
drop trigger if exists settings_check_deposit on settings;

-- La insercion publica vuelve a la politica de la 015.
drop policy if exists "public create reservations" on reservations;
create policy "public create reservations" on reservations for insert
  with check (
    venue_is_writable(venue_id)
    and not exists (select 1 from settings s where s.id = venue_id and s.is_demo)
  );

-- El total del pedido vuelve a las funciones de la 020.
create or replace function order_total(
  p_sale_id uuid,
  p_court_fee numeric,
  p_discount_type text,
  p_discount_value numeric
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select coalesce(sum(qty * unit_price), 0) + coalesce(p_court_fee, 0) as subtotal
    from sale_items where sale_id = p_sale_id
  )
  select greatest(
    0,
    subtotal - case
      when p_discount_type = 'porcentaje' then round(subtotal * least(coalesce(p_discount_value, 0), 100) / 100)
      when p_discount_type = 'fijo' then coalesce(p_discount_value, 0)
      else 0
    end
  )
  from base;
$$;

create or replace function sales_keep_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'en_curso' or (old.status = 'en_curso' and new.status = 'cerrada') then
    new.total := order_total(new.id, new.court_fee, new.discount_type, new.discount_value);
  end if;
  return new;
end;
$$;

-- Funciones de la 025.
drop function if exists deposit_status(uuid, text);
drop function if exists cancel_my_deposit(uuid, text);
drop function if exists mark_deposit_refunded(bigint);
drop function if exists disconnect_mp();
drop function if exists my_mp_connection();
drop function if exists apply_deposit_payment(uuid, bigint, text, numeric, text, bigint, timestamptz);
drop function if exists cancel_deposit_hold(uuid);
drop function if exists expire_deposit_holds();
drop function if exists create_deposit_hold(uuid, uuid, date, text, text, text, text, text);
drop function if exists consume_mp_oauth_state(text);
drop function if exists reservations_track_deposit();
drop function if exists reservations_normalize_public();
drop function if exists settings_check_deposit();
drop function if exists sale_deposit(uuid, numeric);
drop function if exists deposit_amount(uuid, numeric);
drop function if exists deposit_active(uuid);

-- Tablas y columnas.
alter table sales drop column if exists deposit_applied;
drop table if exists deposit_payments;
drop table if exists reservation_deposit_secrets;
drop table if exists reservation_deposits;
drop table if exists reservation_contacts;
drop table if exists mp_oauth_states;
drop table if exists mp_connections;
alter table settings drop constraint if exists settings_deposit_check;
alter table settings
  drop column if exists deposit_enabled,
  drop column if exists deposit_type,
  drop column if exists deposit_value,
  drop column if exists deposit_hold_minutes,
  drop column if exists deposit_policy;

commit;

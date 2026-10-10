-- PlayXP: tareas programadas de la seña.
-- Correr despues de 025.
--
-- Tres tareas, con pg_cron (corre adentro de la base):
--   1. Cada minuto: liberar los horarios cuyo tiempo de pago vencio.
--   2. Cada hora:   limpieza (autorizaciones a medio hacer y credenciales de
--                   cuentas desconectadas).
--   3. Cada dia:    renovar las autorizaciones de Mercado Pago que estan por
--                   vencer. Esto necesita hablar con Mercado Pago, asi que
--                   la base llama a la funcion del servidor mp-refresh.
--
-- Las dos primeras son SQL puro: no pasan por internet y las funciones que
-- llaman no se pueden ejecutar desde el navegador (ver permisos en la 025).
--
-- La tercera llama a una funcion del servidor. Para que esa funcion acepte
-- solo esta llamada, la base le manda una clave que nadie mas conoce. Hay
-- que cargar dos datos en platform_settings (tabla privada, la de la 014),
-- una sola vez, desde el SQL Editor:
--
--   insert into platform_settings (key, value) values
--     ('functions_base_url', 'https://<ref-del-proyecto>.supabase.co/functions/v1'),
--     ('cron_secret', '<una clave larga al azar>')
--   on conflict (key) do update set value = excluded.value;
--
-- y cargar la MISMA clave en los secretos de las funciones, como CRON_SECRET.
-- Mientras esos dos datos no esten, la tarea diaria no hace nada (no falla).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- === 1. Limpieza. ===
create or replace function mp_housekeeping()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Autorizaciones que no se terminaron o ya se usaron.
  delete from mp_oauth_states where expires_at < now() - interval '1 hour';
  -- Cuentas desconectadas: pasado el plazo, la credencial se borra.
  delete from mp_connections where status = 'desconectada' and purge_after < now();
end;
$$;

revoke all on function mp_housekeeping() from public, anon, authenticated;

-- === 2. Pedido de renovacion a la funcion del servidor. ===
create or replace function mp_request_refresh()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from platform_settings where key = 'functions_base_url';
  select value into v_secret from platform_settings where key = 'cron_secret';
  if coalesce(btrim(v_url), '') = '' or coalesce(btrim(v_secret), '') = '' then
    return;
  end if;
  -- Solo si hay alguna cuenta por vencer en los proximos 30 dias, o marcada
  -- para reconectar (se reintenta).
  if not exists (
    select 1 from mp_connections
    where status in ('conectada', 'reconectar') and token_expires_at < now() + interval '30 days'
  ) then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/mp-refresh',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function mp_request_refresh() from public, anon, authenticated;

-- === 3. Agenda. ===
-- cron.schedule con nombre reemplaza la tarea si ya existia: se puede
-- volver a correr sin duplicar.
select cron.schedule('playxp-senas-vencidas', '* * * * *', $$select public.expire_deposit_holds()$$);
select cron.schedule('playxp-mp-limpieza', '17 * * * *', $$select public.mp_housekeeping()$$);
select cron.schedule('playxp-mp-renovar', '40 7 * * *', $$select public.mp_request_refresh()$$);

-- Para apagar todo:
--   select cron.unschedule('playxp-senas-vencidas');
--   select cron.unschedule('playxp-mp-limpieza');
--   select cron.unschedule('playxp-mp-renovar');

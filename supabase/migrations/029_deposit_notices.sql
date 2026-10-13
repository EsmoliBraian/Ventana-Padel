-- PlayXP: avisos cuando un complejo conecta Mercado Pago o activa la seña, y
-- esos dos datos en la lista del superadmin. Correr despues de 028. Se puede
-- volver a correr sin romper nada.
--
-- Los avisos salen por el mismo medio que el de "nuevo complejo" (migracion
-- 014): el webhook cargado en platform_settings ('signup_webhook_url' y, si
-- es Telegram, 'signup_webhook_chat_id'). Si no hay webhook cargado no hacen
-- nada, y si el envio falla, la conexion o el cambio se guardan igual.
--
-- El codigo publicado funciona con o sin esta migracion: sin ella no hay
-- avisos y el superadmin muestra un guion en la columna "Seña".

-- === 1. Envio de un aviso a la plataforma. ===
create or replace function notify_platform(p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_chat_id text;
  v_body jsonb;
begin
  select value into v_url from platform_settings where key = 'signup_webhook_url';
  if v_url is null or btrim(v_url) = '' then
    return;
  end if;
  select value into v_chat_id from platform_settings where key = 'signup_webhook_chat_id';
  v_body := jsonb_build_object('text', p_text);
  if v_chat_id is not null and btrim(v_chat_id) <> '' then
    v_body := v_body || jsonb_build_object('chat_id', v_chat_id);
  end if;
  perform net.http_post(
    url := v_url,
    body := v_body,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  -- El aviso es accesorio: nunca frena lo que lo disparo.
  null;
end;
$$;

revoke all on function notify_platform(text) from public, anon, authenticated;

-- === 2. Un complejo conecta Mercado Pago. ===
-- Avisa cuando la cuenta pasa a "conectada" (la primera vez o al volver a
-- conectar). La renovacion automatica de la autorizacion no avisa. El aviso
-- lleva solo el nombre y el link del complejo: nada de la cuenta de Mercado
-- Pago ni de sus credenciales.
create or replace function notify_mp_connected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue settings;
begin
  if new.status = 'conectada' and (tg_op = 'INSERT' or old.status is distinct from 'conectada') then
    select * into v_venue from settings where id = new.venue_id;
    perform notify_platform(
      'Mercado Pago conectado: ' || coalesce(v_venue.venue_name, '-') || E'\n'
        || 'Link: /' || coalesce(v_venue.slug, '-')
    );
  end if;
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function notify_mp_connected() from public, anon, authenticated;

drop trigger if exists mp_connections_notify on mp_connections;
create trigger mp_connections_notify
  after insert or update of status on mp_connections
  for each row execute function notify_mp_connected();

-- === 3. Un complejo activa la seña. ===
create or replace function notify_deposit_enabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deposit_enabled and not old.deposit_enabled then
    perform notify_platform(
      'Seña activada: ' || new.venue_name || E'\n'
        || 'Seña: ' || case
             when new.deposit_type = 'porcentaje' then trim(to_char(new.deposit_value, 'FM999990')) || '% del turno'
             else '$' || replace(trim(to_char(new.deposit_value, 'FM999G999G990')), ',', '.')
           end || E'\n'
        || 'Link: /' || coalesce(new.slug, '-')
    );
  end if;
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function notify_deposit_enabled() from public, anon, authenticated;

drop trigger if exists settings_notify_deposit on settings;
create trigger settings_notify_deposit
  after update of deposit_enabled on settings
  for each row execute function notify_deposit_enabled();

-- === 4. La lista del superadmin suma Mercado Pago y seña. ===
-- Cambia lo que devuelve, asi que hay que borrarla y volver a crearla (el
-- borrado y la creacion van juntos: si algo falla, queda la anterior).
begin;

drop function if exists admin_list_venues();

create function admin_list_venues()
returns table (
  venue_id uuid,
  slug text,
  venue_name text,
  created_at timestamptz,
  plan_status text,
  trial_ends_at timestamptz,
  is_demo boolean,
  owner_name text,
  owner_whatsapp text,
  owner_email text,
  reservations_count bigint,
  last_activity_at timestamptz,
  paid_since timestamptz,
  price_frozen_until date,
  mp_status text,
  deposit_enabled boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    s.id,
    s.slug,
    s.venue_name,
    s.created_at,
    s.plan_status,
    s.trial_ends_at,
    s.is_demo,
    o.owner_name,
    o.owner_whatsapp,
    coalesce(o.owner_email, u.email::text),
    (select count(*) from reservations r where r.venue_id = s.id),
    greatest(
      (select max(r.created_at) from reservations r where r.venue_id = s.id),
      (select max(sa.created_at) from sales sa where sa.venue_id = s.id),
      u.last_sign_in_at
    ),
    b.paid_since,
    b.price_frozen_until,
    -- Estado de la conexion (conectada, reconectar) o null si nunca conecto.
    -- Solo el estado: ni la cuenta ni las credenciales.
    c.status,
    s.deposit_enabled
  from settings s
  left join venue_owners o on o.venue_id = s.id
  left join auth.users u on u.id = s.owner_id
  left join venue_billing b on b.venue_id = s.id
  left join mp_connections c on c.venue_id = s.id
  where is_platform_admin()
  order by s.created_at desc;
$$;

revoke all on function admin_list_venues() from public, anon;
grant execute on function admin_list_venues() to authenticated;

commit;

-- Para volver atras los avisos:
--   drop trigger if exists mp_connections_notify on mp_connections;
--   drop trigger if exists settings_notify_deposit on settings;
--   drop function if exists notify_mp_connected();
--   drop function if exists notify_deposit_enabled();
--   drop function if exists notify_platform(text);
-- (La lista del superadmin vuelve a su forma anterior corriendo de nuevo la
-- parte 3 de la migracion 024.)

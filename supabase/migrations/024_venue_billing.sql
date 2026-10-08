-- PlayXP: desde cuando paga cada complejo y hasta cuando tiene el precio
-- congelado, para verlo en /superadmin.
-- Correr despues de 022. No depende de la 023 (ni la 023 de esta).
--
-- No hay cobro automatico: esto es solo un registro. La fecha de inicio se
-- anota sola la primera vez que se activa un complejo desde /superadmin, y
-- el precio queda congelado por 6 meses desde ese dia.
--
-- Esta migracion y el codigo nuevo no dependen uno del otro: con el codigo
-- actual /superadmin sigue funcionando igual (ignora las dos columnas
-- nuevas), y el codigo nuevo sin esta migracion las muestra vacias.

-- === 1. Datos de cobro, fuera de la tabla del complejo. ===
-- La tabla settings es de lectura publica (el sitio la necesita), asi que
-- estas fechas no pueden ir ahi. Esta tabla no tiene ninguna politica: ni
-- el publico ni el dueño la leen o la escriben; solo se llega por las
-- funciones de administrador de mas abajo.
create table if not exists venue_billing (
  venue_id uuid primary key references settings(id) on delete cascade,
  -- Dia en que el complejo paso a plan activo por primera vez.
  paid_since timestamptz not null default now(),
  -- Ultimo dia con el precio congelado.
  price_frozen_until date not null
);

alter table venue_billing enable row level security;
revoke all on venue_billing from anon, authenticated;

-- === 2. Activar un complejo anota el inicio del pago. ===
-- Misma funcion de la 018, con un agregado en 'activate': la primera vez
-- guarda la fecha y calcula el fin del precio congelado (6 meses). Si el
-- complejo ya tenia fecha (se dio de baja y volvio), no se pisa: para
-- cambiarla a mano, un UPDATE sobre venue_billing desde el SQL Editor.
create or replace function admin_set_plan(p_venue_id uuid, p_action text, p_days int default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_action = 'activate' then
    update settings set plan_status = 'active', trial_ends_at = null where id = p_venue_id;
    if found then
      insert into venue_billing (venue_id, paid_since, price_frozen_until)
      values (p_venue_id, now(), (ar_today() + interval '6 months')::date)
      on conflict (venue_id) do nothing;
      return;
    end if;
  elsif p_action = 'extend' then
    if p_days is null or p_days < 1 or p_days > 365 then
      raise exception 'La extension tiene que ser de entre 1 y 365 dias.';
    end if;
    update settings
    set plan_status = 'trial',
        trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
    where id = p_venue_id;
  elsif p_action = 'suspend' then
    update settings set plan_status = 'expired' where id = p_venue_id and not is_demo;
  else
    raise exception 'Accion no valida.';
  end if;

  if not found then
    raise exception 'No se encontro el complejo.';
  end if;
end;
$$;

revoke all on function admin_set_plan(uuid, text, int) from public, anon;
grant execute on function admin_set_plan(uuid, text, int) to authenticated;

-- === 3. La lista de complejos suma las dos fechas. ===
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
  price_frozen_until date
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
    b.price_frozen_until
  from settings s
  left join venue_owners o on o.venue_id = s.id
  left join auth.users u on u.id = s.owner_id
  left join venue_billing b on b.venue_id = s.id
  where is_platform_admin()
  order by s.created_at desc;
$$;

revoke all on function admin_list_venues() from public, anon;
grant execute on function admin_list_venues() to authenticated;

commit;

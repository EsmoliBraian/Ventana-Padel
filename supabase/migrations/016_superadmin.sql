-- PlayXP: vista de superadministrador (/superadmin).
-- Correr despues de 015, una sola vez, en el SQL Editor de Supabase. Se
-- puede volver a correr sin romper nada.
--
-- Agrega la lista de administradores de la plataforma y dos funciones que
-- solo ellos pueden usar: listar todos los complejos y activar o extender
-- la prueba de uno. Nadie mas ve datos de otros complejos.
--
-- Despues de correrlo, date de alta como administrador (una sola vez), con
-- el mail de tu cuenta de la app:
--
--   insert into platform_admins (user_id)
--   select id from auth.users where email = 'tu-mail@ejemplo.com'
--   on conflict do nothing;

-- === 1. Quienes son administradores de la plataforma. ===
-- Solo se carga desde el SQL Editor: la app no puede escribir en esta tabla.
-- Cada usuario puede leer unicamente su propia fila (para saber si lo es).
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

drop policy if exists "self read platform_admins" on platform_admins;
create policy "self read platform_admins" on platform_admins for select
  using (user_id = auth.uid());

create or replace function is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

grant execute on function is_platform_admin() to anon, authenticated;

-- === 2. Lista de complejos. ===
-- Devuelve filas solo si quien llama es administrador; para cualquier otro
-- usuario la lista sale vacia. La ultima actividad es lo mas reciente entre
-- la ultima reserva, la ultima venta y el ultimo ingreso del dueño al panel.
create or replace function admin_list_venues()
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
  last_activity_at timestamptz
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
    )
  from settings s
  left join venue_owners o on o.venue_id = s.id
  left join auth.users u on u.id = s.owner_id
  where is_platform_admin()
  order by s.created_at desc;
$$;

revoke all on function admin_list_venues() from public, anon;
grant execute on function admin_list_venues() to authenticated;

-- === 3. Activar o extender la prueba de un complejo. ===
--   'activate': pasa a cliente activo, sin vencimiento.
--   'extend':   deja el complejo en prueba y suma p_days dias. Si la prueba
--               ya vencio, los dias se cuentan desde hoy.
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
  elsif p_action = 'extend' then
    if p_days is null or p_days < 1 or p_days > 365 then
      raise exception 'La extension tiene que ser de entre 1 y 365 dias.';
    end if;
    update settings
    set plan_status = 'trial',
        trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
    where id = p_venue_id;
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

-- === 4. El candado del plan deja pasar a los administradores. ===
-- Misma funcion de 013/015: el dueño sigue sin poder tocar su plan, pero un
-- administrador de la plataforma si (es lo que usa admin_set_plan).
create or replace function protect_settings_plan()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not is_platform_admin() then
    if new.plan_status is distinct from old.plan_status
      or new.trial_ends_at is distinct from old.trial_ends_at
      or new.owner_id is distinct from old.owner_id
      or new.created_at is distinct from old.created_at
      or new.is_demo is distinct from old.is_demo
    then
      raise exception 'El plan del complejo no se puede cambiar desde el panel.';
    end if;
  end if;
  return new;
end;
$$;

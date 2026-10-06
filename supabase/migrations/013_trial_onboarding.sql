-- PlayXP: alta autonoma con datos de ejemplo y prueba gratuita de 30 dias.
-- Correr despues de 001-012, una sola vez y entero, en el SQL Editor de
-- Supabase. Se puede volver a correr sin romper nada.
--
-- Que hace:
--   1. Agrega el deporte a cada cancha.
--   2. Crea venue_owners (contacto del dueño, privado).
--   3. Agrega a settings la lista de primeros pasos.
--   4. Agrega a settings el plan: plan_status, trial_ends_at, created_at.
--   5. Crea create_venue(), la unica forma de dar de alta un complejo.
--   6. Impide que el dueño cambie su propio plan.
--   7. Reescribe las politicas RLS: con la prueba vencida no se puede
--      escribir nada ni crear reservas, pero se sigue pudiendo leer.
--
-- Que NO hace: no borra ni modifica datos. Los complejos que ya existen
-- quedan con plan_status = 'active' y siguen funcionando igual.

-- === 1. El deporte es un dato de cada cancha. ===
-- Las canchas que ya existen quedan como padel.
alter table courts add column if not exists sport text not null default 'padel';
alter table courts drop constraint if exists courts_sport_check;
alter table courts add constraint courts_sport_check
  check (sport in ('padel', 'futbol5', 'futbol7', 'tenis', 'otro'));

-- === 2. Datos de contacto del dueño. ===
-- Van en una tabla aparte y no en settings porque settings es de lectura
-- publica (el sitio de cada complejo la lee sin sesion): ahi quedarian
-- expuestos el nombre y el WhatsApp personal de cada dueño.
create table if not exists venue_owners (
  venue_id uuid primary key references settings(id) on delete cascade,
  owner_name text not null,
  owner_whatsapp text not null,
  owner_email text,
  created_at timestamptz not null default now()
);

alter table venue_owners enable row level security;

drop policy if exists "owner read venue_owners" on venue_owners;
create policy "owner read venue_owners" on venue_owners for select
  using (venue_id = get_my_venue_id());
drop policy if exists "owner update venue_owners" on venue_owners;
create policy "owner update venue_owners" on venue_owners for update
  using (venue_id = get_my_venue_id()) with check (venue_id = get_my_venue_id());

-- === 3. Lista de primeros pasos del Dashboard. ===
-- Guarda que pasos ya hizo el dueño y si oculto la lista. Los complejos que
-- ya existen arrancan con la lista oculta.
alter table settings add column if not exists onboarding jsonb not null default '{}'::jsonb;
update settings set onboarding = '{"dismissed": true}'::jsonb where onboarding = '{}'::jsonb;

-- === 4. Plan del complejo. ===
-- trial: en prueba hasta trial_ends_at. active: cliente que paga, sin
-- vencimiento. expired: dado de baja a mano. Una prueba cuya fecha ya paso
-- se trata como vencida aunque plan_status siga en 'trial' (ver
-- venue_is_writable mas abajo), asi no hace falta ningun proceso que la
-- actualice. Los complejos que ya existen quedan como 'active'.
alter table settings add column if not exists created_at timestamptz not null default now();
alter table settings add column if not exists plan_status text not null default 'active';
alter table settings add column if not exists trial_ends_at timestamptz;
alter table settings drop constraint if exists settings_plan_status_check;
alter table settings add constraint settings_plan_status_check
  check (plan_status in ('trial', 'active', 'expired'));

-- === 5. Alta de un complejo. ===
-- Antes el panel insertaba la fila de settings directo desde el navegador.
-- Ahora la unica forma de crear un complejo es esta funcion, que valida los
-- datos y crea todo junto (complejo, contacto del dueño, canchas y productos
-- de cantina de ejemplo): o se crea todo o no se crea nada. El complejo
-- nace en prueba por 30 dias; como el navegador ya no puede insertar en
-- settings, nadie puede darse de alta directamente como 'active'.
create or replace function create_venue(
  p_venue_name text,
  p_slug text,
  p_owner_name text,
  p_owner_whatsapp text,
  p_courts jsonb
)
returns settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_venue settings;
  v_name text := btrim(coalesce(p_venue_name, ''));
  v_slug text := btrim(coalesce(p_slug, ''));
  v_owner_name text := btrim(coalesce(p_owner_name, ''));
  v_phone text := regexp_replace(coalesce(p_owner_whatsapp, ''), '\D', '', 'g');
  v_item jsonb;
  v_sport text;
  v_count int;
  v_total int := 0;
  v_sports_used int := 0;
  v_label text;
  v_price numeric;
  v_i int;
  v_bebidas uuid;
  v_comidas uuid;
  v_cafeteria uuid;
begin
  if v_user is null then
    raise exception 'Tenés que iniciar sesión para crear tu complejo.';
  end if;
  if exists (select 1 from settings where owner_id = v_user) then
    raise exception 'Tu cuenta ya tiene un complejo creado.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Escribí el nombre del complejo.';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) < 3 or char_length(v_slug) > 40 then
    raise exception 'El link solo puede tener letras, números y guiones (entre 3 y 40 caracteres).';
  end if;
  -- Mantener en sincronia con RESERVED_SLUGS en src/lib/venuePath.ts.
  if v_slug in ('admin', 'api', 'assets', 'demo', 'login', 'signup', 'superadmin') then
    raise exception 'Ese link está reservado, elegí otro.';
  end if;
  if exists (select 1 from settings where slug = v_slug) then
    raise exception 'Ese link ya está en uso, elegí otro.';
  end if;
  if char_length(v_owner_name) < 2 or char_length(v_owner_name) > 80 then
    raise exception 'Escribí tu nombre.';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 15 then
    raise exception 'Revisá el número de WhatsApp: va con código de país, sin el +.';
  end if;
  if p_courts is null or jsonb_typeof(p_courts) <> 'array' then
    raise exception 'Elegí al menos una cancha.';
  end if;

  for v_item in select * from jsonb_array_elements(p_courts) loop
    v_sport := v_item ->> 'sport';
    v_count := coalesce((v_item ->> 'count')::int, 0);
    if v_sport is null or v_sport not in ('padel', 'futbol5', 'futbol7', 'tenis', 'otro') then
      raise exception 'Deporte no válido.';
    end if;
    if v_count < 0 or v_count > 12 then
      raise exception 'Podés cargar hasta 12 canchas por deporte.';
    end if;
    if v_count > 0 then
      v_sports_used := v_sports_used + 1;
    end if;
    v_total := v_total + v_count;
  end loop;
  if v_total < 1 then
    raise exception 'Elegí al menos una cancha.';
  end if;
  if v_total > 20 then
    raise exception 'Podés cargar hasta 20 canchas en el alta. Después sumás más desde el panel.';
  end if;

  begin
    insert into settings (
      owner_id, slug, venue_name, whatsapp_phone,
      open_hour, close_hour, slot_duration_minutes,
      plan_status, trial_ends_at
    )
    values (
      v_user, v_slug, v_name, v_phone,
      8, 23, 60,
      'trial', now() + interval '30 days'
    )
    returning * into v_venue;
  exception when unique_violation then
    raise exception 'Ese link ya está en uso, elegí otro.';
  end;

  insert into venue_owners (venue_id, owner_name, owner_whatsapp, owner_email)
  values (v_venue.id, v_owner_name, v_phone, (select email from auth.users where id = v_user));

  -- Canchas de ejemplo: una por cada una que eligio, con un precio de
  -- referencia que despues edita desde el panel.
  for v_item in select * from jsonb_array_elements(p_courts) loop
    v_sport := v_item ->> 'sport';
    v_count := coalesce((v_item ->> 'count')::int, 0);
    v_label := case v_sport
      when 'padel' then 'Pádel'
      when 'futbol5' then 'Fútbol 5'
      when 'futbol7' then 'Fútbol 7'
      when 'tenis' then 'Tenis'
      else 'Cancha'
    end;
    v_price := case v_sport
      when 'padel' then 20000
      when 'futbol5' then 40000
      when 'futbol7' then 56000
      when 'tenis' then 16000
      else 20000
    end;
    for v_i in 1..v_count loop
      insert into courts (venue_id, name, sport, price)
      values (
        v_venue.id,
        case when v_sports_used = 1 then 'Cancha ' || v_i else v_label || ' ' || v_i end,
        v_sport,
        v_price
      );
    end loop;
  end loop;

  -- Cantina de ejemplo, para que Productos y Venta rapida no arranquen vacios.
  insert into categories (venue_id, name) values (v_venue.id, 'Bebidas') returning id into v_bebidas;
  insert into categories (venue_id, name) values (v_venue.id, 'Comidas') returning id into v_comidas;
  insert into categories (venue_id, name) values (v_venue.id, 'Cafetería') returning id into v_cafeteria;

  insert into products (venue_id, name, description, category_id, price) values
    (v_venue.id, 'Agua mineral 500 ml', '', v_bebidas, 1500),
    (v_venue.id, 'Gaseosa 500 ml', '', v_bebidas, 2200),
    (v_venue.id, 'Bebida isotónica', '', v_bebidas, 2800),
    (v_venue.id, 'Cerveza lata', '', v_bebidas, 3000),
    (v_venue.id, 'Barrita de cereal', '', v_comidas, 1200),
    (v_venue.id, 'Papas fritas', '', v_comidas, 2500),
    (v_venue.id, 'Sándwich de jamón y queso', '', v_comidas, 4500),
    (v_venue.id, 'Café', '', v_cafeteria, 1800);

  return v_venue;
end;
$$;

revoke all on function create_venue(text, text, text, text, jsonb) from public, anon;
grant execute on function create_venue(text, text, text, text, jsonb) to authenticated;

-- El alta ya no inserta en settings desde el navegador.
drop policy if exists "owner insert settings" on settings;

-- === 6. El dueño no puede cambiar su propio plan. ===
-- RLS decide que filas puede tocar cada uno, pero no que columnas. Este
-- trigger rechaza cualquier cambio de plan, vencimiento, dueño o fecha de
-- alta hecho desde la app (rol anon o authenticated). Desde el SQL Editor o
-- con la service role no hay sesion de usuario, asi que ahi si se puede:
-- es la forma de activar o extender un complejo a mano.
create or replace function protect_settings_plan()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if new.plan_status is distinct from old.plan_status
      or new.trial_ends_at is distinct from old.trial_ends_at
      or new.owner_id is distinct from old.owner_id
      or new.created_at is distinct from old.created_at
    then
      raise exception 'El plan del complejo no se puede cambiar desde el panel.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_settings_plan on settings;
create trigger protect_settings_plan
  before update on settings
  for each row execute function protect_settings_plan();

-- === 7. Politicas RLS con el plan incluido. ===
-- Un complejo admite escrituras si esta activo o si su prueba no vencio.
create or replace function venue_is_writable(p_venue_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from settings
    where id = p_venue_id
      and (
        plan_status = 'active'
        or (plan_status = 'trial' and trial_ends_at > now())
      )
  );
$$;

grant execute on function venue_is_writable(uuid) to anon, authenticated;

-- Se borran TODAS las politicas de estas tablas y se vuelven a crear, en vez
-- de reemplazarlas por nombre: en Postgres las politicas se suman (alcanza
-- con que una permita), asi que si quedara alguna vieja con otro nombre el
-- bloqueo no serviria. Lectura: igual que antes. Escritura: igual que antes
-- mas la condicion de que el complejo admita escrituras.
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'settings', 'courts', 'reservations', 'products', 'categories',
        'sales', 'sale_items', 'sale_payments', 'tournaments', 'hero_slides',
        'closed_dates', 'fixed_slots',
        'ranking_categories', 'ranking_points', 'ranking_entries'
      )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end;
$$;

-- settings: lectura publica (el sitio resuelve el complejo por slug). No hay
-- politica de insert: los complejos se crean solo con create_venue().
create policy "public read settings" on settings for select using (true);
create policy "owner update settings" on settings for update
  using (owner_id = auth.uid() and venue_is_writable(id))
  with check (owner_id = auth.uid());
create policy "owner delete settings" on settings for delete
  using (owner_id = auth.uid());

-- reservations: la reserva publica (sin sesion) tambien se pausa.
create policy "public read reservations" on reservations for select using (true);
create policy "public create reservations" on reservations for insert
  with check (venue_is_writable(venue_id));
create policy "owner update reservations" on reservations for update
  using (venue_id = get_my_venue_id() and venue_is_writable(venue_id))
  with check (venue_id = get_my_venue_id() and venue_is_writable(venue_id));
create policy "owner delete reservations" on reservations for delete
  using (venue_id = get_my_venue_id() and venue_is_writable(venue_id));

-- Tablas de lectura publica y escritura del dueño.
do $$
declare
  t text;
begin
  foreach t in array array[
    'courts', 'products', 'categories', 'tournaments', 'hero_slides',
    'closed_dates', 'fixed_slots',
    'ranking_categories', 'ranking_points', 'ranking_entries'
  ]
  loop
    execute format('create policy %I on public.%I for select using (true)', 'public read ' || t, t);
    execute format(
      'create policy %I on public.%I for all '
      || 'using (venue_id = get_my_venue_id() and venue_is_writable(venue_id)) '
      || 'with check (venue_id = get_my_venue_id() and venue_is_writable(venue_id))',
      'owner write ' || t, t
    );
  end loop;
end;
$$;

-- Tablas de ventas: nunca publicas. El dueño las sigue leyendo con la prueba
-- vencida (solo lectura), pero no puede escribir.
do $$
declare
  t text;
begin
  foreach t in array array['sales', 'sale_items', 'sale_payments']
  loop
    execute format(
      'create policy %I on public.%I for select using (venue_id = get_my_venue_id())',
      'owner read ' || t, t
    );
    execute format(
      'create policy %I on public.%I for all '
      || 'using (venue_id = get_my_venue_id() and venue_is_writable(venue_id)) '
      || 'with check (venue_id = get_my_venue_id() and venue_is_writable(venue_id))',
      'owner write ' || t, t
    );
  end loop;
end;
$$;

-- Imagenes (logo, novedades, torneos): subir o borrar tambien requiere un
-- complejo que admita escrituras. La lectura publica no cambia.
drop policy if exists "admin write slide images" on storage.objects;
create policy "admin write slide images" on storage.objects for all
  using (
    bucket_id = 'slides'
    and auth.role() = 'authenticated'
    and venue_is_writable(get_my_venue_id())
  )
  with check (
    bucket_id = 'slides'
    and auth.role() = 'authenticated'
    and venue_is_writable(get_my_venue_id())
  );

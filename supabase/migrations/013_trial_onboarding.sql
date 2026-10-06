-- PlayXP: alta autonoma en un solo flujo.
-- Correr despues de 001-012, una sola vez, en el SQL Editor de Supabase.
-- No borra ni modifica datos existentes: solo agrega columnas, una tabla y
-- una funcion, y cambia como se crea un complejo nuevo.

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

-- === 3. Alta de un complejo. ===
-- Antes el panel insertaba la fila de settings directo desde el navegador.
-- Ahora la unica forma de crear un complejo es esta funcion, que valida los
-- datos y crea todo junto (complejo, contacto del dueño y canchas): o se
-- crea todo o no se crea nada.
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
    insert into settings (owner_id, slug, venue_name, whatsapp_phone, open_hour, close_hour, slot_duration_minutes)
    values (v_user, v_slug, v_name, v_phone, 8, 23, 60)
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

  return v_venue;
end;
$$;

revoke all on function create_venue(text, text, text, text, jsonb) from public, anon;
grant execute on function create_venue(text, text, text, text, jsonb) to authenticated;

-- El alta ya no inserta en settings desde el navegador.
drop policy if exists "owner insert settings" on settings;

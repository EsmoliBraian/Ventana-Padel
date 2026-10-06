-- PlayXP: complejo demo publico, en /demo.
-- Correr despues de 014, una sola vez, en el SQL Editor de Supabase. Se
-- puede volver a correr sin romper nada (no duplica el demo).
--
-- Crea un complejo de ejemplo con datos ficticios para enlazar desde la
-- landing como "Ver demo". No tiene dueño ni panel: es solo el sitio
-- publico. Ahi se puede hacer el flujo de reserva completo, pero las
-- reservas del demo no se guardan (ni la app las manda ni la base las
-- acepta), asi nadie lo llena de turnos falsos y no hay nada que limpiar.

-- === 1. Marca de complejo demo. ===
alter table settings add column if not exists is_demo boolean not null default false;

-- El dueño tampoco puede marcar su propio complejo como demo. Es la misma
-- funcion de 013, con is_demo agregado a las columnas protegidas.
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
      or new.is_demo is distinct from old.is_demo
    then
      raise exception 'El plan del complejo no se puede cambiar desde el panel.';
    end if;
  end if;
  return new;
end;
$$;

-- === 2. La base no acepta reservas para el demo. ===
drop policy if exists "public create reservations" on reservations;
create policy "public create reservations" on reservations for insert
  with check (
    venue_is_writable(venue_id)
    and not exists (select 1 from settings s where s.id = venue_id and s.is_demo)
  );

-- === 3. El complejo demo, con datos ficticios. ===
do $$
declare
  v_venue uuid;
  v_padel_1 uuid;
  v_padel_2 uuid;
  v_futbol uuid;
  v_cat_a uuid;
  v_cat_b uuid;
begin
  if exists (select 1 from settings where slug = 'demo') then
    return;
  end if;

  insert into settings (
    owner_id, slug, venue_name, whatsapp_phone,
    open_hour, close_hour, slot_duration_minutes,
    about, address,
    plan_status, trial_ends_at, is_demo, onboarding
  )
  values (
    null, 'demo', 'Complejo Demo', '',
    8, 23, 60,
    'Este es un complejo de ejemplo. Así ven tus clientes tu sitio: eligen día y horario, reservan en segundos y te llega el aviso por WhatsApp.',
    '',
    'active', null, true, '{"dismissed": true}'::jsonb
  )
  returning id into v_venue;

  insert into courts (venue_id, name, sport, price) values (v_venue, 'Pádel 1', 'padel', 20000) returning id into v_padel_1;
  insert into courts (venue_id, name, sport, price) values (v_venue, 'Pádel 2', 'padel', 20000) returning id into v_padel_2;
  insert into courts (venue_id, name, sport, price) values (v_venue, 'Fútbol 5', 'futbol5', 40000) returning id into v_futbol;

  -- Turnos fijos semanales: hacen que la grilla se vea con horarios tomados
  -- todos los dias, sin depender de fechas que se vencen.
  insert into fixed_slots (venue_id, court_id, weekday, time, customer_name)
  select v_venue, t.court_id, d.weekday, t.time, 'Turno fijo'
  from (
    values
      (v_padel_1, '19:00'), (v_padel_1, '20:00'),
      (v_padel_2, '18:00'), (v_padel_2, '21:00'),
      (v_futbol, '20:00'), (v_futbol, '21:00')
  ) as t(court_id, time)
  cross join generate_series(0, 6) as d(weekday);

  insert into hero_slides (venue_id, image_url, title, subtitle, body, "order", published) values
    (v_venue, '', 'Nuevas luces LED en todas las canchas', 'Jugá de noche como si fuera de día',
     'Renovamos la iluminación de todas las canchas. Vení a probarlas en cualquier horario nocturno.', 0, true),
    (v_venue, '', 'Arrancó la liga de los jueves', 'Todavía quedan lugares',
     'Todos los jueves a partir de las 19 hs. Anotate con tu pareja o tu equipo y sumá puntos para el ranking.', 1, true);

  insert into ranking_categories (venue_id, name) values (v_venue, 'Primera') returning id into v_cat_a;
  insert into ranking_categories (venue_id, name) values (v_venue, 'Intermedia') returning id into v_cat_b;

  insert into ranking_entries (venue_id, category_id, player_name, total_points, best_instance) values
    (v_venue, v_cat_a, 'Jugador Ejemplo A', 420, 'campeon'),
    (v_venue, v_cat_a, 'Jugador Ejemplo B', 360, 'finalista'),
    (v_venue, v_cat_a, 'Jugador Ejemplo C', 270, 'semis'),
    (v_venue, v_cat_a, 'Jugador Ejemplo D', 180, 'cuartos'),
    (v_venue, v_cat_b, 'Jugador Ejemplo E', 390, 'campeon'),
    (v_venue, v_cat_b, 'Jugador Ejemplo F', 300, 'finalista'),
    (v_venue, v_cat_b, 'Jugador Ejemplo G', 210, 'semis');
end;
$$;

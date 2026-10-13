-- PlayXP: las reservas y los turnos fijos dejan de ser de lectura publica.
-- Correr despues de 026.
--
-- OJO, ESTA ES DISTINTA A LAS ANTERIORES: hay que correrla DESPUES de que
-- este publicado el codigo que la acompaña. El sitio publicado antes de
-- este cambio lee las reservas directo de la tabla; si se corre esta
-- migracion con ese codigo todavia en produccion, la grilla publica se ve
-- toda libre y la reserva publica deja de guardarse. El codigo nuevo, en
-- cambio, funciona con o sin esta migracion.
--
-- Que cambia: hasta ahora cualquiera podia leer la tabla de reservas y la
-- de turnos fijos completas, con el nombre del cliente incluido. Desde aca:
--   - El publico solo puede preguntar QUE HORARIOS ESTAN OCUPADOS (cancha,
--     dia y hora), por dos funciones. Sin nombres, precios ni estados.
--   - Las tablas completas las lee solo el dueño de cada complejo.
-- El panel no cambia: sigue leyendo sus tablas y recibiendo las
-- actualizaciones en vivo, porque el dueño conserva la lectura.

-- === 1. Horarios ocupados, para el sitio publico. ===
-- Reservas activas de un complejo desde una fecha. Solo cancha, dia y hora.
create or replace function busy_slots(p_venue_id uuid, p_from date default null)
returns table (court_id uuid, date date, "time" text)
language sql
stable
security definer
set search_path = public
as $$
  select r.court_id, r.date, r.time
  from reservations r
  where r.venue_id = p_venue_id
    and r.status <> 'cancelado'
    and r.date >= coalesce(p_from, ar_today());
$$;

revoke all on function busy_slots(uuid, date) from public;
grant execute on function busy_slots(uuid, date) to anon, authenticated;

-- Turnos fijos de un complejo. Solo cancha, dia de la semana y hora.
create or replace function busy_fixed_slots(p_venue_id uuid)
returns table (id uuid, court_id uuid, weekday int, "time" text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.court_id, f.weekday, f.time
  from fixed_slots f
  where f.venue_id = p_venue_id;
$$;

revoke all on function busy_fixed_slots(uuid) from public;
grant execute on function busy_fixed_slots(uuid) to anon, authenticated;

-- === 2. Las tablas completas, solo para el dueño. ===
drop policy if exists "public read reservations" on reservations;
drop policy if exists "owner read reservations" on reservations;
create policy "owner read reservations" on reservations for select
  using (venue_id = get_my_venue_id());

drop policy if exists "public read fixed_slots" on fixed_slots;
drop policy if exists "owner read fixed_slots" on fixed_slots;
create policy "owner read fixed_slots" on fixed_slots for select
  using (venue_id = get_my_venue_id());

-- Para volver atras (deja la lectura publica como estaba):
--   drop policy if exists "owner read reservations" on reservations;
--   create policy "public read reservations" on reservations for select using (true);
--   drop policy if exists "owner read fixed_slots" on fixed_slots;
--   create policy "public read fixed_slots" on fixed_slots for select using (true);

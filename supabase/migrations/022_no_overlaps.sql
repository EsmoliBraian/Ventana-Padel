-- PlayXP: la base impide que se pise un turno.
-- Correr despues de 021.
--
-- Hasta ahora lo unico que evitaba dos reservas en la misma cancha y horario
-- era la pantalla (el horario tomado se muestra deshabilitado). Dos personas
-- reservando a la vez, o una pestaña sin actualizar, podian guardar las dos.
-- Desde aca lo impide la base, para los tres cruces posibles:
--
--   1. reserva   vs reserva      -> indice unico (solo cuentan las no canceladas)
--   2. turno fijo vs turno fijo  -> indice unico
--   3. reserva   vs turno fijo   -> triggers en las dos tablas
--
-- "Mismo horario" es misma cancha, mismo dia y misma hora de inicio: la app
-- trabaja con una grilla de horarios fijos por complejo y las reservas no
-- guardan duracion.

-- === 0. Si ya hay turnos pisados, frenar antes de tocar nada. ===
do $$
declare
  v_reservas int;
  v_fijos int;
  v_cruzados int;
begin
  select count(*) into v_reservas from (
    select 1 from reservations
    where status <> 'cancelado'
    group by court_id, date, time
    having count(*) > 1
  ) t;

  select count(*) into v_fijos from (
    select 1 from fixed_slots
    group by court_id, weekday, time
    having count(*) > 1
  ) t;

  select count(*) into v_cruzados
  from reservations r
  join fixed_slots f
    on f.court_id = r.court_id
   and f.weekday = extract(dow from r.date)::int
   and f.time = r.time
  where r.status <> 'cancelado'
    and r.date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date;

  if v_reservas + v_fijos + v_cruzados > 0 then
    raise exception
      'Hay turnos superpuestos: % de reservas repetidas, % de turnos fijos repetidos, % de reservas futuras sobre un turno fijo. Resolvelos antes de correr esta migracion.',
      v_reservas, v_fijos, v_cruzados;
  end if;
end $$;

-- === 1. Reserva vs reserva. ===
-- Una sola reserva activa por cancha, fecha y hora. Las canceladas no
-- cuentan: el horario de una reserva cancelada se puede volver a reservar.
create unique index if not exists reservations_active_slot_key
  on reservations (court_id, date, time)
  where status <> 'cancelado';

-- === 2. Turno fijo vs turno fijo. ===
create unique index if not exists fixed_slots_slot_key
  on fixed_slots (court_id, weekday, time);

-- === 3. Reserva vs turno fijo. ===
-- Son dos tablas, asi que un indice no alcanza: cada una revisa a la otra
-- antes de guardar. Para que dos guardados simultaneos (una reserva y un
-- turno fijo sobre el mismo horario) no pasen los dos, ambos toman primero
-- el mismo candado, que dura hasta el final de la transaccion.
create or replace function lock_court_slot(p_court_id uuid, p_weekday int, p_time text)
returns void
language sql
as $$
  select pg_advisory_xact_lock(
    hashtextextended(p_court_id::text || '|' || p_weekday::text || '|' || p_time, 0)
  );
$$;

-- El dia de la semana usa la misma numeracion que la app: 0 = domingo.
create or replace function reservations_check_fixed_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weekday int := extract(dow from new.date)::int;
begin
  if new.status = 'cancelado' then
    return new;
  end if;
  -- Cambios que no mueven la reserva ni la reactivan (por ejemplo pasarla de
  -- "reservado" a "confirmado") no se revisan.
  if tg_op = 'UPDATE'
    and old.status <> 'cancelado'
    and new.court_id = old.court_id
    and new.date = old.date
    and new.time = old.time
  then
    return new;
  end if;

  perform lock_court_slot(new.court_id, v_weekday, new.time);
  if exists (
    select 1 from fixed_slots f
    where f.court_id = new.court_id
      and f.weekday = v_weekday
      and f.time = new.time
  ) then
    raise exception 'Ese horario ya está tomado por un turno fijo.'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_check_fixed_slot on reservations;
create trigger reservations_check_fixed_slot
  before insert or update of court_id, date, time, status on reservations
  for each row execute function reservations_check_fixed_slot();

-- Un turno fijo nuevo no puede caer sobre una reserva activa de hoy en
-- adelante. Las reservas pasadas no lo frenan.
create or replace function fixed_slots_check_reservations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
begin
  perform lock_court_slot(new.court_id, new.weekday, new.time);
  select min(r.date) into v_date
  from reservations r
  where r.court_id = new.court_id
    and r.time = new.time
    and r.status <> 'cancelado'
    and r.date >= ar_today()
    and extract(dow from r.date)::int = new.weekday;

  if v_date is not null then
    raise exception 'Ya hay una reserva en ese horario el %. Cancelala o cambiala antes de crear el turno fijo.',
      to_char(v_date, 'DD/MM/YYYY')
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists fixed_slots_check_reservations on fixed_slots;
create trigger fixed_slots_check_reservations
  before insert or update of court_id, weekday, time on fixed_slots
  for each row execute function fixed_slots_check_reservations();

-- Las funciones de los triggers no se llaman a mano.
revoke all on function reservations_check_fixed_slot() from public, anon, authenticated;
revoke all on function fixed_slots_check_reservations() from public, anon, authenticated;

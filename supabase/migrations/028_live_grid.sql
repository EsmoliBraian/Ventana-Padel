-- PlayXP: la grilla publica vuelve a actualizarse al instante, sin exponer
-- las tablas. Correr despues de 027.
--
-- Cada vez que cambia una reserva o un turno fijo, la base emite un aviso por
-- el canal del complejo ("venue:<id>"). El aviso NO lleva ningun dato: solo
-- dice "hubo un cambio". El sitio publico, al recibirlo, vuelve a pedir los
-- horarios ocupados a busy_slots / busy_fixed_slots (migracion 027).
--
-- Se puede correr antes o despues de publicar el codigo: sin el codigo, los
-- avisos no los escucha nadie; sin esta migracion, el sitio sigue con la
-- consulta cada 30 segundos.

-- === 1. El aviso. ===
-- Vacio a proposito: ni cancha, ni dia, ni hora, ni nombres, ni precios.
-- Si el envio falla por lo que sea, la reserva se guarda igual.
create or replace function notify_venue_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid;
begin
  if tg_op = 'DELETE' then
    v_venue := old.venue_id;
  else
    v_venue := new.venue_id;
  end if;
  begin
    perform realtime.send('{}'::jsonb, 'cambio', 'venue:' || v_venue::text, true);
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function notify_venue_slots() from public, anon, authenticated;

-- Reservas: alta, baja, y cambios que mueven la grilla (estado, cancha, dia
-- u hora). Incluye los horarios guardados mientras se paga una seña y los que
-- se liberan al vencer. Un cambio de nombre o de precio no avisa.
drop trigger if exists reservations_notify_slots on reservations;
create trigger reservations_notify_slots
  after insert or delete or update of status, court_id, date, time on reservations
  for each row execute function notify_venue_slots();

drop trigger if exists fixed_slots_notify_slots on fixed_slots;
create trigger fixed_slots_notify_slots
  after insert or delete or update of court_id, weekday, time on fixed_slots
  for each row execute function notify_venue_slots();

-- === 2. Quien escucha. ===
-- El canal es privado: lo que se puede hacer en el lo deciden estas politicas.
-- Cualquiera puede ESCUCHAR los canales "venue:...". No hay ninguna politica
-- de envio, asi que un visitante (o un dueño) no puede emitir avisos: solo la
-- base, desde el disparador de arriba.
drop policy if exists "listen venue changes" on realtime.messages;
create policy "listen venue changes" on realtime.messages
  for select
  to anon, authenticated
  using (extension = 'broadcast' and realtime.topic() like 'venue:%');

-- Para volver atras:
--   drop trigger if exists reservations_notify_slots on reservations;
--   drop trigger if exists fixed_slots_notify_slots on fixed_slots;
--   drop function if exists notify_venue_slots();
--   drop policy if exists "listen venue changes" on realtime.messages;

-- PlayXP: seña con Mercado Pago al reservar.
-- Correr despues de 024. No depende de la 023.
--
-- La plata va directo a la cuenta de Mercado Pago de cada complejo: PlayXP
-- no cobra, no retiene y no guarda datos de tarjeta. Aca va solo la base:
-- configuracion, credenciales (privadas), registro de señas y pagos, y las
-- reglas. Hablar con Mercado Pago lo hacen las funciones del servidor.
--
-- Nada cambia hasta que un complejo conecta su cuenta y activa la seña:
-- nace desactivada. Con el codigo actual esta migracion no altera ningun
-- recorrido, y el codigo nuevo sin esta migracion se comporta como hoy.
--
-- Estados (en castellano, como el resto de la base):
--   seña:     pendiente -> pagada | vencida ; pagada/vencida -> a_devolver -> devuelta
--   pago:     aprobado | a_devolver | devuelto
--   conexion: conectada | reconectar | desconectada

-- === 1. Configuracion de la seña (publica: el sitio la muestra). ===
alter table settings add column if not exists deposit_enabled boolean not null default false;
alter table settings add column if not exists deposit_type text not null default 'fijo';
alter table settings add column if not exists deposit_value numeric not null default 0;
alter table settings add column if not exists deposit_hold_minutes int not null default 15;
alter table settings add column if not exists deposit_policy text not null default '';

alter table settings drop constraint if exists settings_deposit_check;
alter table settings add constraint settings_deposit_check check (
  deposit_type in ('fijo', 'porcentaje')
  and deposit_value >= 0
  and (deposit_type <> 'porcentaje' or deposit_value <= 100)
  and deposit_hold_minutes between 5 and 60
  and char_length(deposit_policy) <= 400
);

-- === 2. Credenciales de Mercado Pago de cada complejo. PRIVADA. ===
-- Sin ninguna politica y sin permisos: ni el publico ni el dueño pueden
-- leerla o escribirla. Solo la usan las funciones del servidor. El dueño ve
-- con que cuenta esta conectado por my_mp_connection() (punto 9), que no
-- devuelve ninguna credencial.
create table if not exists mp_connections (
  venue_id uuid primary key references settings(id) on delete cascade,
  mp_user_id bigint not null,
  -- Como se le muestra la cuenta al dueño (apodo o mail de Mercado Pago).
  account_label text not null default '',
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  status text not null default 'conectada' check (status in ('conectada', 'reconectar', 'desconectada')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  -- Motivo del ultimo fallo, en texto corto. Nunca una credencial.
  last_error text,
  disconnected_at timestamptz,
  -- Al desconectar, la credencial se conserva hasta esta fecha solo para
  -- poder verificar pagos que estaban en curso. Despues se borra la fila.
  purge_after timestamptz
);

alter table mp_connections enable row level security;
revoke all on mp_connections from anon, authenticated;

-- Parametro "state" del flujo de autorizacion: de un solo uso, con
-- vencimiento, y atado al complejo y al dueño que lo inicio. Se guarda su
-- hash, no el valor. PRIVADA.
create table if not exists mp_oauth_states (
  state_hash text primary key,
  venue_id uuid not null references settings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table mp_oauth_states enable row level security;
revoke all on mp_oauth_states from anon, authenticated;

-- === 3. Señas. ===
-- Una por reserva hecha desde el sitio con la seña activa. Si la reserva se
-- borra, la seña queda (con los datos del turno copiados): es el registro
-- de un cobro. La lee el dueño; solo la escriben las funciones de la base.
create table if not exists reservation_deposits (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  reservation_id uuid unique references reservations(id) on delete set null,
  -- Copia del turno, por si la reserva deja de existir.
  court_id uuid references courts(id) on delete set null,
  court_name text not null,
  date date not null,
  time text not null,
  price_total numeric not null,
  amount numeric not null check (amount > 0),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'pagada', 'vencida', 'a_devolver', 'devuelta')),
  -- Hasta cuando se guarda el horario mientras el jugador paga.
  expires_at timestamptz not null,
  -- Cuenta de Mercado Pago que tiene que recibir el pago.
  mp_collector_id bigint not null,
  mp_preference_id text,
  mp_init_point text,
  -- Pago que confirmo la reserva.
  mp_payment_id bigint,
  paid_at timestamptz,
  -- Ultimo intento que no se aprobo (para decirle al jugador que reintente).
  last_attempt_status text,
  refund_reason text check (refund_reason in ('pago_tardio', 'cancelada_por_el_complejo', 'no_coincide')),
  created_at timestamptz not null default now()
);

create index if not exists reservation_deposits_venue_status_idx on reservation_deposits (venue_id, status);
create index if not exists reservation_deposits_pending_idx on reservation_deposits (expires_at) where status = 'pendiente';

alter table reservation_deposits enable row level security;
revoke insert, update, delete on reservation_deposits from anon, authenticated;
drop policy if exists "owner read reservation_deposits" on reservation_deposits;
create policy "owner read reservation_deposits" on reservation_deposits for select
  using (venue_id = get_my_venue_id());

-- Lo que identifica al jugador y al visitante. PRIVADA: la clave del enlace
-- del comprobante (su hash) y las huellas para limitar abusos no las lee
-- nadie desde la app.
create table if not exists reservation_deposit_secrets (
  deposit_id uuid primary key references reservation_deposits(id) on delete cascade,
  key_hash text not null,
  visitor_hash text not null,
  whatsapp text not null
);

alter table reservation_deposit_secrets enable row level security;
revoke all on reservation_deposit_secrets from anon, authenticated;

-- Pagos de Mercado Pago recibidos por una seña. Normalmente uno; puede haber
-- mas si el jugador paga dos veces. Cada pago se registra una sola vez (el
-- numero de operacion es la clave), asi un aviso repetido no duplica nada.
create table if not exists deposit_payments (
  mp_payment_id bigint primary key,
  deposit_id uuid not null references reservation_deposits(id) on delete cascade,
  venue_id uuid not null references settings(id) on delete cascade,
  amount numeric not null,
  paid_at timestamptz not null,
  status text not null check (status in ('aprobado', 'a_devolver', 'devuelto')),
  refund_reason text check (refund_reason in ('pago_tardio', 'cancelada_por_el_complejo', 'pago_duplicado', 'no_coincide')),
  -- Devuelto: lo marco el dueño a mano, o lo aviso Mercado Pago.
  refunded_at timestamptz,
  refunded_by uuid references auth.users(id) on delete set null,
  refund_source text check (refund_source in ('dueño', 'mercado_pago')),
  created_at timestamptz not null default now()
);

create index if not exists deposit_payments_venue_paid_idx on deposit_payments (venue_id, paid_at);

alter table deposit_payments enable row level security;
revoke insert, update, delete on deposit_payments from anon, authenticated;
drop policy if exists "owner read deposit_payments" on deposit_payments;
create policy "owner read deposit_payments" on deposit_payments for select
  using (venue_id = get_my_venue_id());

-- === 4. Datos del jugador. Solo los lee el dueño. ===
-- No van en reservations, que hoy es de lectura publica.
create table if not exists reservation_contacts (
  reservation_id uuid primary key references reservations(id) on delete cascade,
  venue_id uuid not null references settings(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  whatsapp text not null check (whatsapp ~ '^[0-9]{8,15}$'),
  created_at timestamptz not null default now()
);

alter table reservation_contacts enable row level security;
revoke insert, update, delete on reservation_contacts from anon, authenticated;
drop policy if exists "owner read reservation_contacts" on reservation_contacts;
create policy "owner read reservation_contacts" on reservation_contacts for select
  using (venue_id = get_my_venue_id());

-- === 5. Cuando rige la seña. ===
-- Activada por el dueño, con una cuenta conectada y sana, y con el complejo
-- habilitado para escribir (plan activo o prueba sin vencer).
create or replace function deposit_active(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from settings s
    join mp_connections c on c.venue_id = s.id and c.status = 'conectada'
    where s.id = p_venue_id
      and s.deposit_enabled
      and s.deposit_value > 0
      and not s.is_demo
  ) and venue_is_writable(p_venue_id);
$$;

grant execute on function deposit_active(uuid) to anon, authenticated;

-- No se puede activar la seña sin una cuenta conectada ni con monto cero.
create or replace function settings_check_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deposit_enabled and (tg_op = 'INSERT' or not old.deposit_enabled) then
    if new.deposit_value <= 0 then
      raise exception 'Cargá el monto de la seña antes de activarla.' using errcode = '23514';
    end if;
    if not exists (select 1 from mp_connections c where c.venue_id = new.id and c.status = 'conectada') then
      raise exception 'Conectá tu cuenta de Mercado Pago antes de activar la seña.' using errcode = '23514';
    end if;
  end if;
  if new.deposit_enabled and new.deposit_value <= 0 then
    raise exception 'El monto de la seña tiene que ser mayor que cero.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists settings_check_deposit on settings;
create trigger settings_check_deposit
  before insert or update of deposit_enabled, deposit_type, deposit_value on settings
  for each row execute function settings_check_deposit();

-- Cuanto es la seña de un turno. Se calcula SIEMPRE aca, con el precio de
-- la cancha guardado en la base: nunca se toma un monto del navegador.
create or replace function deposit_amount(p_venue_id uuid, p_price numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select least(
    p_price,
    case
      when s.deposit_type = 'porcentaje' then round(p_price * s.deposit_value / 100)
      else s.deposit_value
    end
  )
  from settings s
  where s.id = p_venue_id;
$$;

grant execute on function deposit_amount(uuid, numeric) to anon, authenticated;

-- === 6. La reserva publica, endurecida. ===
-- Hasta ahora la base aceptaba de cualquiera una reserva con el estado, el
-- precio y el origen que mandara el navegador. Desde aca, quien no es el
-- dueño solo puede crear una reserva "reservado", de origen "user", sin
-- nombre, y con el precio de la cancha tomado de la base. Y si el complejo
-- tiene la seña activa, el publico no puede crear reservas por esta via:
-- pasan por la funcion del servidor, que cobra la seña.
-- (El recorrido actual del sitio ya manda exactamente eso: no cambia.)
create or replace function reservations_normalize_public()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court courts%rowtype;
begin
  select * into v_court from courts where id = new.court_id;
  if not found or v_court.venue_id is distinct from new.venue_id then
    raise exception 'La cancha no es de este complejo.' using errcode = '23514';
  end if;
  -- Solo para llamadas desde la app que no son del dueño del complejo.
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
    and new.venue_id is distinct from get_my_venue_id()
  then
    new.status := 'reservado';
    new.created_via := 'user';
    new.customer_name := null;
    new.price_total := v_court.price;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_normalize_public on reservations;
create trigger reservations_normalize_public
  before insert on reservations
  for each row execute function reservations_normalize_public();

drop policy if exists "public create reservations" on reservations;
create policy "public create reservations" on reservations for insert
  with check (
    venue_is_writable(venue_id)
    and not exists (select 1 from settings s where s.id = venue_id and s.is_demo)
    and (venue_id = get_my_venue_id() or not deposit_active(venue_id))
  );

-- === 7. Guardar un horario mientras el jugador paga. ===
-- La llama solo la funcion del servidor (create-deposit). Valida todo de
-- nuevo, calcula el monto, crea la reserva (que desde ese momento ocupa el
-- horario: rige la migracion 022) y deja la seña "pendiente" con su
-- vencimiento.
--
-- Limites contra el abuso (alguien que guarda horarios y nunca paga), por
-- complejo:
--   - 2 señas pendientes a la vez por numero de WhatsApp
--   - 2 señas pendientes a la vez por visitante (huella de su conexion)
--   - 3 señas vencidas sin pagar en 24 horas, por WhatsApp o por visitante:
--     no puede guardar mas horarios hasta que pasen
--   - 8 señas pendientes a la vez en todo el complejo
create or replace function create_deposit_hold(
  p_venue_id uuid,
  p_court_id uuid,
  p_date date,
  p_time text,
  p_name text,
  p_whatsapp text,
  p_visitor_hash text,
  p_key_hash text
)
returns reservation_deposits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings settings%rowtype;
  v_court courts%rowtype;
  v_conn mp_connections%rowtype;
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_name text := btrim(coalesce(p_name, ''));
  v_minutes int;
  v_step int;
  v_amount numeric;
  v_reservation uuid;
  v_deposit reservation_deposits;
  v_now_ar timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
begin
  select * into v_settings from settings where id = p_venue_id;
  if not found or not deposit_active(p_venue_id) then
    raise exception 'Este complejo no está tomando señas online.' using errcode = 'PX400';
  end if;
  select * into v_conn from mp_connections where venue_id = p_venue_id and status = 'conectada';
  select * into v_court from courts where id = p_court_id;
  if not found or v_court.venue_id <> p_venue_id then
    raise exception 'La cancha no es de este complejo.' using errcode = 'PX400';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Completá tu nombre.' using errcode = 'PX400';
  end if;
  if v_whatsapp !~ '^[0-9]{8,15}$' then
    raise exception 'Revisá tu número de WhatsApp: solo números, con código de área.' using errcode = 'PX400';
  end if;
  if coalesce(p_visitor_hash, '') = '' or coalesce(p_key_hash, '') = '' then
    raise exception 'Faltan datos internos de la reserva.' using errcode = 'PX400';
  end if;

  -- El horario tiene que existir en la grilla del complejo y no haber pasado.
  if p_time !~ '^[0-2][0-9]:[0-5][0-9]$' then
    raise exception 'El horario no es válido.' using errcode = 'PX400';
  end if;
  v_minutes := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;
  v_step := case when v_settings.slot_duration_minutes > 0 then v_settings.slot_duration_minutes else 60 end;
  if v_minutes < v_settings.open_hour * 60
    or v_minutes + v_step > v_settings.close_hour * 60
    or (v_minutes - v_settings.open_hour * 60) % v_step <> 0
  then
    raise exception 'Ese horario no está en la grilla del complejo.' using errcode = 'PX400';
  end if;
  if p_date < v_now_ar::date or p_date > v_now_ar::date + 14 then
    raise exception 'Esa fecha no se puede reservar.' using errcode = 'PX400';
  end if;
  if p_date = v_now_ar::date and v_minutes <= extract(hour from v_now_ar)::int * 60 + extract(minute from v_now_ar)::int then
    raise exception 'Ese horario ya pasó.' using errcode = 'PX400';
  end if;
  if exists (select 1 from closed_dates c where c.venue_id = p_venue_id and c.date = p_date) then
    raise exception 'El complejo está cerrado ese día.' using errcode = 'PX400';
  end if;

  -- Antes de contar, se sueltan los horarios que ya vencieron.
  perform expire_deposit_holds();

  -- Un visitante a la vez por complejo para que los limites no se salteen
  -- mandando varios pedidos juntos.
  perform pg_advisory_xact_lock(hashtextextended('seña|' || p_venue_id::text, 0));

  if (select count(*) from reservation_deposits d join reservation_deposit_secrets x on x.deposit_id = d.id
      where d.venue_id = p_venue_id and d.status = 'pendiente' and x.whatsapp = v_whatsapp) >= 2
    or (select count(*) from reservation_deposits d join reservation_deposit_secrets x on x.deposit_id = d.id
      where d.venue_id = p_venue_id and d.status = 'pendiente' and x.visitor_hash = p_visitor_hash) >= 2
  then
    raise exception 'Ya tenés dos horarios esperando el pago. Terminá de pagarlos o esperá a que se liberen.' using errcode = 'PX429';
  end if;
  if (select count(*) from reservation_deposits d join reservation_deposit_secrets x on x.deposit_id = d.id
      where d.venue_id = p_venue_id and d.status = 'vencida' and d.created_at > now() - interval '24 hours'
        and (x.whatsapp = v_whatsapp or x.visitor_hash = p_visitor_hash)) >= 3
  then
    raise exception 'Guardaste varios horarios sin pagarlos. Para reservar, escribile al complejo por WhatsApp.' using errcode = 'PX429';
  end if;
  if (select count(*) from reservation_deposits d where d.venue_id = p_venue_id and d.status = 'pendiente') >= 8 then
    raise exception 'Hay muchas reservas en proceso de pago en este momento. Probá de nuevo en unos minutos.' using errcode = 'PX429';
  end if;

  v_amount := deposit_amount(p_venue_id, v_court.price);
  if v_amount is null or v_amount <= 0 then
    raise exception 'Este complejo no está tomando señas online.' using errcode = 'PX400';
  end if;

  -- Desde aca el horario queda tomado. Si ya lo estaba, la 022 lo rechaza
  -- (23505 por otra reserva, 23P01 por un turno fijo).
  insert into reservations (venue_id, court_id, date, time, players, status, customer_name, created_via, price_total)
  values (
    p_venue_id, p_court_id, p_date, p_time,
    case v_court.sport when 'padel' then 4 when 'futbol5' then 10 when 'futbol7' then 14 else 2 end,
    'reservado', null, 'user', v_court.price
  )
  returning id into v_reservation;

  insert into reservation_contacts (reservation_id, venue_id, name, whatsapp)
  values (v_reservation, p_venue_id, v_name, v_whatsapp);

  insert into reservation_deposits (
    venue_id, reservation_id, court_id, court_name, date, time, price_total, amount, expires_at, mp_collector_id
  )
  values (
    p_venue_id, v_reservation, p_court_id, v_court.name, p_date, p_time, v_court.price, v_amount,
    now() + make_interval(mins => v_settings.deposit_hold_minutes), v_conn.mp_user_id
  )
  returning * into v_deposit;

  insert into reservation_deposit_secrets (deposit_id, key_hash, visitor_hash, whatsapp)
  values (v_deposit.id, p_key_hash, p_visitor_hash, v_whatsapp);

  return v_deposit;
end;
$$;

-- Los horarios cuyo tiempo de pago vencio se liberan: la reserva pasa a
-- cancelada y la seña a vencida. La corre la tarea programada (026) cada
-- minuto, y tambien cada intento nuevo de reserva.
create or replace function expire_deposit_holds()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_row record;
begin
  for v_row in
    select id, reservation_id from reservation_deposits
    where status = 'pendiente' and expires_at < now()
    for update skip locked
  loop
    update reservations set status = 'cancelado'
    where id = v_row.reservation_id and status = 'reservado';
    update reservation_deposits set status = 'vencida' where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Si no se pudo armar el cobro en Mercado Pago, el horario se suelta enseguida.
create or replace function cancel_deposit_hold(p_deposit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation uuid;
begin
  update reservation_deposits set status = 'vencida'
  where id = p_deposit_id and status = 'pendiente' and mp_payment_id is null
  returning reservation_id into v_reservation;
  if found then
    update reservations set status = 'cancelado' where id = v_reservation and status = 'reservado';
  end if;
end;
$$;

-- === 8. Aplicar un pago avisado por Mercado Pago. ===
-- La llama solo la funcion del servidor, DESPUES de verificar la firma del
-- aviso y de consultarle el pago a Mercado Pago (los datos que llegan aca
-- son los de esa consulta, no los del aviso).
--
-- Llamarla dos veces con el mismo pago no cambia nada.
-- Devuelve en que quedo: 'pagada', 'a_devolver', 'devuelta', 'pendiente' o
-- 'sin_cambios'.
create or replace function apply_deposit_payment(
  p_deposit_id uuid,
  p_payment_id bigint,
  p_status text,
  p_amount numeric,
  p_currency text,
  p_collector_id bigint,
  p_paid_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep reservation_deposits%rowtype;
  v_pay deposit_payments%rowtype;
  v_ok boolean := false;
begin
  select * into v_dep from reservation_deposits where id = p_deposit_id for update;
  if not found then
    raise exception 'La seña no existe.' using errcode = 'PX400';
  end if;
  select * into v_pay from deposit_payments where mp_payment_id = p_payment_id;

  -- Devolucion o contracargo avisado por Mercado Pago.
  if p_status in ('refunded', 'charged_back') then
    if v_pay.mp_payment_id is null or v_pay.status = 'devuelto' then
      return 'sin_cambios';
    end if;
    update deposit_payments
    set status = 'devuelto', refunded_at = now(), refund_source = 'mercado_pago'
    where mp_payment_id = p_payment_id;
    if v_dep.mp_payment_id = p_payment_id then
      update reservation_deposits set status = 'devuelta' where id = v_dep.id;
    end if;
    return 'devuelta';
  end if;

  if p_status <> 'approved' then
    if v_dep.status = 'pendiente' then
      update reservation_deposits set last_attempt_status = left(p_status, 40) where id = v_dep.id;
    end if;
    return 'pendiente';
  end if;

  -- Aprobado. Si este pago ya esta registrado, no hay nada que hacer.
  if v_pay.mp_payment_id is not null then
    return 'sin_cambios';
  end if;

  -- El pago tiene que ser el que se pidio: mismo monto, en pesos, y a la
  -- cuenta del complejo. Si no coincide, no confirma nada y queda a devolver.
  if p_amount is distinct from v_dep.amount
    or upper(coalesce(p_currency, '')) <> 'ARS'
    or p_collector_id is distinct from v_dep.mp_collector_id
  then
    insert into deposit_payments (mp_payment_id, deposit_id, venue_id, amount, paid_at, status, refund_reason)
    values (p_payment_id, v_dep.id, v_dep.venue_id, coalesce(p_amount, 0), coalesce(p_paid_at, now()), 'a_devolver', 'no_coincide');
    return 'a_devolver';
  end if;

  -- La seña ya tenia un pago aprobado: este es un pago de mas.
  if v_dep.mp_payment_id is not null then
    insert into deposit_payments (mp_payment_id, deposit_id, venue_id, amount, paid_at, status, refund_reason)
    values (p_payment_id, v_dep.id, v_dep.venue_id, p_amount, coalesce(p_paid_at, now()), 'a_devolver', 'pago_duplicado');
    return 'a_devolver';
  end if;

  -- Confirmar la reserva. Si el tiempo ya habia vencido, la reserva esta
  -- cancelada: se intenta reactivar, y si el horario lo tomo otro la 022 lo
  -- rechaza. En ese caso la reserva del otro no se toca.
  if v_dep.reservation_id is not null then
    begin
      update reservations set status = 'confirmado' where id = v_dep.reservation_id;
      v_ok := found;
    exception when unique_violation or exclusion_violation then
      v_ok := false;
    end;
  end if;

  if v_ok then
    insert into deposit_payments (mp_payment_id, deposit_id, venue_id, amount, paid_at, status)
    values (p_payment_id, v_dep.id, v_dep.venue_id, p_amount, coalesce(p_paid_at, now()), 'aprobado');
    update reservation_deposits
    set status = 'pagada', mp_payment_id = p_payment_id, paid_at = coalesce(p_paid_at, now()),
        last_attempt_status = null, refund_reason = null
    where id = v_dep.id;
    return 'pagada';
  end if;

  insert into deposit_payments (mp_payment_id, deposit_id, venue_id, amount, paid_at, status, refund_reason)
  values (p_payment_id, v_dep.id, v_dep.venue_id, p_amount, coalesce(p_paid_at, now()), 'a_devolver', 'pago_tardio');
  update reservation_deposits
  set status = 'a_devolver', mp_payment_id = p_payment_id, paid_at = coalesce(p_paid_at, now()),
      refund_reason = 'pago_tardio'
  where id = v_dep.id;
  return 'a_devolver';
end;
$$;

-- === 9. Lo que usa el panel. ===
-- Con que cuenta esta conectado el complejo. Sin credenciales.
create or replace function my_mp_connection()
returns table (status text, account_label text, connected_at timestamptz, last_error text)
language sql
stable
security definer
set search_path = public
as $$
  select c.status, c.account_label, c.connected_at, c.last_error
  from mp_connections c
  where c.venue_id = get_my_venue_id() and c.status <> 'desconectada';
$$;

revoke all on function my_mp_connection() from public, anon;
grant execute on function my_mp_connection() to authenticated;

-- Desconectar la cuenta. La seña se desactiva y no se pierde ningun
-- registro. Si hay pagos en curso, la credencial se guarda 24 horas mas
-- (solo para poder verificarlos) y despues se borra; si no, se borra ya.
create or replace function disconnect_mp()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid := get_my_venue_id();
  v_pending boolean;
begin
  if v_venue is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  update settings set deposit_enabled = false where id = v_venue;
  select exists (select 1 from reservation_deposits where venue_id = v_venue and status = 'pendiente') into v_pending;
  if v_pending then
    update mp_connections
    set status = 'desconectada', disconnected_at = now(), purge_after = now() + interval '24 hours'
    where venue_id = v_venue;
  else
    delete from mp_connections where venue_id = v_venue;
  end if;
end;
$$;

revoke all on function disconnect_mp() from public, anon;
grant execute on function disconnect_mp() to authenticated;

-- "Marcar como devuelta": el dueño registra que devolvio un pago desde su
-- Mercado Pago. Los reportes dejan de contarlo.
create or replace function mark_deposit_refunded(p_payment_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay deposit_payments%rowtype;
begin
  select * into v_pay from deposit_payments where mp_payment_id = p_payment_id for update;
  if not found or v_pay.venue_id is distinct from get_my_venue_id() then
    raise exception 'No se encontró el pago.' using errcode = 'PX400';
  end if;
  if not venue_is_writable(v_pay.venue_id) then
    raise exception 'La prueba gratis de este complejo terminó: el panel está en solo lectura.';
  end if;
  if v_pay.status = 'devuelto' then
    return;
  end if;
  update deposit_payments
  set status = 'devuelto', refunded_at = now(), refunded_by = auth.uid(), refund_source = 'dueño'
  where mp_payment_id = p_payment_id;
  update reservation_deposits set status = 'devuelta'
  where id = v_pay.deposit_id and mp_payment_id = p_payment_id;
end;
$$;

revoke all on function mark_deposit_refunded(bigint) from public, anon;
grant execute on function mark_deposit_refunded(bigint) to authenticated;

-- Comprobante del jugador: se consulta con el identificador de la seña y la
-- clave secreta de su enlace. Sin la clave no devuelve nada. No trae datos
-- del jugador.
create or replace function deposit_status(p_deposit_id uuid, p_key text)
returns table (
  status text,
  venue_slug text,
  court_name text,
  date date,
  "time" text,
  price_total numeric,
  amount numeric,
  expires_at timestamptz,
  expired boolean,
  mp_payment_id bigint,
  paid_at timestamptz,
  last_attempt_status text,
  pay_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.status, s.slug, d.court_name, d.date, d.time, d.price_total, d.amount, d.expires_at,
    d.status = 'pendiente' and d.expires_at < now(),
    d.mp_payment_id, d.paid_at, d.last_attempt_status,
    -- El enlace de pago solo mientras el horario siga guardado.
    case when d.status = 'pendiente' and d.expires_at > now() then d.mp_init_point end
  from reservation_deposits d
  join reservation_deposit_secrets x on x.deposit_id = d.id
  join settings s on s.id = d.venue_id
  where d.id = p_deposit_id
    and x.key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
$$;

revoke all on function deposit_status(uuid, text) from public;
grant execute on function deposit_status(uuid, text) to anon, authenticated;

-- === 10. Cancelar una reserva con la seña pagada. ===
-- Si el dueño la cancela (o la borra), la seña pasa a "a devolver": el panel
-- le recuerda que tiene que devolverla desde su Mercado Pago. Si la vuelve a
-- activar antes de devolverla, vuelve a "pagada".
create or replace function reservations_track_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or (new.status = 'cancelado' and old.status <> 'cancelado') then
    update deposit_payments p
    set status = 'a_devolver', refund_reason = 'cancelada_por_el_complejo'
    from reservation_deposits d
    where d.reservation_id = old.id and d.status = 'pagada'
      and p.mp_payment_id = d.mp_payment_id and p.status = 'aprobado';
    update reservation_deposits
    set status = 'a_devolver', refund_reason = 'cancelada_por_el_complejo'
    where reservation_id = old.id and status = 'pagada';
  elsif new.status <> 'cancelado' and old.status = 'cancelado' then
    update deposit_payments p
    set status = 'aprobado', refund_reason = null
    from reservation_deposits d
    where d.reservation_id = new.id and d.status = 'a_devolver' and d.refund_reason = 'cancelada_por_el_complejo'
      and p.mp_payment_id = d.mp_payment_id and p.status = 'a_devolver';
    update reservation_deposits
    set status = 'pagada', refund_reason = null
    where reservation_id = new.id and status = 'a_devolver' and refund_reason = 'cancelada_por_el_complejo';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reservations_track_deposit on reservations;
create trigger reservations_track_deposit
  before update of status or delete on reservations
  for each row execute function reservations_track_deposit();

-- === 11. Mostrador: la seña ya pagada se descuenta de la cuenta del turno. ===
-- Cuando un pedido tiene cargada la cancha de una reserva con seña pagada,
-- el total sale con la seña restada. Se guarda cuanto se desconto, para que
-- quede en la venta cerrada.
alter table sales add column if not exists deposit_applied numeric not null default 0;

create or replace function sale_deposit(p_sale_id uuid, p_court_fee numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(p_court_fee, 0) > 0 then coalesce((
      select d.amount
      from sales s
      join reservation_deposits d on d.reservation_id = s.reservation_id and d.status = 'pagada'
      where s.id = p_sale_id
    ), 0)
    else 0
  end;
$$;

-- Misma funcion de la 020, con la seña restada al final. La usan el total
-- del pedido en curso y el cierre (close_order), asi que los dos quedan
-- cubiertos sin tocarlos.
create or replace function order_total(
  p_sale_id uuid,
  p_court_fee numeric,
  p_discount_type text,
  p_discount_value numeric
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select coalesce(sum(qty * unit_price), 0) + coalesce(p_court_fee, 0) as subtotal
    from sale_items where sale_id = p_sale_id
  )
  select greatest(
    0,
    subtotal - case
      when p_discount_type = 'porcentaje' then round(subtotal * least(coalesce(p_discount_value, 0), 100) / 100)
      when p_discount_type = 'fijo' then coalesce(p_discount_value, 0)
      else 0
    end - sale_deposit(p_sale_id, p_court_fee)
  )
  from base;
$$;

create or replace function sales_keep_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'en_curso' or (old.status = 'en_curso' and new.status = 'cerrada') then
    new.deposit_applied := sale_deposit(new.id, new.court_fee);
    new.total := order_total(new.id, new.court_fee, new.discount_type, new.discount_value);
  end if;
  return new;
end;
$$;

-- === 12. Permisos. ===
-- Las funciones internas las llama solo el servidor (rol de servicio) o la
-- tarea programada: no se pueden llamar desde el navegador.
revoke all on function create_deposit_hold(uuid, uuid, date, text, text, text, text, text) from public, anon, authenticated;
revoke all on function expire_deposit_holds() from public, anon, authenticated;
revoke all on function cancel_deposit_hold(uuid) from public, anon, authenticated;
revoke all on function apply_deposit_payment(uuid, bigint, text, numeric, text, bigint, timestamptz) from public, anon, authenticated;
revoke all on function sale_deposit(uuid, numeric) from public, anon, authenticated;
revoke all on function settings_check_deposit() from public, anon, authenticated;
revoke all on function reservations_normalize_public() from public, anon, authenticated;
revoke all on function reservations_track_deposit() from public, anon, authenticated;
grant execute on function create_deposit_hold(uuid, uuid, date, text, text, text, text, text) to service_role;
grant execute on function expire_deposit_holds() to service_role;
grant execute on function cancel_deposit_hold(uuid) to service_role;
grant execute on function apply_deposit_payment(uuid, bigint, text, numeric, text, bigint, timestamptz) to service_role;
grant all on mp_connections, mp_oauth_states, reservation_deposits, reservation_deposit_secrets, deposit_payments, reservation_contacts to service_role;

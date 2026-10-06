-- PlayXP: Mostrador (pedidos en curso guardados en la base).
-- Correr despues de 019, una sola vez y entero, en el SQL Editor de
-- Supabase. Se puede volver a correr sin romper nada.
--
-- Hasta ahora una venta se guardaba recien al cobrar; las cuentas abiertas
-- vivian solo en el navegador. Con esto cada pedido se guarda desde que se
-- crea, se ve en todos los dispositivos y se cierra al cobrar.
--
-- Que hace:
--   1. Medios de pago configurables por complejo (payment_methods).
--   2. sales: estado del pedido, numero correlativo, cantinero, comentario,
--      turno fijo, cancha y descuento. sale_items: comentario por linea.
--   3. El total de un pedido en curso lo calcula la base.
--   4. close_order(): cierra un pedido de forma atomica (pagos o fiado).
--   5. Tiempo real para ventas, items y productos.
--
-- Que NO hace: no cambia ventas ya registradas. Quedan como cerradas, con un
-- numero asignado por orden de fecha, y siguen sumando igual en los reportes.
--
-- Seguridad: sales, sale_items y sale_payments ya son privadas (solo el
-- dueño las lee) y ya respetan la prueba vencida desde la migracion 013;
-- eso no cambia. payment_methods nace con las mismas reglas.

-- === 1. Medios de pago por complejo. ===
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (venue_id, name)
);

alter table payment_methods enable row level security;

drop policy if exists "owner read payment_methods" on payment_methods;
create policy "owner read payment_methods" on payment_methods for select
  using (venue_id = get_my_venue_id());
drop policy if exists "owner write payment_methods" on payment_methods;
create policy "owner write payment_methods" on payment_methods for all
  using (venue_id = get_my_venue_id() and venue_is_writable(venue_id))
  with check (venue_id = get_my_venue_id() and venue_is_writable(venue_id));

create or replace function seed_payment_methods(p_venue_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into payment_methods (venue_id, name, sort_order) values
    (p_venue_id, 'Efectivo', 1),
    (p_venue_id, 'Transferencia', 2),
    (p_venue_id, 'Tarjeta', 3),
    (p_venue_id, 'QR', 4)
  on conflict (venue_id, name) do nothing;
$$;

revoke all on function seed_payment_methods(uuid) from public, anon, authenticated;

-- Los complejos nuevos los reciben al crearse; los que ya existen, ahora
-- (solo si todavia no tienen ninguno).
create or replace function seed_payment_methods_on_venue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform seed_payment_methods(new.id);
  return new;
end;
$$;

drop trigger if exists seed_payment_methods_on_venue on settings;
create trigger seed_payment_methods_on_venue
  after insert on settings
  for each row execute function seed_payment_methods_on_venue();

select seed_payment_methods(s.id)
from settings s
where not exists (select 1 from payment_methods p where p.venue_id = s.id);

-- === 2. Los medios de pago dejan de estar fijos en la base. ===
-- sales.payment_method y sale_payments.method solo aceptaban efectivo,
-- transferencia y mixto. Se quitan esas restricciones (se buscan por
-- contenido y no por nombre, porque el nombre puede variar segun como se
-- creo la base) y payment_status suma 'pendiente' para los pedidos en curso.
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.sales'::regclass, 'public.sale_payments'::regclass)
      and (
        pg_get_constraintdef(c.oid) ilike '%payment_method%'
        or pg_get_constraintdef(c.oid) ilike '%payment_status%'
        or pg_get_constraintdef(c.oid) ilike '%method%'
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end;
$$;

alter table sales add constraint sales_payment_status_check
  check (payment_status in ('pagado', 'adeuda', 'pendiente'));

-- === 3. El pedido. ===
alter table sales add column if not exists created_at timestamptz not null default now();
-- en_curso: abierto, se le pueden sumar productos. cerrada: cobrado o fiado.
alter table sales add column if not exists status text not null default 'cerrada';
alter table sales drop constraint if exists sales_status_check;
alter table sales add constraint sales_status_check check (status in ('en_curso', 'cerrada'));
alter table sales add column if not exists order_number integer;
alter table sales add column if not exists closed_at timestamptz;
alter table sales add column if not exists cantinero text;
alter table sales add column if not exists comment text not null default '';
alter table sales add column if not exists fixed_slot_id uuid references fixed_slots(id) on delete set null;
-- Precio de cancha incluido en el pedido. null = venta anterior al Mostrador
-- (ahi no se guardaba aparte); 0 = pedido sin cancha.
alter table sales add column if not exists court_fee numeric;
alter table sales add column if not exists discount_type text;
alter table sales add column if not exists discount_value numeric not null default 0;
alter table sales add column if not exists discount_reason text not null default '';
alter table sales drop constraint if exists sales_discount_type_check;
alter table sales add constraint sales_discount_type_check
  check (discount_type is null or discount_type in ('porcentaje', 'fijo'));
alter table sales drop constraint if exists sales_discount_value_check;
alter table sales add constraint sales_discount_value_check check (discount_value >= 0);

alter table sale_items add column if not exists comment text not null default '';
alter table sale_items add column if not exists created_at timestamptz not null default now();

-- Ventas existentes: cerradas en el momento en que se registraron.
update sales set closed_at = created_at where closed_at is null and status = 'cerrada';

-- Numero correlativo por complejo. A las ventas existentes se les asigna por
-- orden de fecha; a las nuevas se lo pone la base al insertarlas.
with numbered as (
  select
    id,
    coalesce((select max(s2.order_number) from sales s2 where s2.venue_id = s.venue_id), 0)
      + row_number() over (partition by venue_id order by date, created_at, id) as n
  from sales s
  where order_number is null
)
update sales set order_number = numbered.n from numbered where sales.id = numbered.id;

create unique index if not exists sales_venue_order_number_key on sales (venue_id, order_number);

-- Contador por complejo: el numero siguiente sale de aca, en una sola
-- operacion atomica, asi dos pedidos creados a la vez nunca repiten y un
-- numero anulado no se vuelve a usar. Privado: sin politicas, la app no lo lee.
create table if not exists order_counters (
  venue_id uuid primary key references settings(id) on delete cascade,
  last_number integer not null default 0
);

alter table order_counters enable row level security;
revoke all on order_counters from anon, authenticated;

insert into order_counters (venue_id, last_number)
select venue_id, max(order_number) from sales group by venue_id
on conflict (venue_id) do update
  set last_number = greatest(order_counters.last_number, excluded.last_number);

create or replace function assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into order_counters as c (venue_id, last_number)
  values (new.venue_id, 1)
  on conflict (venue_id) do update set last_number = c.last_number + 1
  returning c.last_number into new.order_number;
  return new;
end;
$$;

drop trigger if exists assign_order_number on sales;
create trigger assign_order_number
  before insert on sales
  for each row execute function assign_order_number();

-- La cancha de un turno se cobra una sola vez: no puede haber dos pedidos
-- del mismo turno con la cancha cargada.
create unique index if not exists sales_one_court_fee_per_reservation
  on sales (reservation_id) where reservation_id is not null and court_fee > 0;

-- === 4. El total de un pedido en curso lo calcula la base. ===
-- Asi dos dispositivos cargando productos al mismo pedido no se pisan: cada
-- uno inserta sus lineas y el total sale siempre de lo que hay guardado.
-- Solo aplica a pedidos en curso; las ventas cerradas no se recalculan.
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
    end
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
    new.total := order_total(new.id, new.court_fee, new.discount_type, new.discount_value);
  end if;
  return new;
end;
$$;

drop trigger if exists sales_keep_total on sales;
create trigger sales_keep_total
  before update on sales
  for each row execute function sales_keep_total();

create or replace function sale_items_touch_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale uuid := coalesce(new.sale_id, old.sale_id);
begin
  -- Dispara sales_keep_total, que recalcula el total.
  update sales set total = total where id = v_sale and status = 'en_curso';
  return coalesce(new, old);
end;
$$;

drop trigger if exists sale_items_touch_order on sale_items;
create trigger sale_items_touch_order
  after insert or update or delete on sale_items
  for each row execute function sale_items_touch_order();

-- === 5. Cerrar un pedido. ===
-- Todo o nada: o se registran los pagos y queda cerrado, o no cambia nada.
-- Si otro dispositivo ya lo cerro, avisa en vez de cobrar dos veces.
--   p_payments:   [{"method": "Efectivo", "amount": 5000}, ...]
--   p_fiado_name: si viene, el pedido entero queda como deuda de esa persona
--                 y no se registran pagos.
--   p_date:       fecha (del complejo) en la que se registra la venta.
-- Si los pagos superan el total, la diferencia es vuelto y se descuenta de
-- las lineas (primero de la de efectivo), para que los reportes sumen el
-- total real de la venta.
create or replace function close_order(
  p_sale_id uuid,
  p_payments jsonb,
  p_fiado_name text,
  p_date date
)
returns sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale sales;
  v_total numeric;
  v_paid numeric := 0;
  v_change numeric;
  v_item jsonb;
  v_method text;
  v_amount numeric;
  v_lines int := 0;
  v_single_method text;
  v_fiado text := btrim(coalesce(p_fiado_name, ''));
  v_methods text[] := '{}';
  v_amounts numeric[] := '{}';
  v_i int;
  v_pass int;
  v_take numeric;
begin
  select * into v_sale from sales where id = p_sale_id for update;
  if not found or v_sale.venue_id is distinct from get_my_venue_id() then
    raise exception 'No se encontró el pedido.';
  end if;
  if not venue_is_writable(v_sale.venue_id) then
    raise exception 'La prueba gratis de este complejo terminó: el panel está en solo lectura.';
  end if;
  if v_sale.status <> 'en_curso' then
    raise exception 'Este pedido ya fue cerrado desde otro dispositivo.';
  end if;

  v_total := order_total(v_sale.id, v_sale.court_fee, v_sale.discount_type, v_sale.discount_value);

  if v_fiado <> '' then
    update sales
    set status = 'cerrada', closed_at = now(), date = coalesce(p_date, date),
        payment_status = 'adeuda', payment_method = null, customer_name = v_fiado
    where id = p_sale_id
    returning * into v_sale;
    return v_sale;
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Cargá al menos un pago.';
  end if;

  for v_item in select * from jsonb_array_elements(p_payments) loop
    v_method := btrim(coalesce(v_item ->> 'method', ''));
    v_amount := coalesce((v_item ->> 'amount')::numeric, 0);
    if v_amount < 0 then
      raise exception 'Los montos no pueden ser negativos.';
    end if;
    if v_amount > 0 then
      if v_method = '' then
        raise exception 'Elegí el medio de pago de cada línea.';
      end if;
      v_methods := v_methods || v_method;
      v_amounts := v_amounts || v_amount;
      v_paid := v_paid + v_amount;
    end if;
  end loop;

  if v_paid < v_total then
    raise exception 'Los pagos no cubren el total: faltan $ %.', (v_total - v_paid);
  end if;

  -- Vuelto: primero de las lineas de efectivo, despues de las ultimas.
  v_change := v_paid - v_total;
  for v_pass in 1..2 loop
    for v_i in reverse coalesce(array_length(v_amounts, 1), 0)..1 loop
      exit when v_change <= 0;
      if (v_pass = 1) = (lower(v_methods[v_i]) = 'efectivo') then
        v_take := least(v_amounts[v_i], v_change);
        v_amounts[v_i] := v_amounts[v_i] - v_take;
        v_change := v_change - v_take;
      end if;
    end loop;
  end loop;

  for v_i in 1..coalesce(array_length(v_amounts, 1), 0) loop
    if v_amounts[v_i] > 0 then
      insert into sale_payments (venue_id, sale_id, method, amount)
      values (v_sale.venue_id, v_sale.id, v_methods[v_i], v_amounts[v_i]);
      v_lines := v_lines + 1;
      v_single_method := v_methods[v_i];
    end if;
  end loop;

  update sales
  set status = 'cerrada', closed_at = now(), date = coalesce(p_date, date),
      payment_status = 'pagado',
      payment_method = case when v_lines = 1 then v_single_method when v_lines > 1 then 'mixto' else null end
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

revoke all on function close_order(uuid, jsonb, text, date) from public, anon;
grant execute on function close_order(uuid, jsonb, text, date) to authenticated;

-- === 6. Tiempo real. ===
-- La lista de pedidos se actualiza sola en todos los dispositivos del
-- complejo. Cada uno recibe solo lo que RLS le deja leer (lo suyo).
do $$
declare
  t text;
begin
  foreach t in array array['sales', 'sale_items', 'products'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

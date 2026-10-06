-- PlayXP: stock basico de productos y categorias de ranking precargadas.
-- Correr despues de 018, una sola vez y entero, en el SQL Editor de
-- Supabase. Se puede volver a correr sin romper nada.
--
-- Que hace:
--   1. Stock: cada producto puede llevar control de stock, con codigo (SKU),
--      minimo de alerta y un registro de entradas y salidas. El stock actual
--      se calcula solo a partir de ese registro.
--   2. Las ventas descuentan stock solas (y lo devuelven si se anula o se
--      edita la venta).
--   3. Ranking: descripcion por categoria y las 8 categorias de padel (9na a
--      2da) precargadas en los complejos con canchas de padel que todavia no
--      tengan ninguna.
--   4. create_venue(): los complejos nuevos nacen con stock de ejemplo y con
--      esas categorias.
--
-- Que NO hace: no cambia productos ni ventas existentes. Los productos que
-- ya estan cargados quedan sin control de stock hasta que lo actives.

-- === 1. Productos con stock. ===
alter table products add column if not exists sku text;
alter table products add column if not exists track_stock boolean not null default false;
alter table products add column if not exists stock integer not null default 0;
alter table products add column if not exists stock_min integer;

-- El codigo no se puede repetir dentro de un mismo complejo.
create unique index if not exists products_venue_sku_key
  on products (venue_id, sku) where sku is not null and sku <> '';

-- Registro de movimientos: es la fuente de verdad del stock. qty es positivo
-- cuando entra mercaderia y negativo cuando sale. No se edita ni se borra:
-- un error se corrige con otro movimiento (ajuste).
--   inicial:    conteo al empezar a controlar el producto
--   entrada:    compra a proveedor
--   venta:      salida automatica por una venta
--   devolucion: reingreso automatico al anular o editar una venta
--   merma:      rotura, vencimiento, consumo interno
--   ajuste:     correccion por conteo fisico
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  type text not null check (type in ('inicial', 'entrada', 'venta', 'devolucion', 'merma', 'ajuste')),
  qty integer not null check (qty <> 0),
  note text not null default '',
  sale_id uuid references sales(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_product_idx
  on stock_movements (product_id, created_at desc);

alter table stock_movements enable row level security;

-- Solo el dueño ve y carga movimientos de su complejo (nunca publico). No hay
-- politicas de update ni delete: el registro no se modifica.
drop policy if exists "owner read stock_movements" on stock_movements;
create policy "owner read stock_movements" on stock_movements for select
  using (venue_id = get_my_venue_id());
drop policy if exists "owner insert stock_movements" on stock_movements;
create policy "owner insert stock_movements" on stock_movements for insert
  with check (
    venue_id = get_my_venue_id()
    and venue_is_writable(venue_id)
    and type in ('inicial', 'entrada', 'merma', 'ajuste')
    and exists (
      select 1 from products p
      where p.id = stock_movements.product_id and p.venue_id = stock_movements.venue_id
    )
  );

-- Cada movimiento actualiza el stock del producto.
create or replace function apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update products set stock = stock + new.qty where id = new.product_id;
  return new;
end;
$$;

drop trigger if exists apply_stock_movement on stock_movements;
create trigger apply_stock_movement
  after insert on stock_movements
  for each row execute function apply_stock_movement();

-- El dueño no puede pisar el numero de stock a mano desde la app: solo cambia
-- por movimientos. (Desde el SQL Editor si se puede.)
create or replace function protect_product_stock()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and pg_trigger_depth() < 2 then
    if tg_op = 'INSERT' then
      new.stock := 0;
    elsif new.stock is distinct from old.stock then
      new.stock := old.stock;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_product_stock on products;
create trigger protect_product_stock
  before insert or update on products
  for each row execute function protect_product_stock();

-- === 2. Las ventas mueven el stock solas. ===
-- Cada item de venta de un producto con control de stock genera una salida;
-- si el item se borra (venta anulada o editada), genera el reingreso.
create or replace function stock_on_sale_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from products where id = new.product_id and track_stock) then
      insert into stock_movements (venue_id, product_id, type, qty, sale_id)
      values (new.venue_id, new.product_id, 'venta', -new.qty, new.sale_id);
    end if;
    return new;
  else
    -- Si se esta borrando el complejo entero no hay nada que registrar.
    if exists (select 1 from products where id = old.product_id and track_stock)
      and exists (select 1 from settings where id = old.venue_id)
    then
      insert into stock_movements (venue_id, product_id, type, qty, sale_id)
      values (
        old.venue_id, old.product_id, 'devolucion', old.qty,
        (select id from sales where id = old.sale_id)
      );
    end if;
    return old;
  end if;
end;
$$;

drop trigger if exists stock_on_sale_item on sale_items;
create trigger stock_on_sale_item
  after insert or delete on sale_items
  for each row execute function stock_on_sale_item();

-- === 3. Categorias de ranking. ===
alter table ranking_categories add column if not exists description text not null default '';

create or replace function seed_padel_ranking_categories(p_venue_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into ranking_categories (venue_id, name, description) values
    (p_venue_id, '2da', 'Pre-profesional / Élite amateur'),
    (p_venue_id, '3ra', 'Competitivo / Élite baja'),
    (p_venue_id, '4ta', 'Avanzado'),
    (p_venue_id, '5ta', 'Intermedio alto'),
    (p_venue_id, '6ta', 'Intermedio'),
    (p_venue_id, '7ma', 'Principiante avanzado'),
    (p_venue_id, '8va', 'Principiante'),
    (p_venue_id, '9na', 'Iniciante / Novatos')
  on conflict (venue_id, name) do nothing;
$$;

revoke all on function seed_padel_ranking_categories(uuid) from public, anon, authenticated;

-- Complejos que ya existen: se cargan solo si tienen canchas de padel y
-- todavia no armaron ninguna categoria propia. El demo no se toca.
select seed_padel_ranking_categories(s.id)
from settings s
where not s.is_demo
  and exists (select 1 from courts c where c.venue_id = s.id and c.sport = 'padel')
  and not exists (select 1 from ranking_categories r where r.venue_id = s.id);

-- === 4. Alta de un complejo, con stock de ejemplo y categorias. ===
-- Es la misma funcion de la 013 con esos dos agregados al final.
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

  -- Los envasados arrancan con control de stock (24 unidades, aviso en 6),
  -- para que se vea como funciona. Lo que se prepara en el momento, no.
  insert into products (venue_id, name, description, category_id, price, track_stock, stock_min) values
    (v_venue.id, 'Agua mineral 500 ml', '', v_bebidas, 1500, true, 6),
    (v_venue.id, 'Gaseosa 500 ml', '', v_bebidas, 2200, true, 6),
    (v_venue.id, 'Bebida isotónica', '', v_bebidas, 2800, true, 6),
    (v_venue.id, 'Cerveza lata', '', v_bebidas, 3000, true, 6),
    (v_venue.id, 'Barrita de cereal', '', v_comidas, 1200, true, 6),
    (v_venue.id, 'Papas fritas', '', v_comidas, 2500, true, 6),
    (v_venue.id, 'Sándwich de jamón y queso', '', v_comidas, 4500, false, null),
    (v_venue.id, 'Café', '', v_cafeteria, 1800, false, null);

  insert into stock_movements (venue_id, product_id, type, qty, note)
  select v_venue.id, p.id, 'inicial', 24, 'Stock de ejemplo'
  from products p
  where p.venue_id = v_venue.id and p.track_stock;

  -- Ranking: las categorias de padel ya vienen cargadas.
  if exists (select 1 from courts where venue_id = v_venue.id and sport = 'padel') then
    perform seed_padel_ranking_categories(v_venue.id);
  end if;

  return v_venue;
end;
$$;

revoke all on function create_venue(text, text, text, text, jsonb) from public, anon;
grant execute on function create_venue(text, text, text, text, jsonb) to authenticated;

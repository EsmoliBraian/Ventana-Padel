-- PlayXP: publicidad de comercios en el sitio de cada complejo.
-- Correr despues de 020, una sola vez y entero, en el SQL Editor de
-- Supabase. Se puede volver a correr sin romper nada.
--
-- El dueño del complejo vende espacios a comercios de su zona, los carga
-- desde el panel y aparecen en su sitio publico.
--
-- Tablas:
--   ads            lo que se muestra. Lectura publica SOLO de anuncios activos,
--                  vigentes y de complejos con el servicio al dia.
--   ad_billing     monto mensual y proximo pago. Privada: solo el dueño.
--   ad_stats       vistas y clics por dia. Privada: solo el dueño la lee y
--                  nadie la escribe desde la app.
--   ad_event_marks marcas para no contar dos veces al mismo visitante.
--   ad_salts       clave secreta del dia para esas marcas.
--                  Estas dos son internas: la app no las lee ni las escribe.
--
-- Que NO hace: no toca ninguna tabla ni dato existente.

-- Fecha de hoy en Argentina: la vigencia se corta a la medianoche local, no
-- a la del servidor (que esta en UTC).
create or replace function ar_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

-- === 1. Anuncios. ===
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references settings(id) on delete cascade,
  business_name text not null,
  image_url text not null,
  -- Opcional, solo para banners: version para celular. Sin ella se recorta
  -- la imagen principal.
  mobile_image_url text,
  caption text not null default '',
  link_type text check (link_type is null or link_type in ('whatsapp', 'instagram', 'web')),
  link_value text,
  format text not null check (format in ('banner', 'tarjeta', 'logo')),
  -- Clave de la ubicacion. La lista de ubicaciones vive en la app
  -- (src/lib/ads.ts): sumar una nueva no requiere cambiar la base.
  placement text not null check (placement <> ''),
  starts_on date not null default ar_today(),
  ends_on date, -- null = sin fecha de fin
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check ((link_type is null) = (link_value is null or link_value = ''))
);

create index if not exists ads_venue_idx on ads (venue_id);

alter table ads enable row level security;

-- Publico: solo anuncios activos, dentro de su vigencia, y de complejos que
-- admiten escrituras (plan activo o prueba sin vencer). Con la prueba
-- vencida los anuncios dejan de devolverse, igual que se pausan las reservas.
drop policy if exists "public read visible ads" on ads;
create policy "public read visible ads" on ads for select
  using (
    active
    and starts_on <= ar_today()
    and (ends_on is null or ends_on >= ar_today())
    and venue_is_writable(venue_id)
  );

-- El dueño ve todos los suyos (tambien pausados y vencidos) y es el unico
-- que escribe, salvo con la prueba vencida.
drop policy if exists "owner read ads" on ads;
create policy "owner read ads" on ads for select
  using (venue_id = get_my_venue_id());
drop policy if exists "owner write ads" on ads;
create policy "owner write ads" on ads for all
  using (venue_id = get_my_venue_id() and venue_is_writable(venue_id))
  with check (venue_id = get_my_venue_id() and venue_is_writable(venue_id));

-- === 2. Datos de cobro (privados). ===
-- Van en una tabla aparte porque RLS decide que filas se leen, no que
-- columnas: si el monto estuviera en ads, cualquiera podria leerlo junto con
-- el anuncio. Es solo informativo, para que el dueño lleve el control.
create table if not exists ad_billing (
  ad_id uuid primary key references ads(id) on delete cascade,
  venue_id uuid not null references settings(id) on delete cascade,
  monthly_amount numeric not null default 0 check (monthly_amount >= 0),
  next_payment_on date
);

alter table ad_billing enable row level security;

drop policy if exists "owner read ad_billing" on ad_billing;
create policy "owner read ad_billing" on ad_billing for select
  using (venue_id = get_my_venue_id());
drop policy if exists "owner write ad_billing" on ad_billing;
create policy "owner write ad_billing" on ad_billing for all
  using (venue_id = get_my_venue_id() and venue_is_writable(venue_id))
  with check (
    venue_id = get_my_venue_id()
    and venue_is_writable(venue_id)
    and exists (
      select 1 from ads a where a.id = ad_billing.ad_id and a.venue_id = ad_billing.venue_id
    )
  );

-- === 3. Vistas y clics por dia (privados, de solo lectura para el dueño). ===
-- No hay ninguna politica de insert, update ni delete: desde la app no se
-- pueden escribir. Solo los suma track_ad_event().
create table if not exists ad_stats (
  ad_id uuid not null references ads(id) on delete cascade,
  venue_id uuid not null references settings(id) on delete cascade,
  day date not null,
  views integer not null default 0,
  clicks integer not null default 0,
  primary key (ad_id, day)
);

alter table ad_stats enable row level security;

drop policy if exists "owner read ad_stats" on ad_stats;
create policy "owner read ad_stats" on ad_stats for select
  using (venue_id = get_my_venue_id());

-- === 4. No contar dos veces al mismo visitante. ===
-- Para saber si un visitante ya fue contado hoy se guarda una huella de su
-- IP, nunca la IP. La huella es un HMAC-SHA256 con una clave secreta al
-- azar que cambia todos los dias. Sin esa clave no se puede volver de la
-- huella a la IP ni probando todas las IP posibles, y la clave se borra a
-- los 2 dias junto con las huellas. Ninguna de las dos tablas tiene
-- politicas: la app no puede leerlas ni escribirlas.
create table if not exists ad_salts (
  day date primary key,
  salt bytea not null
);

create table if not exists ad_event_marks (
  ad_id uuid not null references ads(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('view', 'click')),
  visitor_hash bytea not null,
  primary key (ad_id, day, kind, visitor_hash)
);

alter table ad_salts enable row level security;
alter table ad_event_marks enable row level security;
revoke all on ad_salts from anon, authenticated;
revoke all on ad_event_marks from anon, authenticated;

-- === 5. Registrar una vista o un clic. ===
-- Es la unica forma de sumar a los contadores. La llama el sitio publico
-- cuando un anuncio realmente se mostro en pantalla, o cuando se toca.
--   - Solo cuenta anuncios que hoy son visibles al publico.
--   - No cuenta al propio dueño mirando su sitio, ni al complejo demo.
--   - Cuenta una vista y un clic por visitante, por anuncio, por dia.
-- No frena a alguien decidido con muchas IP distintas, pero impide inflar
-- los numeros recargando la pagina o llamando a la funcion en bucle.
create or replace function track_ad_event(p_ad_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_venue uuid;
  v_today date := ar_today();
  v_headers json;
  v_ip text;
  v_salt bytea;
  v_hash bytea;
  v_new int;
begin
  if p_kind is null or p_kind not in ('view', 'click') then
    return;
  end if;

  select a.venue_id into v_venue
  from ads a
  join settings s on s.id = a.venue_id
  where a.id = p_ad_id
    and a.active
    and a.starts_on <= v_today
    and (a.ends_on is null or a.ends_on >= v_today)
    and venue_is_writable(a.venue_id)
    and not s.is_demo
    and s.owner_id is distinct from auth.uid();
  if v_venue is null then
    return;
  end if;

  -- IP del visitante. cf-connecting-ip la pone la red de Supabase y el
  -- visitante no puede falsearla; las otras son respaldo.
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_ip := coalesce(
    nullif(v_headers ->> 'cf-connecting-ip', ''),
    nullif(v_headers ->> 'x-real-ip', ''),
    nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    'desconocida'
  );

  -- Limpieza: huellas y claves de hace mas de 2 dias.
  delete from ad_event_marks where day < v_today - 2;
  delete from ad_salts where day < v_today - 2;

  insert into ad_salts (day, salt) values (v_today, gen_random_bytes(32))
  on conflict (day) do nothing;
  select salt into v_salt from ad_salts where day = v_today;

  v_hash := hmac(convert_to(v_ip, 'utf8'), v_salt, 'sha256');

  insert into ad_event_marks (ad_id, day, kind, visitor_hash)
  values (p_ad_id, v_today, p_kind, v_hash)
  on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then
    return; -- este visitante ya fue contado hoy para este anuncio
  end if;

  insert into ad_stats (ad_id, venue_id, day, views, clicks)
  values (
    p_ad_id, v_venue, v_today,
    case when p_kind = 'view' then 1 else 0 end,
    case when p_kind = 'click' then 1 else 0 end
  )
  on conflict (ad_id, day) do update
    set views = ad_stats.views + excluded.views,
        clicks = ad_stats.clicks + excluded.clicks;
end;
$$;

revoke all on function track_ad_event(uuid, text) from public;
grant execute on function track_ad_event(uuid, text) to anon, authenticated;

-- === 6. Anuncios de ejemplo en el complejo demo. ===
-- Comercios ficticios, con imagenes dibujadas aca mismo (SVG): no se usan
-- fotos ni marcas de terceros. Solo se cargan si el demo todavia no tiene.
do $$
declare
  v_demo uuid;
  v_banner text;
  v_banner_mobile text;
  v_card text;
  v_logo_a text;
  v_logo_b text;
begin
  select id into v_demo from settings where slug = 'demo' and is_demo;
  if v_demo is null or exists (select 1 from ads where venue_id = v_demo) then
    return;
  end if;

  v_banner := 'data:image/svg+xml;base64,' || replace(encode(convert_to(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300"><rect width="1200" height="300" fill="#1f3a5f"/><circle cx="1040" cy="150" r="190" fill="#2c5282"/><circle cx="1040" cy="150" r="110" fill="#f6ad55"/><text x="70" y="140" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff">Ferretería El Tornillo</text><text x="70" y="205" font-family="Arial, sans-serif" font-size="32" fill="#cbd5e0">Todo para tu casa, a dos cuadras del complejo</text></svg>',
    'utf8'), 'base64'), E'\n', '');
  v_banner_mobile := 'data:image/svg+xml;base64,' || replace(encode(convert_to(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><rect width="800" height="400" fill="#1f3a5f"/><circle cx="690" cy="330" r="170" fill="#2c5282"/><circle cx="690" cy="330" r="95" fill="#f6ad55"/><text x="50" y="150" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#ffffff">Ferretería</text><text x="50" y="220" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#ffffff">El Tornillo</text><text x="50" y="280" font-family="Arial, sans-serif" font-size="28" fill="#cbd5e0">A dos cuadras del complejo</text></svg>',
    'utf8'), 'base64'), E'\n', '');
  v_card := 'data:image/svg+xml;base64,' || replace(encode(convert_to(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#7b341e"/><rect x="60" y="60" width="680" height="480" rx="24" fill="#9c4221"/><circle cx="400" cy="230" r="90" fill="#fbd38d"/><text x="400" y="400" text-anchor="middle" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="#ffffff">Kiosco La Esquina</text><text x="400" y="460" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#feebc8">Abierto hasta la medianoche</text></svg>',
    'utf8'), 'base64'), E'\n', '');
  v_logo_a := 'data:image/svg+xml;base64,' || replace(encode(convert_to(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><circle cx="200" cy="170" r="110" fill="#2f855a"/><path d="M150 170l35 35 70-80" fill="none" stroke="#ffffff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><text x="200" y="350" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#22543d">Punto Set</text></svg>',
    'utf8'), 'base64'), E'\n', '');
  v_logo_b := 'data:image/svg+xml;base64,' || replace(encode(convert_to(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect x="90" y="60" width="220" height="220" rx="40" fill="#b7791f"/><path d="M140 210c30-80 90-80 120 0" fill="none" stroke="#fffaf0" stroke-width="22" stroke-linecap="round"/><text x="200" y="350" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#744210">La Espiga</text></svg>',
    'utf8'), 'base64'), E'\n', '');

  insert into ads (venue_id, business_name, image_url, mobile_image_url, caption, format, placement) values
    (v_demo, 'Ferretería El Tornillo', v_banner, v_banner_mobile, '', 'banner', 'bajo_portada'),
    (v_demo, 'Kiosco La Esquina', v_card, null, 'Bebidas frías y algo para picar después del partido.', 'tarjeta', 'despues_de_reservar'),
    (v_demo, 'Deportes Punto Set', v_logo_a, null, '', 'logo', 'nos_acompanan'),
    (v_demo, 'Panadería La Espiga', v_logo_b, null, '', 'logo', 'nos_acompanan');
end;
$$;

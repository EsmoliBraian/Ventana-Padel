-- PlayXP: arreglo para que el alta de un segundo complejo funcione.
-- Correr despues de 016, una sola vez, en el SQL Editor de Supabase. Se
-- puede volver a correr sin romper nada. No borra ni modifica datos.
--
-- Dos tablas se crearon cuando la app era para un solo complejo y quedaron
-- con una regla de "valor unico" global, en vez de unico por complejo:
--
--   categories:   el nombre de categoria no se podia repetir en TODA la base.
--                 Como el alta carga las categorias de ejemplo (Bebidas,
--                 Comidas, Cafeteria), fallaba si otro complejo ya tenia una
--                 con el mismo nombre.
--   closed_dates: dos complejos no podian cerrar el mismo dia.
--
-- Se reemplazan por la misma regla, pero por complejo.

alter table categories drop constraint if exists categories_name_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.categories'::regclass and conname = 'categories_venue_id_name_key'
  ) then
    alter table categories add constraint categories_venue_id_name_key unique (venue_id, name);
  end if;
end;
$$;

alter table closed_dates drop constraint if exists closed_dates_date_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.closed_dates'::regclass and conname = 'closed_dates_venue_id_date_key'
  ) then
    alter table closed_dates add constraint closed_dates_venue_id_date_key unique (venue_id, date);
  end if;
end;
$$;

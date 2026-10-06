-- PlayXP: dar de baja un complejo desde /superadmin.
-- Correr despues de 017, una sola vez, en el SQL Editor de Supabase. Se
-- puede volver a correr sin romper nada. No borra ni modifica datos.
--
-- Agrega la accion 'suspend' a admin_set_plan: deja el complejo como
-- vencido (panel en solo lectura y reservas online en pausa), sin borrar
-- nada. Sirve para un cliente que deja de pagar. Se revierte con "Activar"
-- o sumandole dias de prueba.
create or replace function admin_set_plan(p_venue_id uuid, p_action text, p_days int default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'No autorizado.';
  end if;

  if p_action = 'activate' then
    update settings set plan_status = 'active', trial_ends_at = null where id = p_venue_id;
  elsif p_action = 'extend' then
    if p_days is null or p_days < 1 or p_days > 365 then
      raise exception 'La extension tiene que ser de entre 1 y 365 dias.';
    end if;
    update settings
    set plan_status = 'trial',
        trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
    where id = p_venue_id;
  elsif p_action = 'suspend' then
    update settings set plan_status = 'expired' where id = p_venue_id and not is_demo;
  else
    raise exception 'Accion no valida.';
  end if;

  if not found then
    raise exception 'No se encontro el complejo.';
  end if;
end;
$$;

revoke all on function admin_set_plan(uuid, text, int) from public, anon;
grant execute on function admin_set_plan(uuid, text, int) to authenticated;

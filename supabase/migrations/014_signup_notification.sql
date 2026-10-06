-- PlayXP: aviso en el momento cuando alguien crea un complejo.
-- Correr despues de 013, una sola vez, en el SQL Editor de Supabase. Se
-- puede volver a correr sin romper nada.
--
-- Como funciona: cada vez que create_venue() da de alta un complejo, la base
-- manda un mensaje a un webhook con el nombre del complejo y el nombre,
-- WhatsApp y mail del dueño. No hay nada que desplegar ni servicio de mail
-- que contratar: sale directo desde la base con la extension pg_net.
--
-- Mientras no cargues el webhook (ver "Como activarlo" al final), esto no
-- hace nada. Y si el envio falla, el alta se completa igual.

create extension if not exists pg_net;

-- Configuracion privada de la plataforma. Tiene RLS activado y ninguna
-- politica: no se puede leer ni escribir desde la app, solo desde el SQL
-- Editor. Aca va la URL del webhook, que incluye el token del bot.
create table if not exists platform_settings (
  key text primary key,
  value text not null
);

alter table platform_settings enable row level security;
revoke all on platform_settings from anon, authenticated;

create or replace function notify_new_venue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_chat_id text;
  v_venue settings;
  v_body jsonb;
begin
  select value into v_url from platform_settings where key = 'signup_webhook_url';
  if v_url is null or btrim(v_url) = '' then
    return new;
  end if;
  select value into v_chat_id from platform_settings where key = 'signup_webhook_chat_id';
  select * into v_venue from settings where id = new.venue_id;

  v_body := jsonb_build_object(
    'text',
    'Nuevo complejo en prueba: ' || v_venue.venue_name || E'\n'
      || 'Dueño: ' || new.owner_name || E'\n'
      || 'WhatsApp: https://wa.me/' || new.owner_whatsapp || E'\n'
      || 'Mail: ' || coalesce(new.owner_email, '-') || E'\n'
      || 'Link: /' || v_venue.slug
  );
  if v_chat_id is not null and btrim(v_chat_id) <> '' then
    v_body := v_body || jsonb_build_object('chat_id', v_chat_id);
  end if;

  perform net.http_post(
    url := v_url,
    body := v_body,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  -- El aviso es accesorio: un problema con el webhook nunca frena un alta.
  return new;
end;
$$;

revoke all on function notify_new_venue() from public, anon, authenticated;

drop trigger if exists notify_new_venue on venue_owners;
create trigger notify_new_venue
  after insert on venue_owners
  for each row execute function notify_new_venue();

-- === Como activarlo con Telegram (gratis, llega al celular al instante) ===
--
-- 1. En Telegram, hablale a @BotFather, mandale /newbot y segui los pasos.
--    Te da un token parecido a 123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.
-- 2. Abri el chat con tu bot nuevo y mandale cualquier mensaje.
-- 3. En el navegador, entra a
--      https://api.telegram.org/bot<TOKEN>/getUpdates
--    y copia el numero que aparece en "chat":{"id": ... }.
-- 4. Corre esto en el SQL Editor, reemplazando <TOKEN> y <CHAT_ID>:
--
--      insert into platform_settings (key, value) values
--        ('signup_webhook_url', 'https://api.telegram.org/bot<TOKEN>/sendMessage'),
--        ('signup_webhook_chat_id', '<CHAT_ID>')
--      on conflict (key) do update set value = excluded.value;
--
-- Tambien sirve cualquier webhook que acepte un JSON con el campo "text"
-- (por ejemplo, un Incoming Webhook de Slack): en ese caso carga solo
-- 'signup_webhook_url'.
--
-- Para apagarlo: delete from platform_settings where key = 'signup_webhook_url';
-- Para ver si los envios salen bien: select * from net._http_response order by created desc limit 5;

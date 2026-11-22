# Acceso y contraseñas

La app solo funciona con una **sesión real del servidor** (cookie firmada de 7 días). Sin ella no hay sincronización
de tareas, ni asistente, ni facturas. El login comprueba el usuario y la contraseña en la tabla `app_users` de Supabase.

## Definir o cambiar tu contraseña (Supabase → SQL Editor)

La contraseña se escribe solo en tu SQL Editor (no pasa por el chat ni por el código). `crypt()` genera un hash
bcrypt compatible con la app.

```sql
create extension if not exists pgcrypto;

update app_users
set password_hash = crypt('ESCRIBE-AQUÍ-TU-CONTRASEÑA', gen_salt('bf', 10)),
    updated_at = now()
where email = 'jesus.martin.hospitalet@gmail.com';
```

Comprueba que dice `UPDATE 1` (si dice `UPDATE 0`, ese email no existe en `app_users`). Repite con otro email para
cada usuario. Después entra en la app con esa contraseña.

## Notas de seguridad

- En producción **no existen usuarios de respaldo** ni contraseñas de ejemplo: si la base de datos falla o no hay
  Supabase configurado, el acceso se rechaza (con un mensaje claro) en lugar de abrirse con una contraseña conocida.
  Los usuarios de respaldo (`ligrow26`) solo funcionan en desarrollo local (`NODE_ENV` distinto de `production`).
- El hash de ejemplo que sembraba `20261003_users_and_sync.sql` **no corresponde a ninguna contraseña**, así que hay que
  definir la tuya con el SQL de arriba. Volver a ejecutar esa migración ya no sobrescribe contraseñas.
- Si la sesión del servidor caduca, la app lo detecta y vuelve a la pantalla de acceso.

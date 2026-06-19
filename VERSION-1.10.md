# JamdDmaj AI 1.10.0

## Que cambia

- El chat ya no muestra solo `Failed to fetch` cuando el servidor no responde.
- El backup cifrado queda como pendiente si no hay internet o Vercel no responde.
- JamdDmaj reintenta el backup automaticamente cuando vuelve internet o cuando abres la app.
- El boton de sincronizar ahora muestra un aviso claro si el respaldo no pudo guardarse.
- El endpoint `/api/status` ahora tambien informa version y estado del backup.
- Se conservaron las redes oficiales: X, Instagram, Facebook, YouTube y GitHub.

## Si vuelve a pasar

1. Abre `https://jamd-dmaj.vercel.app/api/status`.
2. Si ves `ready: true`, el backend esta configurado.
3. Si no abre o sale `ready: false`, revisa en Vercel que existan estas variables:
   - `OPENROUTER_API_KEY`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Despues de cambiar variables en Vercel, haz un redeploy.

## Backup

No desinstales la app para actualizar. Instala el APK nuevo encima del anterior.
Si Android obliga a borrar la app, guarda antes el codigo de recuperacion del apartado Data and backup.

# 1.60.1 — 10 de noviembre de 2026

La vigilancia de Sniper funciona con la pagina cerrada.

## Como funciona

- La lista de tokens vigilados se guarda en Redis por dispositivo.
- Un vigilante en el servidor revisa todos los tokens **cada 5 minutos** desde el VPS.
- Compara cada token con su lectura anterior y avisa por **Telegram** de:
  - **rug pull** (liquidez -45 % o precio -60 % con ventas dominantes),
  - **subidas fuertes** (+40 % en 5 minutos).
- Silencio de 20 minutos por aviso para no repetir.

## Comprobaciones

- Endpoint de prueba de Telegram: devuelve 	elegram: true y el mensaje llega al chat.
- Guardar y leer la lista: 200. Ejecucion del vigilante: 200 con watched y devices.
- Timer jamddmaj-sniper-alerts.timer activo en el VPS.

## Pendiente

- Notificacion push de la app (Firebase): requiere asociar el dispositivo a la cuenta con sesion iniciada.
- Android versionCode 212, iOS 1.60.1.

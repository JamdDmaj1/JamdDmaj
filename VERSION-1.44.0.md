# 1.44.0 — 10 de noviembre de 2026

Radar en vivo en Sniper: seguimiento automático de tokens con avisos buenos y malos.

## Radar

- Botón **Vigilar** en cada token; la lista se guarda en el dispositivo.
- Consulta cada **8 segundos** con la app visible (25 s en segundo plano) en una sola petición para todos los tokens vigilados.
- Avisos de **malas noticias**: liquidez retirada (más de 20 %), liquidez bajando, presión vendedora (3× ventas), caída rápida (>20 % en 5 min).
- Avisos de **buenas noticias**: liquidez añadida (>20 %), compras fuertes (2,5× compras), subida fuerte (>25 % en 5 min).
- Panel flotante con historial de avisos, contador y notificaciones del navegador opcionales.

## Servicio

- Nuevo endpoint ligero que devuelve liquidez, precio, compras y ventas de hasta 25 tokens en una llamada, con caché de 5 segundos.

## Notas

- La vigilancia corre mientras la app está abierta; para avisos con la app cerrada hace falta un vigilante en el servidor con notificaciones push (siguiente paso).
- Android versionCode 189, iOS 1.44.0.

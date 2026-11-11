# 1.51.0 — 10 de noviembre de 2026

Sniper muestra el máximo histórico (ATH) de capitalización de cada token.

## ATH

- **ATH market cap**: capitalización en su máximo histórico de precio.
- **% desde el ATH**: cuánto ha caído o subido respecto a ese máximo.
- Se calcula con las velas diarias del par y el suministro implícito (capitalización ÷ precio).
- Carga progresiva: una petición cada 1,5 s por tarjeta visible, con caché de 6 horas en el dispositivo.

## Servicio

- Nuevo endpoint de ATH con caché de 30 minutos en el servidor.
- Si el proveedor limita las peticiones, la tarjeta muestra "sin dato" y se reintenta más tarde.

## Notas

- El ATH se mide desde la creación del par, no desde el lanzamiento del token en otra red.
- Android versionCode 196, iOS 1.51.0.

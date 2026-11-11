# 1.53.0 — 10 de noviembre de 2026

Sniper explica por qué se movió cada token.

## Panel "¿Por qué se movió?"

Se abre solo cuando el token sube o baja con fuerza (15 % en 5 min o 30 % en 1 h) y reúne las pruebas:

- **Precio**: 5 minutos, 1 hora y 24 horas.
- **Volumen**: el de 1 hora frente a la liquidez disponible.
- **Presión**: compras frente a ventas en 5 minutos y operaciones de la última hora.
- **Compras grandes en cadena**: las mayores detectadas, con el importe total en USD.
- **Carteras distintas** que están comprando.
- **Listados**: en cuántos mercados cotiza.
- **Marketing**: si hay boost de pago activo.
- **Antigüedad** del par.

Conclusión en una línea: "Movimiento con compras y actividad por encima de lo normal", "con presión vendedora" o "sin causa clara en los datos públicos".

## Servicio

- Nuevo endpoint que combina DexScreener, RPC de Solana y boosts, con caché de 30 segundos.

## Notas

- Android versionCode 200, iOS 1.53.0.

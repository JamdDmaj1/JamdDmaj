# 1.41.0 — 10 de noviembre de 2026

Sniper permite comprar y vender los tokens analizados desde la misma tarjeta.

## Compra y venta

- Presets de 0,05 / 0,1 / 0,25 / 0,5 SOL o importe libre.
- Precio en vivo: cantidad estimada, impacto de precio y ruta, actualizado al elegir importe y antes de firmar.
- Firma con Phantom (extensión o navegador dentro de Phantom); el envío usa prioridad alta y no espera confirmación en preflight para entrar antes.
- "Vender todo" lee el saldo real de tu wallet y vende la posición completa.
- Enlace a Solscan tras cada envío y aviso de que la operación es real.

## Datos

- Nuevo servicio de cotización y construcción de transacción (Jupiter lite).
- El analizador expone los decimales del token para mostrar importes correctos.

## Notas

- La wallet nativa de la app todavía no firma estos swaps; hoy se usa Phantom. La integración con la wallet interna queda como siguiente paso.
- Android versionCode 186, iOS 1.41.0.

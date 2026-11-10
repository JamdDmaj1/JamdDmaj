# 1.39.0 — 9 de noviembre de 2026

Versión de producto que reúne el trabajo de esta semana sobre la cuenta única de JamdDmaj.

## Mercados

- Vista de **burbujas** por defecto: tamaño por capitalización, volumen o ranking, color por variación de 24 h.
- Burbujas redondas, flotando libremente, arrastrables, con choques entre ellas y paralaje al hacer scroll.
- La métrica elegida se recuerda entre visitas; el buscador filtra el campo en vivo.
- El bloque de alertas de precio se retiró de Mercados.

## Trade

- **Sugerencia del bot** al elegir un mercado, con el motivo (EMA20/EMA50 y RSI) y ficha de detalle: valores, separación, RSI, último cierre y número de velas.
- Botón **Aplicar y revisar** que abre la revisión con el lado sugerido; el margen se ajusta al saldo disponible si hace falta.
- Barra de margen reparada (porcentaje del saldo) y botón **Usar máximo**; se recuerda el último tamaño usado.

## Futuros y cierres

- Cierre y cierre forzado con seguimiento hasta el pago; el dinero vuelve al saldo y la operación pasa al historial.
- **Retirar a mi billetera** para un cierre que quedó pendiente de cobro.
- La app **reconcilia sola** una operación pendiente y reintenta la revisión o el cierre, en lugar de bloquearse.
- **Últimos cierres** con resultado en color, fecha, importe recibido y botón **Compartir** (tarjeta visual con el símbolo correcto y la fecha).

## Cuenta

- Resumen con saldo, margen y PnL sin redibujados periódicos que parpadeen.
- El historial lee la billetera real y se actualiza al cambiar de cuenta.
- Sin menciones al proveedor en la interfaz: la app se presenta como JamdDmaj.

## Notas

- La automatización sigue en modo aviso: calcula y avisa, no envía órdenes sin confirmación.
- El mínimo del venue es 10 USDC por posición más comisiones.
- Versión de app 1.39.0 (Android versionCode 182, iOS 1.39.0); el estado público la informa en /api/status.

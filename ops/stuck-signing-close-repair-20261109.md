# Cierre trabado en SIGNING — revisión y reparación

Fecha: 2026-11-08/09. Producción. Sin pérdida de datos; la posición sigue abierta.

## Síntoma

En Futuros, el cierre de `g4RCTceL…wxs2` quedó mostrado como `PREPARED · SIGNING`
y el botón "Consultar este cierre" no lo liberaba. Antes hubo `Failed to fetch`.

## Causa

1. `jamddmaj-perps-web` y `jamddmaj-perps-https` declaran
   `Requires=jamddmaj-perps-worker`. Un reinicio del worker durante una prueba de
   activación las tumbó y **no volvieron solas** → el navegador no pudo conectar.
2. Al cortarse la petición entre "preparar" y "firmar", quedó una ejecución en
   `SIGNING` con `signature`, `wire_hash`, `owner_signed_wire`, `confirmed_slot` y
   `payout_json` **todos nulos**, y el cierre padre en `PREPARED`.

## Evidencia de que no se envió

- `getSignaturesForAddress` de la billetera del bot: la transacción más reciente
  es de **2026-11-08T04:04:46Z**. El intento es de **23:46:09Z**. No existe
  ninguna transacción posterior.
- La fila de ejecución no tiene firma ni hash de wire, así que no pudo enviarse.

## Reparación aplicada

1. Backup consistente del diario en caliente (`VACUUM INTO`) →
   `/root/journal-backup-20261109T001442Z.sqlite`.
2. Actualización acotada, con precondiciones que se niegan si hubiera cualquier
   evidencia (`signature`/`wire_hash`/`owner_signed_wire`/`confirmed_slot`/`payout`):
   `perps_position_closes.state: PREPARED → CANCELLED` para ese id.
   La fila de ejecución `SIGNING` **se conserva** como intento sin firma
   archivado; no hay estado `CANCELLED` válido en su CHECK.
3. Reinicio del worker: la validación de arranque (`perps-runtime-recovery`)
   acepta el estado (el padre no es COMPLETED y las entradas siguen OPEN).
4. `systemctl start jamddmaj-perps-web jamddmaj-perps-https` + verificación del
   puerto 443.

## Verificación posterior

- `pendingPositionCloses`: **vacío**.
- Cierres: `CANCELLED 2 · COMPLETED 2`.
- Entradas de la billetera: `CANCELLED 4 · CLOSED 2 · OPEN 1`.
- `worker`, `web` y `https`: active; `/health` → 200.

## Pendiente recomendado

El esquema no permite marcar una ejecución como abandonada, así que un futuro
intento sin firma vuelve a requerir esta reparación manual. Conviene añadir una
operación soportada de operador (con migración de esquema) que cierre el intento
sin firma y libere el padre en un solo paso.

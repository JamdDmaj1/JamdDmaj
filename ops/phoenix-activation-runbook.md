# Activación de Phoenix en producción — runbook

Fecha: 2026-11-08. **No ejecutado.** Requiere autorización explícita del dueño y
una ventana. Toca dinero real y el servidor financiero.

## Requisitos previos

0. **Preflight observado 2026-11-08 (solo lectura):**
   - Servicios `jamddmaj-perps-worker`, `-web` y `-https`: **active**.
   - `phoenix.sqlite`: **no existe** (correcto, hay que crearlo).
   - Worker instalado: `7f681c89…57b4d5` (distinto del `420f69a0…` del release
     documentado, así que los binarios se actualizaron después).
   - Web service: `dc4d88e7…1152` (coincide con el documentado).
   - `ExecStart` efectivo: `--controls --custody-setup --bot-swaps
     --platform-fees --bot-manual` — **sin `--phoenix`**.
   - **Estado financiero observado (2026-11-08, ronda 9):** reservas `CANCELLED 4 · CLOSED 2 · OPEN 1`; cierres `CANCELLED 1 · COMPLETED 2`; **cero** operaciones en `SIGNING`/`UNCERTAIN`/`UNKNOWN`/`RESERVED`. La ventana de reinicio está limpia: no hay envío incierto que se pueda orfanar. Hay una posición abierta, que un reinicio no altera.
   - **Corrección (2026-11-08, ronda 8):** HEAD **sí** incluye
     `vault.signPhoenixOrder`, `signPhoenixFee`, `signPhoenixParent` y
     `signPhoenixCollateral`, que es lo que exige `createPhoenixManualService`.
     Lo único que falta en HEAD es `signPhoenixChildSetup` (flujo de onboarding
     del hijo, aún sin commitear); no bloquea entrada ni cierre manual.
   - **Artefacto construido y verificado desde `9ec83f4`:**
     `bot-manual-worker-candidate.mjs`, 3,66 MB,
     SHA256 `652843c360ec25a68ed988e96a842ddbedeeb99f3c016aff7f53a90f6c77bdc4`.
     Incluye `--phoenix`, `createPhoenixManualService` y `PHOENIX_ENTRY_GATED`.
     Arrancado en un directorio vacío falla cerrado con
     `PERPS_RUNTIME_UNAVAILABLE` (los imports resuelven). **No instalado.**

1. `PHOENIX_ENTRY_GATE` decidido: si se deja puesto, Phoenix solo permite cierre.
   Para abrir entradas hay que quitarlo en `lib/phoenix-manual-service.js` **en el
   mismo release** que las pruebas de entrada.
2. Autorización del dueño por escrito para: crear el ledger, instalar binarios y
   habilitar el venue.
3. Ventana con el worker pausado, sin posiciones en `SIGNING`/`UNCERTAIN`/
   `UNKNOWN` y con los siete estados lógicos financieros verificados.

## Paso 1 — Crear el ledger (en la VPS, como root)

```bash
cd /opt/jamddmaj-perps
node --input-type=module <<'JS'
import {openPhoenixExecutionJournal} from './worker/lib/phoenix-execution-journal.js'
const j=openPhoenixExecutionJournal('/var/lib/private/jamddmaj-perps-runtime/phoenix.sqlite',
  {initialize:true,explicitOperatorApproval:true})
console.log('phoenix ledger created');j.close()
JS
```

- Debe quedar con permisos de solo el propietario (`0600`) y el mismo grupo que
  el resto de bases (`jamddmaj-perps-controls`).
- Anotar tamaño y SHA256 en `ops/` como evidencia. **No** copiar bases antiguas.

## Paso 2 — Instalar el worker con `--phoenix`

1. Construir el binario en la máquina de desarrollo (mismo proceso que el
   release anterior: bundle `scripts/perps-server-worker.mjs`).
2. Calcular SHA256 del binario candidato y compararlo con el instalado.
3. Parar `jamddmaj-perps-worker`, reemplazar el binario de forma atómica,
   arrancar con los flags actuales **más `--phoenix`**.
4. Comprobar:
   - `systemctl is-active jamddmaj-perps-worker` → `active`.
   - `worker-status.json` sin errores de arranque.
   - `curl` autenticado a `phoenixStatus` → 200 con `venue:"phoenix"`.
   - `phoenixEntryPrepare` → `409 phoenix-entry-gated` (gate puesto).

## Paso 3 — Abrir entradas (solo si se autorizó)

1. Quitar `PHOENIX_ENTRY_GATE` (dejarla vacía) y desplegar el worker de nuevo.
2. Verificar `phoenixStatus.entryAvailable === true` y que
   `phoenixEntryPrepare` ya no responde `phoenix-entry-gated`.
3. Primera prueba **real** con el margen mínimo (10 USDC) y un solo mercado,
   con confirmación del dueño delante. Sin reintentos si queda `UNKNOWN`.

## Rollback

- Volver al binario anterior (hash registrado) y arrancar sin `--phoenix`.
- **Obligatorio:** `jamddmaj-perps-web` y `jamddmaj-perps-https` declaran
  `Requires=jamddmaj-perps-worker`; cualquier parada o reinicio del worker las
  tumba y **no vuelven solas**. Tras cada reinicio del worker hay que
  arrancarlas y comprobar el puerto 443:
  `systemctl start jamddmaj-perps-web jamddmaj-perps-https && ss -ltnp | grep :443`.
  Si se olvida, el navegador muestra `Failed to fetch` en Futuros (incidente
  real del 2026-11-08).
- El ledger `phoenix.sqlite` **no se borra**: si queda un workflow pendiente, se
  reconcilia, nunca se descarta por conveniencia.
- No restaurar bases antiguas para "deshacer" un binario.

## Lo que este runbook no autoriza

- Fondear la wallet del bot, activar automatización o ejecutar órdenes.
- Cambiar el deslizamiento del 0,5 %, comisiones o límites.
- Reintentar un envío cuyo resultado se desconoce.

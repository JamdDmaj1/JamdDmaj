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
   - **Dependencia crítica:** el commit HEAD de la rama **no incluye
     `vault.signPhoenixOrder`** (solo existe en el árbol de trabajo de la sesión
     paralela: 4 métodos en HEAD frente a 5 en el working tree). El servicio
     Phoenix exige ese método al construirse, así que instalar un worker
     construido desde HEAD con `--phoenix` **fallaría al arrancar**. Hay que
     commitear primero ese trabajo y verificar de nuevo.

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
- El ledger `phoenix.sqlite` **no se borra**: si queda un workflow pendiente, se
  reconcilia, nunca se descarta por conveniencia.
- No restaurar bases antiguas para "deshacer" un binario.

## Lo que este runbook no autoriza

- Fondear la wallet del bot, activar automatización o ejecutar órdenes.
- Cambiar el deslizamiento del 0,5 %, comisiones o límites.
- Reintentar un envío cuyo resultado se desconoce.

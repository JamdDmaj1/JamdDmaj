# Composición del runtime Phoenix — plan exacto

Fecha: 2026-11-08. Estado: **implementado detrás de `--phoenix`, apagado por
defecto**. No instalado y no activado en el VPS.

## Implementado (commit de esta ronda)

- `lib/perps-server-runtime.js`: bandera `phoenixEnabled` que exige
  `platformFeesEnabled && botSwapsEnabled && botManualEnabled && mode==='execute'`;
  el diario `phoenix.sqlite` debe existir **antes** de arrancar (el runtime no lo
  crea) y se cierra en `release()`.
- Composición de `createPhoenixManualService` con el diario de riesgo, swaps,
  backups, cliente del venue, claves de exchange, RPC de lectura y un
  `sendRequest` que solo acepta `sendTransaction` con la ejecución en marcha.
- `assertUncontended` real: bloquea si hay entradas, cierres, cancelaciones,
  pagos de fee, swaps o flujos Phoenix pendientes para la misma billetera.
- `scripts/perps-server-worker.mjs`: acepta `--phoenix` y lo pasa al runtime.
- Pruebas: `phoenixEnabled` sin prerrequisitos y con valor no booleano falla; el
  ledger existente sin bandera sigue fallando; 28 pruebas del runtime, 25
  pasadas, 3 omitidas (solo Linux), 0 fallos.

## Lo que ya está listo

- Bóveda con `signPhoenixOrder` además de fee/parent/childSetup/collateral
  (en el árbol de trabajo, aún sin commitear por la sesión paralela).
- `createPhoenixManualService({...})` completo y probado en el ensayo de fork.
- La API ya acepta y despacha `botPhoenix` (`lib/perps-automation-api.js`).
- Cliente de navegador con la postura de entrada como booleano: acepta
  `entryAvailable:true` con razón `null`, o `false` con una razón acotada.
- UI: directorio de mercados (33 operables) y panel de cierre revisado.

## Lo que falta, con las líneas exactas

1. **Quitar la guarda** `lib/perps-server-runtime.js:88`
   (`if(existsSync(join(directory,'phoenix.sqlite')))fail();`) y sustituirla por
   una bandera explícita `phoenixEnabled`, con la misma disciplina que
   `botManualEnabled`: exigir `platformFeesEnabled && botSwapsEnabled &&
   mode==='execute'`, y fallar si existe `phoenix.sqlite` sin la bandera.
2. **Diario**: `paths.phoenix = join(directory,'phoenix.sqlite')` y
   `journal = openPhoenixExecutionJournal(paths.phoenix,{now,
   allowNonPosixForTests})`. Debe entrar en `release()` para cerrarse.
3. **Cliente del venue**: `createPhoenixClient({phoenixEnv:'prod',
   apiUrl:'https://perp-api.phoenix.trade', rpcUrl, ws:false, ...})` y
   `readExchangeKeys: () => client.api.exchange().getKeys()`.
4. **Servicio**: `createPhoenixManualService({controls, vault, journal,
   riskJournal, swapJournal, backupRegistry, publicClient, client, readExchangeKeys,
   rpcRequest, sendRequest, assertUncontended, isRunning, now, monotonicNow})`,
   pasarlo como `botPhoenix` a `createPerpsAutomationApi`.
5. **Remitente (`sendRequest`)**: es la decisión de riesgo. El ensayo usa un
   ejecutor local. En producción solo puede ser un `sendTransaction` con
   `maxRetries:0`, gated por `executionRunning()`, sin reintentos y con la misma
   frontera que usa el bot. No se debe reutilizar un remitente que permita
   métodos distintos de `sendTransaction`.
6. **Contención entre venues (`assertUncontended`)**: no puede ser un no-op
   como en el ensayo. Debe comprobar que la billetera no tiene operaciones
   pendientes en el diario de riesgo, swaps ni cierres, que es lo que la propia
   guarda `gate()` ya exige; el hueco pendiente son las reservas del executor
   Jupiter.

## Sobre la entrada (entry)

`phoenix-manual-service.js:192` devuelve siempre
`entryAvailable:false, entryReason:'PHOENIX_RELEASE_GATES_PENDING'`. Habilitar
los 33 mercados exige **una decisión de release explícita** del dueño: quitar
ese literal, declarar el gate cerrado (colección de fees, onboarding del padre,
child setup) y aceptar el riesgo. Sin eso, aunque se componga el runtime, solo
se podrá cerrar posiciones, no abrirlas.

## Pruebas que debe traer

- Runtime con `phoenixEnabled` + `phoenix.sqlite` existente → compone y
  `capabilities()` no cambia de forma inesperada.
- Runtime sin la bandera y con `phoenix.sqlite` → falla (no olvida el diario).
- `botPhoenix` ausente → la API responde `phoenix-unavailable` (503).
- Servicio con fakes: entrada bloqueada, cierre revisado y confirmación
  explícita, sin reintentos.

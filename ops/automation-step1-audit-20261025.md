# Paso 1 — auditoría de automatización

Fecha: 2026-10-25. Resultado: **auditoría completada; sistema NO acreditado como completo para operación real**. Solo lecturas y documentación local. Sin reinicios, cambios de configuración/cuentas, instalaciones, firmas ni envíos financieros.

## Historia y límite

Controles de JamdDmaj → API autenticada → worker VPS → billetera exclusiva/contabilidad → respuesta. Se contrastaron fuentes y evidencias en producción. En el primer enlace financiero incompleto (integración de comisiones) se detuvo la verificación de ejecución; no se intentaron entradas reales ni se fingió la sesión del usuario.

## Producción comprobada

- SSH al VPS conocido, clave de host exigida, autenticación existente; no se leyeron claves ni variables secretas.
- Worker, servicio web manual y HTTPS: activos/running desde 2026-10-24 13:17:01 UTC. Worker: NRestarts=0, Result=success; observador de señales también activo, sin reinicios. El antiguo ejecutor Bitget está inactive y disabled.
- GET HTTPS `/health`: HTTP 200, `mode=execute`, `executionAvailable=true`, `tradingEnabled=false`, `custodyProvisioningAvailable=true`. La última bandera global no representa el consentimiento de una cuenta.
- Último ciclo leído: `WORKER_CYCLE_COMPLETE`, mode execute, observedAt 1792974227070, una cuenta revisada, resultado `AUTOMATION_INACTIVE:1`. Es evidencia de inactividad actual, no de una avería del proceso ni de trading probado.
- Controles reales usados por worker: `/var/lib/private/jamddmaj-perps-controls/controls.sqlite`; una cuenta configurada, cero activas. Existe otra controls.sqlite en runtime: no debe confundirse con la ruta efectiva.
- Journal: cero reservas, cierres, conversiones, cancelaciones y completaciones. Web: cero envíos, recibos, liquidaciones, observaciones y locks financieros. Políticas manuales: cero filas. Esto no demuestra ausencia universal de posiciones on-chain; no se efectuó una consulta completa de posiciones en esta auditoría.
- Controles/journal/backup y almacenes web/política pasan integridad; foreign-key check de controles/riesgo/web/política sin errores. Registro de respaldo: tres desafíos, un registro verificado. No se descifró ni restauró el respaldo; la vigencia/recuperación del conjunto final corresponde al paso 7.

## Billetera y bloqueo operativo

- Billetera exclusiva previamente identificada: `3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T`.
- RPC público finalizado: SOL 0 lamports (slot 461459495); USDC 5,000,000 unidades = 5 USDC (slot 461459555, proveedor alternativo después de error de lectura del primero).
- El flujo actual exige mínimo 10 USDC de margen y SOL de red. El saldo observado no cumple esos requisitos. Esto no es una invitación a depositar: la integración aún tiene bloqueos de software.
- ATA canónica receptora de comisiones `AKyJkfAEqmPMCbKRFmtdYzkHry3oJjPxtZFathpSwKNL`: inexistente en slot 461459556. La web pública prepara una operación SIN firmar; GET devuelve `UNSIGNED_FEE_RECIPIENT_USDC_SETUP`, submitted=false. Preparación no significa cuenta creada.

## Código versus instalado

- Código local: rama `codex/native-wallet-protection`, HEAD al inicio `35c962d`. Los cambios ajenos de plataformas móviles y archivos locales se conservaron sin incorporarlos.
- Worker instalado SHA256 `cc73e4d06982629163e0fafcc19b21ba90bd570fffb94958920249d9d7e3fedd`.
- Servicio manual instalado SHA256 `0adf4b477d63d656c01657e4aea62cc64524387dcd9a0c2221afb78817645b9d` (coincide con el registro histórico 1.38.1 del servicio manual; no representa la versión Android).
- No se deduce versión exacta por una recompilación con opciones distintas: los hashes de una compilación local de referencia no bastan para atribuir un commit al bundle remoto.
- Worker instalado: cero coincidencias del identificador de términos `jamddmaj-perps-margin-20bps-v2-trader-sol` y de `perps_platform_fee`. No contiene el nuevo módulo de cobro.
- Incluso el arranque fuente actual `lib/perps-server-runtime.js` construye API y executor SIN pasar `platformFees`; su valor por defecto es null. Los módulos probados existen, pero no están conectados al runtime. Este es el primer enlace financiero incompleto confirmado.
- Permanecen pendientes consentimiento/reserva compartida, adaptadores de firma, pagos persistentes, exposición de estados y respaldo de los nuevos registros, descritos en `platform-fee-implementation-20261025.md`. No se repararon en el paso 1.
- Web pública GET `/api/status`: HTTP 200, webVersion 1.38.4, latestVersion 1.38.4, googleAccount=true. Eso confirma publicación/configuración general, no la sesión concreta del usuario ni operación financiera.
- Última publicación web conocida: `dpl_663Sg7vNuzUKapbAZ53Dbx4ypJKj`, fuente `755da15`. Su comprobación previa de navegador público fue GET/preparación, sin firma. El conjunto de pruebas de esa publicación terminó 1,052 pass / 0 fail / 19 skip. No equivale a aceptación con dinero real ni se volvió a ejecutar en esta auditoría.

## Conclusión y entrega al paso 2

El servidor funciona como proceso, pero la cuenta del bot está pausada y el conjunto final con comisiones no está integrado. No hay evidencia de un ciclo real completo. El siguiente bloque es terminar las comisiones de extremo a extremo, con consentimiento explícito y sin cobros duplicados; la creación del receptor debe quedar bajo aprobación humana de Phantom. No activar el bot como sustituto de esa integración.

La auditoría no certifica el feed autenticado actual (no se consumieron sus credenciales), una restauración nueva, la sesión Google del usuario, la versión instalada en su teléfono ni posiciones on-chain completas. Son límites explícitos de evidencia y verificaciones de sus bloques correspondientes, no afirmaciones de éxito.

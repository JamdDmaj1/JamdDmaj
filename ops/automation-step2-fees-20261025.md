# Paso 2 — comisiones del bot

Estado: implementación integrada en fuente y verificada con fixtures; **cierre operativo pendiente de la creación, aprobada por el propietario, de la cuenta receptora USDC**. No avanzar al paso 3 ni afirmar que el cobro está activo en producción. El despliegue del conjunto sigue siendo el paso 8 del plan, no una publicación implícita de este cambio.

## Condiciones conservadas

- 0,20% del margen USDC de una apertura finalizada, redondeado hacia abajo a seis decimales; nunca del tamaño apalancado. Sin comisión comercial extra de cierre.
- Destinatario fijo `4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr` y mint USDC canónico de Solana. Cada trader paga la red con su SOL. Nunca crear el ATA del operador a cargo del primer cliente.
- Aprobación de términos independiente y desmarcada inicialmente al activar; límites siguen ajustables. Cambiar ajustes o pausar invalida la autorización anterior antes de firmar. No se facturan aperturas históricas sin consentimiento previo.

## Implementación terminada en este trabajo

1. Servicio `perps-automation-fees.js`: consentimiento previo → comprobación del evento de apertura finalizado → factura única → revisión exacta → firma de custodia acotada → un intento de envío → conciliación finalizada. Un acuse de RPC nunca equivale a pagado.
2. Arranque integrado en `perps-server-runtime.js`, activable explícitamente con `--platform-fees`. Reutiliza los controles autenticados y la misma billetera exclusiva. Exige almacenes privados ya existentes y compatibles; no los inventa ni migra al arrancar. No activa cuentas.
3. Frontera `perps-platform-fee-signing.js` y `vault.signPlatformFee`: solo la revisión canónica, mandato vigente, claim real, bloqueo del journal compartido y respaldo completo permiten usar la clave. Sin firmador arbitrario ni endpoint de transferencias genéricas.
4. Reserva atómica del margen MÁS la comisión, incluida en capital y pérdida máxima. 40 USDC de margen reservan 40,08 USDC antes de red. La deuda retenida no desaparece al cerrar la posición ni por reiniciar.
5. Bloqueo financiero compartido con entradas, cierres, cancelaciones y conversiones. Una comisión SIGNING/UNKNOWN mantiene la exclusión; un resultado incierto no se reenvía. Solo un recibo finalizado exacto libera el bloqueo. Las comisiones aún debidas pero no iniciadas no deben impedir procesar primero un cierre ya registrado.
6. Comprobación de destinatario/mandato/respaldo antes de nuevas entradas. Un ATA receptor ausente bloquea antes de abrir. La preparación del pago vuelve a validar cuentas, efectos, coste y mensaje.
7. Contabilidad diaria: el pago USDC verificado se suma como gasto, sin contarlo como un segundo trade. La red se sigue valorando por separado. Cambiar el journal de pagos invalida snapshots/cachés anteriores. La contabilidad reutiliza el recibo finalizado ya verificado para no añadir varias consultas por cada comisión histórica.
8. Totales autenticados de comisiones debidas, pagadas, pendientes y fallidas, con validación del cliente y texto en el panel. No expone claves, mensajes firmados o registros de otra cuenta, ni interpreta fallo del pago como fallo del trade.
9. Respaldo cifrado de controles, riesgo, consentimiento/facturas y pagos, con bloqueos de escritura de todos los SQLite. La omisión de pagos o de reservas de comisión provoca rechazo. Una restauración conserva la incertidumbre y deja controles pausados. El registro de respaldo distingue cobertura de comisiones; un respaldo antiguo solo de custodia no autoriza facturar.

## Esquema y despliegue posterior

- Nuevo journal: `505c96362bd65d613ca90ddd17f846c3bfca04d5f0ee69c732b9f3ebf05d91b9`.
- Fees: `e96ccf68b094190ad10733be6e8b1b4476068f102d129b9cf407313390dbc02b`.
- Payments: `c5c71be566fbfae724397f006dbbd23167571d44b71a565831715d191cfe459d`.
- El actual journal de producción `e92bbd...` no se actualiza automáticamente. El camino de migración existente exige aprobación explícita, cuentas pausadas, journal vacío verificado, lease del worker, respaldo comprobado y copia exacta de rollback. Se ensaya en copia antes de cambiar el original; las comprobaciones no se relajaron.
- En el despliegue correspondiente habrá que preparar `fees.sqlite` y `payments.sqlite` con el propietario/permisos correctos, crear y restaurar un respaldo nuevo con los cuatro almacenes, registrar su prueba y arrancar el bundle compatible con la opción explícita. Ninguno de esos cambios de producción se ejecutó en este paso.
- Los archivos nativos ajenos, capturas y experimento Drift del usuario se conservaron sin incorporarlos.

## Evidencia de pruebas

- Pruebas enfocadas de la ruta, custodia, riesgo, recibos, API y runtime: resultados detallados en `.perps-build/step2-*.log`; todos los importes, claves y transportes son ficticios/no financiados.
- Linux r4 y r5 final: **32/32 pruebas pasaron** en cada una, sin red ni acceso a la billetera real. Bundle final en `/opt/jamddmaj-perps/checks/step2-fees-20261025/step2-fee-linux-r5.mjs`. Unidad transitoria con DynamicUser, PrivateNetwork, PrivateTmp, ProtectSystem=strict, ProtectHome, NoNewPrivileges, 384 MiB y 75% CPU. No se reinició un servicio de producción.
- Una primera prueba Linux falló porque el fixture había creado dos SQLite con permisos públicos. Se corrigieron los permisos del fixture; la protección de producción siguió intacta. r2 y r3 pasaron 28 y 31 pruebas respectivamente.
- Build web: 31 assets preparado correctamente. Suite completa r4: **1.066 pasaron, cero fallaron, 19 omitidas** (1.085 total), log `.perps-build/step2-final-r4-all-tests.log`. Tras el último cambio para reutilizar recibos inmutables en contabilidad, la suite enfocada de comisiones y contabilidad diaria pasó **44/44**; no se presenta la corrida completa anterior como una prueba realizada después de ese cambio.

## Bloqueo humano externo

La última consulta pública devuelve `UNSIGNED_FEE_RECIPIENT_USDC_SETUP`, submitted=false. El usuario comunicó una cotización de 0,00149344 SOL, no un recibo de creación. El propietario debe decidir y confirmar en Phantom desde la página ya publicada; este agente no puede sustituir esa aprobación ni firmar por él. Verificar después en mainnet el ATA canónico `AKyJkfAEqmPMCbKRFmtdYzkHry3oJjPxtZFathpSwKNL` antes de cerrar esta condición.

No hubo cobros, depósitos, firmas financieras reales, activación del bot, publicación de esta fuente ni nuevo APK. La cuenta receptora preparada en la web anterior no significa cobro automático conectado a la instalación actual.

Comprobación final de producción: worker/web/HTTPS activos, NRestarts del worker=0; bundles siguen `cc73e4d06982629163e0fafcc19b21ba90bd570fffb94958920249d9d7e3fedd` y `0adf4b477d63d656c01657e4aea62cc64524387dcd9a0c2221afb78817645b9d`. Health execute/executionAvailable=true no representa activación de cuenta. La última consulta del receptor sigue sin firmar/enviar.

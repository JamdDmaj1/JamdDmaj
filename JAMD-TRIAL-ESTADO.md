# Jamd: saldo, trial y pagos

## Implementado

- Lectura del mint Devnet exacto 5uYzXBoGBrBCPFLqvEzGH8Aab4MNPKKPTcunZa7Q4aWH.
- Panel de wallet con saldo disponible y asignación pendiente en vesting separados.
- Nombre Jamd / símbolo JAMD suministrados por registro de la app, sin alterar Phantom.
- Validación de propietario del vault, mint, política y cobertura de la asignación bloqueada.
- Textos completos para los diez idiomas existentes.

## Trial aprobado: 20 créditos por 7 días

El módulo lib/trial-credits.js prepara operaciones atómicas Redis para reclamación única
y débito idempotente, con tiempo del servidor. Los registros de uso del trial no caducan
cuando vencen los créditos: reinstalar no debe borrar el historial.
No está conectado a un endpoint, a la interfaz ni al servicio de IA. No concede acceso.
Las pruebas actuales cubren el rechazo de identidad no verificada y fallos de almacenamiento,
no constituyen ensayos de concurrencia en Redis real.

Pendiente antes de activarlo:

1. Integrar autenticación de cuenta verificada y sesiones de servicio.
2. Apple DeviceCheck/App Attest e integridad/Device Recall de Google:
   habilitación en las cuentas del propietario, configuración de servidor y versiones nativas.
3. Implementar adaptadores reales de consulta/marcado del uso de promoción.
   Apple entrega bits por dispositivo, no un identificador estable que pueda inventarse.
   El deviceHash de la interfaz interna es un contrato pendiente de adaptar,
   nunca un valor que pueda enviarse directamente desde el cliente.
4. Coordinación idempotente entre proveedor de dispositivo y Redis, recuperación de fallos,
   dispositivos revendidos/compartidos, apelación y política de retención.
5. Ensayos de reinstalación, cambio de cuenta, solicitudes concurrentes, vencimiento,
   doble débito y fallos de IA; conectar el consumo real y la visualización traducida.

En web no se promete identidad física persistente después de borrar almacenamiento.
No usar IMEI, huellas ocultas ni identificadores aleatorios como prueba de persona única.
Fuentes: https://developer.apple.com/documentation/devicecheck
y https://developer.android.com/google/play/integrity/device-recall

## Captura Unknown Token

La cuenta mint consultada tiene 82 bytes, sin extensiones de metadatos, con autoridad de
emisión nula. El flujo actual crea un mint base y revoca emisión sin publicar nombre/símbolo.
La inicialización nativa de TokenMetadata exige MetadataPointer y firma de la autoridad
de emisión; no puede corregirse este mint por ese flujo ahora.
Para comprobar nombre en wallets hace falta preparar un nuevo ensayo con metadatos
antes de revocar emisión. No se creó otro token ni se alteró el existente.
Fuente: https://solana.com/docs/tokens/extensions/metadata

## Compras y membresías de prueba pendientes

No se habilitaron pagos ni beneficios reales con tokens Devnet.
Faltan catálogo/tarifa de ensayo y destinatario de pagos definidos, cotizaciones
vinculadas a cuenta y transacción, verificación finalizada, recibos atómicos globales
por firma, conciliación y prueba de extremo a extremo. Una wallet conectada no autentica
por sí sola una cuenta ni acredita un pago.

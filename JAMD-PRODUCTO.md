# Jamd: definición inicial del token

Estado: diseño de producto. No es una oferta de venta ni un anuncio de lanzamiento.
Fecha: 2026-09-05.

## Decisiones del propietario

- Nombre del token: **Jamd**. Sustituye la denominación propuesta JDMAJ.
- Plataforma: JamdDmaj; la marca de la aplicación conserva su nombre.
- Utilidad: pagar créditos y funciones de la app y acceder a membresías.
- Identidad: producto de utilidad con documentación profesional, sin lanzamiento mediante Pump.fun.
- Configuración definitiva confirmada el 2026-09-06: nombre `Jamd`, símbolo `JAMD`, 9 decimales, suministro fijo de 1.000 millones y 87% del suministro bloqueado inicialmente. Los destinatarios siguen pendientes. La confirmación no habilita mainnet ni sustituye auditoría y revisión legal.

## Primera versión propuesta de la utilidad

1. Créditos: el usuario elige un paquete, recibe una cotización con vencimiento y confirma el pago en su wallet. Los créditos se asignan únicamente después de confirmar el pago en la red.
2. Membresía: pago explícito de un periodo de acceso. La primera versión no contempla cargos automáticos ni permisos de gasto permanente.
3. Funciones: un catálogo publica qué herramientas consume cada paquete y qué incluye cada membresía. Los precios y límites deben cubrir el costo real de IA, datos y alojamiento.

Los créditos internos y el saldo de Jamd son registros diferentes. Comprar créditos no crea tokens. Conectar una wallet no prueba un pago ni concede por sí solo una membresía. Tener tokens bloqueados no significa poder gastarlos.

## Flujo técnico propuesto

- Catálogo versionado con identificadores de producto, periodo, precio y prestaciones.
- Cotización vinculada al usuario, producto, red, mint exacto, cantidad, destinatario y caducidad. No identificar un token únicamente por su nombre o símbolo.
- Resumen visible antes de la firma, con importe y comisiones desglosados.
- Verificación en servidor del pago confirmado: red, mint, cantidad, destinatario y referencia de compra.
- Registro único de la transacción para impedir acreditar dos veces un mismo pago, incluso si el cliente reintenta.
- Estados de compra: pendiente, confirmado, acreditado, caducado o fallido; reconciliación de pagos confirmados cuyo crédito haya fallado.
- Membresías y créditos vinculados a la cuenta de la app mediante prueba de control de la wallet. Las wallets públicas de consulta no pueden reclamar beneficios.
- Separación por proyecto: Jamd es el primer producto; otros creadores conservan su propia configuración, permisos, mint y contabilidad.

## Protecciones que se conservan como requisitos

- Oferta fija y revocación de la autoridad de emisión tras la emisión aprobada.
- Desactivación de la autoridad de congelación y revisión de metadatos antes de hacerlos inmutables.
- Mínimo del 85 % bloqueado en las asignaciones protegidas del creador y los primeros 2.000 participantes elegibles; esto no equivale automáticamente al 85 % de toda la oferta.
- Cliff mínimo de 24 meses y liberación gradual posterior. El simulador propone 12 meses de liberación.
- Bloqueo de liquidez, multisig y timelock verificables antes del lanzamiento.
- Una wallet no representa una persona única; el proveedor y proceso de elegibilidad están pendientes.

El prototipo actual usa 730 días como cliff. Antes de anunciar 24 meses naturales, se debe resolver y probar la diferencia de calendario, incluidos años bisiestos. La existencia de código y pruebas locales no demuestra un despliegue ni una auditoría independiente.

## Economía aprobada para preparación y ensayos

Se aprobaron: 40% comunidad, 25% tesorería, 15% equipo, 15% ecosistema y 5% reserva de liquidez. Comunidad, tesorería y ecosistema bloquean 90%; el equipo bloquea 100%. Esto bloquea inicialmente 870 millones, equivalentes al 87% del suministro. El cliff es de 24 meses naturales y la liberación posterior es mensual durante 36 meses.

Siguen pendientes el precio inicial, presupuesto y par de liquidez, destinatarios, fecha de lanzamiento y precios definitivos de servicios. La recarga 10 JAMD de Devnet por 20 créditos solo prueba el mecanismo y no fija el precio real.

Los valores actuales del simulador —1.000 millones de tokens, 0,001 USD y 1.000 USD de aportación— son ejemplos heredados y no se adoptan como economía de Jamd. La comisión de creación del laboratorio tampoco define una comisión sobre compras de Jamd ni sobre créditos.

## Entregables antes de emisión real

1. Catálogo de funciones y membresías aprobado, con costos y condiciones de uso.
2. Distribución completa que sume el 100 %, destinatarios por categoría y calendario de desbloqueo.
3. Integración de compra de créditos y membresías probada con fondos sin valor, incluidos reintentos y fallos de acreditación.
4. Ensayo del mint, asignaciones, bloqueos, autoridades y verificación pública en Devnet.
5. Auditoría independiente y revisión legal pendientes, referidas al código y producto finales.
6. Aprobación explícita del plan de emisión real y sus costos; firma del propietario en su wallet.

Esta ficha es documentación interna en español, no texto publicado en la app. Toda interfaz derivada deberá tener paridad en los diez idiomas admitidos. No modifica borradores guardados, direcciones, contratos ni identificadores existentes.

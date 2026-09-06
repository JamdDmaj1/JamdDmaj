# Jamd — paquete previo a creación

Fecha: 2026-09-05. Documento interno de trabajo, no oferta de venta.
Nombre aprobado: Jamd. Símbolo aprobado: JAMD. Suministro fijo aprobado: 1.000 millones.
Tokenómica confirmada el 2026-09-06 en security/jamd-mainnet-intent.json.
Esta confirmación no sustituye evidencia de auditoría ni aprueba una transacción concreta.
Estado: preparación parcial; no apto todavía para emisión real.

## Catálogo inicial propuesto

| Producto | Entrega | Condición para habilitar |
| --- | --- | --- |
| Acceso básico | Consulta de mercados y herramientas básicas | Delimitar funciones existentes y gratuitas |
| Créditos IA | Saldo interno para consultas y análisis | Medir costo por modelo, consumo y margen |
| Pro mensual | Acceso durante un mes, con cuotas publicadas | Definir catálogo exacto, vencimiento y cancelación |
| Informes premium | Informe solicitado, con fecha y fuentes | Definir costo, disponibilidad y tratamiento de fallos |

No son prestaciones nuevas implementadas. No se ofrece IA ilimitada.
La propuesta conserva una alternativa de pago sin Jamd; su proveedor y condiciones están pendientes.
No hay descuento ni precio aprobado. El token no otorga participación, dividendos
ni rendimientos prometidos en esta propuesta.

## Hoja de costos antes de fijar precios

Registrar por función: costo de IA, datos, infraestructura incremental, procesamiento,
soporte, impuestos aplicables y margen propuesto. Usar datos reales de consumo,
incluyendo casos costosos y reintentos. No adoptar precios del simulador.
Si se cotiza el servicio en otra moneda y se paga en Jamd, definir fuente de precio,
antigüedad máxima y vencimiento. Sin precio fiable o liquidez suficiente, no cotizar.
No fijar una conversión permanente ni prometer un valor monetario del token.

## Especificación de compra para futura implementación

- Cuenta autenticada y prueba de control de wallet; dirección pública de consulta no basta.
- Pedido con proyecto, usuario, producto/version, red, mint exacto, unidades enteras,
  destinatario, referencia única y vencimiento.
- Cotización y detalle de comisiones antes de cada aprobación del usuario.
- Verificación en servidor de la transacción, resultado, importe, mint, destinatario y referencia.
- Restricción única de transacción por red para impedir doble acreditación entre cuentas/proyectos.
- Acreditación y registro de consumo atómicos; reintentos idempotentes.
- Pago tardío o discrepante pasa a conciliación, nunca se pierde silenciosamente.
- Membresía se activa tras acreditación; renovación explícita, sin autorización permanente.
- No guardar claves privadas ni frases de recuperación. No importar secretos de Trojan u otras wallets.
- Reembolsos y cancelaciones requieren política revisada; no transferir automáticamente por un error del cliente.

## Matriz de aceptación pendiente

| Caso | Resultado exigido |
| --- | --- |
| Pago correcto confirmado | Una acreditación al comprador correcto |
| Reenvío o peticiones simultáneas | Ningún crédito duplicado |
| Otra red, mint, cuenta o destinatario | Rechazo sin beneficios |
| Wallet watch-only | No puede comprar en nombre de otra cuenta |
| Fallo de red o reinicio tras pago | Recuperación por conciliación |
| Precio vencido o proveedor caído | No ofrecer cotización engañosa |
| Token bloqueado | No mostrarlo como saldo gastable |
| Proyecto de otro creador | No comparte permisos ni contabilidad |
| Cambio de wallet durante compra | Pedido conserva comprador e identidad originales |

Esta matriz todavía no equivale a pruebas ejecutadas de pagos.

## Economía aprobada para preparación

- Oferta total fija: 1.000 millones y 9 decimales confirmados; los pagos usan unidades enteras de base.
- Distribución confirmada: 40% comunidad, 25% tesorería, 15% equipo, 15% ecosistema y 5% reserva de liquidez.
- Bloqueo inicial confirmado: 90% de comunidad, tesorería y ecosistema y 100% del equipo, equivalente a 870 millones o 87% del suministro.
- Calendario confirmado: cliff de 24 meses naturales y liberación mensual durante 36 meses.
- Para cada categoría: beneficiario, cantidad, porción bloqueada y calendario verificable.
- Conservar mínimos de 85% en asignaciones protegidas, 2.000 participantes elegibles,
  24 meses de cliff y liberación gradual. No confundir estas asignaciones con el total de oferta.
- Auditar que el suelo conservador de 731 días y los 36 tramos durante 1.096 días nunca acorten el calendario aprobado, incluidos años bisiestos.
- Elegibilidad anti-Sybil: método, apelaciones, privacidad y responsable pendientes.
- Liquidez: presupuesto, par, custodio de bloqueo y condiciones pendientes.
- Destinatarios, mint, multisig/timelock y metadatos finales de Mainnet: no definidos ni desplegados.
- La comisión comercial solicitada anteriormente no está configurada:
  faltan porcentaje, destinatario verificado, alcance y revisión legal.

No se elegirán destinatarios, presupuesto o porcentajes mediante valores heredados.

## Secuencia de entrega y salida

1. Aprobar catálogo y economía con costos reales.
2. Implementar pagos en entorno de prueba y ejecutar la matriz anterior.
3. Ensayar emisión y bloqueos sin valor, incluyendo calendario, revocaciones y ataques.
4. Encargar auditoría independiente del código final y revisión legal de jurisdicciones,
   comercialización, condiciones, comisiones y derechos del comprador.
5. Publicar documentación verificable y traducida después de aprobarla.
6. Obtener aprobación de la emisión concreta y sus costos. Firmar únicamente en wallet del propietario.

Referencias internas: JAMD-PRODUCTO.md, AUDIT-READINESS.md, LEGAL-READINESS.md,
FAIR-LAUNCH-ARCHITECTURE.md y security/mainnet-readiness.json.

## Validación local incorporada

El control de preparación exige los siete requisitos conocidos aunque se borren del archivo.
Rechaza evidencia vacía, tipos incorrectos, red/esquema incorrectos y multisig de un solo firmante.
Se prueba con datos sintéticos: no acredita que un informe, dirección o aprobación sean auténticos.
No es un bloqueo on-chain ni reemplaza controles de despliegue o una auditoría.
Mainnet continúa deshabilitado en la configuración; no se han modificado límites financieros.

## Idiomas y publicación

Estos documentos son internos en español. No se ha cambiado la interfaz ni publicado promesas.
Antes de mostrar el catálogo: traducir todos los textos a los diez idiomas de la app,
probar paridad de claves y errores, importes locales y accesibilidad. Jamd, símbolos,
direcciones y hashes no se traducen.

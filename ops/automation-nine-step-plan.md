# Plan acordado: automatización real completa

Estos son nueve bloques de trabajo, en este orden. Los subproblemas se registran dentro del bloque correspondiente, no se presentan como una ampliación silenciosa. Un hallazgo que cambie alcance, coste o autorización se explica antes de actuar.

Regla del usuario: comenzar y terminar un bloque antes de avanzar al siguiente. Terminar una auditoría no significa reparar sus hallazgos. No confundir código implementado, prueba aislada, publicación y funcionamiento real verificado.

1. **Auditar el estado actual del servidor.** Versiones, funciones conectadas, billetera exclusiva, controles, registros y bloqueos. Estado: COMPLETADO como auditoría de solo lectura; evidencia en `automation-step1-audit-20261025.md`.
2. **Completar las comisiones.** Cálculo/cobro USDC conectado al bot, consentimiento, reservas, destinatario y prevención de duplicados; red pagada por el usuario en SOL. Estado: implementación integrada en fuente y pruebas realizadas; NO CERRADO operativamente, pendiente de aprobación humana de la cuenta receptora. Ver `automation-step2-fees-20261025.md`. No pasar al 3 aún. Despliegue del conjunto en el 8.
3. **Completar la apertura automática.** Señales Telegram → billetera exclusiva → Jupiter, respetando límites. Estado: PENDIENTE de integración/verificación completa; no asumir que no existe código.
4. **Completar las salidas.** SL/TP/cierres, evidencia de recepción y conversión protegida a USDC cuando corresponda. Estado: PENDIENTE de verificación integrada.
5. **Conectar los controles de la app.** Límites ajustables, activación explícita, pausa de nuevas entradas y estado real. Estado: PENDIENTE de verificación del flujo final con comisiones.
6. **Unificar saldos e historial.** Capital, reservas, posiciones, costes y resultados del bot separados de la billetera principal. Estado: PENDIENTE de verificación integrada.
7. **Verificar recuperación y seguridad.** Reinicios, desconexiones, incertidumbre, no duplicación y respaldo/restauración de todos los registros finales. Estado: PENDIENTE.
8. **Publicar servidor, web y Android compatibles.** Publicar el conjunto completado, verificar versiones y conservación de datos. Estado: PENDIENTE; publicaciones anteriores no cierran este bloque.
9. **Validar la activación desde la cuenta del usuario.** Saldo/red/respaldo/límites definitivos, revisión y decisión del usuario. Pruebas reales requieren autorización específica. Estado: PENDIENTE.

No activar cuentas, cambiar límites, cobrar comisiones ni firmar/enviar operaciones durante una auditoría. No solicitar secretos. No elegir límites reales por el usuario. Los números anteriores de prueba no constituyen aceptación definitiva.

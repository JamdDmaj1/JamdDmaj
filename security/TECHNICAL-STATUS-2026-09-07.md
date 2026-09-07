# Estado técnico comprobado el 7 de septiembre de 2026

Se ejecutaron 130 pruebas automatizadas y la compilación web: todas pasaron.
Los simuladores RPC Devnet rechazaron los cuatro casos de liquidez y los cinco
casos de vesting previstos. No se enviaron transacciones. Estos ensayos usan
firmas sin verificar y no sustituyen pruebas firmadas de extremo a extremo,
una auditoría independiente ni una comparación del binario desplegado.

Se corrigió el comprobador documental de Mainnet para exigir al menos 86400
segundos de timelock, conforme al plan de gobernanza. Se probaron los valores
0, 1 y 86399 como inválidos y el caso válido de 86400 segundos.

Después del ensayo integral y la verificación pública de la nueva multisig, ya
constan como completados en el control documental:

- Compilación sBPF identificada por commit y SHA-256.
- Ensayo local integral de creación, suministro fijo y cinco asignaciones.
- Multisig Mainnet `FFyAmn9dauQQjq8d6eLP8ZWBJexJBpLMTYmgDo8zSygJ`, umbral
  2 de 3 y timelock de 86400 segundos.

Siguen pendientes antes de Mainnet:

- Falta auditoría técnica independiente auténtica.
- Falta comparar una compilación reproducida con el binario correspondiente.
- Faltan destinatarios de las asignaciones, par y presupuesto de liquidez.
- Falta evidencia de elegibilidad y bloqueo de liquidez real.
- Falta implementar y validar el flujo Mainnet de creación y recarga; los
  ensayos actuales solo demuestran comportamiento Devnet.

La intención Mainnet y el ensayo integral cuadran 870 millones bloqueados
(87%) y 130 millones no sujetos a vesting. El ensayo no abre venta pública ni
aporta liquidez.

La autorización del propietario para avanzar consta en la conversación, pero
no acredita una firma sobre direcciones, costes y transacciones finales que
todavía no se han definido. No se modificaron aprobaciones documentales.

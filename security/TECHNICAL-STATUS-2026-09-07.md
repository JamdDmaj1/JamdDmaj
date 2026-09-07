# Estado técnico comprobado el 7 de septiembre de 2026

Se ejecutaron 130 pruebas automatizadas y la compilación web: todas pasaron.
Los simuladores RPC Devnet rechazaron los cuatro casos de liquidez y los cinco
casos de vesting previstos. No se enviaron transacciones. Estos ensayos usan
firmas sin verificar y no sustituyen pruebas firmadas de extremo a extremo,
una auditoría independiente ni una comparación del binario desplegado.

Se corrigió el comprobador documental de Mainnet para exigir al menos 86400
segundos de timelock, conforme al plan de gobernanza. Se probaron los valores
0, 1 y 86399 como inválidos y el caso válido de 86400 segundos.

No es correcto afirmar que solo falta revisión legal:

- Falta auditoría técnica independiente auténtica.
- Falta comparar una compilación reproducida con el binario correspondiente.
- Faltan firmantes, dirección y umbral de la multisig y su timelock configurado.
- Faltan destinatarios de las asignaciones, par y presupuesto de liquidez.
- Falta evidencia de elegibilidad y bloqueo de liquidez real.
- Falta completar el ensayo adversarial integral, incluidos casos que no cubren
  las nueve simulaciones actuales.
- Falta implementar y validar el flujo Mainnet de creación y recarga; los
  ensayos actuales solo demuestran comportamiento Devnet.

La intención Mainnet guardada asigna 870 millones bloqueados (87%), mientras
el ensayo del creador usa 850 millones (85%). Son configuraciones diferentes;
no se debe reutilizar el ensayo como prueba de la asignación final.

La autorización del propietario para avanzar consta en la conversación, pero
no acredita una firma sobre direcciones, costes y transacciones finales que
todavía no se han definido. No se modificaron aprobaciones documentales.

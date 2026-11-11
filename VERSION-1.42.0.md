# 1.42.0 — 10 de noviembre de 2026

Sniper añade auditoría profunda por token: web, cuenta de X y actividad real en la cadena.

## Web

- Comprueba que responde, su título y si menciona el símbolo del token.
- Detecta si enlaza la cuenta de X del proyecto o no.
- Marca peticiones de "conectar wallet", "claim", preventa o airdrop como señal de cautela.

## Cuenta de X

- Antigüedad de la cuenta, seguidores, número de tweets y verificación.
- Alerta cuando la cuenta es nueva (menos de 14 días) o tiene muy pocos seguidores.

## Cadena

- Muestra de las últimas transacciones del pool: compras, ventas, carteras distintas, SOL comprado y quemas de tokens detectadas.
- Alerta si solo hay ventas, si hay muy pocas carteras operando o si la presión vendedora es alta.

## Interfaz

- Botón "Auditoría profunda: web, X y cadena" en cada tarjeta, con resultados por bloques y penalización estimada.

## Notas

- Los datos de X provienen de una API pública de lectura; no se puede verificar propiedad de la cuenta ni historial de estafas.
- La muestra on-chain es limitada (18 transacciones) por tiempo de respuesta.
- Android versionCode 187, iOS 1.42.0.

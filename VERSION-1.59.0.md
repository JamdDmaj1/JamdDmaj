# 1.59.0 — 10 de noviembre de 2026

Deteccion rapida de rug pull con aviso visible en la tarjeta.

## Cuando se dispara

- La liquidez cae **45 % o mas** desde la lectura anterior, o
- el precio cae **60 % o mas en 5 minutos** con ventas iguales o mayores que las compras.

## Que hace

- La tarjeta se marca con borde rojo y un cartel: **"RUG PULL DETECTADO: liquidez -82 % · precio -91 % en 5 min · 40 ventas / 3 compras"**.
- La etiqueta de seguridad cambia a **RUG**.
- Se añade un aviso rojo al radar y una notificacion que abre el token.
- El panel "¿Por que se movio?" añade el veredicto **"Posible rug pull"** con las pruebas.

## Notas

- Se apoya en las lecturas en vivo del radar (cada 8 s para los tokens visibles).
- Android versionCode 210, iOS 1.59.0.

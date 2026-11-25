# Decisión del bot paper — ronda 24

## Modo por defecto: long-only de precisión

```
TSMOM 7d
Largo solo si retorno 7d > +5%
y el día cae más de 2%
TP 2 ATR / SL 5 ATR
Volatilidad objetivo 10%
Máximo 2x efectivo
Hasta 8 señales
```

Evidencia:

- 2019–2026: 73,6% de acierto, +5,44% medio (30 días).
- Split 2019–2022 / 2023–2026: 71,0% y +3,56% en validación.
- Validación larga Deribit 2024–2026: 60,0% y +1,52%.
- Años malos: 2019 (-1,09%) y 2025 (-1,85%).
- No depende de un solo activo: BTC 68,9%, ETH 65,2%, SOL 69,1% en el split original.

Conclusión: es el modo con mejor expectativa, pero **no es estable al 70%**. Rango realista: 60–67%.

## Modo experimental: cortos

```
TSMOM 10d
Corto solo si retorno 10d < -5%
y funding actual >= 0
TP 3 ATR / SL 4 ATR
```

Evidencia:

- 2019–2026: cortos con expectativa negativa.
- 2026: buenos por régimen bajista.
- Funding ≥0 en Bitget 2026: 70,5% de acierto y +4,44%.
- Funding ≥0,005%: 81% en 90d, pero Deribit 2021–2026 lo desmiente: 50,0% y -2,97%.
- Por eso se revirtió a funding ≥0 y sigue experimental.

Conclusión: no es base; solo se prueba en paper separado.

## Lo que se descartó

- MA 50/200, Donchian, TSMOM 60d.
- Long-only + BTC MA200.
- Consenso BTC/ETH/SOL.
- Salida parcial 50% TP1 + breakeven.
- Filtro de régimen BTC.
- Funding exigente ≥0,005%.
- Horizonte 5/10/15/20 días.
- Short-only, short band -10/-20%.

## Evidencia que falta

- Operaciones cerradas forward: 0.
- Funding/OI completos por exchange: parcial.
- Datos tick/order book: no.
- Historial auditado de trader: no.

## Criterios para promover un modo

No se promueve a real hasta cumplir:

1. ≥30 operaciones cerradas en paper.
2. Acierto forward ≥60%.
3. PnL medio positivo después de fees y funding.
4. Drawdown del tracker ≤15%.
5. Resultado positivo en más de un régimen.
6. Comparación contra buy & hold.

## Estado operativo

- Web: sin cambios.
- Órdenes reales: ninguna.
- Telegram: apagado.
- Trackers: long-only y cortos separados.
- Datos: Bitget 90d + Yahoo 2019–2026 + Deribit funding 2021–2026.

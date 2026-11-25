# JamdDmaj Paper Signal Bot

Bot local de señales paper para futuros USDT de Bitget. **No envía órdenes, no toca la web y no importa código de producción.**

## Estrategia

Modo por defecto: **long-only de precisión**.

- Momentum de 7 días; largo solo si supera **+5%**.
- Entrada en retroceso: exige caída diaria **>2%**.
- TP 2 ATR / SL 5 ATR.
- Volatilidad objetivo por activo: 10% anual.
- Exposición máxima: 2x efectiva.
- Cartera: hasta 8 señales, elegidas por convicción.
- Control de volatilidad de cartera: si la cartera estimada supera 10%, se escala toda la exposición.

Modo experimental `--allow-shorts`:

- Momentum de 10 días.
- Largo > +1%; corto < -5%.
- **Cortos solo si el funding actual es ≥ 0** (el short recibe o no paga).
- TP 3 ATR / SL 4 ATR.

Validación larga con Deribit 2021–2026:

| Filtro de funding | Señales | Acierto | Retorno medio |
|---|---:|---:|---:|
| ≥ 0 | 569 | 60,6% | +1,25% |
| ≥ 0,003% | 236 | 54,7% | -1,15% |
| ≥ 0,005% | 150 | **50,0%** | **-2,97%** |
| ≥ 0,007% | 110 | 46,4% | -4,38% |

El 81% de Bitget 2026 con ≥0,005% era régimen, no ventaja. Se revirtió a **funding ≥0**. El modo corto sigue siendo experimental.

Los cortos se dejan fuera por defecto porque su expectativa histórica 2019–2026 es negativa; el buen resultado de 2026 es régimen.

## Universo

- Futuros USDT de Bitget con mayor volumen 24h.
- Solo bases cripto conocidas.
- Se excluyen acciones/ETFs tokenizados, stablecoins y tokens sin liquidez.
- Por defecto: top 10; configurable con `--top`.

## Uso

```powershell
cd research/paper-bot
node bot.mjs --top 10                 # long-only precisión (por defecto)
node bot.mjs --top 10 --allow-shorts  # long/short experimental
run-daily.cmd                         # long-only + tracker long-only
run-shorts.cmd                        # cortos experimentales + su tracker
```

Salidas:

- `out/latest.txt`: señales legibles y, si no hay señales, una watchlist de los activos más cerca de activar el long-only (no son señales).
- `out/latest.json`: datos completos.
- `out/signals.jsonl`: histórico de señales.
- `out/efficiency.json`: evaluación sobre el universo Bitget.
- `out/paper-state.json`: tracker del modo long-only por defecto.
- `out/paper-state-shorts.json`: tracker del modo corto experimental.
- `out/paper-state-legacy.json`: archivo del tracker antiguo mezclado.
- `out/paper-history.json` / `paper-state-shorts-history.json`: snapshots diarios.
- `out/paper-report.txt` / `paper-state-shorts-report.txt`: reportes legibles.
- `out/telegram-result.json`: resultado del envío opcional.

Trackers separados:

- `run-daily.cmd`: bot long-only + evaluación + tracker long-only.
- `run-shorts.cmd`: bot con `--allow-shorts` + tracker de cortos.

El tracker abre las señales, marca PnL, cobra comisión de entrada/salida, aplica funding diario, cierra por TP/SL/30 días y calcula win rate real.

## Telegram opcional

El envío está **desactivado por defecto**. Para activarlo, define variables de entorno y usa `--send`:

```powershell
$env:TELEGRAM_BOT_TOKEN="..."
$env:TELEGRAM_CHAT_ID="..."
$env:TELEGRAM_THREAD_ID="..."   # opcional
node bot.mjs --top 10 --send
```

Sin `--send`, no se envía nada. Sin token/chat, no se envía nada.

## Eficiencia medida (muestra corta)

Periodo: 19 ago 2026 – 16 nov 2026, 89 días, 10 activos Bitget.

| Cartera | Retorno | Vol | Sharpe | Max DD |
|---|---:|---:|---:|---:|
| Bot paper (asimétrico) | +5,28% | 8,59% | 2,50 | -3,19% |
| Buy & hold equal-weight | +7,63% | 71,84% | 0,78 | -35,58% |

El bot gana menos en retorno absoluto en esta muestra, pero con **8 veces menos volatilidad** y un drawdown mucho menor. La muestra es demasiado corta para concluir que superará al mercado hacia adelante.

## Aciertos históricos

En 2019–2026, BTC/ETH/SOL, señales con la regla asimétrica:

- 10 días: **52,2%** de acierto, retorno medio +2,02%.
- 30 días: **55,8%** de acierto, retorno medio +6,13%.
- La versión simétrica 1%/1% daba 51,9% y 54,6%.
- En la muestra bajista de Bitget 2026, los cortos tienen ~67% de acierto a 10d; los largos fallan. Es régimen, no una ventaja permanente.

## TP/SL y aciertos

Probado sobre 6.129 señales, 30 días, con coste de 0,10% por operación:

| TP / SL (ATR) | Acierto | Retorno medio |
|---|---:|---:|
| 0,5 / 4 | 86,8% | +0,01% |
| 1 / 4 | 77,2% | +0,29% |
| 2 / 4 | 64,7% | +1,10% |
| **3 / 4** | **59,1%** | **+2,00%** |
| 3 / 3 | 56,4% | +2,17% |
| 4 / 3 | 53,6% | +2,72% |

El win rate más alto (86,8%) deja PnL casi cero: es la trampa de TP pequeño. Se eligió **3/4** por equilibrio entre aciertos y expectativa positiva.

### Largos vs cortos con TP 3/SL 4

| Grupo | Acierto | Retorno medio |
|---|---:|---:|
| Largos, full | **62,5%** | **+3,56%** |
| Cortos, full | 53,2% | -0,80% |
| Largos, validación | **59,5%** | **+1,88%** |
| Cortos, validación | 54,1% | -0,45% |

En 2019–2026 los cortos no tienen expectativa positiva. El modo por defecto usa un preset de precisión:

```
TSMOM 7d · largo > +5%
retroceso del día > 2%
TP 2 ATR / SL 5 ATR
```

Comprar el retroceso en vez de perseguir el máximo sube el acierto de validación a **71,0%** y +3,56% medio (frente a 67,8% y +1,48% sin filtro). Por activo el preset base daba BTC 68,9%, ETH 65,2%, SOL 69,1%; no depende de un solo activo. En el mercado bajista actual no genera señales. El modo long/short queda como `--allow-shorts` experimental porque en 2026 los cortos están funcionando; es una decisión de régimen, no una ventaja permanente.

Probé también salida parcial 50% TP1 + breakeven y un modo régimen BTC; ninguno superó al preset ni a la regla base. Se descartaron.

Walk-forward del long-only: si se optimiza solo el acierto, el sistema elige TP1/SL4 y alcanza 77,1%, pero con solo +0,78% medio. El preset 71,0%/+3,56% tiene mejor expectativa; se mantiene ese equilibrio.

Filtro adicional BTC > MA200: 69,6% y +3,19% en validación; no mejora al preset. Descartado.

Validación larga con Deribit 2021–2026: el long-only da 74,8% de acierto en toda la muestra, pero **60,0% en 2024–2026**. El funding no lo mejora. El 71% del split original no es estable en el tiempo.

## Reglas de validación

- Paper trading 8–12 semanas.
- Comparar contra buy & hold y contra no operar.
- Detener si el drawdown supera 15%.
- Revisar slippage, funding y correlación entre señales.
- No pasar a dinero real sin revisión manual.

## Limitaciones

- Datos diarios de Bitget: solo ~90 días por consulta.
- No modela liquidaciones ni order book.
- No incluye acciones tokenizadas.
- No es asesoramiento financiero.

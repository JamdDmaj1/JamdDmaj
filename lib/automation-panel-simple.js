// Simple owner-facing automation card. Limits are the only inputs; the bot
// derives the internal risk envelope and always takes SL/TP from the signal.
import {validateAutomationSettings} from './automation-panel.js';

export function setupAutomationPanel(parent, language, doc, storage = globalThis.localStorage, {controlsClient} = {}) {
  const t = (es, en) => language === 'es' ? es : en;
  const node = (tag, text) => { const n = doc.createElement(tag); if (text) n.textContent = text; return n; };
  const section = node('section'); section.className = 'card automation-simple';
  const title = node('h2', t('Bot automático', 'Automatic bot'));
  const balance = node('p'); balance.className = 'automation-simple-balance';
  const status = node('p'); status.className = 'automation-simple-status'; status.setAttribute('role', 'status');
  const limits = node('div'); limits.className = 'automation-limits automation-simple-limits';
  const fields = {};
  const field = (key, label, min, max, step) => {
    const box = node('div'); box.className = 'automation-limit';
    const input = node('input'); input.type = 'number'; input.id = 'auto-simple-' + key;
    input.min = String(min); input.max = String(max); input.step = String(step); input.required = true;
    input.inputMode = 'decimal';
    const labelNode = node('label', label); labelNode.htmlFor = input.id;
    box.append(labelNode, input); limits.append(box); fields[key] = input;
  };
  field('margin', t('Margen por trade (USDC)', 'Margin per trade (USDC)'), 10, 1000, 1);
  field('leverage', t('Apalancamiento', 'Leverage'), 1.1, 50, 0.1);
  field('positions', t('Trades a la vez', 'Trades at once'), 1, 10, 1);
  const button = node('button', t('Activar bot', 'Activate bot')); button.type = 'button';
  const note = node('p', t('El bot calcula SL y TP con cada señal. No se piden más límites.', 'The bot sets SL and TP from each signal. No extra limits are requested.'));
  note.className = 'notes';
  const feeNote = node('p', t('Comisión JamdDmaj: 0,20% del margen por apertura. La red se paga con SOL de la billetera del bot.', 'JamdDmaj fee: 0.20% of margin per opening. Network fees are paid with SOL from the bot wallet.'));
  feeNote.className = 'notes';
  section.append(title, balance, limits, button, status, note, feeNote); parent.append(section);

  let current = null, busy = false, confirming = false, funding = null, active = false;

  const amount = (units, decimals = 6) => {
    const text = String(units ?? '0').padStart(decimals + 1, '0');
    const fraction = text.slice(-decimals).replace(/0+$/, '');
    return text.slice(0, -decimals) + (fraction ? '.' + fraction : '');
  };
  const setStatus = (text) => { status.textContent = text; };
  const setBusy = (value) => { busy = value; button.disabled = value; for (const input of Object.values(fields)) input.disabled = value || active; };
  const values = () => ({
    margin: Number(fields.margin.value),
    leverage: Number(fields.leverage.value),
    positions: Number(fields.positions.value)
  });
  function inputsValid() {
    const {margin, leverage, positions} = values();
    if (!Number.isFinite(margin) || margin < 10) { setStatus(t('El margen mínimo es 10 USDC.', 'Minimum margin is 10 USDC.')); return null; }
    if (!Number.isFinite(leverage) || leverage < 1.1 || leverage > 50 || Math.round(leverage * 10) !== leverage * 10) { setStatus(t('El apalancamiento debe estar entre 1,1× y 50×.', 'Leverage must be between 1.1× and 50×.')); return null; }
    if (!Number.isInteger(positions) || positions < 1 || positions > 10) { setStatus(t('Los trades a la vez deben ser un entero entre 1 y 10.', 'Trades at once must be a whole number from 1 to 10.')); return null; }
    return {margin, leverage, positions};
  }
  function settingsFrom(values) {
    // Internal envelope only; the user never has to configure these separately.
    const capital = Math.max(11, Math.round((values.margin * values.positions + 0.2) * 100) / 100);
    const settings = {
      capital,
      loss: capital,
      positions: values.positions,
      margin: values.margin,
      leverage: values.leverage,
      dailyTrades: Math.min(100, Math.max(5, values.positions * 5)),
      stopLossPercent: null,
      takeProfitPercent: null,
      lossAction: 'disable',
      reductionPercent: 50
    };
    return validateAutomationSettings(settings);
  }
  function render() {
    active = Boolean(current?.enabled && !current?.paused);
    balance.textContent = funding
      ? t('Balance: ', 'Balance: ') + amount(funding.availableUsdcUnits) + ' USDC'
      : t('Balance: no disponible', 'Balance: unavailable');
    button.textContent = active
      ? t('Pausar bot', 'Pause bot')
      : confirming ? t('Confirmar activación', 'Confirm activation') : t('Activar bot', 'Activate bot');
    button.disabled = busy || (!active && !confirming && !current);
    for (const input of Object.values(fields)) input.disabled = busy || active;
    if (active) setStatus(t('Bot activo. Las señales abren y cierran con SL/TP automáticos.', 'Bot active. Signals open and close with automatic SL/TP.'));
  }
  async function read() {
    setBusy(true);
    try {
      const result = typeof controlsClient?.readStatus === 'function'
        ? await controlsClient.readStatus()
        : {controls: await controlsClient.read(), recovery: null};
      current = result.controls || null;
      funding = result.funding?.stage === 'OBSERVED_EXCLUSIVE_WALLET_FUNDS' ? result.funding : null;
      if (current?.settings) {
        const settings = current.settings;
        if (!fields.margin.value) fields.margin.value = String(settings.margin ?? 10);
        if (!fields.leverage.value) fields.leverage.value = String((settings.leverage ?? 3));
        if (!fields.positions.value) fields.positions.value = String(settings.positions ?? 1);
      }
      if (!current) setStatus(t('Esta cuenta aún no tiene billetera de bot. Prepara la billetera antes de activar.', 'This account has no bot wallet yet. Prepare the wallet before activating.'));
      else if (!result.recovery?.backupVerified) setStatus(t('El respaldo de la billetera aún no está verificado. No se puede activar.', 'The wallet backup is not verified yet. Activation is unavailable.'));
      else if (result.executionAvailable !== true) setStatus(t('El servidor no tiene la ejecución habilitada.', 'The server has execution disabled.'));
      else if (!active && !confirming) setStatus(t('Listo para activar. Revisa margen, apalancamiento y trades a la vez.', 'Ready to activate. Review margin, leverage and trades at once.'));
      render();
    } catch (error) {
      current = null; funding = null;
      setStatus(error?.code === 'session-missing' || error?.code === 'login-required'
        ? t('Inicia sesión con Google para consultar el bot.', 'Sign in with Google to read the bot.')
        : t('No se pudo leer el estado del bot. Inténtalo de nuevo.', 'Could not read the bot state. Try again.'));
      render();
    } finally { setBusy(false); render(); }
  }
  async function pause() {
    setBusy(true);
    try {
      current = await controlsClient.pause({walletAddress: current.walletAddress});
      confirming = false; setStatus(t('Bot pausado. No abrirá nuevas entradas.', 'Bot paused. It will not open new entries.'));
    } catch { setStatus(t('No se confirmó la pausa. Vuelve a consultar.', 'Pause was not confirmed. Read the state again.')); }
    finally { setBusy(false); render(); }
  }
  async function activate(retried = false) {
    const values = inputsValid(); if (!values) return;
    const settings = settingsFrom(values);
    setBusy(true);
    try {
      let state = current;
      if (JSON.stringify(state.settings) !== JSON.stringify(settings)) {
        state = await controlsClient.save({walletAddress: state.walletAddress, expectedRevision: state.revision, settings});
      }
      const review = await controlsClient.prepareActivation({walletAddress: state.walletAddress, expectedRevision: state.revision});
      const next = await controlsClient.activate({review, explicitApproval: true, ...review.platformFee ? {explicitFeeApproval: true} : {}});
      current = next; confirming = false;
      setStatus(t('Bot activado. Solo abrirá con señales nuevas.', 'Bot activated. It will only open on new signals.'));
    } catch (error) {
      // A stale tab can hold an old controls revision after another device or a
      // prior save. Refresh once and retry with the durable revision instead of
      // making the owner reload the whole app.
      if (!retried && error?.code === 'settings-changed') {
        await read();
        if (current?.enabled && !current?.paused) {
          confirming = false;
          setStatus(t('El bot ya está activo. No hace falta activarlo otra vez.', 'The bot is already active. No need to activate it again.'));
          return;
        }
        if (current) { await activate(true); return; }
      }
      setStatus(error?.code === 'invalid-settings'
        ? t('Los límites no son válidos. Revisa margen, apalancamiento y trades.', 'The limits are not valid. Check margin, leverage and trades.')
        : t('No se activó el bot. No se envió ninguna orden.', 'The bot was not activated. No order was sent.'));
    } finally { setBusy(false); render(); }
  }
  button.onclick = () => {
    if (active) { void pause(); return; }
    if (!confirming) {
      const values = inputsValid(); if (!values) return;
      confirming = true;
      setStatus(t(`Vas a activar con ${values.margin} USDC de margen, ${values.leverage}× y ${values.positions} trade(s) a la vez. Pulsa de nuevo para confirmar.`, `You will activate with ${values.margin} USDC margin, ${values.leverage}× and ${values.positions} trade(s) at once. Press again to confirm.`));
      render(); return;
    }
    void activate();
  };
  void read();
  return Object.freeze({section, fields, button, status, read});
}

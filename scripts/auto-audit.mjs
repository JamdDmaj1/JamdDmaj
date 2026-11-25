// Operational audit for the Phoenix AUTO path. Read-only on financial journals;
// the only repair is restarting the manual web boundary when it is down.
import {DatabaseSync} from 'node:sqlite';
import {appendFileSync, existsSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const runtime = '/var/lib/jamddmaj-perps-runtime';
const logPath = '/var/log/jamddmaj-auto-audit.log';
const report = {at: new Date().toISOString(), services: {}, auto: {}, workflows: {}, repairs: [], errors: []};

function service(name) {
  try {
    return execFileSync('systemctl', ['is-active', name], {encoding: 'utf8'}).trim();
  } catch {
    return 'inactive';
  }
}

for (const unit of ['jamddmaj-perps-worker', 'jamddmaj-perps-web', 'caddy']) {
  report.services[unit] = service(unit);
}
if (report.services['jamddmaj-perps-web'] !== 'active') {
  try {
    execFileSync('systemctl', ['start', 'jamddmaj-perps-web'], {stdio: 'ignore'});
    report.repairs.push('started jamddmaj-perps-web');
    report.services['jamddmaj-perps-web'] = service('jamddmaj-perps-web');
  } catch {
    report.errors.push('manual-web-start-failed');
  }
}

function db(path) {
  try {
    if (!existsSync(path)) return null;
    return new DatabaseSync(path, {readOnly: true, timeout: 5000});
  } catch {
    report.errors.push('db-open-failed:' + path);
    return null;
  }
}
function count(connection, sql, ...params) {
  try {
    return Number(connection?.prepare(sql).get(...params)?.n || 0);
  } catch {
    report.errors.push('query-failed');
    return null;
  }
}

const auto = db(`${runtime}/phoenix-auto.sqlite`);
if (auto) {
  report.auto = {
    open: count(auto, "SELECT COUNT(*) n FROM phoenix_auto_signals WHERE state='OPEN'"),
    opening: count(auto, "SELECT COUNT(*) n FROM phoenix_auto_signals WHERE state='OPENING'"),
    closing: count(auto, "SELECT COUNT(*) n FROM phoenix_auto_signals WHERE state='CLOSING'"),
    failed: count(auto, "SELECT COUNT(*) n FROM phoenix_auto_signals WHERE state='FAILED'"),
    closed: count(auto, "SELECT COUNT(*) n FROM phoenix_auto_signals WHERE state='CLOSED'")
  };
  try {
    report.lessons = auto.prepare('SELECT signal,symbol,side,outcome,entry,exit,pnl,reason,updated FROM phoenix_auto_lessons ORDER BY updated DESC LIMIT 8').all();
  } catch {
    report.lessons = [];
  }
  auto.close();
}

const journal = db(`${runtime}/phoenix.sqlite`);
if (journal) {
  report.workflows = {
    held: count(journal, "SELECT COUNT(*) n FROM phoenix_workflows WHERE state='HELD'"),
    settling: count(journal, "SELECT COUNT(*) n FROM phoenix_workflows WHERE state='SETTLING'"),
    canonicalReady: count(journal, "SELECT COUNT(*) n FROM phoenix_workflows WHERE state='CANONICAL_READY'")
  };
  journal.close();
}

try {
  const status = JSON.parse(readFileSync(`${runtime}/worker-status.json`, 'utf8'));
  report.worker = {stage: status.stage, observedAt: status.observedAt, results: status.results};
} catch {
  report.errors.push('worker-status-unavailable');
}

const line = JSON.stringify(report);
appendFileSync(logPath, line + '\n');
console.log(line);

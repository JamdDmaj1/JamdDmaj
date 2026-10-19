import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../ops/perps-controls.Caddyfile',import.meta.url),'utf8');
const unit=readFileSync(new URL('../ops/jamddmaj-perps-https.service',import.meta.url),'utf8');

test('prepared public TLS uses a public ACME IP profile, no internal CA or disabled verification',()=>{
 assert.match(config,/https:\/\/157\.230\.54\.133\s*\{/);
 assert.match(config,/issuer acme\s*\{\s*dir https:\/\/acme-v02\.api\.letsencrypt\.org\/directory\s*profile shortlived/);
 assert.match(config,/disable_http_challenge/);assert.match(config,/auto_https disable_redirects/);
 assert.match(config,/admin off/);assert.match(config,/skip_install_trust/);
 assert.doesNotMatch(config,/tls internal|tls_insecure_skip_verify|trusted_roots|on_demand|log\s*\{/);
});

test('TLS proxy exposes only bounded control routes to loopback and replaces untrusted forwarding headers',()=>{
 assert.match(config,/@controls path \/health \/v1\/automation/);
 assert.match(config,/reverse_proxy 127\.0\.0\.1:8788/);
 assert.match(config,/header_up X-Forwarded-For \{remote_host\}/);
 assert.match(config,/header_up -Cookie/);assert.match(config,/max_size 4096/);
 assert.match(config,/read_header 5s/);assert.match(config,/max_header_size 8KB/);
 assert.match(config,/respond "Not found" 404/);
 assert.doesNotMatch(config,/file_server|root \*|reverse_proxy \{|0\.0\.0\.0:8788/);
});

test('HTTPS unit isolates certificate state and has no custody keys, funding or executor configuration',()=>{
 for(const directive of ['DynamicUser=yes','ProtectSystem=strict','ProtectHome=yes','NoNewPrivileges=yes','PrivateTmp=yes','StateDirectoryMode=0700','CapabilityBoundingSet=CAP_NET_BIND_SERVICE'])assert.ok(unit.includes(directive));
 assert.match(unit,/Requires=jamddmaj-perps-controls\.service/);
 assert.doesNotMatch(unit,/EnvironmentFile=|master\.key|custody|\.env|bitget|MODE=execute|PrivateKey/);
});

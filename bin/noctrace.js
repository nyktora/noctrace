#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { enableMcp, disableMcp } from './claude-config.js';

const NOCTRACE_PORT = 4117;
const NOCTRACE_BASE_URL = `http://localhost:${NOCTRACE_PORT}`;
const HOOKS_ENDPOINT = `${NOCTRACE_BASE_URL}/api/hooks`;

/**
 * The set of Claude Code hook event names noctrace subscribes to.
 */
const HOOK_EVENT_NAMES = [
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'PreCompact',
  'PostCompact',
  'SessionStart',
  'SessionEnd',
  'PermissionRequest',
  'PermissionDenied',
  'WorktreeCreate',
  'WorktreeRemove',
];

/**
 * Check if a hook entry array contains a noctrace hook (either old command-type or new http-type).
 */
function hasNoctraceHook(entry) {
  return Array.isArray(entry.hooks) &&
    entry.hooks.some(
      (h) =>
        (h.type === 'command' && typeof h.command === 'string' && h.command.includes(HOOKS_ENDPOINT)) ||
        (h.type === 'http' && h.url === HOOKS_ENDPOINT),
    );
}

/**
 * Read and parse ~/.claude/settings.json.
 * Returns an empty object if the file doesn't exist yet.
 */
async function readSettings(settingsPath) {
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

/**
 * Write settings back to disk, creating parent directories as needed.
 */
async function writeSettings(settingsPath, settings) {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

/**
 * Install noctrace hooks into ~/.claude/settings.json.
 * For each hook event name, adds an HTTP hook pointing at the noctrace endpoint.
 * Detects both old command-type and new http-type hooks to avoid duplicates.
 */
async function installHooks() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = await readSettings(settingsPath);

  if (!settings.hooks) settings.hooks = {};

  const added = [];
  const skipped = [];

  for (const eventName of HOOK_EVENT_NAMES) {
    if (!settings.hooks[eventName]) settings.hooks[eventName] = [];

    const existing = settings.hooks[eventName];

    // Check whether a noctrace hook is already registered (either old command or new http format)
    const alreadyInstalled = existing.some(hasNoctraceHook);

    if (alreadyInstalled) {
      skipped.push(eventName);
      continue;
    }

    existing.push({
      hooks: [{
        type: 'http',
        url: HOOKS_ENDPOINT,
        async: true,
      }],
    });

    added.push(eventName);
  }

  await writeSettings(settingsPath, settings);

  if (added.length > 0) {
    console.log(`[noctrace] Installed hooks for: ${added.join(', ')}`);
  }
  if (skipped.length > 0) {
    console.log(`[noctrace] Already installed (skipped): ${skipped.join(', ')}`);
  }
  console.log(`[noctrace] Settings written to: ${settingsPath}`);
  console.log(`[noctrace] Hook events will be forwarded to ${HOOKS_ENDPOINT}`);
}

/**
 * Remove noctrace hooks from ~/.claude/settings.json.
 * Removes both old command-type and new http-type hooks.
 * Iterates all hook event keys (not just HOOK_EVENT_NAMES) to clean up orphaned entries.
 */
async function uninstallHooks() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = await readSettings(settingsPath);

  if (!settings.hooks) {
    console.log('[noctrace] No hooks section found in settings.json — nothing to remove.');
    return;
  }

  const removed = [];

  // Iterate ALL hook event keys (not just current HOOK_EVENT_NAMES) to clean up orphaned old entries
  for (const eventName of Object.keys(settings.hooks)) {
    const existing = settings.hooks[eventName];
    if (!Array.isArray(existing)) continue;

    const before = existing.length;
    settings.hooks[eventName] = existing.filter((entry) => !hasNoctraceHook(entry));

    if (settings.hooks[eventName].length < before) {
      removed.push(eventName);
    }

    // Clean up empty arrays
    if (settings.hooks[eventName].length === 0) {
      delete settings.hooks[eventName];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  await writeSettings(settingsPath, settings);

  if (removed.length > 0) {
    console.log(`[noctrace] Removed hooks for: ${removed.join(', ')}`);
    console.log(`[noctrace] Settings written to: ${settingsPath}`);
  } else {
    console.log('[noctrace] No noctrace hooks found — nothing to remove.');
  }
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes('--install-hooks')) {
  await installHooks();
  process.exit(0);
}

if (args.includes('--uninstall-hooks')) {
  await uninstallHooks();
  process.exit(0);
}

if (args.includes('--enable')) {
  const { alreadyConfigured } = await enableMcp();
  if (alreadyConfigured) {
    console.log('[noctrace] MCP server entry updated.');
  } else {
    console.log('[noctrace] ✓ Noctrace will auto-start with your next Claude Code session.');
    console.log('[noctrace]   Run "noctrace --disable" to remove.');
  }
  process.exit(0);
}

if (args.includes('--disable')) {
  const { wasConfigured } = await disableMcp();
  if (wasConfigured) {
    console.log('[noctrace] ✓ Noctrace removed from Claude Code.');
  } else {
    console.log('[noctrace] Noctrace is not configured in Claude Code.');
  }
  process.exit(0);
}

if (args.includes('--docker')) {
  const containerArg = args[args.indexOf('--docker') + 1];
  if (!containerArg || containerArg.startsWith('--')) {
    console.error('[noctrace] Usage: npx noctrace --docker <container-name-or-id>');
    console.error('[noctrace] Example: npx noctrace --docker my-claude-container');
    process.exit(1);
  }

  const { execFileSync, spawn: spawnChild } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');

  // Validate container name to prevent command injection
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(containerArg)) {
    console.error(`[noctrace] Invalid container name: "${containerArg}"`);
    process.exit(1);
  }

  // Verify container exists and is running
  try {
    execFileSync('docker', ['inspect', '--format', '{{.State.Running}}', containerArg], { stdio: 'pipe' });
  } catch {
    console.error(`[noctrace] Container "${containerArg}" not found or not running.`);
    console.error(`[noctrace] Check: docker ps`);
    process.exit(1);
  }

  // Find Claude config dir inside the container
  const claudeDir = execFileSync(
    'docker', ['exec', containerArg, 'sh', '-c', 'echo ${CLAUDE_CONFIG_DIR:-$HOME/.claude}'],
    { stdio: 'pipe' },
  ).toString().trim();

  console.log(`[noctrace] Connecting to container "${containerArg}" (claude dir: ${claudeDir})`);

  // Check if curl or wget exists in the container
  let httpTool = 'none';
  try {
    execFileSync('docker', ['exec', containerArg, 'which', 'curl'], { stdio: 'pipe' });
    httpTool = 'curl';
  } catch {
    try {
      execFileSync('docker', ['exec', containerArg, 'which', 'wget'], { stdio: 'pipe' });
      httpTool = 'wget';
    } catch { /* neither */ }
  }

  if (httpTool === 'none') {
    console.error('[noctrace] Container has neither curl nor wget. Cannot stream sessions.');
    console.error('[noctrace] Install curl in the container: apt-get install -y curl');
    process.exit(1);
  }

  // Resolve host URL that the container can reach
  let hostUrl;
  try {
    execFileSync('docker', ['exec', containerArg, 'getent', 'hosts', 'host.docker.internal'], { stdio: 'pipe' });
    hostUrl = 'http://host.docker.internal';
  } catch {
    // Fall back to container gateway IP (Linux without host.docker.internal)
    try {
      const gatewayIp = execFileSync(
        'docker', ['inspect', '--format', '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}', containerArg],
        { stdio: 'pipe' },
      ).toString().trim();
      hostUrl = gatewayIp ? `http://${gatewayIp}` : 'http://host.docker.internal';
    } catch {
      hostUrl = 'http://host.docker.internal';
    }
  }

  // Start noctrace server on the host
  process.env.NOCTRACE_NO_AUTOSTART = '1';
  process.env.NODE_ENV = 'production';
  const { startServer } = await import('../dist/server/server/index.js');
  const openMod = await import('open');
  const port = await startServer();
  const url = `http://localhost:${port}`;
  const containerTargetUrl = `${hostUrl}:${port}`;
  console.log(`[noctrace] Dashboard: ${url}`);
  console.log(`[noctrace] Container will stream to: ${containerTargetUrl}`);
  await openMod.default(url);

  // Read the watcher script from the package
  const watcherScript = readFileSync(
    new URL('./docker-watcher.sh', import.meta.url), 'utf8'
  );

  // Inject the watcher script into the container and run it in the background
  console.log(`[noctrace] Injecting watcher into container...`);
  const watcherProc = spawnChild('docker', [
    'exec', '-d', containerArg, 'sh', '-c',
    `${watcherScript.replace(/'/g, "'\\''")}\nexit 0`,
    '--', claudeDir, containerTargetUrl, containerArg,
  ], { stdio: 'pipe' });

  // Actually, docker exec -d doesn't let us pass the script via -c easily with args.
  // Better approach: pipe the script content via stdin
  // Let's use a simpler method: write the script to a temp file in the container, then exec it

  // Kill the -d attempt (it won't work with complex scripts)
  watcherProc.kill();

  // Copy script into container and run it
  const tmpScript = path.join(os.tmpdir(), `noctrace-watcher-${Date.now()}.sh`);
  const { writeFileSync, unlinkSync } = await import('node:fs');
  writeFileSync(tmpScript, watcherScript);

  execFileSync('docker', ['cp', tmpScript, `${containerArg}:/tmp/noctrace-watcher.sh`], { stdio: 'pipe' });
  execFileSync('docker', ['exec', containerArg, 'chmod', '+x', '/tmp/noctrace-watcher.sh'], { stdio: 'pipe' });
  unlinkSync(tmpScript);

  // Run the watcher in the background inside the container
  const watcherBg = spawnChild('docker', [
    'exec', '-d', containerArg,
    'sh', '-c', `/tmp/noctrace-watcher.sh "${claudeDir}" "${containerTargetUrl}" "${containerArg}"`,
  ], { stdio: 'ignore' });

  watcherBg.on('error', () => {}); // swallow spawn errors

  console.log(`[noctrace] Watcher injected. Streaming sessions in real-time.`);
  console.log(`[noctrace] Press Ctrl+C to stop.`);

  // Monitor heartbeats
  let lastHeartbeatCheck = Date.now();
  const heartbeatInterval = setInterval(async () => {
    try {
      const { default: http } = await import('node:http');
      const result = await new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/api/docker/status`, { timeout: 2000 }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
        });
        req.on('error', () => resolve(null));
      });

      if (result && result.containers) {
        const container = result.containers.find((c) => c.name === containerArg);
        if (container && container.stale && Date.now() - lastHeartbeatCheck > 30000) {
          console.log(`[noctrace] Warning: No heartbeat from container "${containerArg}" in 30s. It may have stopped.`);
          lastHeartbeatCheck = Date.now();
        }
      }
    } catch { /* heartbeat check is best-effort */ }
  }, 15000);

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n[noctrace] Stopping...');
    clearInterval(heartbeatInterval);
    // Kill the watcher inside the container
    try {
      execFileSync('docker', ['exec', containerArg, 'sh', '-c', 'pkill -f noctrace-watcher 2>/dev/null || true'], { stdio: 'pipe', timeout: 3000 });
    } catch { /* container may be gone */ }
    console.log('[noctrace] Stopped.');
    process.exit(0);
  });
  process.on('SIGTERM', () => process.exit(0));

  // Keep process alive
  await new Promise(() => {});
}

if (args.includes('--mcp')) {
  // MCP mode: boot the Express server and speak JSON-RPC over stdio.
  // stdout is the JSON-RPC channel — all logging must go to stderr.
  process.stderr.write('[noctrace-mcp] Starting MCP server...\n');
  await import('./noctrace-mcp.js');
  // noctrace-mcp.js takes over from here (runs main() internally)
  process.exit(0); // unreachable — mcp keeps process alive via readline
}

// Default: start the server and open the browser
process.env.NOCTRACE_NO_AUTOSTART = '1';
process.env.NODE_ENV = 'production';
const { startServer } = await import('../dist/server/server/index.js');
const open = (await import('open')).default;
const port = await startServer();
const url = `http://localhost:${port}`;
await open(url);

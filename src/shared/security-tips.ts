/**
 * Security tips detection engine.
 * Scans WaterfallRow[] for credential leaks, dangerous commands, and
 * adversarial content patterns, then attaches per-row tips.
 * Pure module: no file I/O, no side effects beyond mutating the rows array.
 */
import type { WaterfallRow, EfficiencyTip } from './types.js';

// ---------------------------------------------------------------------------
// Pre-compiled regex constants
// ---------------------------------------------------------------------------

/** Matches common API key / secret token patterns. */
const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /sk-[a-zA-Z0-9]{20,}/,
  /sk-ant-[a-zA-Z0-9-]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /npm_[a-zA-Z0-9]{36}/,
  /xoxb-[0-9]{10,}/,
  /-----BEGIN .{0,30}PRIVATE KEY-----/,
];

/** curl/wget piped directly to a shell interpreter. */
const CURL_PIPE_BASH = /curl[^|]*\|[^|]*(bash|sh|zsh|python|node)\b|wget[^|]*\|[^|]*(bash|sh)\b|eval\s*\$\(curl/;

/** Outbound data transfer via curl/wget/nc. */
const DATA_EXFIL = /curl[^&\n]*(-d\s|--data|--data-raw|-F\s)|cat[^|]*\|[^|]*(curl|wget|nc)\b|base64[^|]*\|[^|]*(curl|wget)\b/;

/** localhost / loopback exclusion for data exfiltration. */
const LOCALHOST_PATTERN = /localhost|127\.0\.0\.1/;

/** Write/Edit to shell profile files. */
const SHELL_PROFILE = /\.(bashrc|zshrc|bash_profile|zprofile|profile)$/;

/** Zero-width and bidirectional Unicode control characters. */
const HIDDEN_UNICODE = /[\u200B\u200C\u200D\u2060\uFEFF\u202A-\u202E]/;

/** Individual prompt-injection keyword patterns. */
const INJECTION_KEYWORDS: RegExp[] = [
  /ignore.*previous.*instructions/i,
  /disregard.*above/i,
  /you are now/i,
  /new instructions:/i,
  /system prompt/i,
];

/** Destructive shell / SQL commands. */
const DESTRUCTIVE_CMD = /rm\s+.*-.*r.*-.*f|rm\s+-rf|DROP\s+(TABLE|DATABASE)|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*;/i;

/** git push --force (but NOT --force-with-lease). */
const FORCE_PUSH = /git\s+push\s+.*--force(?!-with-lease)|git\s+push\s+.*-f\b/;

/** Sensitive credential / config file paths. */
const SENSITIVE_FILE = /\.env($|\.)|\.pem$|\.key$|id_rsa|id_ed25519|\.ssh\/|credentials\.json|\.aws\/|\.npmrc|\.docker\/config|kubeconfig/;

/** Overly permissive chmod. */
const PERMISSION_WEAKENING = /chmod\s+(777|666)|chmod\s+-R\s+7/;

/** sudo invocation at the start of a command. */
const SUDO_CMD = /^sudo\s/;

/** Binary file downloaded from the internet. */
const BINARY_DOWNLOAD = /curl[^&\n]*-o[^&\n]*\.(sh|bin|exe)|wget[^&\n]*\.(sh|bin|exe|deb|rpm)/;

/** Tool names that operate on files (Write / Edit / MultiEdit). */
const FILE_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

/** Maximum number of output characters to scan (performance guard). */
const OUTPUT_SCAN_LIMIT = 3000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Append a tip to a row, skipping duplicates by tip id.
 */
function addTip(row: WaterfallRow, tip: EfficiencyTip): void {
  if (!row.tips.some((t) => t.id === tip.id)) {
    row.tips.push(tip);
  }
}

/**
 * Return the first OUTPUT_SCAN_LIMIT characters of a string, or '' if null.
 */
function truncatedOutput(output: string | null): string {
  if (output === null) return '';
  return output.length > OUTPUT_SCAN_LIMIT ? output.slice(0, OUTPUT_SCAN_LIMIT) : output;
}

/**
 * Return true if any SECRET_PATTERNS regex matches the given text.
 */
function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/**
 * Return true if the output text appears to contain prompt-injection patterns.
 * Requires 2+ distinct keyword matches within 200 characters of each other.
 * Skips Markdown documentation files (too many false positives).
 */
function hasPossibleInjection(output: string, filePath: string | null): boolean {
  if (filePath !== null && filePath.endsWith('.md')) return false;

  const matches: number[] = [];
  for (const re of INJECTION_KEYWORDS) {
    const m = re.exec(output);
    if (m !== null) matches.push(m.index);
  }

  if (matches.length < 2) return false;

  // Check whether any two match positions are within 200 chars of each other.
  const sorted = matches.slice().sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] - sorted[i] <= 200) return true;
  }
  return false;
}

/**
 * Flatten rows and all their children into a single ordered array.
 */
function flattenRows(rows: WaterfallRow[]): WaterfallRow[] {
  const result: WaterfallRow[] = [];
  for (const row of rows) {
    result.push(row);
    if (row.children.length > 0) {
      result.push(...flattenRows(row.children));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan rows for security-relevant patterns and attach tips. Mutates rows in place.
 *
 * Detection rules (CRITICAL):
 * 1. secrets-in-output      — credential patterns in tool output
 * 2. secrets-in-command     — credential patterns in Bash input.command
 * 3. curl-pipe-bash         — remote code execution via pipe
 * 4. data-exfiltration      — outbound data transfer (excluding localhost)
 * 5. shell-profile-mod      — Write/Edit to .bashrc / .zshrc etc.
 * 6. hidden-unicode         — zero-width / bidirectional chars in output
 * 7. prompt-injection       — instruction-like text in tool output
 *
 * Detection rules (WARNING):
 * 8.  destructive-command   — rm -rf, DROP TABLE, DELETE without WHERE
 * 9.  force-push            — git push --force (not --force-with-lease)
 * 10. sensitive-file        — .env, .pem, .key, .ssh/, AWS/npm credentials
 * 11. permission-weakening  — chmod 777/666
 * 12. sudo-usage            — sudo at the start of a command
 *
 * Detection rules (INFO):
 * 13. binary-download       — curl/wget downloading .sh / .bin / .exe
 *
 * @param rows Top-level WaterfallRow[] (may include agent rows with children).
 */
export function attachSecurityTips(rows: WaterfallRow[]): void {
  const flat = flattenRows(rows);

  for (const row of flat) {
    if (row.type !== 'tool') continue;

    const output = truncatedOutput(row.output);
    const command =
      row.toolName === 'Bash' && typeof row.input['command'] === 'string'
        ? (row.input['command'] as string)
        : null;
    const filePath =
      FILE_WRITE_TOOLS.has(row.toolName) && typeof row.input['file_path'] === 'string'
        ? (row.input['file_path'] as string)
        : null;
    const readFilePath =
      row.toolName === 'Read' && typeof row.input['file_path'] === 'string'
        ? (row.input['file_path'] as string)
        : null;
    const anyFilePath = filePath ?? readFilePath;

    // ------------------------------------------------------------------
    // 1. secrets-in-output (CRITICAL)
    // ------------------------------------------------------------------
    if (output && containsSecret(output)) {
      addTip(row, {
        id: 'secrets-in-output',
        title: 'Secret detected in output',
        message:
          'An API key or secret token appeared in this tool output. It is now in your session log on disk. ' +
          'Rotate the credential and add the source file to .gitignore.',
        severity: 'critical',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 2. secrets-in-command (CRITICAL)
    // ------------------------------------------------------------------
    if (command !== null && containsSecret(command)) {
      addTip(row, {
        id: 'secrets-in-command',
        title: 'Secret in command',
        message:
          'A credential appears to be hardcoded in this shell command. Use environment variables instead.',
        severity: 'critical',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 3. curl-pipe-bash (CRITICAL)
    // ------------------------------------------------------------------
    if (command !== null && CURL_PIPE_BASH.test(command)) {
      addTip(row, {
        id: 'curl-pipe-bash',
        title: 'Remote code execution',
        message:
          'Downloading and piping directly to a shell interpreter. This bypasses security checks. ' +
          'Review the URL and consider using a package manager.',
        severity: 'critical',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 4. data-exfiltration (CRITICAL)
    // ------------------------------------------------------------------
    if (command !== null && DATA_EXFIL.test(command) && !LOCALHOST_PATTERN.test(command)) {
      addTip(row, {
        id: 'data-exfiltration',
        title: 'Outbound data transfer',
        message:
          'Data is being sent to an external URL. Verify the destination and confirm no sensitive data is being transmitted.',
        severity: 'critical',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 5. shell-profile-mod (CRITICAL)
    // ------------------------------------------------------------------
    if (filePath !== null && SHELL_PROFILE.test(filePath)) {
      addTip(row, {
        id: 'shell-profile-mod',
        title: 'Shell profile modified',
        message:
          'Changes to shell profiles persist across all future terminal sessions. Review what was added.',
        severity: 'critical',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 6. hidden-unicode (CRITICAL)
    // ------------------------------------------------------------------
    if (output && HIDDEN_UNICODE.test(output)) {
      addTip(row, {
        id: 'hidden-unicode',
        title: 'Hidden Unicode characters',
        message:
          'Invisible control characters detected in tool output. These can conceal instructions that ' +
          'Claude processes but humans cannot see.',
        severity: 'critical',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 7. prompt-injection (CRITICAL)
    // ------------------------------------------------------------------
    if (output && hasPossibleInjection(output, anyFilePath)) {
      addTip(row, {
        id: 'prompt-injection',
        title: 'Possible prompt injection',
        message:
          'Tool output contains instruction-like text that could manipulate Claude. This may indicate ' +
          'adversarial content in project files or dependencies.',
        severity: 'critical',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 8. destructive-command (WARNING)
    // ------------------------------------------------------------------
    if (command !== null && DESTRUCTIVE_CMD.test(command)) {
      addTip(row, {
        id: 'destructive-command',
        title: 'Destructive command',
        message: 'This command can cause irreversible data loss. Verify the target is correct.',
        severity: 'warning',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 9. force-push (WARNING)
    // ------------------------------------------------------------------
    if (command !== null && FORCE_PUSH.test(command)) {
      addTip(row, {
        id: 'force-push',
        title: 'Force push',
        message:
          'Force push rewrites remote history. Use --force-with-lease for safer pushes, or verify this is intentional.',
        severity: 'warning',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 10. sensitive-file (WARNING) — Read, Write, Edit, MultiEdit
    // ------------------------------------------------------------------
    const sensitiveFilePath =
      typeof row.input['file_path'] === 'string' ? (row.input['file_path'] as string) : null;
    if (sensitiveFilePath !== null && SENSITIVE_FILE.test(sensitiveFilePath)) {
      addTip(row, {
        id: 'sensitive-file',
        title: 'Sensitive file accessed',
        message:
          'Credential file contents are now in the session log (~/.claude/projects/). Consider whether this access was necessary.',
        severity: 'warning',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 11. permission-weakening (WARNING)
    // ------------------------------------------------------------------
    if (command !== null && PERMISSION_WEAKENING.test(command)) {
      addTip(row, {
        id: 'permission-weakening',
        title: 'Overly permissive permissions',
        message: 'World-writable permissions (777/666). Use 755 for directories, 644 for files.',
        severity: 'warning',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 12. sudo-usage (WARNING)
    // ------------------------------------------------------------------
    if (command !== null && SUDO_CMD.test(command)) {
      addTip(row, {
        id: 'sudo-usage',
        title: 'Root privilege escalation',
        message:
          'Claude should not need sudo for development tasks. Consider a non-root approach.',
        severity: 'warning',
        category: 'security',
      });
    }

    // ------------------------------------------------------------------
    // 13. binary-download (INFO)
    // ------------------------------------------------------------------
    if (command !== null && BINARY_DOWNLOAD.test(command)) {
      addTip(row, {
        id: 'binary-download',
        title: 'Binary download',
        message:
          'Binary downloaded from the internet. Verify the source URL and consider using a package manager with signature verification.',
        severity: 'info',
        category: 'security',
      });
    }
  }
}

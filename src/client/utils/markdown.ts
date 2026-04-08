/**
 * Minimal inline markdown renderer. No dependencies.
 * Handles: headings, bold, italic, code blocks, inline code, lists, links, hr.
 * Does NOT handle: tables, images, HTML passthrough.
 */

/** Escape HTML special characters to prevent XSS */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Apply inline markdown transforms: bold, italic, inline code, links */
function applyInline(text: string): string {
  // Inline code (must come before bold/italic to avoid conflicts)
  text = text.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);
  // Bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic (single asterisk, not preceded/followed by another asterisk)
  text = text.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return text;
}

/**
 * Convert basic markdown to an HTML string.
 * Input is sanitized (HTML tags stripped) before processing.
 * Handles headings, bold, italic, code blocks, inline code, lists, links, hr.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];

  let inCodeBlock = false;
  let codeLang = '';
  let codeLines: string[] = [];

  let inUl = false;
  let inOl = false;

  function closeList(): void {
    if (inUl) { output.push('</ul>'); inUl = false; }
    if (inOl) { output.push('</ol>'); inOl = false; }
  }

  function flushCode(): void {
    const escaped = codeLines.map(escapeHtml).join('\n');
    const langAttr = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
    output.push(`<pre><code${langAttr}>${escaped}</code></pre>`);
    codeLines = [];
    codeLang = '';
  }

  for (const rawLine of lines) {
    // Code block fence
    if (rawLine.trim().startsWith('```')) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        closeList();
        inCodeBlock = true;
        codeLang = rawLine.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    // Sanitize the line before processing markdown syntax
    // We escape first, then selectively allow our own tags via inline transforms
    const line = rawLine;

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      closeList();
      output.push('<hr>');
      continue;
    }

    // Headings: # through #### map to h3–h6 for visual compactness
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = Math.min(headingMatch[1].length + 2, 6); // #→h3, ##→h4, ###→h5, ####→h6
      const content = applyInline(escapeHtml(headingMatch[2]));
      output.push(`<h${level}>${content}</h${level}>`);
      continue;
    }

    // Unordered list item
    const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) { output.push('</ol>'); inOl = false; }
      if (!inUl) { output.push('<ul>'); inUl = true; }
      output.push(`<li>${applyInline(escapeHtml(ulMatch[2]))}</li>`);
      continue;
    }

    // Ordered list item
    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (!inOl) { output.push('<ol>'); inOl = true; }
      output.push(`<li>${applyInline(escapeHtml(olMatch[1]))}</li>`);
      continue;
    }

    // Blank line = paragraph break
    if (line.trim() === '') {
      closeList();
      output.push('<p></p>');
      continue;
    }

    // Regular paragraph line
    closeList();
    output.push(`<p>${applyInline(escapeHtml(line))}</p>`);
  }

  // Flush any unclosed blocks
  if (inCodeBlock) flushCode();
  closeList();

  return output.join('\n');
}

/** Heuristic: does the text look like markdown? Returns true if 2+ indicators found. */
export function looksLikeMarkdown(text: string): boolean {
  let score = 0;
  if (/^#{1,4}\s/m.test(text)) score++;          // headings
  if (/\*\*[^*]+\*\*/.test(text)) score++;        // bold
  if (/(?<!\*)\*(?!\*)[^*]+(?<!\*)\*(?!\*)/.test(text)) score++; // italic
  if (/```/.test(text)) score++;                   // code fences
  if (/^[-*]\s/m.test(text)) score++;              // unordered list
  if (/^\d+\.\s/m.test(text)) score++;             // ordered list
  if (/\[.+\]\(.+\)/.test(text)) score++;          // links
  if (/`[^`]+`/.test(text)) score++;               // inline code
  return score >= 2;
}

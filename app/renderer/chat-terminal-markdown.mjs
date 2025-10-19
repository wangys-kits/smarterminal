/* Markdown rendering utilities for ChatTerminal */

export class MarkdownRenderer {
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderMarkdown(markdownText) {
    if (!markdownText) return '<p class="markdown-empty">(empty markdown cell)</p>';

    const codeBlocks = [];
    let text = markdownText.replace(/\r\n/g, '\n');

    text = text.replace(/```([\s\S]*?)```/g, (_, code) => {
      const token = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(`<pre><code>${this.escapeHtml(code.trimEnd())}</code></pre>`);
      return token;
    });

    const lines = text.split('\n');
    const blocks = [];

    const isHeading = (line) => /^ {0,3}#{1,6}\s+/.test(line);
    const isUlItem = (line) => /^ {0,3}[-*+]\s+/.test(line);
    const isOlItem = (line) => /^ {0,3}\d+\.\s+/.test(line);
    const isBlockquote = (line) => /^ {0,3}>\s?/.test(line);
    const isHr = (line) => /^ {0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line.trim());

    let i = 0;
    while (i < lines.length) {
      let line = lines[i];
      if (!line.trim()) { i++; continue; }

      if (isHr(line)) {
        blocks.push('<hr />');
        i++;
        continue;
      }

      const codeMatch = line.match(/__CODE_BLOCK_(\d+)__/);
      if (codeMatch) {
        const idx = parseInt(codeMatch[1], 10);
        if (!Number.isNaN(idx) && codeBlocks[idx]) {
          blocks.push(codeBlocks[idx]);
        }
        i++;
        continue;
      }

      if (isHeading(line)) {
        const level = (line.match(/^ {0,3}(#{1,6})\s+/) || ['','#'])[1].length;
        const content = line.replace(/^ {0,3}#{1,6}\s+/, '');
        blocks.push(`<h${level}>${this.renderMarkdownInline(content)}</h${level}>`);
        i++;
        continue;
      }

      if (isBlockquote(line)) {
        const quoteLines = [];
        while (i < lines.length && isBlockquote(lines[i])) {
          quoteLines.push(lines[i].replace(/^ {0,3}>\s?/, ''));
          i++;
        }
        const innerHtml = this.renderMarkdown(quoteLines.join('\n'));
        blocks.push(`<blockquote>${innerHtml}</blockquote>`);
        continue;
      }

      if (isUlItem(line)) {
        const items = [];
        while (i < lines.length && isUlItem(lines[i])) {
          items.push(lines[i].replace(/^ {0,3}[-*+]\s+/, ''));
          i++;
        }
        const htmlItems = items
          .map(item => `<li>${this.renderMarkdownInline(item)}</li>`)
          .join('');
        blocks.push(`<ul>${htmlItems}</ul>`);
        continue;
      }

      if (isOlItem(line)) {
        const items = [];
        while (i < lines.length && isOlItem(lines[i])) {
          items.push(lines[i].replace(/^ {0,3}\d+\.\s+/, ''));
          i++;
        }
        const htmlItems = items
          .map(item => `<li>${this.renderMarkdownInline(item)}</li>`)
          .join('');
        blocks.push(`<ol>${htmlItems}</ol>`);
        continue;
      }

      const paragraphLines = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !isHeading(lines[i]) &&
        !isUlItem(lines[i]) &&
        !isOlItem(lines[i]) &&
        !isBlockquote(lines[i]) &&
        !lines[i].includes('__CODE_BLOCK_')
      ) {
        paragraphLines.push(lines[i]);
        i++;
      }

      const paragraph = paragraphLines.join('\n');
      blocks.push(`<p>${this.renderMarkdownInline(paragraph)}</p>`);
    }

    return blocks.join('\n') || '<p class="markdown-empty">(empty markdown cell)</p>';
  }

  renderMarkdownInline(text) {
    if (!text) return '';
    let escaped = this.escapeHtml(text);

    // Images
    escaped = escaped.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2" />');

    // Links
    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Inline code
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold and italics
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, (match, content, offset, str) => {
      const prev = offset > 0 ? str[offset - 1] : '';
      const next = str[offset + match.length];
      if ((prev && /\w/.test(prev)) || (next && /\w/.test(next))) return match;
      return `<em>${content}</em>`;
    });
    escaped = escaped.replace(/_([^_]+)_/g, (match, content, offset, str) => {
      const prev = offset > 0 ? str[offset - 1] : '';
      const next = str[offset + match.length];
      if ((prev && /\w/.test(prev)) || (next && /\w/.test(next))) return match;
      return `<em>${content}</em>`;
    });

    // Strikethrough
    escaped = escaped.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');

    // Line breaks
    escaped = escaped.replace(/\n/g, '<br />');

    return escaped;
  }
}

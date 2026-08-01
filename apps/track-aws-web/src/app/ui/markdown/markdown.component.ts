import { Component, Input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

@Component({
  standalone: true,
  selector: 'ta-markdown',
  template: `<div class="ta-md" [innerHTML]="html"></div>`,
  styles: [
    `
      .ta-md {
        line-height: 1.55;
        color: var(--ta-text);
      }
      :host ::ng-deep .ta-md h1,
      :host ::ng-deep .ta-md h2,
      :host ::ng-deep .ta-md h3 {
        font-family: var(--ta-font-display);
        margin: 1.1rem 0 0.45rem;
      }
      :host ::ng-deep .ta-md h1 {
        font-size: 1.45rem;
      }
      :host ::ng-deep .ta-md h2 {
        font-size: 1.15rem;
        color: var(--ta-accent);
      }
      :host ::ng-deep .ta-md h3 {
        font-size: 1rem;
      }
      :host ::ng-deep .ta-md p,
      :host ::ng-deep .ta-md li {
        color: var(--ta-text-muted);
        margin: 0.35rem 0;
      }
      :host ::ng-deep .ta-md code {
        font-family: var(--ta-font-mono);
        font-size: 0.85em;
        background: var(--ta-bg-panel);
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
      }
      :host ::ng-deep .ta-md table {
        width: 100%;
        border-collapse: collapse;
        margin: 0.75rem 0;
        font-size: 0.9rem;
      }
      :host ::ng-deep .ta-md th,
      :host ::ng-deep .ta-md td {
        border: 1px solid var(--ta-border);
        padding: 0.45rem 0.55rem;
        text-align: left;
      }
      :host ::ng-deep .ta-md ul,
      :host ::ng-deep .ta-md ol {
        padding-left: 1.2rem;
      }
      :host ::ng-deep .ta-md hr {
        border: 0;
        border-top: 1px solid var(--ta-border);
        margin: 1.25rem 0;
      }
      :host ::ng-deep .ta-md strong {
        color: var(--ta-text);
      }
    `,
  ],
})
export class MarkdownComponent {
  html: SafeHtml = '';

  constructor(private readonly sanitizer: DomSanitizer) {}

  @Input()
  set content(value: string | null | undefined) {
    this.html = this.sanitizer.bypassSecurityTrustHtml(
      renderMarkdown(value ?? ''),
    );
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  const closeTable = () => {
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeLists();
      closeTable();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      closeLists();
      closeTable();
      out.push('<hr />');
      continue;
    }
    if (line.startsWith('# ')) {
      closeLists();
      closeTable();
      out.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('## ')) {
      closeLists();
      closeTable();
      out.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('### ')) {
      closeLists();
      closeTable();
      out.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
      continue;
    }
    if (line.includes('|') && line.trim().startsWith('|')) {
      closeLists();
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (!inTable) {
        out.push('<table><thead><tr>');
        out.push(cells.map((c) => `<th>${inlineFormat(c)}</th>`).join(''));
        out.push('</tr></thead><tbody>');
        inTable = true;
      } else {
        out.push(
          `<tr>${cells.map((c) => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`,
        );
      }
      continue;
    }
    closeTable();
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${inlineFormat(ul[1])}</li>`);
      continue;
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${inlineFormat(ol[1])}</li>`);
      continue;
    }
    closeLists();
    out.push(`<p>${inlineFormat(line)}</p>`);
  }
  closeLists();
  closeTable();
  return out.join('\n');
}

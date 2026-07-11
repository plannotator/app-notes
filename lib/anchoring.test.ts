import { beforeEach, describe, expect, test } from 'bun:test';
import { parseHTML } from 'linkedom';
import {
  createAnnotationAnchor,
  getUniqueSelector,
  querySelectorDeep,
  resolveAnnotationAnchor,
} from './anchoring';

beforeEach(() => {
  installDocument('<!doctype html><html><body></body></html>');
});

describe('durable element anchoring', () => {
  test('prefers a unique semantic attribute and tolerates mutable visible text', () => {
    const document = installDocument(`
      <main>
        <button data-testid="save-profile">Save (1)</button>
        <button>Cancel</button>
      </main>
    `);
    const target = requireElement(document.querySelector('[data-testid="save-profile"]'));
    const anchor = createAnnotationAnchor(target, target.getBoundingClientRect());

    expect(anchor.selector).toBe('button[data-testid="save-profile"]');
    target.textContent = 'Save (2)';
    expect(resolveAnnotationAnchor(anchor)).toBe(target);
  });

  test('fails closed when a structural selector moves to different content', () => {
    const document = installDocument(`
      <ul>
        <li class="item">Alpha</li>
        <li class="item">Beta</li>
      </ul>
    `);
    const items = document.querySelectorAll('li');
    const target = requireElement(items[1] ?? null);
    const anchor = createAnnotationAnchor(target, target.getBoundingClientRect());
    const prepended = document.createElement('li');
    prepended.className = 'item';
    prepended.textContent = 'New';
    target.parentElement?.prepend(prepended);

    expect(resolveAnnotationAnchor(anchor)).toBeNull();
  });

  test('does not trust duplicate IDs on creation or restore', () => {
    const document = installDocument(`
      <section><button id="duplicate">First</button></section>
      <section><button id="duplicate">Second</button></section>
    `);
    const buttons = document.querySelectorAll('button');
    const target = requireElement(buttons[1] ?? null);

    expect(getUniqueSelector(target)).not.toBe('#duplicate');
    expect(querySelectorDeep('#duplicate')).toBeNull();
  });

  test('round-trips selector chains through an open shadow root', () => {
    const document = installDocument('<div id="widget"></div>');
    const host = requireElement(document.querySelector('#widget'));
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '<button aria-label="Finish">Done</button>';
    const target = requireElement(shadowRoot.querySelector('button'));
    const anchor = createAnnotationAnchor(target, target.getBoundingClientRect());

    expect(anchor.selector).toContain(' >>> ');
    expect(resolveAnnotationAnchor(anchor)).toBe(target);
  });

  test('escapes the shadow delimiter inside semantic attribute values', () => {
    const document = installDocument('<button aria-label="Step >>> finish">Done</button>');
    const target = requireElement(document.querySelector('button'));
    const anchor = createAnnotationAnchor(target, target.getBoundingClientRect());

    expect(anchor.selector.split(' >>> ')).toHaveLength(1);
    expect(resolveAnnotationAnchor(anchor)).toBe(target);
  });

  test('captures selected text and a small semantic row context', () => {
    const document = installDocument(`
      <table>
        <tr class="athing">
          <td class="rank">8.</td>
          <td class="title">
            <a>We scaled PgBouncer to 4x throughput</a>
            <span> (clickhouse.com)</span>
          </td>
        </tr>
      </table>
    `);
    const target = requireElement(document.querySelector('td.title'));
    const anchor = createAnnotationAnchor(target, target.getBoundingClientRect());

    expect(anchor.text).toBe('We scaled PgBouncer to 4x throughput (clickhouse.com)');
    expect(anchor.nearbyText).toBe('8. We scaled PgBouncer to 4x throughput (clickhouse.com)');
  });

  test('caps semantic context without walking an entire container', () => {
    const filler = Array.from({ length: 100 }, (_, index) => `<span>context-${index}</span>`).join(' ');
    const document = installDocument(`<main><article><button>Target action</button>${filler}</article></main>`);
    const target = requireElement(document.querySelector('button'));
    const anchor = createAnnotationAnchor(target, target.getBoundingClientRect());

    expect(anchor.text).toBe('Target action');
    expect(anchor.nearbyText?.startsWith('Target action context-0')).toBe(true);
    expect(anchor.nearbyText?.length).toBeLessThanOrEqual(280);
    expect(anchor.nearbyText?.endsWith('…')).toBe(true);
  });
});

function installDocument(html: string): Document {
  const parsed = parseHTML(html);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: parsed.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: parsed.document });
  Object.defineProperty(globalThis, 'ShadowRoot', {
    configurable: true,
    value: Reflect.get(parsed.window, 'ShadowRoot'),
  });
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: {
      escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`),
    },
  });
  Object.defineProperty(parsed.window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(parsed.window, 'scrollY', { configurable: true, value: 0 });
  return parsed.document;
}

function requireElement(element: Element | null): Element {
  if (element === null) throw new Error('Expected test element');
  return element;
}

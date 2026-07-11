import type { AnnotationAnchor, AnnotationAnchorAttribute } from './types';

const SHADOW_BOUNDARY = ' >>> ';
const SEMANTIC_ATTRIBUTES = [
  'data-testid',
  'data-test',
  'data-cy',
  'aria-label',
  'name',
  'role',
  'placeholder',
  'alt',
  'href',
] as const;
const IDENTITY_ATTRIBUTES = new Set([
  'data-testid',
  'data-test',
  'data-cy',
  'aria-label',
  'name',
  'placeholder',
  'alt',
  'href',
]);

type QueryRoot = Document | ShadowRoot;

function escapeAttributeValue(value: string): string {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('>', '\\3e ')
    .replaceAll('\n', '\\a ')}"`;
}

function queryAll(root: QueryRoot, selector: string): ReadonlyArray<Element> {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function uniquelySelects(root: QueryRoot, selector: string, element: Element): boolean {
  const matches = queryAll(root, selector);
  return matches.length === 1 && matches[0] === element;
}

function getSemanticSelector(element: Element, root: QueryRoot): string | null {
  const tag = element.tagName.toLowerCase();

  if (element.id) {
    const idSelector = `#${CSS.escape(element.id)}`;
    if (uniquelySelects(root, idSelector, element)) return idSelector;
  }

  for (const attributeName of SEMANTIC_ATTRIBUTES) {
    const value = element.getAttribute(attributeName)?.trim();
    if (!value || value.length > 240) continue;

    const selector = `${tag}[${attributeName}=${escapeAttributeValue(value)}]`;
    if (uniquelySelects(root, selector, element)) return selector;
  }

  const meaningfulClasses = Array.from(element.classList)
    .filter((className) => !isLikelyGeneratedClass(className))
    .slice(0, 2);
  if (meaningfulClasses.length > 0) {
    const selector = `${tag}${meaningfulClasses.map((className) => `.${CSS.escape(className)}`).join('')}`;
    if (uniquelySelects(root, selector, element)) return selector;
  }

  return null;
}

function getStructuralSelector(element: Element, root: QueryRoot): string {
  const path: Array<string> = [];
  let current: Element | null = element;

  while (current && current.getRootNode() === root) {
    const semanticSelector = getSemanticSelector(current, root);
    if (semanticSelector) {
      path.unshift(semanticSelector);
      return path.join(' > ');
    }

    let segment = current.tagName.toLowerCase();
    const currentTagName = current.tagName;
    const parent: Element | null = current.parentElement;
    if (parent && parent.getRootNode() === root) {
      const sameTagSiblings: Array<Element> = Array.from(parent.children).filter(
        (sibling: Element) => sibling.tagName === currentTagName,
      );
      if (sameTagSiblings.length > 1) {
        segment += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }

    path.unshift(segment);
    const selector = path.join(' > ');
    if (uniquelySelects(root, selector, element)) return selector;
    current = parent;
  }

  return path.join(' > ');
}

function getStableAttributes(element: Element): ReadonlyArray<AnnotationAnchorAttribute> {
  const attributes: Array<AnnotationAnchorAttribute> = [];
  for (const name of SEMANTIC_ATTRIBUTES) {
    const value = element.getAttribute(name)?.trim();
    if (!value || value.length > 240) continue;
    attributes.push({ name, value });
  }
  return attributes;
}

function getTextSnapshot(element: Element): string | undefined {
  const text = element.textContent?.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 120) : undefined;
}

function isLikelyGeneratedClass(className: string): boolean {
  if (className.length > 36) return true;
  if (/^[a-f\d]{8,}$/i.test(className)) return true;
  if (/[a-zA-Z]+[_-][a-zA-Z]*\d{4,}/.test(className)) return true;
  return false;
}

function targetHasStableIdentity(
  selector: string,
  attributes: ReadonlyArray<AnnotationAnchorAttribute>,
): boolean {
  const shadowSegments = selector.split(/\s*>>>\s*/);
  const innerSelector = shadowSegments.at(-1) ?? '';
  const pathSegments = innerSelector.split(/\s*>\s*/);
  const targetSegment = pathSegments.at(-1) ?? '';
  return targetSegment.includes('#')
    || attributes.some((attribute) => IDENTITY_ATTRIBUTES.has(attribute.name));
}

/** Builds a unique selector chain that can cross successive open shadow roots. */
export function getUniqueSelector(element: Element): string {
  const segments: Array<string> = [];
  let current = element;

  while (true) {
    const rootNode = current.getRootNode();
    const root = rootNode instanceof ShadowRoot ? rootNode : document;
    segments.unshift(getStructuralSelector(current, root));

    if (!(rootNode instanceof ShadowRoot)) break;
    current = rootNode.host;
  }

  return segments.join(SHADOW_BOUNDARY);
}

/** Returns a concise, accessible-name-first description of an element. */
export function identifyElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const ariaLabel = element.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim();
  if (ariaLabel) return `${tag} "${ariaLabel.slice(0, 48)}"`;

  if (tag === 'button' || tag === 'a') {
    const text = getTextSnapshot(element);
    if (text) return `${tag} "${text.slice(0, 48)}"`;
  }

  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const placeholder = element.getAttribute('placeholder')?.trim();
    if (placeholder) return `${tag} "${placeholder.slice(0, 48)}"`;
    const name = element.getAttribute('name')?.trim();
    if (name) return `${tag}[name="${name.slice(0, 48)}"]`;
    const type = element.getAttribute('type')?.trim();
    return type ? `${tag}[type="${type}"]` : tag;
  }

  if (tag === 'img') {
    const alt = element.getAttribute('alt')?.trim();
    return alt ? `img "${alt.slice(0, 48)}"` : 'img';
  }

  if (/^h[1-6]$/.test(tag)) {
    const text = getTextSnapshot(element);
    if (text) return `${tag} "${text.slice(0, 56)}"`;
  }

  const role = element.getAttribute('role')?.trim();
  if (role) {
    const text = getTextSnapshot(element);
    return text ? `${role} "${text.slice(0, 48)}"` : role;
  }

  const classes = Array.from(element.classList)
    .filter((className) => !isLikelyGeneratedClass(className))
    .slice(0, 2)
    .join('.');
  return classes ? `${tag}.${classes}` : tag;
}

/** Captures the durable selector and semantic signals used to validate it on restore. */
export function createAnnotationAnchor(element: Element, rect: DOMRect): AnnotationAnchor {
  const attributes = getStableAttributes(element);
  const text = getTextSnapshot(element);

  return {
    selector: getUniqueSelector(element),
    tagName: element.tagName.toLowerCase(),
    label: identifyElement(element),
    rect: {
      x: window.innerWidth > 0 ? (rect.x / window.innerWidth) * 100 : 0,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    },
    ...(attributes.length > 0 ? { attributes } : {}),
    ...(text ? { text } : {}),
  };
}

/** Resolves a composed selector through open shadow roots. */
export function querySelectorDeep(selector: string): Element | null {
  const segments = selector.split(/\s*>>>\s*/).filter(Boolean);
  if (segments.length === 0) return null;

  let root: QueryRoot = document;
  let resolved: Element | null = null;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) return null;

    const matches = queryAll(root, segment);
    if (matches.length !== 1) return null;
    resolved = matches[0] ?? null;
    if (resolved === null) return null;

    if (index < segments.length - 1) {
      if (!resolved.shadowRoot) return null;
      root = resolved.shadowRoot;
    }
  }

  return resolved;
}

/** Resolves and validates a stored anchor, failing closed when semantic signals disagree. */
export function resolveAnnotationAnchor(anchor: AnnotationAnchor): Element | null {
  const element = querySelectorDeep(anchor.selector);
  if (!element || element.tagName.toLowerCase() !== anchor.tagName.toLowerCase()) return null;

  const attributes = anchor.attributes ?? [];
  const hasStableTargetIdentity = targetHasStableIdentity(anchor.selector, attributes);
  if (!hasStableTargetIdentity) {
    for (const attribute of attributes) {
      if (element.getAttribute(attribute.name)?.trim() !== attribute.value) return null;
    }
    if (anchor.text && getTextSnapshot(element) !== anchor.text) return null;
  }

  if (attributes.length === 0 && !hasStableTargetIdentity && anchor.label !== anchor.tagName) {
    if (identifyElement(element) !== anchor.label) return null;
  }

  return element;
}

/** Finds the deepest element at viewport coordinates across open shadow roots. */
export function deepElementFromPoint(x: number, y: number): Element | null {
  let element = document.elementFromPoint(x, y);
  if (!element) return null;

  while (element.shadowRoot) {
    const deeper = element.shadowRoot.elementFromPoint(x, y);
    if (!deeper || deeper === element) break;
    element = deeper;
  }

  return element;
}

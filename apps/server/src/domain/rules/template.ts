import type { LiveEvent } from '@tiklive/contracts';

const PLACEHOLDER = /\{(\w+)\}/g;
const LEADING_COMMAND = /^\s*!\S+\s*/u;

export type TemplateVariables = Readonly<Record<string, string>>;

/** Variables available to action templates, e.g. "{nickname} envió {quantity} {giftName}". */
export function templateVariables(event: LiveEvent): TemplateVariables {
  const vars: Record<string, string> = {};
  if ('viewer' in event) {
    vars['nickname'] = event.viewer.nickname || event.viewer.uniqueId;
    vars['uniqueId'] = event.viewer.uniqueId;
  }
  switch (event.type) {
    case 'gift':
      vars['giftName'] = event.giftName;
      vars['quantity'] = String(event.quantity);
      vars['diamonds'] = String(event.diamondValue * event.quantity);
      break;
    case 'like':
      vars['likes'] = String(event.likeDelta);
      vars['totalLikes'] = String(event.totalLikes);
      break;
    case 'comment':
      vars['comment'] = event.text;
      break;
    case 'viewerCount':
      vars['viewerCount'] = String(event.viewerCount);
      break;
    default:
      break;
  }
  return vars;
}

/** Replaces known {placeholders}; unknown ones are left untouched so mistakes are visible. */
export function resolveTemplate(template: string, vars: TemplateVariables): string {
  return template.replace(PLACEHOLDER, (match, name: string) => vars[name] ?? match);
}

/** "!di hola a todos" -> "hola a todos": what a viewer asked to be read, without the command. */
export function stripCommand(text: string): string {
  return text.replace(LEADING_COMMAND, '').trim();
}

/**
 * Like resolveTemplate for JSON text: values are escaped as JSON string contents, so a viewer's
 * quotes or newlines cannot break out of the string they are placed in. Returns undefined when
 * the result is not valid JSON.
 */
export function resolveJsonTemplate(template: string, vars: TemplateVariables): string | undefined {
  const rendered = template.replace(PLACEHOLDER, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : JSON.stringify(value).slice(1, -1);
  });
  try {
    JSON.parse(rendered);
    return rendered;
  } catch {
    return undefined;
  }
}

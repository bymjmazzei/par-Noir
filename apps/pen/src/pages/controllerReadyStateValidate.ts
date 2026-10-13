/**
 * Static checks for Pen controller → shell ready-state wiring.
 * Used by controllerReadyState.gate.test.ts
 */

export type ControllerReadyStateCheck = {
  readyReturnKeys: string[];
  hookBindings: string[];
  consumerKeys: string[];
  orphanReturnKeys: string[];
  missingConsumerKeys: string[];
};

/** Extract property names from the ready-phase `return { ... }` object. */
export function extractReadyReturnKeys(controllerSource: string): string[] {
  const anchor = 'controllerReadyState.gate.test.ts';
  const anchorIdx = controllerSource.indexOf(anchor);
  const searchFrom = anchorIdx >= 0 ? anchorIdx : 0;
  const re = /return(?:\s+penControllerReady)?\s*\(\s*\{\s*\n\s*phase:\s*'ready'/g;
  const slice = controllerSource.slice(searchFrom);
  let match: RegExpExecArray | null = null;
  let last: RegExpExecArray | null = null;
  while ((match = re.exec(slice))) {
    last = match;
  }
  if (!last) {
    throw new Error('controllerReadyState: could not find return { phase: ready');
  }
  const returnStart = searchFrom + last.index;
  return extractKeysFromObjectLiteral(controllerSource, returnStart);
}

function extractKeysFromObjectLiteral(source: string, returnStart: number): string[] {
  const braceOpen = source.indexOf('{', returnStart);
  if (braceOpen < 0) throw new Error('controllerReadyState: malformed return object');
  let depth = 0;
  let end = -1;
  for (let i = braceOpen; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('controllerReadyState: unclosed return object');
  const body = source.slice(braceOpen + 1, end);
  const keys: string[] = [];
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    if (trimmed.startsWith('...')) continue;
    const shorthand = /^([A-Za-z_$][\w$]*)\s*,?\s*(?:\/\/.*)?$/.exec(trimmed);
    if (shorthand) {
      keys.push(shorthand[1]);
      continue;
    }
    const explicit = /^([A-Za-z_$][\w$]*)\s*:/.exec(trimmed);
    if (explicit) keys.push(explicit[1]);
  }
  return keys;
}

/** Hook-level names that may appear in the ready return object. */
export function extractHookBindings(controllerSource: string, hookName: string): string[] {
  const fnNeedle = `export function ${hookName}`;
  const fnStart = controllerSource.indexOf(fnNeedle);
  if (fnStart < 0) throw new Error(`controllerReadyState: hook ${hookName} not found`);
  const hookSource = sliceHookFunction(controllerSource, fnStart);
  const bindings = new Set<string>();

  const paramMatch = /export function \w+\(([\s\S]*?)\)\s*:/.exec(hookSource);
  if (paramMatch) {
    const params = paramMatch[1];
    if (params.includes('props:')) {
      for (const key of [
        'session',
        'docs',
        'onDocsChange',
        'onDocsRemoved',
        'addIntent',
        'onAddIntentConsumed'
      ]) {
        if (params.includes(key)) bindings.add(key);
      }
    } else {
      for (const p of params.split(',')) {
        const name = p.trim().split(':')[0]?.trim();
        if (name && /^[A-Za-z_$][\w$]*$/.test(name)) bindings.add(name);
      }
    }
  }

  const propsDestructure = /^\s{2}const \{([\s\S]*?)\} = props;/m.exec(hookSource);
  if (propsDestructure) {
    for (const part of propsDestructure[1].split(',')) {
      const key = part.trim().split('=')[0]?.trim();
      if (key && /^[A-Za-z_$][\w$]*$/.test(key)) bindings.add(key);
    }
  }

  const fnDecl = /^\s{2}(?:async )?function (\w+)\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = fnDecl.exec(hookSource))) bindings.add(m[1]);

  const constAssign = /^\s{2}const (\w+)\s*[=:]/gm;
  while ((m = constAssign.exec(hookSource))) bindings.add(m[1]);

  const useStatePair = /^\s{2}const \[([^,\]]*),\s*(\w+)\]\s*=\s*useState/gm;
  while ((m = useStatePair.exec(hookSource))) {
    const a = m[1].trim();
    if (a) bindings.add(a);
    bindings.add(m[2]);
  }

  const verified = /^\s{2}const (\w+) = useVerifiedAuthor/m.exec(hookSource);
  if (verified) bindings.add(verified[1]);

  const navigate = /^\s{2}const navigate = useNavigate/m.exec(hookSource);
  if (navigate) bindings.add('navigate');

  return [...bindings];
}

function sliceHookFunction(source: string, fnStart: number): string {
  const rest = source.slice(fnStart);
  const nextExport = rest.search(/\nexport (?:async )?function /);
  if (nextExport > 0) return rest.slice(0, nextExport);
  return rest;
}

/** Names destructured from `state` in a shell module. */
export function extractConsumerDestructuringKeys(shellSource: string, shellExportName: string): string[] {
  const fnNeedle = `export function ${shellExportName}`;
  const fnStart = shellSource.indexOf(fnNeedle);
  if (fnStart < 0) throw new Error(`controllerReadyState: shell ${shellExportName} not found`);
  const destructureNeedle = '} = state';
  const slice = shellSource.slice(fnStart, fnStart + 120_000);
  const destructureStart = slice.indexOf('const {');
  if (destructureStart < 0) throw new Error(`controllerReadyState: no const { } = state in ${shellExportName}`);
  const destructureEnd = slice.indexOf(destructureNeedle, destructureStart);
  if (destructureEnd < 0) throw new Error(`controllerReadyState: unclosed destructure in ${shellExportName}`);
  const block = slice.slice(destructureStart, destructureEnd);
  const keys: string[] = [];
  for (const line of block.split('\n')) {
    const trimmed = line.trim().replace(/,$/, '');
    if (!trimmed || trimmed === 'const {' || trimmed.startsWith('//')) continue;
    const name = /^([A-Za-z_$][\w$]*)/.exec(trimmed);
    if (name) keys.push(name[1]);
  }
  return keys;
}

export function checkControllerReadyState(args: {
  controllerSource: string;
  hookName: string;
  shellSources: Array<{ source: string; exportName: string }>;
  /** Return keys allowed without a hook binding (empty by default). */
  allowOrphanReturnKeys?: string[];
}): ControllerReadyStateCheck {
  const readyReturnKeys = extractReadyReturnKeys(args.controllerSource);
  const hookBindings = extractHookBindings(args.controllerSource, args.hookName);
  const bindingSet = new Set(hookBindings);
  const allowOrphan = new Set(args.allowOrphanReturnKeys ?? []);
  const orphanReturnKeys = readyReturnKeys.filter(
    (k) => k !== 'phase' && !bindingSet.has(k) && !allowOrphan.has(k)
  );

  const returnSet = new Set(readyReturnKeys);
  const consumerKeys = args.shellSources.flatMap((s) =>
    extractConsumerDestructuringKeys(s.source, s.exportName)
  );
  const missingConsumerKeys = [...new Set(consumerKeys)].filter((k) => !returnSet.has(k));

  return {
    readyReturnKeys,
    hookBindings,
    consumerKeys,
    orphanReturnKeys,
    missingConsumerKeys
  };
}

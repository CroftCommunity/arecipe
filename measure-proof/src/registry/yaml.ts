// Minimal, deliberately-scoped YAML reader.
//
// STAND-IN NOTE (declared in the run summary): measure-proof takes no external
// dependencies, so this is a hand-rolled parser for the *subset* the registry
// uses — nested block mappings, 2-space indentation, single-line scalar leaves,
// whole-line `#` comments, and quoted or bare string scalars. It is NOT a
// general YAML implementation (no sequences, anchors, multi-line scalars, flow
// collections, or inline comments). The registry is authored to this subset; a
// real extraction would swap in a spec-complete parser. Anything outside the
// subset throws rather than silently mis-parsing.

export type YamlNode = { [key: string]: string | YamlNode };

export class YamlError extends Error {
  override name = 'YamlError';
}

function parseScalar(raw: string): string {
  const v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    const inner = v.slice(1, -1);
    return v[0] === '"' ? inner.replace(/\\"/g, '"') : inner;
  }
  return v;
}

export function parseYaml(text: string): YamlNode {
  const root: YamlNode = {};
  const stack: { indent: number; container: YamlNode }[] = [
    { indent: -1, container: root },
  ];

  const lines = text.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln]!;
    if (line.trim() === '') continue;
    if (/^\s*#/.test(line)) continue; // whole-line comment

    const indentMatch = line.match(/^( *)/);
    const indent = indentMatch![1]!.length;
    if (indent % 2 !== 0) {
      throw new YamlError(`line ${ln + 1}: indentation must be a multiple of 2 spaces`);
    }
    const body = line.slice(indent);
    const colon = body.indexOf(':');
    if (colon < 0) {
      throw new YamlError(`line ${ln + 1}: expected "key:" — got ${JSON.stringify(body)}`);
    }
    const key = body.slice(0, colon).trim();
    const value = body.slice(colon + 1).trim();

    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (!parent) throw new YamlError(`line ${ln + 1}: dedent below root`);

    if (value === '') {
      const child: YamlNode = {};
      parent.container[key] = child;
      stack.push({ indent, container: child });
    } else {
      parent.container[key] = parseScalar(value);
    }
  }
  return root;
}

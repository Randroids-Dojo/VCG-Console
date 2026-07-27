export const MAX_JSON_CONTAINER_DEPTH = 64;

export function parseJsonWithUniqueObjectFields(text: string): unknown {
  let offset = 0;

  function malformed(): never {
    throw new SyntaxError("JSON document is malformed");
  }

  function skipWhitespace(): void {
    while (offset < text.length && isJsonWhitespace(text[offset])) offset += 1;
  }

  function parseString(): string {
    const start = offset;
    if (text[offset] !== '"') malformed();
    offset += 1;
    while (offset < text.length) {
      if (text[offset] === "\\") {
        offset += 2;
      } else if (text[offset] === '"') {
        offset += 1;
        try {
          return JSON.parse(text.slice(start, offset)) as string;
        } catch {
          malformed();
        }
      } else {
        offset += 1;
      }
    }
    malformed();
  }

  function parseValue(containerDepth: number): void {
    skipWhitespace();
    if (text[offset] === "{") {
      parseObject(containerDepth + 1);
      return;
    }
    if (text[offset] === "[") {
      parseArray(containerDepth + 1);
      return;
    }
    if (text[offset] === '"') {
      parseString();
      return;
    }
    const start = offset;
    while (offset < text.length && !isJsonValueTerminator(text[offset])) offset += 1;
    if (offset === start) malformed();
  }

  function assertDepth(containerDepth: number): void {
    if (containerDepth > MAX_JSON_CONTAINER_DEPTH) {
      throw new RangeError(
        `JSON document exceeds the ${MAX_JSON_CONTAINER_DEPTH}-container nesting limit`,
      );
    }
  }

  function parseObject(containerDepth: number): void {
    assertDepth(containerDepth);
    offset += 1;
    skipWhitespace();
    const fields = new Set<string>();
    if (text[offset] === "}") {
      offset += 1;
      return;
    }
    while (offset < text.length) {
      skipWhitespace();
      const field = parseString();
      if (fields.has(field)) {
        throw new SyntaxError("JSON document contains a duplicate object field");
      }
      fields.add(field);
      skipWhitespace();
      if (text[offset] !== ":") malformed();
      offset += 1;
      parseValue(containerDepth);
      skipWhitespace();
      if (text[offset] === "}") {
        offset += 1;
        return;
      }
      if (text[offset] !== ",") malformed();
      offset += 1;
    }
    malformed();
  }

  function parseArray(containerDepth: number): void {
    assertDepth(containerDepth);
    offset += 1;
    skipWhitespace();
    if (text[offset] === "]") {
      offset += 1;
      return;
    }
    while (offset < text.length) {
      parseValue(containerDepth);
      skipWhitespace();
      if (text[offset] === "]") {
        offset += 1;
        return;
      }
      if (text[offset] !== ",") malformed();
      offset += 1;
    }
    malformed();
  }

  parseValue(0);
  skipWhitespace();
  if (offset !== text.length) malformed();
  return JSON.parse(text) as unknown;
}

function isJsonWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\n" || character === "\r" || character === "\t";
}

function isJsonValueTerminator(character: string | undefined): boolean {
  return (
    character === undefined ||
    isJsonWhitespace(character) ||
    character === "," ||
    character === "]" ||
    character === "}"
  );
}

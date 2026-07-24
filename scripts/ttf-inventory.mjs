import assert from "node:assert/strict";

export const TTF_LIMITS = Object.freeze({
  maximumBytes: 128 * 1024,
  maximumTables: 64,
  maximumCmapSubtables: 32,
  maximumNameRecords: 256,
  maximumCodePoints: 0x10000,
});

function requireRange(buffer, offset, length, label) {
  assert.equal(Number.isSafeInteger(offset), true, `${label} offset must be an integer`);
  assert.equal(Number.isSafeInteger(length), true, `${label} length must be an integer`);
  assert.ok(offset >= 0 && length >= 0, `${label} range must be non-negative`);
  assert.ok(offset + length <= buffer.length, `${label} exceeds the font`);
}

function u16(buffer, offset, label) {
  requireRange(buffer, offset, 2, label);
  return buffer.readUInt16BE(offset);
}

function i16(buffer, offset, label) {
  requireRange(buffer, offset, 2, label);
  return buffer.readInt16BE(offset);
}

function u32(buffer, offset, label) {
  requireRange(buffer, offset, 4, label);
  return buffer.readUInt32BE(offset);
}

function i32(buffer, offset, label) {
  requireRange(buffer, offset, 4, label);
  return buffer.readInt32BE(offset);
}

function fixed16_16(buffer, offset, label) {
  return i32(buffer, offset, label) / 65536;
}

function decodeUtf16Be(bytes) {
  assert.equal(bytes.length % 2, 0, "UTF-16BE name length must be even");
  const swapped = Buffer.allocUnsafe(bytes.length);
  for (let index = 0; index < bytes.length; index += 2) {
    swapped[index] = bytes[index + 1];
    swapped[index + 1] = bytes[index];
  }
  return swapped.toString("utf16le");
}

function readTable(buffer, tables, tag, minimumLength) {
  const table = tables.get(tag);
  assert.ok(table, `required ${tag} table is missing`);
  assert.ok(table.length >= minimumLength, `${tag} table is too short`);
  requireRange(buffer, table.offset, table.length, `${tag} table`);
  return table;
}

function parseNames(buffer, tables) {
  const table = readTable(buffer, tables, "name", 6);
  const count = u16(buffer, table.offset + 2, "name record count");
  const stringOffset = u16(buffer, table.offset + 4, "name string offset");
  assert.ok(count <= TTF_LIMITS.maximumNameRecords, "too many name records");
  requireRange(buffer, table.offset + 6, count * 12, "name records");
  assert.ok(stringOffset <= table.length, "name string storage exceeds table");

  const records = [];
  for (let index = 0; index < count; index += 1) {
    const recordOffset = table.offset + 6 + index * 12;
    const platformId = u16(buffer, recordOffset, "name platform");
    const encodingId = u16(buffer, recordOffset + 2, "name encoding");
    const languageId = u16(buffer, recordOffset + 4, "name language");
    const nameId = u16(buffer, recordOffset + 6, "name identifier");
    const length = u16(buffer, recordOffset + 8, "name length");
    const relativeOffset = u16(buffer, recordOffset + 10, "name offset");
    const absoluteOffset = table.offset + stringOffset + relativeOffset;
    requireRange(buffer, absoluteOffset, length, "name string");
    if (platformId !== 0 && platformId !== 3) continue;
    const value = decodeUtf16Be(buffer.subarray(absoluteOffset, absoluteOffset + length));
    records.push({ platformId, encodingId, languageId, nameId, value });
  }

  const preferred = new Map();
  for (const record of records) {
    const priority =
      record.platformId === 3 && record.languageId === 0x0409
        ? 3
        : record.platformId === 0
          ? 2
          : 1;
    const existing = preferred.get(record.nameId);
    if (!existing || priority > existing.priority) {
      preferred.set(record.nameId, { priority, value: record.value });
    }
  }
  const value = (nameId) => preferred.get(nameId)?.value ?? null;
  return {
    copyright: value(0),
    family: value(1),
    subfamily: value(2),
    uniqueId: value(3),
    fullName: value(4),
    version: value(5),
    postScriptName: value(6),
    licenseDescription: value(13),
    licenseUrl: value(14),
  };
}

function parseFormat4(buffer, offset, length) {
  assert.ok(length >= 16, "format 4 cmap is too short");
  const segCountX2 = u16(buffer, offset + 6, "format 4 segment count");
  assert.equal(segCountX2 % 2, 0, "format 4 segment count must be even");
  const segCount = segCountX2 / 2;
  assert.ok(segCount > 0 && segCount <= 4096, "format 4 segment count is invalid");
  const endCodes = offset + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  requireRange(buffer, idRangeOffsets, segCount * 2, "format 4 arrays");

  const mappings = new Map();
  for (let segment = 0; segment < segCount; segment += 1) {
    const start = u16(buffer, startCodes + segment * 2, "format 4 start code");
    const end = u16(buffer, endCodes + segment * 2, "format 4 end code");
    assert.ok(start <= end, "format 4 segment is reversed");
    if (start === 0xffff && end === 0xffff) continue;
    assert.ok(
      mappings.size + (end - start + 1) <= TTF_LIMITS.maximumCodePoints,
      "format 4 expands beyond the code-point limit",
    );
    const delta = i16(buffer, idDeltas + segment * 2, "format 4 delta");
    const rangeOffsetPosition = idRangeOffsets + segment * 2;
    const rangeOffset = u16(buffer, rangeOffsetPosition, "format 4 range offset");
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      let glyphId;
      if (rangeOffset === 0) {
        glyphId = (codePoint + delta) & 0xffff;
      } else {
        const glyphOffset =
          rangeOffsetPosition + rangeOffset + (codePoint - start) * 2;
        assert.ok(glyphOffset + 2 <= offset + length, "format 4 glyph exceeds subtable");
        glyphId = u16(buffer, glyphOffset, "format 4 glyph");
        if (glyphId !== 0) glyphId = (glyphId + delta) & 0xffff;
      }
      if (glyphId !== 0) mappings.set(codePoint, glyphId);
    }
  }
  return mappings;
}

function parseFormat12(buffer, offset, length) {
  assert.ok(length >= 16, "format 12 cmap is too short");
  const groupCount = u32(buffer, offset + 12, "format 12 group count");
  assert.ok(groupCount <= 4096, "too many format 12 groups");
  requireRange(buffer, offset + 16, groupCount * 12, "format 12 groups");
  const mappings = new Map();
  let previousEnd = -1;
  for (let group = 0; group < groupCount; group += 1) {
    const groupOffset = offset + 16 + group * 12;
    const start = u32(buffer, groupOffset, "format 12 start");
    const end = u32(buffer, groupOffset + 4, "format 12 end");
    const firstGlyph = u32(buffer, groupOffset + 8, "format 12 glyph");
    assert.ok(start <= end && start > previousEnd, "format 12 groups must be ordered");
    assert.ok(end <= 0x10ffff, "format 12 code point is outside Unicode");
    assert.ok(
      mappings.size + (end - start + 1) <= TTF_LIMITS.maximumCodePoints,
      "format 12 expands beyond the code-point limit",
    );
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      const glyphId = firstGlyph + codePoint - start;
      if (glyphId !== 0) mappings.set(codePoint, glyphId);
    }
    previousEnd = end;
  }
  return mappings;
}

function cmapPriority(platformId, encodingId, format) {
  if (platformId === 3 && encodingId === 10 && format === 12) return 5;
  if (platformId === 0 && format === 12) return 4;
  if (platformId === 3 && encodingId === 1 && format === 4) return 3;
  if (platformId === 0 && format === 4) return 2;
  return 0;
}

function parseCmap(buffer, tables) {
  const table = readTable(buffer, tables, "cmap", 4);
  const subtableCount = u16(buffer, table.offset + 2, "cmap subtable count");
  assert.ok(subtableCount <= TTF_LIMITS.maximumCmapSubtables, "too many cmap subtables");
  requireRange(buffer, table.offset + 4, subtableCount * 8, "cmap records");
  const candidates = [];
  const subtables = [];

  for (let index = 0; index < subtableCount; index += 1) {
    const recordOffset = table.offset + 4 + index * 8;
    const platformId = u16(buffer, recordOffset, "cmap platform");
    const encodingId = u16(buffer, recordOffset + 2, "cmap encoding");
    const relativeOffset = u32(buffer, recordOffset + 4, "cmap offset");
    const absoluteOffset = table.offset + relativeOffset;
    requireRange(buffer, absoluteOffset, 2, "cmap subtable");
    const format = u16(buffer, absoluteOffset, "cmap format");
    let length;
    if (format === 4) {
      length = u16(buffer, absoluteOffset + 2, "format 4 length");
    } else if (format === 12) {
      requireRange(buffer, absoluteOffset, 16, "format 12 header");
      length = u32(buffer, absoluteOffset + 4, "format 12 length");
    } else {
      subtables.push({ platformId, encodingId, format, supported: false });
      continue;
    }
    assert.ok(length > 0 && relativeOffset + length <= table.length, "cmap subtable exceeds table");
    const mappings =
      format === 4
        ? parseFormat4(buffer, absoluteOffset, length)
        : parseFormat12(buffer, absoluteOffset, length);
    subtables.push({
      platformId,
      encodingId,
      format,
      supported: true,
      mappingCount: mappings.size,
    });
    const priority = cmapPriority(platformId, encodingId, format);
    if (priority > 0) {
      candidates.push({ platformId, encodingId, format, priority, mappings });
    }
  }

  candidates.sort((left, right) => right.priority - left.priority);
  assert.ok(candidates.length > 0, "no supported Unicode cmap was found");
  return {
    subtables,
    best: candidates[0],
  };
}

export function parseTrueTypeFont(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  assert.ok(buffer.length >= 12, "font is too short");
  assert.ok(buffer.length <= TTF_LIMITS.maximumBytes, "font exceeds the byte limit");
  const scalarVersion = u32(buffer, 0, "sfnt version");
  assert.equal(scalarVersion, 0x00010000, "only TrueType outlines are accepted");
  const numTables = u16(buffer, 4, "table count");
  assert.ok(numTables > 0 && numTables <= TTF_LIMITS.maximumTables, "table count is invalid");
  requireRange(buffer, 12, numTables * 16, "table directory");

  const tables = new Map();
  const tableDirectory = [];
  for (let index = 0; index < numTables; index += 1) {
    const recordOffset = 12 + index * 16;
    const tag = buffer.toString("latin1", recordOffset, recordOffset + 4);
    assert.match(tag, /^[\x20-\x7e]{4}$/u, "table tag is not printable ASCII");
    assert.equal(tables.has(tag), false, `duplicate ${tag} table`);
    const checksum = u32(buffer, recordOffset + 4, `${tag} checksum`);
    const offset = u32(buffer, recordOffset + 8, `${tag} offset`);
    const length = u32(buffer, recordOffset + 12, `${tag} length`);
    requireRange(buffer, offset, length, `${tag} table`);
    const table = { tag, checksum, offset, length };
    tables.set(tag, table);
    tableDirectory.push(table);
  }

  const head = readTable(buffer, tables, "head", 54);
  const maxp = readTable(buffer, tables, "maxp", 6);
  const os2 = readTable(buffer, tables, "OS/2", 78);
  const hhea = readTable(buffer, tables, "hhea", 10);
  const post = readTable(buffer, tables, "post", 16);
  assert.equal(u32(buffer, head.offset + 12, "head magic"), 0x5f0f3cf5, "head magic changed");
  const cmap = parseCmap(buffer, tables);
  const glyphCount = u16(buffer, maxp.offset + 4, "glyph count");
  assert.ok(glyphCount > 0, "font must contain at least one glyph");
  for (const glyphId of cmap.best.mappings.values()) {
    assert.ok(glyphId < glyphCount, "cmap references a glyph outside maxp");
  }

  return {
    scalarVersion: `0x${scalarVersion.toString(16).padStart(8, "0")}`,
    numTables,
    tables: tableDirectory,
    names: parseNames(buffer, tables),
    metrics: {
      unitsPerEm: u16(buffer, head.offset + 18, "units per em"),
      boundingBox: {
        xMin: i16(buffer, head.offset + 36, "head xMin"),
        yMin: i16(buffer, head.offset + 38, "head yMin"),
        xMax: i16(buffer, head.offset + 40, "head xMax"),
        yMax: i16(buffer, head.offset + 42, "head yMax"),
      },
      glyphCount,
      weightClass: u16(buffer, os2.offset + 4, "weight class"),
      widthClass: u16(buffer, os2.offset + 6, "width class"),
      embeddingFsType: u16(buffer, os2.offset + 8, "embedding fsType"),
      typoAscender: i16(buffer, os2.offset + 68, "typographic ascender"),
      typoDescender: i16(buffer, os2.offset + 70, "typographic descender"),
      typoLineGap: i16(buffer, os2.offset + 72, "typographic line gap"),
      windowsAscent: u16(buffer, os2.offset + 74, "Windows ascender"),
      windowsDescent: u16(buffer, os2.offset + 76, "Windows descender"),
      horizontalHeaderAscender: i16(buffer, hhea.offset + 4, "hhea ascender"),
      horizontalHeaderDescender: i16(buffer, hhea.offset + 6, "hhea descender"),
      horizontalHeaderLineGap: i16(buffer, hhea.offset + 8, "hhea line gap"),
      italicAngle: fixed16_16(buffer, post.offset + 4, "italic angle"),
      fixedPitch: u32(buffer, post.offset + 12, "fixed pitch") !== 0,
    },
    cmap: {
      subtables: cmap.subtables,
      best: {
        platformId: cmap.best.platformId,
        encodingId: cmap.best.encodingId,
        format: cmap.best.format,
        mappings: cmap.best.mappings,
      },
    },
  };
}

export function formatCodePoint(codePoint) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function compressCodePointRanges(codePoints) {
  const sorted = [...new Set(codePoints)].sort((left, right) => left - right);
  const ranges = [];
  for (const codePoint of sorted) {
    const previous = ranges.at(-1);
    if (previous && codePoint === previous.end + 1) {
      previous.end = codePoint;
      previous.count += 1;
    } else {
      ranges.push({ start: codePoint, end: codePoint, count: 1 });
    }
  }
  return ranges.map(({ start, end, count }) => ({
    start: formatCodePoint(start),
    end: formatCodePoint(end),
    count,
  }));
}

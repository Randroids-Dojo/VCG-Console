export function unicodeScalarLength(value: string): number {
  return [...value].length;
}

export function hasUnsafeVisibleTextCharacter(value: string): boolean {
  return [...value].some(isUnsafeVisibleTextCharacter);
}

function isUnsafeVisibleTextCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return true;
  return (
    codePoint <= 0x1f
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)
    || codePoint === 0x00ad
    || codePoint === 0x061c
    || codePoint === 0x180e
    || (codePoint >= 0x200b && codePoint <= 0x200f)
    || (codePoint >= 0x2028 && codePoint <= 0x202e)
    || (codePoint >= 0x2060 && codePoint <= 0x2064)
    || (codePoint >= 0x2066 && codePoint <= 0x206f)
    || codePoint === 0xfeff
    || (codePoint >= 0xfff9 && codePoint <= 0xfffb)
    || (codePoint >= 0x1bca0 && codePoint <= 0x1bca3)
    || (codePoint >= 0x1d173 && codePoint <= 0x1d17a)
    || codePoint === 0xe0001
    || (codePoint >= 0xe0020 && codePoint <= 0xe007f)
    || (character !== " " && /\s/u.test(character))
  );
}

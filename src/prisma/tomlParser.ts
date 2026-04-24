type TomlValue = string | number | boolean | string[];
type TomlSection = Record<string, TomlValue>;

export type ParsedToml = Record<string, TomlSection | TomlSection[]>;

export function parseToml(text: string): ParsedToml {
  const result: ParsedToml = {};
  let currentSection: TomlSection | undefined;
  let currentArrayKey: string | undefined;

  // State for multiline array accumulation
  let arrayAccumKey: string | undefined;
  let arrayAccumLines: string[] = [];

  const flushArray = () => {
    if (!arrayAccumKey || !currentSection) return;
    const joined = arrayAccumLines.join(' ');
    const inner = joined.slice(joined.indexOf('[') + 1, joined.lastIndexOf(']'));
    currentSection[arrayAccumKey] = inner
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    arrayAccumKey = undefined;
    arrayAccumLines = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Accumulating a multiline array
    if (arrayAccumKey !== undefined) {
      arrayAccumLines.push(line);
      if (line.includes(']')) flushArray();
      continue;
    }

    const arrMatch = line.match(/^\[\[(.+)\]\]$/);
    if (arrMatch) {
      const key = arrMatch[1].trim();
      currentArrayKey = key;
      if (!Array.isArray(result[key])) result[key] = [];
      currentSection = {};
      (result[key] as TomlSection[]).push(currentSection);
      continue;
    }

    const secMatch = line.match(/^\[([^\]]+)\]$/);
    if (secMatch) {
      currentArrayKey = undefined;
      const key = secMatch[1].trim();
      currentSection = {};
      result[key] = currentSection;
      continue;
    }

    if (!currentSection) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;

    const key = line.slice(0, eqIdx).trim();
    const raw = line.slice(eqIdx + 1).trim();

    if (raw === 'true') { currentSection[key] = true; continue; }
    if (raw === 'false') { currentSection[key] = false; continue; }

    if (raw.startsWith('[')) {
      if (raw.includes(']')) {
        // Single-line array
        const inner = raw.slice(1, raw.lastIndexOf(']'));
        currentSection[key] = inner
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else {
        // Multiline array — start accumulating
        arrayAccumKey = key;
        arrayAccumLines = [raw];
      }
      continue;
    }

    const num = Number(raw);
    if (raw !== '' && !isNaN(num)) { currentSection[key] = num; continue; }

    currentSection[key] = raw.replace(/^["']|["']$/g, '');
  }

  // Flush if file ends mid-array
  if (arrayAccumKey) flushArray();

  return result;
}

/**
 * Unicode character mapping tables for LinkedIn-compatible text formatting.
 *
 * LinkedIn renders Unicode Mathematical Alphanumeric Symbols as-is,
 * so we map standard ASCII letters/digits to their styled Unicode equivalents.
 */

const UnicodeMaps = (() => {
  // ── Bold (Mathematical Sans-Serif Bold) ──────────────────────────
  const BOLD_UPPER = '𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭';
  const BOLD_LOWER = '𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇';
  const BOLD_DIGITS = '𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵';

  // ── Italic (Mathematical Sans-Serif Italic) ──────────────────────
  const ITALIC_UPPER = '𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡';
  const ITALIC_LOWER = '𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻';

  // ── Bold Italic (Mathematical Sans-Serif Bold Italic) ────────────
  const BOLD_ITALIC_UPPER = '𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕';
  const BOLD_ITALIC_LOWER = '𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯';

  // ── Monospace (Mathematical Monospace) ────────────────────────────
  const MONO_UPPER = '𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉';
  const MONO_LOWER = '𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣';
  const MONO_DIGITS = '𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿';

  /**
   * Splits a Unicode string that may contain surrogate pairs into
   * an array of individual visible characters.
   */
  function toCharArray(str) {
    return [...str];
  }

  /**
   * Build a lookup map: standard char → styled char.
   */
  function buildMap(upper, lower, digits) {
    const map = {};
    const u = toCharArray(upper);
    const l = toCharArray(lower);

    for (let i = 0; i < 26; i++) {
      map[String.fromCharCode(65 + i)] = u[i]; // A-Z
      map[String.fromCharCode(97 + i)] = l[i]; // a-z
    }

    if (digits) {
      const d = toCharArray(digits);
      for (let i = 0; i < 10; i++) {
        map[String.fromCharCode(48 + i)] = d[i]; // 0-9
      }
    }

    return map;
  }

  // Build all maps
  const boldMap = buildMap(BOLD_UPPER, BOLD_LOWER, BOLD_DIGITS);
  const italicMap = buildMap(ITALIC_UPPER, ITALIC_LOWER, null);
  const boldItalicMap = buildMap(BOLD_ITALIC_UPPER, BOLD_ITALIC_LOWER, null);
  const monoMap = buildMap(MONO_UPPER, MONO_LOWER, MONO_DIGITS);

  // Build reverse maps for "un-formatting" (stripping back to plain text)
  function buildReverseMap(forwardMap) {
    const rev = {};
    for (const [plain, styled] of Object.entries(forwardMap)) {
      rev[styled] = plain;
    }
    return rev;
  }

  const allReverseMaps = [
    buildReverseMap(boldMap),
    buildReverseMap(italicMap),
    buildReverseMap(boldItalicMap),
    buildReverseMap(monoMap),
  ];

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Convert text using a character map.
   */
  function convertText(text, charMap) {
    return toCharArray(text)
      .map((ch) => charMap[ch] || ch)
      .join('');
  }

  /**
   * Apply combining character to each character in text.
   * Used for strikethrough (\u0336) and underline (\u0332).
   */
  function applyCombining(text, combiningChar) {
    return toCharArray(text)
      .map((ch) => {
        // Don't apply to whitespace or existing combining marks
        if (/\s/.test(ch)) return ch;
        return ch + combiningChar;
      })
      .join('');
  }

  /**
   * Remove combining characters from text.
   */
  function removeCombining(text, combiningChar) {
    return text.replaceAll(combiningChar, '');
  }

  /**
   * Strip all known Unicode formatting back to plain ASCII.
   */
  function stripFormatting(text) {
    let result = text;
    // Remove combining characters
    result = result.replaceAll('\u0336', ''); // strikethrough
    result = result.replaceAll('\u0332', ''); // underline

    // Reverse-map styled chars
    const chars = toCharArray(result);
    return chars
      .map((ch) => {
        for (const rmap of allReverseMaps) {
          if (rmap[ch]) return rmap[ch];
        }
        return ch;
      })
      .join('');
  }

  /**
   * Check if text already contains styled characters from a given map.
   */
  function hasStyle(text, charMap) {
    const styledChars = new Set(Object.values(charMap));
    return toCharArray(text).some((ch) => styledChars.has(ch));
  }

  /**
   * Check if text has combining characters.
   */
  function hasCombining(text, combiningChar) {
    return text.includes(combiningChar);
  }

  return {
    boldMap,
    italicMap,
    boldItalicMap,
    monoMap,
    convertText,
    applyCombining,
    removeCombining,
    stripFormatting,
    hasStyle,
    hasCombining,
    STRIKETHROUGH_CHAR: '\u0336',
    UNDERLINE_CHAR: '\u0332',
    BULLET: '•',
  };
})();

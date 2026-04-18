const r = String.raw;

// Shared character class content for tag characters: unicode letters, numbers,
// emoji (including variation selectors like U+FE0F), and punctuation allowed in tags.
const TAG_CHARS = r`\p{L}\p{N}\p{Extended_Pictographic}\p{So}\uFE00-\uFE0F_\/\-`;
// A complete tag pattern used inside larger regexes (no '#', no wildcard)
const INLINE_TAG_PATTERN = r`tag:[${TAG_CHARS}]+(?:[\s,.]+|$)`;

// The pound sign is optional here
export const TAG_NAME_WITH_HEADER = new RegExp(
    r`tag:(#?[${TAG_CHARS}]*)`,
    'gu',
);
// Same as above, but also supporting wildcards for query purposes (not used for inline tags)
export const TAG_NAME_WITH_HEADER_AND_WILDCARD = new RegExp(
    r`tag:(#?[${TAG_CHARS}\*]*)`,
    'gu',
);
// Note no '#' sign
export const INLINE_TAG_IN_NOTE = new RegExp(
    r`tag:(?<tag>[${TAG_CHARS}]+)`,
    'gu',
);
export const PATH = "['p{L}p{N}_,&()/-\\.]+?";
// path:"..."
export const PATH_QUERY_WITH_HEADER = /path:"((?:[^"]|\\")+?)"/gu;
export const LINKEDTO_QUERY_WITH_HEADER = /linkedto:"((?:[^"]|\\")+?)"/gu;
export const LINKEDFROM_QUERY_WITH_HEADER = /linkedfrom:"((?:[^"]|\\")+?)"/gu;
export const NAME_QUERY_WITH_HEADER = /name:"((?:[^"]|\\")+?)"/gu;
// path:"path with spaces" OR path:path_without_spaces
export const QUOTED_OR_NOT_QUOTED_PATH =
    /path:(("((?:[^"]|\\")*)")|((?:[^"\s]|\\")*))/gu;
export const QUOTED_OR_NOT_QUOTED_LINKEDTO =
    /linkedto:(("((?:[^"]|\\")*)")|((?:[^"\s]|\\")*))/gu;
export const DISTANCEFROM_QUERY_WITH_HEADER =
    /distancefrom:(\[?[+-]?[\d.]+,[+-]?[\d.]+\]?<[\d.]+(?:km|mi|ft|m))/gu;
export const QUOTED_OR_NOT_QUOTED_LINKEDFROM =
    /linkedfrom:(("((?:[^"]|\\")*)")|((?:[^"\s]|\\")*))/gu;
export const COORDINATES =
    /(?<lat>[+-]?([0-9]*[.])?[0-9]+)\s*,\s*(?<lng>[+-]?([0-9]*[.])?[0-9]+)/;
export const INLINE_LOCATION_OLD_SYNTAX =
    /`location:\s*\[?(?<lat>[+-]?([0-9]*[.])?[0-9]+)\s*,\s*(?<lng>[+-]?([0-9]*[.])?[0-9]+)\]?/g;
// A link name is defined here as [^\]]* to prevent a previous link in the same line to count as the beginning
// of the link name
export const INLINE_LOCATION_WITH_TAGS = new RegExp(
    r`(?<link>\[(?<name>[^\]]*?)\]\(geo:(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<lng>[+-]?([0-9]*[.])?[0-9]+)\))[ \t]*(?<tags>(${INLINE_TAG_PATTERN})*)`,
    'gu',
);
// Should be exactly like above but without the tags
export const INLINE_LOCATION_WITHOUT_TAGS =
    /(?<link>\[(?<name>[^\]]*?)\]\(geo:(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<lng>[+-]?([0-9]*[.])?[0-9]+)\))/gu;
// location: "32.84,35.36"    or     location: 32.84,35.36
export const FRONT_MATTER_LOCATION_V3 =
    /(?<header>^---.*)(?<loc>location:[ \t\r\n]*\-[ \t]*\"?(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<lng>[+-]?([0-9]*[.])?[0-9]+)\"?).*^---/ms;
export const FRONT_MATTER_LOCATION_V2 =
    /(?<header>^---.*)(?<loc>location:[ \t]*\"?(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<lng>[+-]?([0-9]*[.])?[0-9]+)\"?).*^---/ms;
// location: [32.84577588420059,35.36074429750443]
export const FRONT_MATTER_LOCATION =
    /(?<header>^---.*)(?<loc>location:[ \t]*\[(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<lng>[+-]?([0-9]*[.])?[0-9]+)\]).*^---/ms;
// Note: backtick (\x60) can't appear in a template literal, so we use \x60 (hex) to represent it.
export const INLINE_GEOJSON = new RegExp(
    r`\x60\x60\x60geojson\n(?<content>[^\x60]*)\x60\x60\x60\s*\n?(?<tags>(${INLINE_TAG_PATTERN})*)`,
    'gu',
);

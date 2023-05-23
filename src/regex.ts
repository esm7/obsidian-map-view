import * as utils from 'src/utils';

// The pound sign is optional here
export const TAG_NAME_WITH_HEADER = /tag:(#?[\p{L}\p{N}_\/\-]*)/gu;
// Same as above, but also supporting wildcards for query purposes (not used for inline tags)
export const TAG_NAME_WITH_HEADER_AND_WILDCARD =
    /tag:(#?[\p{L}\p{N}_\/\-\*]*)/gu;
// Note no '#' sign
export const INLINE_TAG_IN_NOTE = /tag:(?<tag>[\p{L}\p{N}_\/\-]+)/gu;
export const PATH = "['p{L}p{N}_,&()/-\\.]+?";
// path:"..."
export const PATH_QUERY_WITH_HEADER =
    /path:"(['\p{L}\p{N}_,&\(\)\s/\-\\\.]+?)"/gu;
export const LINKEDTO_QUERY_WITH_HEADER =
    /linkedto:"(['\p{L}\p{N}_,&\(\)\s/\-\\\.]+?)"/gu;
export const LINKEDFROM_QUERY_WITH_HEADER =
    /linkedfrom:"(['\p{L}\p{N}_,&\(\)\s/\-\\\.]+?)"/gu;
// Known bug: this is not inclusive enough, many legal names with special characters would not be matched here
export const NAME_QUERY_WITH_HEADER =
    /name:"(['\p{L}\p{N}_,&\(\)\s/\-\\\.]+?)"/gu;
// path:"path with spaces" OR path:path_without_spaces
export const QUOTED_OR_NOT_QUOTED_PATH =
    /path:(("([\p{L}\p{N}_,&\(\)\s'/\-\\\.]*)")|([\p{L}\p{N}_,&\(\)'/\-\\\.]*))/gu;
export const QUOTED_OR_NOT_QUOTED_LINKEDTO =
    /linkedto:(("([\p{L}\p{N}_,&\(\)\s'/\-\\\.]*)")|([\p{L}\p{N}_,&\(\)'/\-\\\.]*))/gu;
export const QUOTED_OR_NOT_QUOTED_LINKEDFROM =
    /linkedfrom:(("([\p{L}\p{N}_,&\(\)\s'/\-\\\.]*)")|([\p{L}\p{N}_,&\(\)'/\-\\\.]*))/gu;
export const COORDINATES =
    /(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<lng>[+-]?([0-9]*[.])?[0-9]+)/;
export const INLINE_LOCATION_OLD_SYNTAX =
    /`location:\s*\[?(?<lat>[+-]?([0-9]*[.])?[0-9]+)\s*,\s*(?<lng>[+-]?([0-9]*[.])?[0-9]+)\]?/g;
// A link name is defined here as [^\]]* to prevent a previous link in the same line to count as the beginning
// of the link name
export const INLINE_LOCATION_WITH_TAGS =
    /(?<link>\[(?<name>[^\]]*?)\]\(geo:(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<lng>[+-]?([0-9]*[.])?[0-9]+)\))[ \t]*(?<tags>(tag:[\p{L}\p{N}_\/\-]+[\s,.]+)*)/gu;
export const FRONT_MATTER_LOCATION =
    /(?<header>^---.*)(?<loc>location:[ \t]*\[(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<lng>[+-]?([0-9]*[.])?[0-9]+)\]).*^---/ms;

// location: [32.84577588420059,35.36074429750443]

/**
 * Returns a match object if the given cursor position has the beginning
 * of a `tag:...` expression
 */
export function getTagUnderCursor(
    line: string,
    cursorPosition: number
): RegExpMatchArray {
    return utils.matchByPosition(line, TAG_NAME_WITH_HEADER, cursorPosition);
}

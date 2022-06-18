import * as utils from 'src/utils';

// The pound sign is optional here
export const TAG_NAME_WITH_HEADER = /tag:(#?[\p{L}\p{N}_\/\-]*)/ug;
// Note no '#' sign
export const INLINE_TAG_IN_NOTE = /tag:(?<tag>[\p{L}\p{N}_\/\-]+)/ug;
export const PATH = '[\'\p{L}\p{N}_\s\/\-\\\.]+?';
// path:"..."
export const PATH_QUERY_WITH_HEADER = /path:"(['\p{L}\p{N}_\s/\-\\\.]+?)"/ug;
export const LINKEDTO_QUERY_WITH_HEADER = /linkedto:"(['\p{L}\p{N}_\s/\-\\\.]+?)"/ug;
export const LINKEDFROM_QUERY_WITH_HEADER = /linkedfrom:"(['\p{L}\p{N}_\s/\-\\\.]+?)"/ug;
// path:"path with spaces" OR path:path_without_spaces
export const QUOTED_OR_NOT_QUOTED_PATH = /path:(("([\p{L}\p{N}_\s'/\-\\\.]*)")|([\p{L}\p{N}_'/\-\\\.]*))/ug;
export const QUOTED_OR_NOT_QUOTED_LINKEDTO = /linkedto:(("([\p{L}\p{N}_\s'/\-\\\.]*)")|([\p{L}\p{N}_'/\-\\\.]*))/ug;
export const QUOTED_OR_NOT_QUOTED_LINKEDFROM = /linkedfrom:(("([\p{L}\p{N}_\s'/\-\\\.]*)")|([\p{L}\p{N}_'/\-\\\.]*))/ug;
export const COORDINATE = '[+-]?([0-9]*[.])?[0-9]+';
export const INLINE_LOCATION_OLD_SYNTAX = /`location:\s*\[?(?<lat>[+-]?([0-9]*[.])?[0-9]+)\s*,\s*(?<lng>[+-]?([0-9]*[.])?[0-9]+)\]?/g;
export const INLINE_LOCATION_WITH_TAGS = /\[(?<name>.*?)\]\(geo:(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<lng>[+-]?([0-9]*[.])?[0-9]+)\)[ \t]*(?<tags>(tag:[\p{L}\p{N}_\/\-]+[\s.]+)*)/ug;

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

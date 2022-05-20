import * as utils from 'src/utils';

/**
 * Returns a match object if the given cursor position has the beginning
 * of a `tag:...` expression
 */
export function getTagUnderCursor(
    line: string,
    cursorPosition: number
): RegExpMatchArray {
    return utils.matchByPosition(line, /tag:(#?[\w\/\-]*)?/g, cursorPosition);
}

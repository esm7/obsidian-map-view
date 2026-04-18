import { App } from 'obsidian';

import * as regex from 'src/regex';
import { isLayerLinkedFrom } from 'src/fileMarker';
import { BaseGeoLayer } from 'src/baseGeoLayer';
import { checkTagPatternMatch } from 'src/markerIcons';

import * as parser from 'boon-js';

export class QueryNode {
    public nodeType: 'leaf' | 'and' | 'or' | 'not';
    public leafOperator: 'tag' | 'path';
    public leafContent: string;
    public leftChild: QueryNode;
    public rightChild: QueryNode;
}

export class Query {
    private queryRpn: parser.PostfixExpression = null;
    private queryEmpty = false;
    private app: App;

    constructor(app: App, queryString: string) {
        this.app = app;
        if (queryString?.length > 0) {
            this.queryRpn = parser.parse(
                this.preprocessQueryString(queryString),
            );
        } else this.queryEmpty = true;
    }

    private preprocessQueryString(queryString: string) {
        // 1. Replace tag:#abc by "tag:#abc" because this parser doesn't like the '#' symbol
        // 2. Replace path:"abc def/ghi" by "path:abc def/dhi" because the parser doesn't like quotes as part of the words
        // 3. Same goes for linkedto:"", linkedfrom:"" and name:""
        // 4. Replace ["property":"value"] with single quotes to avoid parser complaints.
        let newString = queryString
            .replace(regex.TAG_NAME_WITH_HEADER_AND_WILDCARD, '"tag:$1"')
            .replace(regex.PATH_QUERY_WITH_HEADER, '"path:$1"')
            .replace(regex.LINKEDTO_QUERY_WITH_HEADER, '"linkedto:$1"')
            .replace(regex.LINKEDFROM_QUERY_WITH_HEADER, '"linkedfrom:$1"')
            .replace(regex.NAME_QUERY_WITH_HEADER, '"name:$1"')
            .replace(/^\[(")(.+?)\1:/, "['$2':")
            .replace(/:(")(.+)?\1\]/, ":'$2']");
        return newString;
    }

    testLayer(layer: BaseGeoLayer): boolean {
        if (this.queryEmpty) return true;
        const toBool = (s: string) => {
            return s === 'true';
        };
        const toString = (b: boolean) => {
            return b ? 'true' : 'false';
        };
        let booleanStack: string[] = [];
        for (const token of this.queryRpn) {
            if (token.name === 'IDENTIFIER') {
                const result = this.testIdentifier(layer, token.value);
                booleanStack.push(toString(result));
            } else if (token.name === 'OPERATOR') {
                let result;
                if (token.value === 'NOT') {
                    let arg1 = toBool(booleanStack.pop());
                    booleanStack.push(toString(!arg1));
                } else if (token.value === 'OR') {
                    let arg1 = toBool(booleanStack.pop());
                    let arg2 = toBool(booleanStack.pop());
                    booleanStack.push(toString(arg1 || arg2));
                } else if (token.value === 'AND') {
                    let arg1 = toBool(booleanStack.pop());
                    let arg2 = toBool(booleanStack.pop());
                    booleanStack.push(toString(arg1 && arg2));
                } else {
                    throw Error('Unsuppoted operator' + token.value);
                }
            } else {
                throw Error('Unsupported token type:' + token);
            }
        }
        return toBool(booleanStack[0]);
    }

    private testIdentifier(layer: BaseGeoLayer, value: string): boolean {
        if (value.startsWith('tag:#')) {
            const queryTag = value.replace('tag:', '');
            if (queryTag.length === 0) return false;
            if (checkTagPatternMatch(queryTag, layer.tags)) return true;
            return false;
        } else if (value.startsWith('name:')) {
            const query = value.replace('name:', '').toLowerCase();
            if (query.length === 0) return false;
            // For inline geolocations, completely ignore the file name and use only the link name
            if (layer.extraName)
                return layer.extraName.toLowerCase().includes(query);
            // For front matter geolocations, use the file name
            return layer.file.name.toLowerCase().includes(query);
        } else if (value.startsWith('path:')) {
            const queryPath = value.replace('path:', '').toLowerCase();
            if (queryPath.length === 0) return false;
            return layer.file.path.toLowerCase().includes(queryPath);
        } else if (value.startsWith('linkedto:')) {
            const query = value.replace('linkedto:', '').toLowerCase();
            const linkedToDest = this.app.metadataCache.getFirstLinkpathDest(
                query,
                '',
            );
            if (!linkedToDest) return false;
            const fileCache = this.app.metadataCache.getFileCache(layer.file);
            const allLinks = [
                ...(fileCache?.links ?? []),
                ...(fileCache?.frontmatterLinks ?? []),
            ];
            if (
                allLinks.some(
                    (linkCache) =>
                        this.app.metadataCache.getFirstLinkpathDest(
                            linkCache.link,
                            '',
                        ) == linkedToDest,
                )
            )
                return true;
        } else if (value.startsWith('linkedfrom:')) {
            const query = value.replace('linkedfrom:', '').toLowerCase();
            const fileMatch = this.app.metadataCache.getFirstLinkpathDest(
                query,
                '',
            );
            if (fileMatch) {
                const linksFrom =
                    this.app.metadataCache.getFileCache(fileMatch);
                const allLinks = [
                    ...(linksFrom?.links ?? []),
                    ...(linksFrom?.frontmatterLinks ?? []),
                    ...(linksFrom?.embeds ?? []),
                ];
                // Check if the given layer is linked from 'fileMatch'
                for (const link of allLinks) {
                    if (isLayerLinkedFrom(layer, link, this.app)) return true;
                }
                // Also include the 'linked from' file itself
                if (fileMatch.basename === layer.file.basename) return true;
            }
        } else if (value.startsWith('lines:')) {
            const linesQueryMatch = value.match(/(lines:)([0-9]+)-([0-9]+)/);
            if (linesQueryMatch && linesQueryMatch.length === 4) {
                const fromLine = parseInt(linesQueryMatch[2]);
                const toLine = parseInt(linesQueryMatch[3]);
                return (
                    layer.fileLine &&
                    layer.fileLine >= fromLine &&
                    layer.fileLine <= toLine
                );
            }
        } else if (value.startsWith('[')) {
            const propertyQueryMatch = value.match(/\[(.+?):(.*?)\]/);
            if (!propertyQueryMatch) return false;

            // Quoted property name or value imply exact match; otherwise substring match.
            const [, propertyNameRaw, propertyQueryRaw] = propertyQueryMatch;
            const [isExactName, propertyName] = unquote(propertyNameRaw);
            const [isExactQuery, propertyQuery] = unquote(propertyQueryRaw);

            const fileCache = this.app.metadataCache.getFileCache(layer.file);
            let propertyValues: string[] = [];
            if (isExactName) {
                const property = fileCache.frontmatter?.[propertyName];
                if (typeof property !== 'undefined')
                    propertyValues = [property];
            } else {
                propertyValues = Object.keys(fileCache.frontmatter)
                    .filter((k) => k.includes(propertyName))
                    .map((k) => fileCache.frontmatter[k]);
            }

            // Allow searching for the existence of a property via a blank value.
            if (propertyQuery.length === 0) return propertyValues.length > 0;

            const propertyQueryLower = propertyQuery.toLowerCase();
            return normalizePropertyValues(propertyValues).some((p) =>
                isExactQuery
                    ? p === propertyQueryLower
                    : p.includes(propertyQueryLower),
            );
        } else
            throw new Error(
                `Unsupported query format for Map View: "${value}"`,
            );
    }
}

export function normalizePropertyValues(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(normalizePropertyValues);
    if (value === null) return ['null'];
    if (typeof value === 'string') return [value.toLowerCase()];
    if (['boolean', 'number'].includes(typeof value))
        return [value.toString().toLowerCase()];
    throw new Error('Cannot coerce property: ' + value);
}

// Return whether the given string was quoted, and the unquoted value.
export function unquote(s: string): [boolean, string] {
    // Match any string, but only capture the first group on balanced quotes.
    const match = s.match(/^(['"])?(.*)\1$/);
    if (!match) {
        throw new Error('Unexpected regex failure when unquoting: ' + s);
    }
    return [Boolean(match[1]), match[2]];
}

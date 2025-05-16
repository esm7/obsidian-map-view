import { App } from 'obsidian';
import { type DisplayRule } from 'src/settings';
import { Query } from 'src/query';
import { BaseGeoLayer } from 'src/baseGeoLayer';
import { type PathOptions } from 'leaflet';

export class DisplayRulesCache {
    private displayRuleQueries: Query[] = [];
    private displayRules: DisplayRule[] = [];
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    public build(displayRules: DisplayRule[]) {
        this.displayRuleQueries = [];
        for (const rule of displayRules) {
            const query = new Query(this.app, rule.query);
            this.displayRuleQueries.push(query);
        }
        this.displayRules = displayRules;
    }

    // TODO document
    public runOn(marker: BaseGeoLayer): [any, PathOptions] {
        const defaultRule = this.displayRules.find(
            (rule) => rule.preset == true,
        );
        let iconDetails: any = Object.assign({}, defaultRule.iconDetails);
        let pathOptions: PathOptions = Object.assign(
            {},
            defaultRule.pathOptions,
        );
        if (this.displayRuleQueries.length != this.displayRules.length)
            throw new Error(
                `Display rules cache is garbled, ${this.displayRuleQueries.length} vs ${this.displayRules.length} rules`,
            );
        for (let i = 0; i < this.displayRules.length; i++) {
            const rule = this.displayRules[i];
            // Test & apply the rules one by one, except the preset one, which is always first
            if (!rule.preset) {
                const query = this.displayRuleQueries[i];
                if (query.testMarker(marker)) {
                    if (rule.iconDetails)
                        iconDetails = Object.assign(
                            {},
                            iconDetails,
                            rule.iconDetails,
                        );
                    if (rule.pathOptions)
                        pathOptions = Object.assign(
                            {},
                            pathOptions,
                            rule.pathOptions,
                        );
                }
            }
        }
        return [iconDetails, pathOptions];
    }
}

import { App } from 'obsidian';
import { type DisplayRule, type IconBadgeOptions } from 'src/settings';
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

    public getDefaults(): [any, PathOptions, IconBadgeOptions[]] {
        const defaultRule = this.displayRules.find(
            (rule) => rule.preset == true,
        );
        let iconDetails: any = Object.assign({}, defaultRule.iconDetails);
        let pathOptions: PathOptions = Object.assign(
            {},
            defaultRule.pathOptions,
        );
        let badgeOptions: IconBadgeOptions[] = [];
        return [iconDetails, pathOptions, badgeOptions];
    }

    /*
     * Run the list of display rules on the given layer.
     * Starting from the default marker/path options (default icon, path, badge options etc), it iterates over all the rules,
     * and any rule that matches the layer overwrites whatever settings that it has in iconDetails and pathOptions,
     * and adds additional badge options.
     * The result (=the accumulated icon details, accumulated path options and list of badge options) is returned.
     */
    public runOn(layer: BaseGeoLayer): [any, PathOptions, IconBadgeOptions[]] {
        let [iconDetails, pathOptions, badgeOptions] = this.getDefaults();
        if (this.displayRuleQueries.length != this.displayRules.length)
            throw new Error(
                `Display rules cache is garbled, ${this.displayRuleQueries.length} vs ${this.displayRules.length} rules`,
            );
        for (let i = 0; i < this.displayRules.length; i++) {
            const rule = this.displayRules[i];
            // Test & apply the rules one by one, except the preset one, which is always first
            if (!rule.preset) {
                const query = this.displayRuleQueries[i];
                if (query.testLayer(layer)) {
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
                    // Possible future improvement: allow adding up properties of badges like in icons and paths.
                    if (rule.badgeOptions) badgeOptions.push(rule.badgeOptions);
                }
            }
        }
        return [iconDetails, pathOptions, badgeOptions];
    }
}

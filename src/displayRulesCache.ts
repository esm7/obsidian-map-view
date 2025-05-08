import { App } from 'obsidian';
import { type DisplayRule } from 'src/settings';
import { Query } from 'src/query';
import { FileMarker } from 'src/fileMarker';

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

    public runOn(marker: FileMarker) {
        const defaultRule = this.displayRules.find(
            (rule) => rule.preset == true,
        );
        let iconDetails: any = Object.assign({}, defaultRule.iconDetails);
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
                    iconDetails = Object.assign(
                        {},
                        iconDetails,
                        rule.iconDetails,
                    );
                }
            }
        }
        return iconDetails;
    }
}

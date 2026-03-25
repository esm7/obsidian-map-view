import type { PluginSettings } from './settings';

export function makeSettingsReactive(settings: PluginSettings): PluginSettings {
    let reactive: PluginSettings = $state(settings);
    return reactive;
}

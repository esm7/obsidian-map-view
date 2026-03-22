import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'Map View',
    description:
        'An interactive map plugin for Obsidian.md — turn your vault into a personal GIS.',
    base: '/obsidian-map-view/',

    themeConfig: {
        logo: '/img/main.png',

        nav: [
            { text: 'Guide', link: '/quick-start' },
            { text: 'Changelog', link: '/changelog' },
        ],

        sidebar: [
            {
                text: 'Overview',
                link: '/',
            },
            {
                text: 'Getting Started',
                items: [
                    { text: 'Quick Start', link: '/quick-start' },
                    {
                        text: 'Location Formats',
                        link: '/location-formats',
                    },
                    {
                        text: 'Adding Locations',
                        link: '/adding-locations',
                    },
                    { text: 'GPS Support', link: '/gps-support' },
                ],
            },
            {
                text: 'Features',
                items: [
                    { text: 'Embedding Maps', link: '/embedding-maps' },
                    {
                        text: 'Paths (GPX, KML, GeoJSON)',
                        link: '/paths',
                    },
                    { text: 'Queries', link: '/queries' },
                    { text: 'Display Rules', link: '/display-rules' },
                    {
                        text: 'Search & Geocoding',
                        link: '/search',
                    },
                    { text: 'Map Sources', link: '/map-sources' },
                    { text: 'Presets', link: '/presets' },
                    { text: 'Routing', link: '/routing' },
                    { text: 'Open In', link: '/open-in' },
                    {
                        text: 'URL Parsing Rules',
                        link: '/url-parsing',
                    },
                    { text: 'Offline Tiles', link: '/offline-tiles' },
                    { text: 'Links View', link: '/links-view' },
                    {
                        text: 'Follow Active Note',
                        link: '/follow-active-note',
                    },
                    {
                        text: 'Obsidian Bases View',
                        link: '/bases-view',
                    },
                    { text: 'Import from KML', link: '/import-kml' },
                    { text: 'View URLs', link: '/view-urls' },
                ],
            },
            {
                text: 'Reference',
                items: [
                    {
                        text: 'vs. Obsidian Leaflet',
                        link: '/vs-leaflet',
                    },
                    { text: 'Changelog', link: '/changelog' },
                ],
            },
        ],

        socialLinks: [
            {
                icon: 'github',
                link: 'https://github.com/esm7/obsidian-map-view',
            },
        ],

        footer: {
            message:
                'Released under the <a href="https://github.com/esm7/obsidian-map-view/blob/master/LICENSE">MIT License</a>.',
            copyright:
                'If you find Map View useful, <a href="https://www.buymeacoffee.com/esm7">buy me a coffee</a> ☕',
        },

        editLink: {
            pattern:
                'https://github.com/esm7/obsidian-map-view/edit/master/docs/:path',
            text: 'Edit this page on GitHub',
        },

        search: {
            provider: 'local',
        },
    },
});

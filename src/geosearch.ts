import { Editor, Notice } from 'obsidian';
import * as geosearch from 'leaflet-geosearch';

import * as utils from 'src/utils';

export async function selectionToLink(editor: Editor) {
	const provider = new geosearch.OpenStreetMapProvider();
	const selection = editor.getSelection();
	const results = await provider.search({query: selection});
	if (results && results.length > 0) {
		const firstResult = results[0];
		editor.replaceSelection(`[${selection}](geo:${firstResult.y},${firstResult.x})`);
		new Notice(firstResult.label, 10 * 1000);
		if (utils.verifyOrAddFrontMatter(editor))
			new Notice("The note's front matter was updated to denote locations are present");
	}
	else {
		new Notice(`No location found for the term '${selection}'`);
	}
}

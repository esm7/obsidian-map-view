import { App, TFile } from 'obsidian';

import * as moment_ from 'moment';
import * as path from 'path';

export function formatWithTemplates(s: string) {
	const datePattern = /{{date:([a-zA-Z\-\/\.\:]*)}}/g;
	const replaced = s.replace(datePattern, (_, pattern) => {
		// @ts-ignore
		return moment().format(pattern);
	});
	return replaced;
}

type NewNoteType = 'singleLocation' | 'multiLocation';

export async function newNote(app: App, newNoteType: NewNoteType, directory: string, fileName: string,
	location: string, templatePath?: string): Promise<TFile>
{
	let content = newNoteType === 'singleLocation' ?
		`---\nlocation: [${location}]\n---\n\n` :
		`---\nlocations:\n---\n\n\`location: ${location}\`\n`;
	let templateContent = '';
	if (templatePath)
		templateContent = await app.vault.adapter.read(templatePath);
	let fullName = path.join(directory || '', fileName);
	if (await app.vault.adapter.exists(fullName + '.md'))
		fullName += Math.random() * 1000;
	try {
		return app.vault.create(fullName + '.md', content + templateContent);
	}
	catch (e) {
		throw Error(`Cannot create file named ${fullName}: ${e}`);
	}
}

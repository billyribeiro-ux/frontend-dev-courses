import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';

const contentBase = join(process.cwd(), 'src', 'lib', 'content', 'modules');

export function loadLessonContent(moduleSlug: string, lessonSlug: string): string | null {
	const filePath = join(contentBase, moduleSlug, `${lessonSlug}.md`);
	if (!existsSync(filePath)) return null;
	const raw = readFileSync(filePath, 'utf-8');
	return marked.parse(raw) as string;
}

export function loadExercises(moduleSlug: string): Array<{
	id: string;
	title: string;
	instructions: string;
	starterCode: string;
	solution: string;
	language: string;
}> {
	const filePath = join(contentBase, moduleSlug, 'exercises.json');
	if (!existsSync(filePath)) return [];
	const raw = readFileSync(filePath, 'utf-8');
	try {
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

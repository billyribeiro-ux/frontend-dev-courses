export interface Module {
	slug: string;
	number: number;
	title: string;
	description: string;
	phase: number;
	lessons: Lesson[];
}

export interface Lesson {
	slug: string;
	number: number;
	title: string;
	description: string;
	hasEditor: boolean;
}

export interface UserProgress {
	moduleSlug: string;
	lessonSlug: string;
	completed: boolean;
	completedAt: string | null;
}

export interface Exercise {
	id: string;
	title: string;
	instructions: string;
	starterCode: string;
	solution: string;
	language: 'html' | 'css' | 'javascript' | 'svelte';
}

export interface CourseJsonLd {
	name: string;
	description: string;
	provider: string;
	url: string;
}

export function generateCourseJsonLd(course: CourseJsonLd): string {
	const data = {
		'@context': 'https://schema.org',
		'@type': 'Course',
		name: course.name,
		description: course.description,
		provider: {
			'@type': 'Organization',
			name: course.provider,
			sameAs: course.url
		},
		hasCourseInstance: {
			'@type': 'CourseInstance',
			courseMode: 'online',
			courseWorkload: 'PT120H'
		}
	};
	return JSON.stringify(data);
}

export interface ArticleJsonLd {
	title: string;
	description: string;
	url: string;
	datePublished: string;
	author: string;
}

export function generateArticleJsonLd(article: ArticleJsonLd): string {
	const data = {
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: article.title,
		description: article.description,
		url: article.url,
		datePublished: article.datePublished,
		author: {
			'@type': 'Person',
			name: article.author
		}
	};
	return JSON.stringify(data);
}

export function generateBreadcrumbJsonLd(
	items: Array<{ name: string; url: string }>
): string {
	const data = {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name,
			item: item.url
		}))
	};
	return JSON.stringify(data);
}

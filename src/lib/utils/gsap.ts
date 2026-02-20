import { gsap } from 'gsap';

if (typeof window !== 'undefined') {
	const { ScrollTrigger } = await import('gsap/ScrollTrigger');
	gsap.registerPlugin(ScrollTrigger);
}

export { gsap };
export type { ScrollTrigger } from 'gsap/ScrollTrigger';

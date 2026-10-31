import type React from "react";

/*
	The @efferd/features-6 globe, split for a static site. The block draws it
	from a React effect, which would mean hydrating React in the browser for
	one canvas. Here the component only renders the canvas at build time, and
	`src/scripts/globe.ts` starts it with the same cobe settings, loading cobe
	only once the canvas is about to scroll into view.
*/
export function CobeGlobe({ ...props }: React.ComponentProps<"canvas">) {
	return (
		<canvas
			aria-hidden="true"
			data-cobe-globe=""
			style={{ width: 512, height: 512, aspectRatio: 1 }}
			{...props}
		/>
	);
}

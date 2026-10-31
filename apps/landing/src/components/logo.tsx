import { cn } from "@workspace/ui/lib/utils";
import type React from "react";

/*
	The block's placeholder wordmark, replaced by numa's: the mark from
	`public/logo.svg` next to the name, sized by the `className` height.
*/
export const Logo = ({ className, ...props }: React.ComponentProps<"span">) => (
	<span
		className={cn("flex items-center gap-2 font-medium text-foreground", className)}
		{...props}
	>
		<img alt="" className="h-full w-auto" height={24} src="/logo.svg" width={20} />
		<span className="text-lg leading-none">numa</span>
	</span>
);

import { cn } from "@workspace/ui/lib/utils";
import React from "react";
import { Button } from "@workspace/ui/components/button";
import { Portal, PortalBackdrop } from "@/components/portal";
import type { HeaderCopy } from "@/components/header";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons";

export function MobileNav({ copy }: { copy: HeaderCopy }) {
	const [open, setOpen] = React.useState(false);

	/* Escape closes the menu, as the site's previous menu did. */
	React.useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open]);

	return (
		<div className="md:hidden">
			<Button
				aria-controls="mobile-menu"
				aria-expanded={open}
				aria-label={open ? copy.closeMenu : copy.openMenu}
				className="md:hidden"
				onClick={() => setOpen(!open)}
				size="icon"
				variant="outline"
			>
				{open ? (
					<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4.5" />
				) : (
					<HugeiconsIcon icon={Menu01Icon} strokeWidth={2} className="size-4.5" />
				)}
			</Button>
			{open && (
				<Portal className="top-14" id="mobile-menu">
					<PortalBackdrop />
					<div
						className={cn(
							"data-[slot=open]:zoom-in-97 ease-out data-[slot=open]:animate-in",
							"size-full p-4"
						)}
						data-slot={open ? "open" : "closed"}
					>
						<div className="grid gap-y-2">
							{copy.links.map((link) => (
								<Button
									className="justify-start"
									key={link.href}
									nativeButton={false}
									onClick={() => setOpen(false)}
									render={<a href={link.href} />}
									variant="ghost"
								>
									{link.label}
								</Button>
							))}
						</div>
						<div className="mt-12 flex flex-col gap-2">
							<Button
								className="w-full"
								nativeButton={false}
								render={<a href={copy.signInUrl} />}
							>
								{copy.start}
								<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
							</Button>
						</div>
					</div>
				</Portal>
			)}
		</div>
	);
}

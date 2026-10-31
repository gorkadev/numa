"use client";
import { cn } from "@workspace/ui/lib/utils";
import { Logo } from "@/components/logo";
import { useScroll } from "@/hooks/use-scroll";
import { Button } from "@workspace/ui/components/button";
import { MobileNav } from "@/components/mobile-nav";

/*
	The @efferd/header-2 block with numa's links and copy. It is `fixed`
	rather than the block's `sticky`, so it floats over the hero's sky instead
	of pushing the island down, and every call to action is a link to the app.
	`Landing.astro` hydrates it with `client:load`: the scrolled state and the
	mobile menu are React state.
*/
export type NavLink = { label: string; href: string };

export type HeaderCopy = {
	homeHref: string;
	homeLabel: string;
	links: NavLink[];
	signIn: string;
	start: string;
	signInUrl: string;
	openMenu: string;
	closeMenu: string;
};

export function Header({ copy }: { copy: HeaderCopy }) {
	const scrolled = useScroll(10);

	return (
		<header
			className={cn(
				"fixed inset-x-0 top-0 z-50 mx-auto w-full max-w-4xl border-transparent border-b md:rounded-md md:border md:transition-all md:ease-out",
				{
					"border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50 md:top-2 md:max-w-3xl md:shadow":
						scrolled,
				}
			)}
		>
			<nav
				aria-label="Main"
				className={cn(
					"flex h-14 w-full items-center justify-between px-4 md:h-12 md:transition-all md:ease-out",
					{
						"md:px-2": scrolled,
					}
				)}
			>
				<a
					aria-label={copy.homeLabel}
					className="rounded-md p-2 hover:bg-muted dark:hover:bg-muted/50"
					href={copy.homeHref}
				>
					<Logo className="h-5" />
				</a>
				<div className="hidden items-center gap-2 md:flex">
					<div>
						{copy.links.map((link) => (
							<Button
								data-nav-link=""
								key={link.href}
								nativeButton={false}
								render={<a href={link.href} />}
								className="aria-[current=true]:bg-muted aria-[current=true]:text-foreground"
								size="sm"
								variant="ghost"
							>
								{link.label}
							</Button>
						))}
					</div>
					<Button
						nativeButton={false}
						render={<a href={copy.signInUrl} />}
						size="sm"
						variant="outline"
					>
						{copy.signIn}
					</Button>
					<Button
						nativeButton={false}
						render={<a href={copy.signInUrl} />}
						size="sm"
					>
						{copy.start}
					</Button>
				</div>
				<MobileNav copy={copy} />
			</nav>
		</header>
	);
}

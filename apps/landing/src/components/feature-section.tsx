import { cn } from "@workspace/ui/lib/utils";
import type React from "react";
import { CobeGlobe } from "@/components/cobe-globe";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	CodeIcon,
	Coins01Icon,
	Globe02Icon,
	PackageIcon,
} from "@hugeicons/core-free-icons";

import type { Dictionary } from "@/i18n/en";

/*
	The @efferd/features-6 bento, filled with numa's benefits. The block's
	visuals were made for a business dashboard, so the ones that would claim
	something numa does not do are swapped: the made up growth chart is a
	conversation, the dashboard screenshot is numa's own island, the lock and
	the timer are numa's icons. The globe carries no city markers.
*/
type Benefits = Dictionary["benefits"]["items"];

type Chat = Dictionary["benefits"]["chat"];

export function FeatureSection({
	items,
	chat,
	islandAlt,
}: {
	items: Benefits;
	chat: Chat;
	islandAlt: string;
}) {
	const [noCode, assets, talking, pay, browser] = items;

	const features = [
		{
			id: "no-code",
			children: <NoCodeVisual item={noCode} />,
			className: "md:col-span-2",
		},
		{
			id: "pay",
			children: <PayVisual item={pay} />,
			className: "md:col-span-2",
		},
		{
			id: "talking",
			children: <TalkingVisual item={talking} chat={chat} />,
			className: "sm:col-span-2 md:col-span-2",
		},
		{
			id: "assets",
			children: <AssetsVisual item={assets} alt={islandAlt} />,
			className: "sm:col-span-2 md:col-span-3 p-0",
		},
		{
			id: "browser",
			children: <BrowserVisual item={browser} />,
			className: "sm:col-span-2 md:col-span-3 p-0",
		},
	];

	return (
		<div className="relative mx-auto grid w-full max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-6">
			{features.map((feature) => (
				<FeatureCard className={feature.className} key={feature.id}>
					{feature.children}
				</FeatureCard>
			))}
		</div>
	);
}

type Item = Benefits[number] | undefined;

function FeatureCard({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"group relative overflow-hidden rounded-card border bg-background px-8 pt-8 pb-6",
				className
			)}
		>
			{children}
		</div>
	);
}

function FeatureTitle({ className, ...props }: React.ComponentProps<"h3">) {
	return (
		<h3
			className={cn("font-heading font-medium text-foreground text-lg", className)}
			{...props}
		/>
	);
}

function FeatureDescription({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p className={cn("text-muted-foreground text-sm", className)} {...props} />
	);
}

function NoCodeVisual({ item }: { item: Item }) {
	return (
		<>
			<div className="relative mx-auto flex size-32 items-center justify-center rounded-full border-4 border-dashed bg-background shadow-xs outline outline-border outline-offset-4">
				<div className="absolute inset-0 z-10 scale-120 bg-radial from-foreground/20 via-foreground/5 to-transparent blur-xl" />
				<HugeiconsIcon icon={CodeIcon} strokeWidth={2} className="size-14 text-primary/90" />
			</div>

			<div className="relative mt-8 space-y-1.5 text-center">
				<FeatureTitle>{item?.title}</FeatureTitle>
				<FeatureDescription>{item?.body}</FeatureDescription>
			</div>
		</>
	);
}

function PayVisual({ item }: { item: Item }) {
	return (
		<>
			<div className="relative mx-auto flex size-32 items-center justify-center rounded-full border bg-background shadow-xs outline outline-border outline-offset-4">
				<HugeiconsIcon icon={Coins01Icon} strokeWidth={1.5} className="size-16 text-primary" />
				<div className="absolute inset-0 scale-120 bg-radial from-foreground/15 via-foreground/5 to-transparent blur-xl" />
			</div>

			<div className="relative mt-8 space-y-1.5 text-center">
				<FeatureTitle>{item?.title}</FeatureTitle>
				<FeatureDescription>{item?.body}</FeatureDescription>
			</div>
		</>
	);
}

/* A short exchange in numa's chat: the change is asked for in words. */
function TalkingVisual({ item, chat }: { item: Item; chat: Chat }) {
	return (
		<>
			<div className="flex min-h-32 flex-col justify-center gap-2" aria-hidden="true">
				<div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-foreground text-xs">
					{chat.ask}{" "}
					<span className="rounded-lg bg-primary-foreground/20 px-1 font-medium">
						{chat.file}
					</span>
				</div>
				<div className="max-w-[85%] rounded-2xl rounded-bl-md border bg-card px-3 py-2 text-muted-foreground text-xs">
					{chat.reply}
				</div>
			</div>
			<div className="relative z-10 mt-8 space-y-1.5 text-center">
				<FeatureTitle>{item?.title}</FeatureTitle>
				<FeatureDescription>{item?.body}</FeatureDescription>
			</div>
		</>
	);
}

function AssetsVisual({ item, alt }: { item: Item; alt: string }) {
	return (
		<div className="grid h-full sm:grid-cols-2">
			<div className="relative z-10 space-y-6 py-8 ps-8 pe-2">
				<div className="flex size-12 items-center justify-center rounded-full border bg-card shadow-xs outline outline-border/80 outline-offset-2">
					<HugeiconsIcon icon={PackageIcon} strokeWidth={2} className="size-5 text-primary/80" />
				</div>
				<div className="space-y-2">
					<FeatureTitle className="text-base">{item?.title}</FeatureTitle>
					<FeatureDescription>{item?.body}</FeatureDescription>
				</div>
			</div>
			<div className="mask-b-from-90% mask-r-from-90% relative aspect-video sm:aspect-auto">
				<div className="absolute -right-1 -bottom-1 aspect-video max-h-50 rounded-tl-2xl border bg-card p-1 sm:max-h-42 md:aspect-square md:max-h-50 lg:aspect-16/12">
					<div className="aspect-video h-full overflow-hidden rounded-tl-xl border *:pointer-events-none *:size-full *:shrink-0 *:select-none">
						<img
							alt={alt}
							className="object-cover"
							height={720}
							loading="lazy"
							src="/island.webp"
							width={960}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function BrowserVisual({ item }: { item: Item }) {
	return (
		<div className="grid max-h-120 sm:grid-cols-2">
			<div className="space-y-6 pt-8 pb-4 pl-8 sm:pb-8">
				<div className="flex size-12 items-center justify-center rounded-full border bg-card shadow-xs outline outline-border/80 outline-offset-2">
					<HugeiconsIcon icon={Globe02Icon} strokeWidth={2} className="size-5 text-primary/80" />
				</div>
				<div className="space-y-2">
					<FeatureTitle className="text-base">{item?.title}</FeatureTitle>
					<FeatureDescription>{item?.body}</FeatureDescription>
				</div>
			</div>
			<div className="relative">
				<CobeGlobe className="top-[-12%] left-0 sm:absolute" />
			</div>
		</div>
	);
}

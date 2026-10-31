import { cn } from "@workspace/ui/lib/utils";
import * as PricingCard from "@/components/pricing-card";
import { LinkButton } from "@/components/LinkButton";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Briefcase01Icon,
	Building01Icon,
	CheckmarkCircle04Icon,
	UserIcon,
} from "@hugeicons/core-free-icons";

import type { Dictionary } from "@/i18n/en";

/*
	The @efferd/pricing-3 block, filled with numa's plans. The block's sample
	data (three made up plans with struck through prices) is replaced by the
	real plans from the site's copy; numa runs no discounts, so the original
	price slot is gone. Every call to action is a link to the app's sign-in.
*/
const icons = {
	free: UserIcon,
	pro: Briefcase01Icon,
	max: Building01Icon,
};

export function PricingSection({
	copy,
	signInUrl,
}: {
	copy: Dictionary["pricing"];
	signInUrl: string;
}) {
	return (
		<section
			id="pricing"
			aria-labelledby="pricing-title"
			className="w-full scroll-mt-24 px-4 py-20 md:py-24"
		>
			<div className="mx-auto mb-4 max-w-md space-y-2">
				<div className="flex justify-center">
					<div className="rounded-2xl border px-4 py-1 text-sm">
						{copy.eyebrow}
					</div>
				</div>
				<h2
					id="pricing-title"
					className="font-heading text-center font-bold text-2xl tracking-tight md:text-3xl lg:text-4xl"
				>
					{copy.title}
				</h2>
				<p className="text-center text-muted-foreground text-sm md:text-base">
					{copy.subtitle}
				</p>
			</div>
			<div className="mx-auto grid w-full max-w-4xl gap-4 p-6 md:grid-cols-3">
				{copy.plans.map((plan) => {
					const isPopular = plan.id === "pro";
					return (
						<PricingCard.Card
							className={cn("w-full max-w-full", isPopular && "md:scale-105")}
							key={plan.id}
						>
							<PricingCard.Header isPopular={isPopular}>
								<PricingCard.Plan>
									<PricingCard.PlanName>
										<HugeiconsIcon
											icon={icons[plan.id as keyof typeof icons]}
											strokeWidth={2}
										/>
										<span>{plan.name}</span>
									</PricingCard.PlanName>
									{isPopular && (
										<PricingCard.Badge>{copy.popular}</PricingCard.Badge>
									)}
								</PricingCard.Plan>
								<PricingCard.Price>
									<PricingCard.MainPrice>{plan.price}</PricingCard.MainPrice>
									<PricingCard.Period>{copy.perMonth}</PricingCard.Period>
								</PricingCard.Price>
								<LinkButton
									href={signInUrl}
									className="w-full font-semibold"
									variant={isPopular ? "default" : "outline"}
								>
									{plan.cta}
								</LinkButton>
							</PricingCard.Header>

							<PricingCard.Body>
								<PricingCard.Description>
									{plan.description}
								</PricingCard.Description>
								<PricingCard.List>
									{plan.features.map((item) => (
										<PricingCard.ListItem className="text-xs" key={item}>
											<HugeiconsIcon
												icon={CheckmarkCircle04Icon}
												strokeWidth={2}
												aria-hidden="true"
												className="size-4 text-foreground"
											/>
											<span>{item}</span>
										</PricingCard.ListItem>
									))}
								</PricingCard.List>
							</PricingCard.Body>
						</PricingCard.Card>
					);
				})}
			</div>
		</section>
	);
}

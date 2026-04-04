"use client";

import { createContext, useContext } from "react";
import type { UserSubscription } from "@/lib/subscription";

const defaultSub: UserSubscription = {
  planId: "free",
  tier: "free",
  status: "active",
  currentPeriodEnd: "",
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
};

const SubscriptionContext = createContext<UserSubscription>(defaultSub);

export function SubscriptionProvider({
  subscription,
  children,
}: {
  subscription: UserSubscription;
  children: React.ReactNode;
}) {
  return (
    <SubscriptionContext.Provider value={subscription}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}

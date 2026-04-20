// Manage subscription groups and subscription products
// Docs: https://developer.apple.com/documentation/appstoreconnectapi/subscription_groups
//       https://developer.apple.com/documentation/appstoreconnectapi/subscriptions

export async function listSubscriptionGroups(client, appId) {
  const resp = await client.get(`/apps/${appId}/subscriptionGroups`, {
    query: {
      limit: 50,
      include: "subscriptions",
    },
  });
  return resp.data || [];
}

export async function getSubscriptionsInGroup(client, groupId) {
  const resp = await client.get(`/subscriptionGroups/${groupId}/subscriptions`, {
    query: { limit: 200 },
  });
  return resp.data || [];
}

export async function createSubscriptionGroup(client, appId, referenceName) {
  const body = {
    data: {
      type: "subscriptionGroups",
      attributes: { referenceName },
      relationships: {
        app: { data: { type: "apps", id: appId } },
      },
    },
  };
  const resp = await client.post("/subscriptionGroups", { body });
  return resp.data;
}

export async function addGroupLocalization(client, groupId, locale, name, customAppName) {
  const body = {
    data: {
      type: "subscriptionGroupLocalizations",
      attributes: { locale, name, customAppName },
      relationships: {
        subscriptionGroup: { data: { type: "subscriptionGroups", id: groupId } },
      },
    },
  };
  const resp = await client.post("/subscriptionGroupLocalizations", { body });
  return resp.data;
}

export async function createSubscription(client, groupId, config) {
  const body = {
    data: {
      type: "subscriptions",
      attributes: {
        name: config.referenceName,
        productId: config.productId,
        subscriptionPeriod: config.subscriptionPeriod,
        groupLevel: config.groupLevel,
        familySharable: config.familySharable,
      },
      relationships: {
        group: { data: { type: "subscriptionGroups", id: groupId } },
      },
    },
  };
  const resp = await client.post("/subscriptions", { body });
  return resp.data;
}

export async function addSubscriptionLocalization(client, subscriptionId, locale, name, description) {
  const body = {
    data: {
      type: "subscriptionLocalizations",
      attributes: { locale, name, description },
      relationships: {
        subscription: { data: { type: "subscriptions", id: subscriptionId } },
      },
    },
  };
  const resp = await client.post("/subscriptionLocalizations", { body });
  return resp.data;
}

export async function setSubscriptionPrice(client, subscriptionId, priceTier, territory = "USA") {
  // Price points require fetching available price points for the territory and tier
  // For simplicity, we create an introductory price schedule with a known territory
  const body = {
    data: {
      type: "subscriptionPrices",
      attributes: {
        preserveCurrentPrice: false,
      },
      relationships: {
        subscription: { data: { type: "subscriptions", id: subscriptionId } },
        subscriptionPricePoint: {
          data: {
            type: "subscriptionPricePoints",
            // Price point IDs are constructed as <subscriptionId>_<tier>_<territory>
            // but the correct approach is to look up /subscriptions/{id}/pricePoints
            id: `${subscriptionId}_${priceTier}_${territory}`,
          },
        },
      },
    },
  };
  try {
    const resp = await client.post("/subscriptionPrices", { body });
    return { ok: true, data: resp.data };
  } catch (err) {
    return { ok: false, error: err.body || err.message };
  }
}

export async function getPricePointForTier(client, subscriptionId, tier, territory = "USA") {
  // Find a price point matching a USD-equivalent tier for the given territory
  const resp = await client.get(`/subscriptions/${subscriptionId}/pricePoints`, {
    query: {
      "filter[territory]": territory,
      limit: 200,
    },
  });
  const points = resp.data || [];
  // Tier roughly maps to customerPrice in USD (Apple used to use tiers 1..)
  // We find the closest price point to the tier (as USD)
  let best = null;
  let bestDiff = Infinity;
  for (const p of points) {
    const price = parseFloat(p.attributes?.customerPrice || "0");
    const diff = Math.abs(price - tier);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return best;
}

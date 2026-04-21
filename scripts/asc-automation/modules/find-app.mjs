// Find the Kindar app in App Store Connect by bundle ID
// Returns { id, attributes } or throws if not found

export async function findApp(client, bundleId) {
  const resp = await client.get("/apps", {
    query: {
      "filter[bundleId]": bundleId,
      "fields[apps]": "name,bundleId,sku,primaryLocale",
      limit: 1,
    },
  });

  if (!resp.data || resp.data.length === 0) {
    throw new Error(`App with bundle ID "${bundleId}" not found. Create it first in App Store Connect.`);
  }

  const app = resp.data[0];
  return {
    id: app.id,
    attributes: app.attributes,
  };
}

export async function getAppRelationships(client, appId) {
  // Get IAP, subscription groups, version info in one go
  const [appInfos, subscriptionGroups, versions] = await Promise.all([
    client.get(`/apps/${appId}/appInfos`, { query: { limit: 5 } }).catch(() => ({ data: [] })),
    client.get(`/apps/${appId}/subscriptionGroups`, { query: { limit: 20 } }).catch(() => ({ data: [] })),
    client.get(`/apps/${appId}/appStoreVersions`, { query: { limit: 5, sort: "-createdDate" } }).catch(() => ({ data: [] })),
  ]);

  return { appInfos: appInfos.data || [], subscriptionGroups: subscriptionGroups.data || [], versions: versions.data || [] };
}

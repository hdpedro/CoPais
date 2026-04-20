// Manage app-level info: primary category, subtitle, privacy URL, etc.

export async function listAppInfos(client, appId) {
  const resp = await client.get(`/apps/${appId}/appInfos`, { query: { limit: 10 } });
  return resp.data || [];
}

export async function getAppInfoLocalizations(client, appInfoId) {
  const resp = await client.get(`/appInfos/${appInfoId}/appInfoLocalizations`);
  return resp.data || [];
}

export async function updateAppInfo(client, appInfoId, attributes) {
  const body = {
    data: {
      type: "appInfos",
      id: appInfoId,
      attributes,
    },
  };
  return client.patch(`/appInfos/${appInfoId}`, { body });
}

export async function setAppCategories(client, appInfoId, { primary, secondary }) {
  // Categories are relationships, not attributes
  const rels = {};
  if (primary) {
    rels.primaryCategory = { data: { type: "appCategories", id: primary } };
  }
  if (secondary) {
    rels.secondaryCategory = { data: { type: "appCategories", id: secondary } };
  }

  const body = {
    data: {
      type: "appInfos",
      id: appInfoId,
      relationships: rels,
    },
  };
  return client.patch(`/appInfos/${appInfoId}`, { body });
}

export async function updateAppInfoLocalization(client, localizationId, attributes) {
  const body = {
    data: {
      type: "appInfoLocalizations",
      id: localizationId,
      attributes,
    },
  };
  return client.patch(`/appInfoLocalizations/${localizationId}`, { body });
}

export async function createAppInfoLocalization(client, appInfoId, locale, attributes) {
  const body = {
    data: {
      type: "appInfoLocalizations",
      attributes: { locale, ...attributes },
      relationships: {
        appInfo: { data: { type: "appInfos", id: appInfoId } },
      },
    },
  };
  return client.post("/appInfoLocalizations", { body });
}

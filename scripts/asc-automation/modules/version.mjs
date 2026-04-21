// Manage AppStoreVersion + localizations (description, keywords, whats new)

export async function getLatestVersion(client, appId) {
  const resp = await client.get(`/apps/${appId}/appStoreVersions`, {
    query: {
      limit: 5,
      sort: "-createdDate",
    },
  });
  const versions = resp.data || [];
  // Prefer a version in editable state
  const editable = versions.find((v) =>
    ["PREPARE_FOR_SUBMISSION", "METADATA_REJECTED", "DEVELOPER_REJECTED", "REJECTED", "INVALID_BINARY"].includes(
      v.attributes?.appStoreState
    )
  );
  return editable || versions[0] || null;
}

export async function getVersionLocalizations(client, versionId) {
  const resp = await client.get(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  return resp.data || [];
}

export async function updateVersionLocalization(client, localizationId, attributes) {
  const body = {
    data: {
      type: "appStoreVersionLocalizations",
      id: localizationId,
      attributes,
    },
  };
  return client.patch(`/appStoreVersionLocalizations/${localizationId}`, { body });
}

export async function createVersionLocalization(client, versionId, locale, attributes) {
  const body = {
    data: {
      type: "appStoreVersionLocalizations",
      attributes: { locale, ...attributes },
      relationships: {
        appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
      },
    },
  };
  return client.post("/appStoreVersionLocalizations", { body });
}

export async function getReviewDetail(client, versionId) {
  try {
    const resp = await client.get(`/appStoreVersions/${versionId}/appStoreReviewDetail`);
    return resp.data;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function createReviewDetail(client, versionId, attributes) {
  const body = {
    data: {
      type: "appStoreReviewDetails",
      attributes,
      relationships: {
        appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
      },
    },
  };
  return client.post("/appStoreReviewDetails", { body });
}

export async function updateReviewDetail(client, detailId, attributes) {
  const body = {
    data: {
      type: "appStoreReviewDetails",
      id: detailId,
      attributes,
    },
  };
  return client.patch(`/appStoreReviewDetails/${detailId}`, { body });
}

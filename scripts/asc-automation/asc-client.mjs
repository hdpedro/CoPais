// ASC API JWT Authentication
// Generates short-lived (20 min) tokens signed with ES256 using the .p8 private key
// Docs: https://developer.apple.com/documentation/appstoreconnectapi/generating_tokens_for_api_requests

import crypto from "node:crypto";
import fs from "node:fs";

const ASC_BASE_URL = "https://api.appstoreconnect.apple.com/v1";

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function createJWT({ keyId, issuerId, privateKeyPath }) {
  const privateKey = fs.readFileSync(privateKeyPath, "utf8");
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "ES256",
    kid: keyId,
    typ: "JWT",
  };

  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60, // 20 minutes
    aud: "appstoreconnect-v1",
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign("SHA256");
  sign.update(signInput);
  sign.end();
  const signature = sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  const encodedSignature = base64UrlEncode(signature);

  return `${signInput}.${encodedSignature}`;
}

export class AscClient {
  constructor({ keyId, issuerId, privateKeyPath }) {
    this.config = { keyId, issuerId, privateKeyPath };
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  getToken() {
    const now = Date.now();
    if (!this.token || now >= this.tokenExpiresAt) {
      this.token = createJWT(this.config);
      // Refresh 2 min before expiry for safety
      this.tokenExpiresAt = now + 18 * 60 * 1000;
    }
    return this.token;
  }

  async request(method, path, { body, query, headers } = {}) {
    const url = new URL(ASC_BASE_URL + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
        }
      }
    }

    const token = this.getToken();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      const err = new Error(`ASC API ${method} ${path} → ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }

    return data;
  }

  get(path, opts) { return this.request("GET", path, opts); }
  post(path, opts) { return this.request("POST", path, opts); }
  patch(path, opts) { return this.request("PATCH", path, opts); }
  delete(path, opts) { return this.request("DELETE", path, opts); }
}

"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import {
  requestWhatsAppLink,
  verifyWhatsAppOTP,
  unlinkWhatsApp,
} from "@/actions/whatsapp";

type LinkStatus = "unlinked" | "pending" | "linked";

export default function WhatsAppLinkSection({
  initialStatus,
  initialPhone,
}: {
  initialStatus: LinkStatus;
  initialPhone?: string;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<LinkStatus>(initialStatus);
  const [phone, setPhone] = useState(initialPhone || "");
  const [phoneInput, setPhoneInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleRequestLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.set("phone", phoneInput);

    const result = await requestWhatsAppLink(formData);

    if (result.error) {
      setError(result.error);
    } else {
      setPhone(result.phone || phoneInput);
      setStatus("pending");
      setSuccess(t("whatsapp.codeSent"));
    }
    setLoading(false);
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.set("otp", otpInput);

    const result = await verifyWhatsAppOTP(formData);

    if (result.error) {
      setError(result.error);
    } else {
      setStatus("linked");
      setSuccess(t("whatsapp.linked"));
    }
    setLoading(false);
  }

  async function handleUnlink() {
    if (!confirm(t("whatsapp.unlinkConfirm"))) return;
    setLoading(true);
    setError("");

    const result = await unlinkWhatsApp();

    if (result.error) {
      setError(result.error);
    } else {
      setStatus("unlinked");
      setPhone("");
      setPhoneInput("");
      setOtpInput("");
      setSuccess(t("whatsapp.unlinked"));
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-[#25D366]/10 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-dark">{t("whatsapp.title")}</h3>
          <p className="text-xs text-muted">{t("whatsapp.description")}</p>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-error/10 text-error text-sm rounded-lg">{error}</div>
      )}
      {success && (
        <div className="mb-3 p-3 bg-success/10 text-success text-sm rounded-lg">{success}</div>
      )}

      {/* Unlinked — show phone input */}
      {status === "unlinked" && (
        <form onSubmit={handleRequestLink} className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">{t("whatsapp.phoneLabel")}</label>
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+5511999998888"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
            <p className="text-xs text-muted mt-1">{t("whatsapp.phoneHint")}</p>
          </div>
          <button
            type="submit"
            disabled={loading || !phoneInput.trim()}
            className="w-full py-2.5 bg-[#25D366] text-white font-semibold rounded-lg hover:bg-[#20BD5A] transition-colors disabled:opacity-50"
          >
            {loading ? t("common.loading") : t("whatsapp.sendCode")}
          </button>
        </form>
      )}

      {/* Pending — show OTP input */}
      {status === "pending" && (
        <div className="space-y-3">
          <p className="text-sm text-dark">
            {t("whatsapp.codeSentTo")} <strong>{phone}</strong>
          </p>
          <form onSubmit={handleVerifyOTP} className="space-y-3">
            <div>
              <label className="block text-xs text-muted mb-1">{t("whatsapp.otpLabel")}</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || otpInput.length !== 6}
              className="w-full py-2.5 bg-[#25D366] text-white font-semibold rounded-lg hover:bg-[#20BD5A] transition-colors disabled:opacity-50"
            >
              {loading ? t("common.loading") : t("whatsapp.verify")}
            </button>
          </form>
          <button
            onClick={() => { setStatus("unlinked"); setError(""); setSuccess(""); }}
            className="w-full text-sm text-muted hover:text-dark transition-colors"
          >
            {t("whatsapp.changeNumber")}
          </button>
        </div>
      )}

      {/* Linked — show status + unlink */}
      {status === "linked" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg">
            <span className="text-lg">{"\u2705"}</span>
            <div>
              <p className="text-sm font-medium text-dark">{t("whatsapp.connectedTo")}</p>
              <p className="text-sm text-muted">{phone}</p>
            </div>
          </div>
          <p className="text-xs text-muted">{t("whatsapp.connectedHint")}</p>
          <button
            onClick={handleUnlink}
            disabled={loading}
            className="w-full py-2.5 bg-error/10 text-error font-medium rounded-lg hover:bg-error/20 transition-colors text-sm disabled:opacity-50"
          >
            {loading ? t("common.loading") : t("whatsapp.unlink")}
          </button>
        </div>
      )}
    </div>
  );
}

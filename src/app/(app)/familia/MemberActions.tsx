"use client";

import { useState } from "react";
import { changeMemberRole, removeMember } from "@/actions/members";
import { useI18n } from "@/i18n/provider";

export default function MemberActions({
  memberId,
  groupId,
  currentRole,
  memberName,
}: {
  memberId: string;
  groupId: string;
  currentRole: string;
  memberName: string;
}) {
  const { t } = useI18n();
  const [showMenu, setShowMenu] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const roles = [
    { value: "admin", label: t("memberActions.roleAdmin"), desc: t("memberActions.roleAdminDesc") },
    { value: "member", label: t("memberActions.roleMember"), desc: t("memberActions.roleMemberDesc") },
    { value: "readonly", label: t("memberActions.roleReadonly"), desc: t("memberActions.roleReadonlyDesc") },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-muted"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-48">
            <button
              onClick={() => { setShowMenu(false); setShowRoleModal(true); }}
              className="w-full text-left px-4 py-2.5 text-sm text-dark hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t("memberActions.changePermission")}
            </button>
            <button
              onClick={() => { setShowMenu(false); setShowRemoveModal(true); }}
              className="w-full text-left px-4 py-2.5 text-sm text-error hover:bg-red-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {t("memberActions.removeFromGroup")}
            </button>
          </div>
        </>
      )}

      {/* Role change modal */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-bold text-dark mb-1">{t("memberActions.changePermission")}</h3>
            <p className="text-sm text-muted mb-4">{t("memberActions.chooseRole", { name: memberName })}</p>

            <form action={changeMemberRole}>
              <input type="hidden" name="memberId" value={memberId} />
              <input type="hidden" name="groupId" value={groupId} />

              <div className="space-y-2 mb-5">
                {roles.map((role) => (
                  <label
                    key={role.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      currentRole === role.value
                        ? "border-primary bg-primary/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="newRole"
                      value={role.value}
                      defaultChecked={currentRole === role.value}
                      className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-dark">{role.label}</p>
                      <p className="text-xs text-muted">{role.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
                >
                  {t("common.confirm")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove confirmation modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="w-12 h-12 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="text-lg font-bold text-dark text-center mb-1">{t("memberActions.removeTitle", { name: memberName })}</h3>
            <div className="text-sm text-muted text-center mb-5">
              <p className="mb-2">{t("memberActions.whatWillHappen")}</p>
              <ul className="text-left space-y-1 text-xs bg-gray-50 rounded-lg p-3">
                <li>{t("memberActions.willLoseAccess", { name: memberName })}</li>
                <li>{t("memberActions.historyKept")}</li>
                <li>{t("memberActions.canReinvite")}</li>
              </ul>
            </div>

            <form action={removeMember}>
              <input type="hidden" name="memberId" value={memberId} />
              <input type="hidden" name="groupId" value={groupId} />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowRemoveModal(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-error rounded-lg hover:bg-red-700 transition-colors"
                >
                  {t("memberActions.remove")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

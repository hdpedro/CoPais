"use client";

import { useState } from "react";
import { leaveGroup } from "@/actions/members";

export default function LeaveGroupButton({
  groupId,
  isOnlyAdmin,
}: {
  groupId: string;
  isOnlyAdmin: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center justify-center gap-2 w-full py-3 text-error font-medium text-sm rounded-xl border border-error/20 hover:bg-error/5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sair do grupo
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="w-12 h-12 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>

            <h3 className="text-lg font-bold text-dark text-center mb-1">Sair do grupo?</h3>

            {isOnlyAdmin ? (
              <div className="text-sm text-center mb-5">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700">
                  <p className="font-medium mb-1">Voce e o unico administrador</p>
                  <p className="text-xs">Promova outro membro a administrador antes de sair do grupo.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="text-sm text-muted text-center mb-5">
                  <p className="mb-2">O que vai acontecer:</p>
                  <ul className="text-left space-y-1 text-xs bg-gray-50 rounded-lg p-3">
                    <li>• Voce perdera acesso a este grupo</li>
                    <li>• Seu historico de dados sera mantido</li>
                    <li>• Voce pode ser reconvidado depois</li>
                  </ul>
                </div>

                <form action={leaveGroup}>
                  <input type="hidden" name="groupId" value={groupId} />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="flex-1 py-2.5 text-sm font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 text-sm font-semibold text-white bg-error rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Sair do grupo
                    </button>
                  </div>
                </form>
              </>
            )}

            {isOnlyAdmin && (
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full py-2.5 mt-3 text-sm font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Entendi
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

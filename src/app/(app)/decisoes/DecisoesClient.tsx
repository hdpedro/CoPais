"use client";

import { useI18n } from "@/i18n/provider";
import { createDecision, castVote, addArgument } from "@/actions/decisions";

interface Decision {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  deadline: string | null;
  created_at: string;
  created_by: string;
}

interface Member {
  user_id: string;
  full_name: string;
}

interface Vote {
  decision_id: string;
  user_id: string;
  vote: string;
}

interface Argument {
  id: string;
  user_id: string;
  argument_type: string;
  text: string;
  user_name: string;
}

interface DecisoesClientProps {
  decisions: Decision[];
  membersList: Member[];
  userId: string;
  groupId: string;
  isReadonly: boolean;
  tab: string;
  openDecisionId: string | null;
  votesMap: Record<string, Vote[]>;
  openDecisionArgs: Argument[];
  profileMap: Record<string, string>;
  decisionCategories: Array<{ value: string; label: string; icon: string }>;
}

export default function DecisoesClient({
  decisions,
  membersList,
  userId,
  groupId,
  isReadonly,
  tab,
  openDecisionId,
  votesMap,
  openDecisionArgs,
  profileMap,
  decisionCategories,
}: DecisoesClientProps) {
  const { t, locale } = useI18n();

  const categoryLabels: Record<string, string> = {
    escola: t("decisions.catSchool"),
    saude: t("decisions.catHealth"),
    atividade: t("decisions.catActivity"),
    viagem: t("decisions.catTravel"),
    financeiro: t("decisions.catFinancial"),
    moradia: t("decisions.catHousing"),
    outro: t("decisions.catOther"),
  };

  const categoryConfig: Record<string, { color: string; bg: string; icon: string }> = {
    escola: { color: "text-blue-600", bg: "bg-blue-50", icon: "\u{1F3EB}" },
    saude: { color: "text-red-600", bg: "bg-red-50", icon: "\u{2764}\u{FE0F}" },
    atividade: { color: "text-green-600", bg: "bg-green-50", icon: "\u{26BD}" },
    viagem: { color: "text-purple-600", bg: "bg-purple-50", icon: "\u{2708}\u{FE0F}" },
    financeiro: { color: "text-amber-600", bg: "bg-amber-50", icon: "\u{1F4B0}" },
    moradia: { color: "text-teal-600", bg: "bg-teal-50", icon: "\u{1F3E0}" },
    outro: { color: "text-gray-600", bg: "bg-gray-50", icon: "\u{1F4CB}" },
  };

  const statusLabels: Record<string, string> = {
    aberta: t("decisions.statusOpen"),
    aprovada: t("decisions.statusApproved"),
    rejeitada: t("decisions.statusRejected"),
    expirada: t("decisions.statusExpired"),
  };

  const statusConfig: Record<string, { color: string; bg: string; border: string }> = {
    aberta: { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
    aprovada: { color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
    rejeitada: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
    expirada: { color: "text-gray-700", bg: "bg-gray-50", border: "border-gray-200" },
  };

  const dateLocale = locale === "pt" ? "pt-BR" : locale === "en" ? "en-US" : locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : "de-DE";

  const formatDate = (dateStr: string) => {
    const dateOnly = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    return new Date(dateOnly + "T12:00:00").toLocaleDateString(dateLocale, {
      day: "numeric",
      month: "short",
    });
  };

  // Compute urgency for a decision
  const getUrgency = (decision: Decision): { label: string; color: string; bg: string; icon: string } | null => {
    const now = new Date();

    if (decision.deadline) {
      const deadlineDate = new Date(decision.deadline + "T23:59:59");
      const daysUntil = Math.ceil((deadlineDate.getTime() - now.getTime()) / 86400000);

      if (daysUntil < 0 && decision.status === "aberta") {
        return { label: t("decisions.deadlineExpired"), color: "text-red-700", bg: "bg-red-50 border border-red-200", icon: "\u26A0\uFE0F" };
      }
      if (daysUntil <= 3 && daysUntil >= 0 && decision.status === "aberta") {
        return { label: t("decisions.deadlineNear"), color: "text-orange-700", bg: "bg-orange-50 border border-orange-200", icon: "\u23F0" };
      }
    } else if (decision.status === "aberta") {
      const createdDate = new Date(decision.created_at);
      const daysOld = Math.ceil((now.getTime() - createdDate.getTime()) / 86400000);
      if (daysOld > 7) {
        return { label: t("decisions.noDeadline"), color: "text-gray-600", bg: "bg-gray-50 border border-gray-200", icon: "\u{1F4CC}" };
      }
    }
    return null;
  };

  const tabs = [
    { key: "abertas", label: t("decisions.tabOpen") },
    { key: "resolvidas", label: t("decisions.tabResolved") },
    { key: "todas", label: t("decisions.all") },
  ];

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("decisions.title")}</h1>
          <p className="text-sm text-muted mt-1">
            {t("decisions.subtitle")}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map((tb) => (
          <a
            key={tb.key}
            href={`/decisoes?tab=${tb.key}`}
            className={`flex-1 text-center py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === tb.key
                ? "bg-white text-dark shadow-sm"
                : "text-muted hover:text-dark"
            }`}
          >
            {tb.label}
          </a>
        ))}
      </div>

      {/* New Decision Form */}
      {!isReadonly && (
        <form action={createDecision} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-dark">{t("decisions.newDecision")}</h3>
          <input type="hidden" name="groupId" value={groupId} />

          <input
            type="text"
            name="title"
            required
            placeholder={t("decisions.titlePlaceholder")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          <textarea
            name="description"
            rows={2}
            placeholder={t("decisions.descriptionPlaceholder")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          <div className="flex gap-3">
            <select
              name="category"
              required
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {decisionCategories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.icon} {categoryLabels[cat.value] || cat.label}
                </option>
              ))}
            </select>

            <input
              type="date"
              name="deadline"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder={t("decisions.deadline")}
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
          >
            {t("decisions.createDecision")}
          </button>
        </form>
      )}

      {/* Decisions List */}
      {decisions && decisions.length > 0 ? (
        <div className="space-y-3">
          {decisions.map((decision) => {
            const cat = categoryConfig[decision.category] || categoryConfig.outro;
            const catLabel = categoryLabels[decision.category] || decision.category;
            const st = statusConfig[decision.status] || statusConfig.aberta;
            const stLabel = statusLabels[decision.status] || decision.status;
            const decVotes = votesMap[decision.id] || [];
            const userVote = decVotes.find((v) => v.user_id === userId);
            const isOpen = openDecisionId === decision.id;
            const isAberta = decision.status === "aberta";
            const creatorName = profileMap[decision.created_by] || t("decisions.user");
            const urgency = getUrgency(decision);
            const userHasNotVoted = isAberta && !userVote;

            // Vote counts
            const agreeCount = decVotes.filter(v => v.vote === "concordo").length;
            const disagreeCount = decVotes.filter(v => v.vote === "discordo").length;
            const thinkCount = decVotes.filter(v => v.vote === "pensar").length;

            // Members who haven't voted
            const votedUserIds = new Set(decVotes.map(v => v.user_id));
            const missingVoters = membersList.filter(m => !votedUserIds.has(m.user_id));

            return (
              <div key={decision.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Pending vote banner */}
                {userHasNotVoted && (
                  <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
                    <span className="text-amber-600 text-sm">{"\u{1F4E2}"}</span>
                    <span className="text-xs font-semibold text-amber-700">
                      {t("decisions.yourVotePending")}
                    </span>
                  </div>
                )}

                {/* Card header - clickable to expand */}
                <a
                  href={isOpen ? `/decisoes?tab=${tab}` : `/decisoes?tab=${tab}&open=${decision.id}`}
                  className="block p-4"
                >
                  {/* Top row: badges */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.color} ${cat.bg} inline-flex items-center gap-1`}>
                      <span>{cat.icon}</span> {catLabel}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${st.color} ${st.bg} ${st.border}`}>
                      {stLabel}
                    </span>
                    {urgency && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urgency.color} ${urgency.bg} inline-flex items-center gap-1`}>
                        <span>{urgency.icon}</span> {urgency.label}
                      </span>
                    )}
                  </div>

                  {/* Title + description */}
                  <h3 className="font-semibold text-dark text-base mb-1">{decision.title}</h3>
                  {decision.description && (
                    <p className="text-sm text-muted line-clamp-2 mb-3">{decision.description}</p>
                  )}

                  {/* Deadline row */}
                  {decision.deadline && (
                    <div className="flex items-center gap-1.5 mb-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span className="text-xs text-muted">
                        {t("decisions.deadline")}: {formatDate(decision.deadline)}
                      </span>
                    </div>
                  )}

                  {/* Member vote status */}
                  <div className="space-y-1.5 mb-3">
                    {membersList.map((m) => {
                      const mv = decVotes.find((v) => v.user_id === m.user_id);
                      let statusIcon = "\u23F3";
                      let statusText = t("decisions.awaitingVote");
                      let statusColor = "text-gray-500";

                      if (mv?.vote === "concordo") {
                        statusIcon = "\u2705";
                        statusText = t("decisions.agreed");
                        statusColor = "text-green-600";
                      } else if (mv?.vote === "discordo") {
                        statusIcon = "\u274C";
                        statusText = t("decisions.disagreed");
                        statusColor = "text-red-600";
                      } else if (mv?.vote === "pensar") {
                        statusIcon = "\u{1F914}";
                        statusText = t("decisions.thinking");
                        statusColor = "text-amber-600";
                      }

                      return (
                        <div key={m.user_id} className="flex items-center gap-2">
                          <span className="text-sm">{statusIcon}</span>
                          <span className="text-xs text-dark font-medium">{m.full_name?.split(" ")[0]}</span>
                          <span className={`text-xs ${statusColor}`}>{statusText}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Missing voters callout */}
                  {isAberta && missingVoters.length > 0 && (
                    <div className="bg-gray-50 rounded-lg px-3 py-2 mb-2">
                      {missingVoters.map((m) => (
                        <p key={m.user_id} className="text-xs text-muted">
                          {t("decisions.missingVoteFrom", { name: m.full_name?.split(" ")[0] })}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Creator + date */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                    <span className="text-[11px] text-muted">
                      {creatorName?.split(" ")[0]} &middot; {formatDate(decision.created_at)}
                    </span>
                  </div>
                </a>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-gray-100 p-4 space-y-4">
                    {decision.description && (
                      <p className="text-sm text-dark">{decision.description}</p>
                    )}

                    {/* Arguments section */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Pro arguments */}
                      <div>
                        <h4 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          {t("decisions.inFavor")}
                        </h4>
                        <div className="space-y-2">
                          {openDecisionArgs
                            .filter((a) => a.argument_type === "pro")
                            .map((arg) => (
                              <div key={arg.id} className="bg-green-50 rounded-lg p-2.5">
                                <p className="text-xs font-medium text-green-800">
                                  {arg.user_name?.split(" ")[0] || t("decisions.user")}
                                </p>
                                <p className="text-sm text-green-900 mt-0.5">{arg.text}</p>
                              </div>
                            ))}
                          {openDecisionArgs.filter((a) => a.argument_type === "pro").length === 0 && (
                            <p className="text-xs text-muted italic">{t("decisions.noProArgs")}</p>
                          )}
                        </div>
                      </div>

                      {/* Contra arguments */}
                      <div>
                        <h4 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          {t("decisions.against")}
                        </h4>
                        <div className="space-y-2">
                          {openDecisionArgs
                            .filter((a) => a.argument_type === "contra")
                            .map((arg) => (
                              <div key={arg.id} className="bg-red-50 rounded-lg p-2.5">
                                <p className="text-xs font-medium text-red-800">
                                  {arg.user_name?.split(" ")[0] || t("decisions.user")}
                                </p>
                                <p className="text-sm text-red-900 mt-0.5">{arg.text}</p>
                              </div>
                            ))}
                          {openDecisionArgs.filter((a) => a.argument_type === "contra").length === 0 && (
                            <p className="text-xs text-muted italic">{t("decisions.noContraArgs")}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Add argument form */}
                    {isAberta && !isReadonly && (
                      <form action={addArgument} className="bg-gray-50 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-dark">{t("decisions.addArgument")}</p>
                        <input type="hidden" name="decisionId" value={decision.id} />
                        <div className="flex gap-2">
                          <select
                            name="argumentType"
                            required
                            className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            <option value="pro">{t("decisions.inFavor")}</option>
                            <option value="contra">{t("decisions.against")}</option>
                          </select>
                          <input
                            type="text"
                            name="text"
                            required
                            placeholder={t("decisions.argPlaceholder")}
                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark transition-colors"
                          >
                            {t("common.send")}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Vote buttons — large, clear */}
                    {isAberta && !isReadonly && (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-dark">{t("decisions.yourVote")}</p>
                        <div className="grid grid-cols-3 gap-3">
                          <form action={castVote}>
                            <input type="hidden" name="decisionId" value={decision.id} />
                            <input type="hidden" name="vote" value="concordo" />
                            <button
                              type="submit"
                              className={`w-full py-3 text-sm font-semibold rounded-xl transition-all flex flex-col items-center gap-1 ${
                                userVote?.vote === "concordo"
                                  ? "bg-green-600 text-white ring-2 ring-green-300 shadow-md"
                                  : "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                              }`}
                            >
                              <span className="text-lg">{"\u2705"}</span>
                              <span>{t("decisions.voteAgree")}</span>
                              <span className={`text-[10px] ${userVote?.vote === "concordo" ? "text-green-100" : "text-green-500"}`}>
                                {t("decisions.voteCount", { count: agreeCount })}
                              </span>
                            </button>
                          </form>
                          <form action={castVote}>
                            <input type="hidden" name="decisionId" value={decision.id} />
                            <input type="hidden" name="vote" value="discordo" />
                            <button
                              type="submit"
                              className={`w-full py-3 text-sm font-semibold rounded-xl transition-all flex flex-col items-center gap-1 ${
                                userVote?.vote === "discordo"
                                  ? "bg-red-600 text-white ring-2 ring-red-300 shadow-md"
                                  : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                              }`}
                            >
                              <span className="text-lg">{"\u274C"}</span>
                              <span>{t("decisions.voteDisagree")}</span>
                              <span className={`text-[10px] ${userVote?.vote === "discordo" ? "text-red-100" : "text-red-500"}`}>
                                {t("decisions.voteCount", { count: disagreeCount })}
                              </span>
                            </button>
                          </form>
                          <form action={castVote}>
                            <input type="hidden" name="decisionId" value={decision.id} />
                            <input type="hidden" name="vote" value="pensar" />
                            <button
                              type="submit"
                              className={`w-full py-3 text-sm font-semibold rounded-xl transition-all flex flex-col items-center gap-1 ${
                                userVote?.vote === "pensar"
                                  ? "bg-amber-500 text-white ring-2 ring-amber-300 shadow-md"
                                  : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                              }`}
                            >
                              <span className="text-lg">{"\u{1F914}"}</span>
                              <span>{t("decisions.voteNeedToThink")}</span>
                              <span className={`text-[10px] ${userVote?.vote === "pensar" ? "text-amber-100" : "text-amber-500"}`}>
                                {t("decisions.voteCount", { count: thinkCount })}
                              </span>
                            </button>
                          </form>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">{t("decisions.noDecisionsYet")}</p>
          <p className="text-sm text-muted mt-1">
            {t("decisions.createHere")}
          </p>
        </div>
      )}
    </div>
  );
}

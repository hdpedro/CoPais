"use client";

import { useTransition } from "react";
import { switchGroup } from "@/actions/group-switch";

interface GroupSelectorProps {
  groups: Array<{ id: string; name: string }>;
  activeGroupId: string;
}

export default function GroupSelector({ groups, activeGroupId }: GroupSelectorProps) {
  const [isPending, startTransition] = useTransition();

  if (groups.length < 2) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newGroupId = e.target.value;
    if (newGroupId === activeGroupId) return;
    const fd = new FormData();
    fd.set("groupId", newGroupId);
    startTransition(() => { switchGroup(fd); });
  }

  return (
    <div className="relative">
      <select
        value={activeGroupId}
        onChange={handleChange}
        disabled={isPending}
        className="appearance-none bg-primary/10 text-primary text-xs font-semibold pl-3 pr-7 py-1.5 rounded-full border-none focus:ring-2 focus:ring-primary/30 cursor-pointer disabled:opacity-50 transition-opacity"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        {isPending ? (
          <svg className="w-3 h-3 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
    </div>
  );
}

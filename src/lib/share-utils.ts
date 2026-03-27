import { ACTIVITY_CATEGORIES } from "@/lib/constants";

export interface ShareActivityData {
  name: string;
  category: string;
  childName: string;
  timeStr: string;
  location: string;
  checklistItems?: string[];
  dateLabel?: string;
}

export function formatActivityShareText(activity: ShareActivityData): string {
  const cat = ACTIVITY_CATEGORIES.find((c) => c.value === activity.category);
  const icon = cat?.icon || "📋";

  let text = `${icon} ${activity.name}`;
  if (activity.dateLabel) {
    text += ` - ${activity.dateLabel}`;
  }
  text += "\n";

  const details: string[] = [];
  if (activity.childName) details.push(activity.childName);
  if (activity.timeStr) details.push(activity.timeStr);
  if (activity.location) details.push(activity.location);
  if (details.length > 0) {
    text += details.join(" · ") + "\n";
  }

  if (activity.checklistItems && activity.checklistItems.length > 0) {
    const items = activity.checklistItems.slice(0, 5).join(", ");
    const extra = activity.checklistItems.length > 5 ? ` +${activity.checklistItems.length - 5}` : "";
    text += `📋 ${items}${extra}\n`;
  }

  text += "\nvia Kindar";
  return text;
}

export async function shareText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text });
      return true;
    } catch {
      // User cancelled or share failed — fall through to WhatsApp
    }
  }

  const encoded = encodeURIComponent(text);
  window.open(`https://wa.me/?text=${encoded}`, "_blank");
  return true;
}

/* ------------------------------------------------------------------ */
/* Fix Pipeline — shared types                                         */
/* ------------------------------------------------------------------ */

import { FolderCategory } from "@/lib/error-tracking/classify";

export interface ErrorDetails {
  id: string;
  message: string;
  stackTrace: string | null;
  filePath: string | null;
  folderCategory: FolderCategory;
}

export interface FixResult {
  fixedContent: string;
  explanation: string;
  filePath: string;
}

export interface PRResult {
  url: string;
  branch: string;
  number: number;
}

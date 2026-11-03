export type TreeListItem = {
  id: string;
  name: string;
  description: string | null;
  visibility: "private" | "unlisted" | "public";
  role: "owner" | "admin";
  shareCode: string;
  updatedAt: string;
};

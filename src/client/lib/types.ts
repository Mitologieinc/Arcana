export type MemberRole = "owner" | "admin" | "member" | "guest";
export type PageType = "page" | "database";
export type Permission = "full" | "edit" | "view" | "none";

export type User = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export type Workspace = {
  id: string;
  name: string;
  role: MemberRole;
  inviteOnly?: boolean;
  allowedDomains?: string;
  shareLinksEnabled?: boolean;
};

export type Page = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  type: PageType;
  title: string;
  icon: string | null;
  coverR2Key?: string | null;
  position: number;
  properties: string | null;
  createdBy: string;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
  archivedAt?: string | number | Date | null;
};

export type SelectOption = { id: string; name: string; color: string };

export type DbProperty = {
  id: string;
  type: "title" | "select" | "status" | "multi_select" | "date" | "person" | "number" | "checkbox" | "text" | "relation" | "formula";
  name: string;
  options?: SelectOption[];
  databaseId?: string;
  expression?: string;
};

export type DbFilter = {
  propertyId: string;
  op: "equals" | "contains";
  value: string;
};

export type DbView = {
  id: string;
  pageId: string;
  name: string;
  type: "table" | "board" | "calendar" | "gallery";
  config: {
    groupBy?: string;
    filters?: DbFilter[];
    sorts?: { propertyId: string; dir: "asc" | "desc" }[];
  };
};

export type Member = {
  userId: string;
  role: MemberRole;
  name: string;
  email: string;
};

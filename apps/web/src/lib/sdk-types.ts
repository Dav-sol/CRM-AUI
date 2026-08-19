import type {
  assignConversationTag,
  createConversationNote,
  getConversation,
  getDashboardActivity,
  getDashboardCampaigns,
  getDashboardSummary,
  listConversationNotes,
  listConversations,
  listConversationTags,
  listMessages,
  listQuickReplies,
  login,
  me,
  replyConversation,
} from "@automatize-it/sdk";

type SuccessData<T extends (...args: never[]) => Promise<{ status: number; data: unknown }>> =
  Extract<Awaited<ReturnType<T>>, { status: 200 | 201 }>["data"]["data"];

export type LoginData = NonNullable<SuccessData<typeof login>>;
export type LoginUser = LoginData["user"];

export type MeData = NonNullable<SuccessData<typeof me>>;
export type MeUser = NonNullable<MeData["user"]>;

export type ConversationListItem = SuccessData<typeof listConversations>[number];
export type ConversationListParams = Parameters<typeof listConversations>[0];

export type ConversationDetail = NonNullable<SuccessData<typeof getConversation>>;
export type ConversationMessage = ConversationDetail["messages"][number];
export type ConversationNote = ConversationDetail["notes"][number];
export type ConversationTagAssignment = ConversationDetail["tags"][number];
export type ReplyBody = Parameters<typeof replyConversation>[1];

export type ConversationNoteItem = SuccessData<typeof listConversationNotes>[number];
export type CreateNoteBody = Parameters<typeof createConversationNote>[1];

export type ConversationTagItem = SuccessData<typeof listConversationTags>[number];
export type AssignTagArgs = Parameters<typeof assignConversationTag>;

export type MessageItem = SuccessData<typeof listMessages>[number];

export type QuickReplyItem = SuccessData<typeof listQuickReplies>[number];

export type DashboardSummary = NonNullable<SuccessData<typeof getDashboardSummary>>;
export type DashboardCampaigns = NonNullable<SuccessData<typeof getDashboardCampaigns>>;
export type DashboardActivityItem = NonNullable<
  SuccessData<typeof getDashboardActivity>
>[number];
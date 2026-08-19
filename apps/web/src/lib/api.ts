import {
  archiveConversation,
  assignConversation,
  assignConversationTag,
  closeConversation,
  createConversationNote,
  createCustomer,
  createPurchase,
  getConversation,
  getDashboardActivity,
  getDashboardCampaigns,
  getDashboardSummary,
  listConversationNotes,
  listConversations,
  listConversationTags,
  listCustomers,
  listMessages,
  listProducts,
  listPurchases,
  listQuickReplies,
  login,
  logout,
  me,
  removeConversationTag,
  reopenConversation,
  replyConversation,
  transferConversation,
} from "@automatize-it/sdk";

import { authStore, notifySessionExpired, refreshAccessToken } from "./auth";
import type {
  AssignTagArgs,
  ConversationListParams,
  CreateCustomerBody,
  CreateNoteBody,
  CreatePurchaseBody,
  CustomerListParams,
  LoginData,
  MeData,
  ProductListParams,
  PurchaseListParams,
  ReplyBody,
} from "./sdk-types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, "SESSION_EXPIRED", "Tu sesión ha expirado. Inicia sesión nuevamente.");
    this.name = "SessionExpiredError";
  }
}

type SdkFn = (...args: never[]) => Promise<{ status: number; data: unknown }>;
type SdkResult = { status: number; data: unknown };
type SdkData<T extends SdkFn> = NonNullable<
  Extract<Awaited<ReturnType<T>>, { status: 200 | 201 }>["data"]["data"]
>;

function buildOptions(): RequestInit {
  const headers: Record<string, string> = {};
  const token = authStore.token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return { credentials: "include", headers };
}

async function call<T extends SdkResult>(
  run: (options: RequestInit) => Promise<T>,
): Promise<T> {
  const res = await run(buildOptions());
  if (res.status !== 401) {
    return res;
  }
  const token = await refreshAccessToken();
  if (!token) {
    notifySessionExpired();
    throw new SessionExpiredError();
  }
  const retry = await run(buildOptions());
  if (retry.status === 401) {
    notifySessionExpired();
    throw new SessionExpiredError();
  }
  return retry;
}

function unwrap<T extends SdkFn>(fn: T, res: Awaited<ReturnType<T>>): SdkData<T> {
  if (res.status >= 200 && res.status < 300) {
    return ((res.data as { data?: unknown } | null)?.data ?? res.data) as SdkData<T>;
  }
  const error = (res.data ?? {}) as { code?: string; message?: string };
  throw new ApiError(
    res.status,
    error.code ?? "UNKNOWN_ERROR",
    error.message ?? "Error inesperado del servidor",
  );
}

type ListSdkFn = (...args: never[]) => Promise<{
  status: number;
  data: { data?: unknown[]; meta?: unknown } | null;
}>;

async function callList<T extends ListSdkFn>(
  run: (options: RequestInit) => Promise<Awaited<ReturnType<T>>>,
): Promise<NonNullable<Extract<Awaited<ReturnType<T>>, { status: 200 | 201 }>["data"]>> {
  const res = await call(run);
  if (res.status >= 200 && res.status < 300) {
    return res.data as NonNullable<
      Extract<Awaited<ReturnType<T>>, { status: 200 | 201 }>["data"]
    >;
  }
  const error = (res.data ?? {}) as { code?: string; message?: string };
  throw new ApiError(
    res.status,
    error.code ?? "UNKNOWN_ERROR",
    error.message ?? "Error inesperado del servidor",
  );
}

export async function apiLogin(body: Parameters<typeof login>[0]): Promise<LoginData> {
  const res = await login(body, { credentials: "include" });
  return unwrap(login, res);
}

export async function apiLogout(): Promise<void> {
  await logout({ credentials: "include" });
}

export async function apiMe(): Promise<MeData> {
  const res = await call((options) => me(options));
  return unwrap(me, res);
}

export async function apiListConversations(
  params?: ConversationListParams,
): Promise<SdkData<typeof listConversations>> {
  const res = await call((options) => listConversations(params, options));
  return unwrap(listConversations, res);
}

export async function apiGetConversation(
  uuid: string,
): Promise<SdkData<typeof getConversation>> {
  const res = await call((options) => getConversation(uuid, options));
  return unwrap(getConversation, res);
}

export async function apiReplyConversation(
  uuid: string,
  body: ReplyBody,
): Promise<SdkData<typeof replyConversation>> {
  const res = await call((options) => replyConversation(uuid, body, options));
  return unwrap(replyConversation, res);
}

export async function apiAssignConversation(
  uuid: string,
  body: Parameters<typeof assignConversation>[1],
): Promise<SdkData<typeof assignConversation>> {
  const res = await call((options) => assignConversation(uuid, body, options));
  return unwrap(assignConversation, res);
}

export async function apiTransferConversation(
  uuid: string,
  body: Parameters<typeof transferConversation>[1],
): Promise<SdkData<typeof transferConversation>> {
  const res = await call((options) => transferConversation(uuid, body, options));
  return unwrap(transferConversation, res);
}

export async function apiCloseConversation(
  uuid: string,
): Promise<SdkData<typeof closeConversation>> {
  const res = await call((options) => closeConversation(uuid, options));
  return unwrap(closeConversation, res);
}

export async function apiArchiveConversation(
  uuid: string,
): Promise<SdkData<typeof archiveConversation>> {
  const res = await call((options) => archiveConversation(uuid, options));
  return unwrap(archiveConversation, res);
}

export async function apiReopenConversation(
  uuid: string,
): Promise<SdkData<typeof reopenConversation>> {
  const res = await call((options) => reopenConversation(uuid, options));
  return unwrap(reopenConversation, res);
}

export async function apiListMessages(
  conversationId: string,
): Promise<SdkData<typeof listMessages>> {
  const res = await call((options) => listMessages({ conversationId }, options));
  return unwrap(listMessages, res);
}

export async function apiListConversationNotes(
  uuid: string,
): Promise<SdkData<typeof listConversationNotes>> {
  const res = await call((options) => listConversationNotes(uuid, options));
  return unwrap(listConversationNotes, res);
}

export async function apiCreateConversationNote(
  uuid: string,
  body: CreateNoteBody,
): Promise<SdkData<typeof createConversationNote>> {
  const res = await call((options) => createConversationNote(uuid, body, options));
  return unwrap(createConversationNote, res);
}

export async function apiListConversationTags(): Promise<SdkData<typeof listConversationTags>> {
  const res = await call((options) => listConversationTags({}, options));
  return unwrap(listConversationTags, res);
}

export async function apiAssignConversationTag(
  uuid: string,
  tagId: AssignTagArgs[1],
): Promise<SdkData<typeof assignConversationTag>> {
  const res = await call((options) => assignConversationTag(uuid, tagId, options));
  return unwrap(assignConversationTag, res);
}

export async function apiRemoveConversationTag(
  uuid: string,
  tagId: string,
): Promise<SdkData<typeof removeConversationTag>> {
  const res = await call((options) => removeConversationTag(uuid, tagId, options));
  return unwrap(removeConversationTag, res);
}

export async function apiListQuickReplies(): Promise<SdkData<typeof listQuickReplies>> {
  const res = await call((options) => listQuickReplies({}, options));
  return unwrap(listQuickReplies, res);
}

export async function apiDashboardSummary(): Promise<SdkData<typeof getDashboardSummary>> {
  const res = await call((options) => getDashboardSummary(options));
  return unwrap(getDashboardSummary, res);
}

export async function apiDashboardCampaigns(): Promise<SdkData<typeof getDashboardCampaigns>> {
  const res = await call((options) => getDashboardCampaigns(options));
  return unwrap(getDashboardCampaigns, res);
}

export async function apiDashboardActivity(): Promise<SdkData<typeof getDashboardActivity>> {
  const res = await call((options) => getDashboardActivity(options));
  return unwrap(getDashboardActivity, res);
}

export async function apiListCustomers(
  params?: CustomerListParams,
): Promise<NonNullable<Extract<Awaited<ReturnType<typeof listCustomers>>, { status: 200 }>["data"]>> {
  return callList((options) => listCustomers(params, options));
}

export async function apiCreateCustomer(
  body: CreateCustomerBody,
): Promise<SdkData<typeof createCustomer>> {
  const res = await call((options) => createCustomer(body, options));
  return unwrap(createCustomer, res);
}

export async function apiListProducts(
  params?: ProductListParams,
): Promise<NonNullable<Extract<Awaited<ReturnType<typeof listProducts>>, { status: 200 }>["data"]>> {
  return callList((options) => listProducts(params, options));
}

export async function apiListPurchases(
  params?: PurchaseListParams,
): Promise<NonNullable<Extract<Awaited<ReturnType<typeof listPurchases>>, { status: 200 }>["data"]>> {
  return callList((options) => listPurchases(params, options));
}

export async function apiCreatePurchase(
  body: CreatePurchaseBody,
): Promise<SdkData<typeof createPurchase>> {
  const res = await call((options) => createPurchase(body, options));
  return unwrap(createPurchase, res);
}
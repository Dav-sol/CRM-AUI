import {
  activateCampaign,
  approveCampaign,
  archiveConversation,
  assignConversation,
  assignConversationTag,
  cancelAutomation,
  cancelCampaign,
  cancelImportJob,
  closeConversation,
  createCampaign,
  createConversationNote,
  createCustomer,
  customerAllowContact,
  customerNoContact,
  createImportJob,
  createProduct,
  createPurchase,
  createFollowUpSequence,
  createQuote,
  acceptQuote,
  rejectQuote,
  sendQuote,
  expireQuote,
  getQuote,
  listQuotes,
  updateQuote,
  deleteFollowUpSequence,
  getAutomation,
  getCampaign,
  getCommercialCycle,
  getConversation,
  getCustomer,
  getDashboardActivity,
  getDashboardActionable,
  getDashboardCampaigns,
  getDashboardSummary,
  getFollowUpSequence,
  getImportJob,
  getPurchase,
  getPurchaseStats,
  listAutomations,
  listCampaigns,
  listCommercialCycles,
  listConversationNotes,
  listConversations,
  listConversationTags,
  listCustomers,
  listFollowUpSequences,
  listImportJobs,
  listMessages,
  listProducts,
  listPurchases,
  listQuickReplies,
  login,
  logout,
  me,
  pauseCampaign,
  previewCampaignSegment,
  previewCampaignSegmentDraft,
  removeConversationTag,
  reopenConversation,
  replyConversation,
  resumeCampaign,
  retryImportJob,
  transferConversation,
  updateFollowUpSequence,
  updateCustomer,
  updateProduct,
  updateCampaign,
  deleteProduct,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@automatize-it/sdk";

import type { ListQuotes200DataItem } from "@automatize-it/sdk/model/listQuotes200DataItem";
import type { PreviewCampaignSegmentDraftBodyType } from "@automatize-it/sdk/model/previewCampaignSegmentDraftBodyType";

import { authStore, notifySessionExpired, refreshAccessToken } from "./auth";
import type {
  AssignTagArgs,
  AutomationListParams,
  CampaignListParams,
  CommercialCycleListParams,
  ConversationListParams,
  CreateCampaignBody,
  CreateCustomerBody,
  CreateFollowUpSequenceBody,
  CreateImportJobBody,
  CreateNoteBody,
  CreateProductBody,
  CreatePurchaseBody,
  CustomerListParams,
  FollowUpSequenceListParams,
  ImportJobListParams,
  LoginData,
  MeData,
  ProductListParams,
  PurchaseListParams,
  ReplyBody,
  UpdateCampaignBody,
  UpdateFollowUpSequenceBody,
  UpdateCustomerBody,
  UpdateProductBody,
  TemplateListParams,
  CreateTemplateBody,
  UpdateTemplateBody,
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
    super(
      401,
      "SESSION_EXPIRED",
      "Tu sesión ha expirado. Inicia sesión nuevamente.",
    );
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

function unwrap<T extends SdkFn>(
  fn: T,
  res: Awaited<ReturnType<T>>,
): SdkData<T> {
  if (res.status >= 200 && res.status < 300) {
    return ((res.data as { data?: unknown } | null)?.data ??
      res.data) as SdkData<T>;
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
): Promise<
  NonNullable<Extract<Awaited<ReturnType<T>>, { status: 200 | 201 }>["data"]>
> {
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

export async function apiLogin(
  body: Parameters<typeof login>[0],
): Promise<LoginData> {
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

export async function apiCustomerNoContact(
  id: string,
  reason?: string,
): Promise<SdkData<typeof customerNoContact>> {
  const res = await call((options) =>
    customerNoContact(id, { reason }, options),
  );
  return unwrap(customerNoContact, res);
}

export async function apiCustomerAllowContact(
  id: string,
): Promise<SdkData<typeof customerAllowContact>> {
  const res = await call((options) => customerAllowContact(id, options));
  return unwrap(customerAllowContact, res);
}

export async function apiCreateQuote(body: {
  conversationId?: string;
  customerId?: string;
  campaignId?: string;
  productId?: string;
  quantity?: number;
  value: number;
  note?: string;
}): Promise<SdkData<typeof createQuote>> {
  const res = await call((options) => createQuote(body, options));
  return unwrap(createQuote, res);
}

export async function apiListQuotes(
  params?: Parameters<typeof listQuotes>[0],
): Promise<ListQuotes200DataItem[]> {
  const res = await call((options) => listQuotes(params, options));
  if (res.status >= 200 && res.status < 300) {
    const body = res.data as
      ListQuotes200DataItem[] | { data?: ListQuotes200DataItem[] };
    return Array.isArray(body) ? body : (body.data ?? []);
  }
  const error = (res.data ?? {}) as { code?: string; message?: string };
  throw new ApiError(
    res.status,
    error.code ?? "REQUEST_FAILED",
    error.message ?? "Request failed",
  );
}

export async function apiGetQuote(
  uuid: string,
): Promise<SdkData<typeof getQuote>> {
  const res = await call((options) => getQuote(uuid, options));
  return unwrap(getQuote, res);
}

export async function apiUpdateQuote(
  uuid: string,
  body: {
    productId?: string;
    quantity?: number;
    value?: number;
    note?: string;
  },
): Promise<SdkData<typeof updateQuote>> {
  const res = await call((options) => updateQuote(uuid, body, options));
  return unwrap(updateQuote, res);
}

export async function apiSendQuote(
  uuid: string,
): Promise<SdkData<typeof sendQuote>> {
  const res = await call((options) => sendQuote(uuid, options));
  return unwrap(sendQuote, res);
}

export async function apiAcceptQuote(
  uuid: string,
): Promise<SdkData<typeof acceptQuote>> {
  const res = await call((options) => acceptQuote(uuid, options));
  return unwrap(acceptQuote, res);
}

export async function apiRejectQuote(
  uuid: string,
): Promise<SdkData<typeof rejectQuote>> {
  const res = await call((options) => rejectQuote(uuid, options));
  return unwrap(rejectQuote, res);
}

export async function apiExpireQuote(
  uuid: string,
): Promise<SdkData<typeof expireQuote>> {
  const res = await call((options) => expireQuote(uuid, options));
  return unwrap(expireQuote, res);
}

export async function apiGetCustomer(
  uuid: string,
): Promise<SdkData<typeof getCustomer>> {
  const res = await call((options) => getCustomer(uuid, options));
  return unwrap(getCustomer, res);
}

export interface CustomerTimeline {
  customer: { uuid: string; name: string; status: string };
  purchases: Array<{
    uuid: string;
    invoiceNumber: string;
    purchaseDate: string;
    quantity: number;
    value: number;
    warrantyMonths: number | null;
    warrantyExpiresAt: string | null;
    status: string;
    product: { uuid: string; name: string; code: string };
    automations: Array<{
      uuid: string;
      stageName: string | null;
      scheduledDate: string;
      executedDate: string | null;
      status: string;
      purpose: string;
      messagePreview: string | null;
    }>;
  }>;
  quotes: Array<{
    uuid: string;
    value: number;
    status: string;
    createdAt: string;
    sentAt: string | null;
  }>;
  conversations: Array<{
    uuid: string;
    channel: string;
    status: string;
    messageCount: number;
    createdAt: string;
  }>;
}

export async function apiGetCustomerTimeline(
  uuid: string,
): Promise<CustomerTimeline> {
  const opts = buildOptions();
  const res = await fetch(`/api/v1/customers/${uuid}/timeline`, opts);
  if (res.status === 401) {
    const token = await refreshAccessToken();
    if (!token) {
      notifySessionExpired();
      throw new SessionExpiredError();
    }
    const retry = await fetch(`/api/v1/customers/${uuid}/timeline`, {
      ...opts,
      headers: { ...opts.headers, Authorization: `Bearer ${token}` },
    });
    if (!retry.ok) throw new ApiError(retry.status, "FETCH_ERROR", "Error loading timeline");
    return (await retry.json()).data;
  }
  if (!res.ok) throw new ApiError(res.status, "FETCH_ERROR", "Error loading timeline");
  return (await res.json()).data;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportParams {
  from?: string;
  to?: string;
  groupBy?: "day" | "week" | "month";
  search?: string;
}

export interface CustomerReport {
  summary: {
    total: number;
    newInPeriod: number;
    pendingContact: number;
    blocked: number;
  };
  rows: Array<{ label: string; value: number; [key: string]: unknown }>;
}

export interface PurchaseReport {
  summary: {
    total: number;
    totalValue: number;
    unitsInPeriod: number;
    valueInPeriod: number;
    avgTicket: number;
  };
  rows: Array<{ label: string; value: number; totalValue: number; [key: string]: unknown }>;
}

export interface CampaignReport {
  summary: {
    total: number;
    active: number;
    finished: number;
    totalSent: number;
    totalDelivered: number;
    totalResponded: number;
    totalSales: number;
    totalRevenue: number;
  };
  rows: Array<{ label: string; value: number; status: string; type: string; delivered: number; responded: number; sales: number; revenue: number }>;
}

export interface AutomationReport {
  summary: {
    total: number;
    pending: number;
    executed: number;
    errors: number;
    successRate: number;
  };
  rows: Array<{ label: string; value: number; [key: string]: unknown }>;
}

export interface MessageReport {
  summary: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    deliveryRate: number;
  };
  rows: Array<{ label: string; value: number; sent: number; failed: number; [key: string]: unknown }>;
}

function buildReportUrl(endpoint: string, params?: ReportParams): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.groupBy) qs.set("groupBy", params.groupBy);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();
  return `${base}/api/v1/reports/${endpoint}${query ? `?${query}` : ""}`;
}

async function fetchReport<T>(endpoint: string, params?: ReportParams): Promise<T> {
  const url = buildReportUrl(endpoint, params);
  const res = await fetch(url, { ...buildOptions() });
  if (res.status === 401) {
    const token = await refreshAccessToken();
    if (!token) {
      notifySessionExpired();
      throw new SessionExpiredError();
    }
    const retry = await fetch(url, { ...buildOptions() });
    if (!retry.ok) throw new ApiError(retry.status, "ERROR", await retry.text());
    return (await retry.json()).data;
  }
  if (!res.ok) throw new ApiError(res.status, "ERROR", await res.text());
  return (await res.json()).data;
}

export async function apiReportCustomers(params?: ReportParams): Promise<CustomerReport> {
  return fetchReport<CustomerReport>("customers", params);
}

export async function apiReportPurchases(params?: ReportParams): Promise<PurchaseReport> {
  return fetchReport<PurchaseReport>("purchases", params);
}

export async function apiReportCampaigns(params?: ReportParams): Promise<CampaignReport> {
  return fetchReport<CampaignReport>("campaigns", params);
}

export async function apiReportAutomations(params?: ReportParams): Promise<AutomationReport> {
  return fetchReport<AutomationReport>("automations", params);
}

export async function apiReportMessages(params?: ReportParams): Promise<MessageReport> {
  return fetchReport<MessageReport>("messages", params);
}

export async function apiGetPurchase(
  uuid: string,
): Promise<SdkData<typeof getPurchase>> {
  const res = await call((options) => getPurchase(uuid, options));
  return unwrap(getPurchase, res);
}

export async function apiPurchaseStats(
  params?: Parameters<typeof getPurchaseStats>[0],
): Promise<SdkData<typeof getPurchaseStats>> {
  const res = await call((options) => getPurchaseStats(params, options));
  return unwrap(getPurchaseStats, res);
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
  const res = await call((options) =>
    transferConversation(uuid, body, options),
  );
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
  const res = await call((options) =>
    listMessages({ conversationId }, options),
  );
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
  const res = await call((options) =>
    createConversationNote(uuid, body, options),
  );
  return unwrap(createConversationNote, res);
}

export async function apiListConversationTags(): Promise<
  SdkData<typeof listConversationTags>
> {
  const res = await call((options) => listConversationTags({}, options));
  return unwrap(listConversationTags, res);
}

export async function apiAssignConversationTag(
  uuid: string,
  tagId: AssignTagArgs[1],
): Promise<SdkData<typeof assignConversationTag>> {
  const res = await call((options) =>
    assignConversationTag(uuid, tagId, options),
  );
  return unwrap(assignConversationTag, res);
}

export async function apiRemoveConversationTag(
  uuid: string,
  tagId: string,
): Promise<SdkData<typeof removeConversationTag>> {
  const res = await call((options) =>
    removeConversationTag(uuid, tagId, options),
  );
  return unwrap(removeConversationTag, res);
}

export async function apiListQuickReplies(): Promise<
  SdkData<typeof listQuickReplies>
> {
  const res = await call((options) => listQuickReplies({}, options));
  return unwrap(listQuickReplies, res);
}

export async function apiDashboardSummary(
  params?: Parameters<typeof getDashboardSummary>[0],
): Promise<SdkData<typeof getDashboardSummary>> {
  const res = await call((options) => getDashboardSummary(params, options));
  return unwrap(getDashboardSummary, res);
}

export async function apiDashboardCampaigns(): Promise<
  SdkData<typeof getDashboardCampaigns>
> {
  const res = await call((options) => getDashboardCampaigns(options));
  return unwrap(getDashboardCampaigns, res);
}

export async function apiDashboardActivity(
  params?: Parameters<typeof getDashboardActivity>[0],
): Promise<SdkData<typeof getDashboardActivity>> {
  const res = await call((options) => getDashboardActivity(params, options));
  return unwrap(getDashboardActivity, res);
}

export async function apiDashboardActionable(): Promise<
  SdkData<typeof getDashboardActionable>
> {
  const res = await call((options) => getDashboardActionable(options));
  return unwrap(getDashboardActionable, res);
}

export interface AggregatedMessage {
  id: string;
  source: "campaign_template" | "campaign_stage" | "sequence_stage" | "quick_reply";
  sourceName: string;
  sourceId: string;
  body: string;
  anchor?: string;
  offsetDays?: number;
  updatedAt: string;
}

export async function apiMessagesOverview(): Promise<AggregatedMessage[]> {
  const opts = buildOptions();
  const res = await fetch("/api/v1/message-overview", opts);
  if (res.status === 401) {
    const token = await refreshAccessToken();
    if (!token) {
      notifySessionExpired();
      throw new SessionExpiredError();
    }
    const retry = await fetch("/api/v1/message-overview", {
      ...opts,
      headers: { ...opts.headers, Authorization: `Bearer ${token}` },
    });
    if (!retry.ok) throw new ApiError(retry.status, "FETCH_ERROR", "Error loading messages");
    const json = await retry.json();
    return json.data;
  }
  if (!res.ok) throw new ApiError(res.status, "FETCH_ERROR", "Error loading messages");
  const json = await res.json();
  return json.data;
}

export async function apiListCustomers(
  params?: CustomerListParams,
): Promise<
  NonNullable<
    Extract<Awaited<ReturnType<typeof listCustomers>>, { status: 200 }>["data"]
  >
> {
  return callList((options) => listCustomers(params, options));
}

export async function apiCreateCustomer(
  body: CreateCustomerBody,
): Promise<SdkData<typeof createCustomer>> {
  const res = await call((options) => createCustomer(body, options));
  return unwrap(createCustomer, res);
}

export async function apiUpdateCustomer(
  id: string,
  body: UpdateCustomerBody,
): Promise<SdkData<typeof updateCustomer>> {
  const res = await call((options) => updateCustomer(id, body, options));
  return unwrap(updateCustomer, res);
}

export async function apiListProducts(
  params?: ProductListParams,
): Promise<
  NonNullable<
    Extract<Awaited<ReturnType<typeof listProducts>>, { status: 200 }>["data"]
  >
> {
  return callList((options) => listProducts(params, options));
}

export async function apiCreateProduct(
  body: CreateProductBody,
): Promise<SdkData<typeof createProduct>> {
  const res = await call((options) => createProduct(body, options));
  return unwrap(createProduct, res);
}

export async function apiUpdateProduct(
  id: string,
  body: UpdateProductBody,
): Promise<SdkData<typeof updateProduct>> {
  const res = await call((options) => updateProduct(id, body, options));
  return unwrap(updateProduct, res);
}

export async function apiDeleteProduct(
  id: string,
): Promise<SdkData<typeof deleteProduct>> {
  const res = await call((options) => deleteProduct(id, options));
  return unwrap(deleteProduct, res);
}

export async function apiListTemplates(
  params?: TemplateListParams,
): Promise<
  NonNullable<
    Extract<Awaited<ReturnType<typeof listTemplates>>, { status: 200 }>["data"]
  >
> {
  return callList((options) => listTemplates(params, options));
}

export async function apiGetTemplate(
  id: string,
): Promise<SdkData<typeof getTemplate>> {
  const res = await call((options) => getTemplate(id, options));
  return unwrap(getTemplate, res);
}

export async function apiCreateTemplate(
  body: CreateTemplateBody,
): Promise<SdkData<typeof createTemplate>> {
  const res = await call((options) => createTemplate(body, options));
  return unwrap(createTemplate, res);
}

export async function apiUpdateTemplate(
  id: string,
  body: UpdateTemplateBody,
): Promise<SdkData<typeof updateTemplate>> {
  const res = await call((options) => updateTemplate(id, body, options));
  return unwrap(updateTemplate, res);
}

export async function apiDeleteTemplate(
  id: string,
): Promise<SdkData<typeof deleteTemplate>> {
  const res = await call((options) => deleteTemplate(id, options));
  return unwrap(deleteTemplate, res);
}

export async function apiListPurchases(
  params?: PurchaseListParams,
): Promise<
  NonNullable<
    Extract<Awaited<ReturnType<typeof listPurchases>>, { status: 200 }>["data"]
  >
> {
  return callList((options) => listPurchases(params, options));
}

export async function apiCreatePurchase(
  body: CreatePurchaseBody,
): Promise<SdkData<typeof createPurchase>> {
  const res = await call((options) => createPurchase(body, options));
  return unwrap(createPurchase, res);
}

export async function apiListCampaigns(
  params?: CampaignListParams,
): Promise<
  NonNullable<
    Extract<Awaited<ReturnType<typeof listCampaigns>>, { status: 200 }>["data"]
  >
> {
  return callList((options) => listCampaigns(params, options));
}

export async function apiCreateCampaign(
  body: CreateCampaignBody,
): Promise<SdkData<typeof createCampaign>> {
  const res = await call((options) => createCampaign(body, options));
  return unwrap(createCampaign, res);
}

export async function apiUpdateCampaign(
  uuid: string,
  body: UpdateCampaignBody,
): Promise<SdkData<typeof updateCampaign>> {
  const res = await call((options) => updateCampaign(uuid, body, options));
  return unwrap(updateCampaign, res);
}

export async function apiActivateCampaign(
  uuid: string,
): Promise<SdkData<typeof activateCampaign>> {
  const res = await call((options) => activateCampaign(uuid, options));
  return unwrap(activateCampaign, res);
}

export async function apiApproveCampaign(
  uuid: string,
): Promise<SdkData<typeof approveCampaign>> {
  const res = await call((options) => approveCampaign(uuid, options));
  return unwrap(approveCampaign, res);
}

export async function apiPauseCampaign(
  uuid: string,
): Promise<SdkData<typeof pauseCampaign>> {
  const res = await call((options) => pauseCampaign(uuid, options));
  return unwrap(pauseCampaign, res);
}

export async function apiResumeCampaign(
  uuid: string,
): Promise<SdkData<typeof resumeCampaign>> {
  const res = await call((options) => resumeCampaign(uuid, options));
  return unwrap(resumeCampaign, res);
}

export async function apiCancelCampaign(
  uuid: string,
): Promise<SdkData<typeof cancelCampaign>> {
  const res = await call((options) => cancelCampaign(uuid, options));
  return unwrap(cancelCampaign, res);
}

export async function apiGetCampaign(
  uuid: string,
): Promise<SdkData<typeof getCampaign>> {
  const res = await call((options) => getCampaign(uuid, options));
  return unwrap(getCampaign, res);
}

export async function apiPreviewCampaignSegment(
  uuid: string,
  segment?: Record<string, unknown>,
): Promise<{
  count: number;
  estimatedAutomations: number;
  estimatedCost: number;
}> {
  const res = await call((options) =>
    previewCampaignSegment(uuid, segment, options),
  );
  return unwrap(previewCampaignSegment, res);
}

export async function apiPreviewCampaignSegmentDraft(body: {
  segment?: Record<string, unknown>;
  followUpSequenceId?: string;
  type?: PreviewCampaignSegmentDraftBodyType;
  channel?: "SMS" | "WHATSAPP_CLIENTS";
}): Promise<{
  count: number;
  estimatedAutomations: number;
  estimatedCost: number;
  estimatedSegments?: number;
  estimatedMessages?: number;
  currency?: string;
}> {
  const res = await call((options) =>
    previewCampaignSegmentDraft(body, options),
  );
  return unwrap(previewCampaignSegmentDraft, res);
}

export async function apiListAutomations(
  params?: AutomationListParams,
): Promise<
  NonNullable<
    Extract<
      Awaited<ReturnType<typeof listAutomations>>,
      { status: 200 }
    >["data"]
  >
> {
  return callList((options) => listAutomations(params, options));
}

export async function apiGetAutomation(
  uuid: string,
): Promise<SdkData<typeof getAutomation>> {
  const res = await call((options) => getAutomation(uuid, options));
  return unwrap(getAutomation, res);
}

export async function apiCancelAutomation(
  uuid: string,
): Promise<SdkData<typeof cancelAutomation>> {
  const res = await call((options) => cancelAutomation(uuid, options));
  return unwrap(cancelAutomation, res);
}

export async function apiListCommercialCycles(
  params?: CommercialCycleListParams,
): Promise<
  NonNullable<
    Extract<
      Awaited<ReturnType<typeof listCommercialCycles>>,
      { status: 200 }
    >["data"]
  >
> {
  return callList((options) => listCommercialCycles(params, options));
}

export async function apiGetCommercialCycle(
  uuid: string,
): Promise<SdkData<typeof getCommercialCycle>> {
  const res = await call((options) => getCommercialCycle(uuid, options));
  return unwrap(getCommercialCycle, res);
}

export async function apiListImportJobs(
  params?: ImportJobListParams,
): Promise<
  NonNullable<
    Extract<Awaited<ReturnType<typeof listImportJobs>>, { status: 200 }>["data"]
  >
> {
  return callList((options) => listImportJobs(params, options));
}

export async function apiCreateImportJob(
  body: CreateImportJobBody,
): Promise<SdkData<typeof createImportJob>> {
  const res = await call((options) => createImportJob(body, options));
  return unwrap(createImportJob, res);
}

export async function apiGetImportJob(
  uuid: string,
): Promise<SdkData<typeof getImportJob>> {
  const res = await call((options) => getImportJob(uuid, options));
  return unwrap(getImportJob, res);
}

export async function apiCancelImportJob(
  uuid: string,
): Promise<SdkData<typeof cancelImportJob>> {
  const res = await call((options) => cancelImportJob(uuid, options));
  return unwrap(cancelImportJob, res);
}

export async function apiRetryImportJob(
  uuid: string,
): Promise<SdkData<typeof retryImportJob>> {
  const res = await call((options) => retryImportJob(uuid, options));
  return unwrap(retryImportJob, res);
}

export async function apiListFollowUpSequences(
  params?: FollowUpSequenceListParams,
): Promise<
  NonNullable<
    Extract<
      Awaited<ReturnType<typeof listFollowUpSequences>>,
      { status: 200 }
    >["data"]
  >
> {
  return callList((options) => listFollowUpSequences(params, options));
}

export async function apiCreateFollowUpSequence(
  body: CreateFollowUpSequenceBody,
): Promise<SdkData<typeof createFollowUpSequence>> {
  const res = await call((options) => createFollowUpSequence(body, options));
  return unwrap(createFollowUpSequence, res);
}

export async function apiGetFollowUpSequence(
  uuid: string,
): Promise<SdkData<typeof getFollowUpSequence>> {
  const res = await call((options) => getFollowUpSequence(uuid, options));
  return unwrap(getFollowUpSequence, res);
}

export async function apiUpdateFollowUpSequence(
  uuid: string,
  body: UpdateFollowUpSequenceBody,
): Promise<SdkData<typeof updateFollowUpSequence>> {
  const res = await call((options) =>
    updateFollowUpSequence(uuid, body, options),
  );
  return unwrap(updateFollowUpSequence, res);
}

export async function apiDeleteFollowUpSequence(
  uuid: string,
): Promise<SdkData<typeof deleteFollowUpSequence>> {
  const res = await call((options) => deleteFollowUpSequence(uuid, options));
  return unwrap(deleteFollowUpSequence, res);
}

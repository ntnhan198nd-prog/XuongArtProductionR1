import "server-only";
import { NextResponse } from "next/server";

// Server-side helpers so admin route handlers ALWAYS answer with JSON.
//
// Before this, an exception inside a handler (most commonly: the R2 content
// store is unreachable because the R2 credentials/env on the host are wrong
// or missing) escaped Next.js and produced a 500 with an EMPTY body. The
// admin UI then crashed on `response.json()` with the cryptic
// "Unexpected end of JSON input" and nobody could see the real cause.
//
// These helpers are meant for admin-authenticated routes only: exposing the
// error class (e.g. InvalidAccessKeyId) and the names of missing env vars is
// precisely what makes the failure diagnosable from the browser, and the
// admin already knows those values. Public routes keep generic messages.

export const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

// Map an exception thrown by the content store / R2 SDK to a readable
// message + an actionable hint (in Vietnamese, matching the admin UI).
export function describeServerError(error) {
  const rawName = String(error?.name || error?.Code || "").trim();
  // Generic JS error classes carry no diagnostic value as a prefix
  // ("Error: R2 is not configured…"); SDK codes (InvalidAccessKeyId,
  // NoSuchBucket, …) do, so keep those. "Unknown/UnknownError" is what the
  // AWS SDK uses when the response had no parseable error body (e.g. a 401
  // on HeadBucket) — the HTTP status is the useful part there.
  const GENERIC_NAMES = /^(Error|TypeError|RangeError|SyntaxError|Unknown|UnknownError)$/;
  const name = GENERIC_NAMES.test(rawName) ? "" : rawName;
  const status = error?.$metadata?.httpStatusCode;
  let raw = String(error?.message || error || "").trim();
  if (!raw || GENERIC_NAMES.test(raw)) {
    raw = status ? `R2 trả về HTTP ${status} (không có nội dung lỗi)` : "Unknown error";
  }

  let hint = "";
  if (/R2 is not configured/i.test(raw)) {
    hint =
      "Server thiếu biến môi trường R2. Trên Vercel: Project → Settings → Environment Variables, điền đủ R2_ACCOUNT_ID (hoặc R2_ENDPOINT), R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL cho môi trường Production, sau đó bấm Redeploy (env chỉ có hiệu lực sau khi deploy lại).";
  } else if (name === "InvalidAccessKeyId") {
    hint =
      "R2_ACCESS_KEY_ID không tồn tại — token đã bị xoá hoặc thuộc account Cloudflare khác (ví dụ sau khi chuyển account R2). Tạo lại R2 API Token trên account đang dùng, cập nhật env trên Vercel rồi Redeploy.";
  } else if (name === "SignatureDoesNotMatch") {
    hint =
      "R2_SECRET_ACCESS_KEY sai. Copy lại Secret Access Key (chỉ hiện một lần lúc tạo token) hoặc tạo token mới.";
  } else if (name === "NoSuchBucket") {
    hint =
      "R2_BUCKET không tồn tại trên account này — kiểm tra lại tên bucket (và account ID/endpoint có đúng account chứa bucket không).";
  } else if (name === "AccessDenied" || status === 403) {
    hint =
      "R2 API Token không đủ quyền (cần Object Read & Write cho bucket này) hoặc account/bucket không khớp với token.";
  } else if (status === 401 || name === "Unauthorized") {
    hint =
      "R2 từ chối xác thực — kiểm tra R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ACCOUNT_ID trên server.";
  } else if (
    /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|TimeoutError|NetworkingError|fetch failed/i.test(
      `${name} ${raw}`
    )
  ) {
    hint =
      "Không kết nối được tới endpoint R2 — kiểm tra R2_ACCOUNT_ID / R2_ENDPOINT (dạng https://<account-id>.r2.cloudflarestorage.com).";
  }

  const statusSuffix =
    status && !raw.includes(`HTTP ${status}`) ? ` (HTTP ${status})` : "";
  const message = `${name && !raw.startsWith(name) ? `${name}: ` : ""}${raw}${statusSuffix}`;

  return {
    message,
    hint,
    code: name || (status ? `HTTP_${status}` : "INTERNAL_ERROR"),
  };
}

// Build the JSON 500 response for an unexpected error in an admin route.
// `prefix` lets the route say what it was doing ("Không đọc được kho nội dung
// trên R2 —") so the admin sees both the operation and the underlying cause.
export function serverErrorResponse(error, { context = "", prefix = "" } = {}) {
  console.error(`[api${context ? ` ${context}` : ""}]`, error);
  const { message, hint, code } = describeServerError(error);
  return NextResponse.json(
    {
      error: prefix ? `${prefix} ${message}` : message,
      hint,
      code,
    },
    { status: 500, headers: NO_STORE_HEADERS }
  );
}

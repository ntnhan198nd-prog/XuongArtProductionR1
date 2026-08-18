// Client-safe helpers for calling our own /api routes from the admin UI.
//
// Why this exists: a bare `await response.json()` throws
// "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
// whenever the server answers with an EMPTY body — which is exactly what
// Next.js/Vercel return when a route handler throws before it can build a
// JSON response (e.g. the R2 content store is unreachable). Gateway errors
// (502/504) come back as HTML, which fails to parse the same way. That parse
// error then masks the real failure and leaves the admin stuck with no
// actionable message. These helpers read the body as text, parse leniently,
// and always produce a human-readable message that includes the HTTP status.

export async function readJsonSafe(response) {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const STATUS_HINTS = {
  400: "Dữ liệu gửi lên không hợp lệ (400).",
  401: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ — tải lại trang và đăng nhập lại.",
  403: "Không có quyền thực hiện thao tác này (403).",
  404: "Không tìm thấy dữ liệu (404).",
  413: "Dữ liệu gửi lên quá lớn (413).",
  429: "Thao tác quá nhanh, thử lại sau ít phút (429).",
  500: "Server gặp lỗi nội bộ (500) và không trả về chi tiết.",
  502: "Server không phản hồi (502 Bad Gateway).",
  503: "Server tạm thời không sẵn sàng (503).",
  504: "Server phản hồi quá chậm (504 Gateway Timeout).",
};

export function describeHttpError(response, payload, fallback = "Yêu cầu thất bại") {
  const serverMessage =
    typeof payload?.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : "";
  const status = response?.status;
  // Our admin routes answer a bare {error:"Unauthorized"} when the session
  // cookie is missing/expired — translate that into the actionable hint.
  // (The login route says "Invalid credentials." instead, which passes
  // through untouched.)
  if (status === 401 && /^unauthorized\.?$/i.test(serverMessage)) {
    return `${fallback}: ${STATUS_HINTS[401]}`;
  }
  if (serverMessage) return serverMessage;
  const hint = STATUS_HINTS[status];
  if (hint) return `${fallback}: ${hint}`;
  return `${fallback} (HTTP ${status || "?"} — server không trả về JSON).`;
}

export class ApiError extends Error {
  constructor(message, { status = null, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    // Optional actionable hint the server may attach (see lib/apiErrors.js).
    this.hint = typeof payload?.hint === "string" ? payload.hint : "";
    this.code = typeof payload?.code === "string" ? payload.code : "";
  }
}

// fetch + lenient JSON parse. Resolves with the parsed payload when the
// response is 2xx; rejects with an ApiError otherwise. Network failures are
// wrapped too, so callers can always rely on `error.message` being readable.
export async function fetchJson(
  input,
  init = {},
  { fallbackError = "Yêu cầu thất bại" } = {}
) {
  let response;
  try {
    response = await fetch(input, init);
  } catch (networkError) {
    throw new ApiError(
      `${fallbackError}: không kết nối được tới server (${
        networkError?.message || "network error"
      }).`,
      { status: 0 }
    );
  }

  const payload = await readJsonSafe(response);

  if (!response.ok) {
    throw new ApiError(describeHttpError(response, payload, fallbackError), {
      status: response.status,
      payload,
    });
  }

  if (payload === null) {
    // 204 No Content is legitimately empty; anything else that is 2xx with
    // no JSON body is a protocol error — surface it instead of letting the
    // caller read `undefined.data`.
    if (response.status === 204) return {};
    throw new ApiError(
      `${fallbackError}: server trả về phản hồi rỗng (HTTP ${response.status}).`,
      { status: response.status }
    );
  }

  return payload;
}

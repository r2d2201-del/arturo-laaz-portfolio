// Never expose provider messages: they can contain submitted text or credentials.
const codes = new Set(['invalid_json_schema', 'invalid_request_error', 'unsupported_parameter', 'unsupported_value', 'model_not_found', 'rate_limit_exceeded', 'insufficient_quota', 'invalid_api_key', 'context_length_exceeded']);
const params = new Set(['response_format', 'temperature', 'model', 'max_tokens', 'max_completion_tokens', 'store', 'messages']);

export async function aiServiceError(response) {
  const body = await response.json().catch(() => null);
  const detail = body?.error;
  const providerCode = codes.has(detail?.code) ? detail.code : codes.has(detail?.type) ? detail.type : 'unknown';
  const providerParam = params.has(detail?.param) ? detail.param : null;
  let code = 'ai_unavailable', status = 503;
  let message = 'El servicio de IA no está disponible temporalmente. Tus textos se conservan; vuelve a intentarlo en un momento.';
  if (response.status === 429 && providerCode !== 'insufficient_quota') {
    code = 'ai_rate_limited'; status = 429;
    message = 'El servicio de IA está limitando las solicitudes. Tus textos se conservan; espera un minuto antes de reintentar.';
  } else if (response.status === 402 || providerCode === 'insufficient_quota') {
    code = 'ai_quota_exhausted';
    message = 'El servicio de IA indica que no hay cuota disponible. Revisa el consumo de IA en Netlify. Tus textos se conservan.';
  } else if ([401, 403].includes(response.status)) {
    code = 'ai_access_denied';
    message = 'El servicio de IA rechazó el acceso del estudio. Hay que revisar su conexión; tus textos se conservan.';
  } else if ([400, 404, 422].includes(response.status)) {
    code = 'ai_request_rejected'; status = 502;
    message = 'El servicio de IA rechazó el formato de la solicitud. Hay que corregir la integración; tus textos se conservan.';
  }
  const diagnostic = { status: response.status, code: providerCode, param: providerParam };
  return Object.assign(new Error(message), { status, code, diagnostic });
}

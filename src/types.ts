// Mirror of the Cotool `POST /api/agent-sync/validate` request/response contract.
//
// The response is a public, additive-only contract: we parse it loosely (tolerate
// unknown extra fields and missing optional fields) so that future additive API
// changes never break an older release of this Action. See `normalizeResponse`.

export interface ValidateFile {
    path: string;
    content: string;
}

export interface ValidateRequest {
    files: ValidateFile[];
}

export type DiagnosticCode = 'yaml_error' | 'schema_error' | 'fetch_error' | string;

export interface Diagnostic {
    code: DiagnosticCode;
    message: string;
    /** 1-based line of the issue, when known (yaml_error only). Populated once the API ships it. */
    line?: number;
    /** 1-based column of the issue, when known (yaml_error only). */
    column?: number;
}

export interface FileResult {
    path: string;
    valid: boolean;
    errors: Diagnostic[];
    warnings: Diagnostic[];
}

export interface ValidateResponse {
    valid: boolean;
    fileCount: number;
    agentCount: number;
    results: FileResult[];
}

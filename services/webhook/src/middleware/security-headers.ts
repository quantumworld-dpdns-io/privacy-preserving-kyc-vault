import { Request, Response, NextFunction } from 'express';

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: string | false;
  hstsMaxAge?: number;
  hstsIncludeSubdomains?: boolean;
  hstsPreload?: boolean;
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM' | false;
  xContentTypeOptions?: false | 'nosniff';
  xPermittedCrossDomainPolicies?: false | 'none' | 'master-only' | 'by-content-type' | 'all';
  referrerPolicy?: false | ReferrerPolicy;
  xXSSProtection?: false | '0' | '1' | '1; mode=block';
  crossOriginOpenerPolicy?: false | 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none';
  crossOriginEmbedderPolicy?: false | 'require-corp' | 'credentialless' | 'unsafe-none';
  crossOriginResourcePolicy?: false | 'same-origin' | 'same-site' | 'cross-origin';
  permissionsPolicy?: string | false;
  strictTransportSecurity?: false;
  dnsPrefetchControl?: false | 'on' | 'off';
}

type ReferrerPolicy =
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
].join('; ');

export function createSecurityHeadersMiddleware(config: SecurityHeadersConfig = {}) {
  const csp = config.contentSecurityPolicy === false ? null : config.contentSecurityPolicy ?? DEFAULT_CSP;
  const hstsMaxAge = config.strictTransportSecurity === false ? 0 : config.hstsMaxAge ?? 31536000;
  const hstsIncludeSubdomains = config.hstsIncludeSubdomains ?? true;
  const hstsPreload = config.hstsPreload ?? false;
  const xFrameOptions = config.xFrameOptions === false ? null : config.xFrameOptions ?? 'DENY';
  const xContentTypeOptions = config.xContentTypeOptions === false ? null : config.xContentTypeOptions ?? 'nosniff';
  const xPermittedCrossDomainPolicies = config.xPermittedCrossDomainPolicies === false ? null : config.xPermittedCrossDomainPolicies ?? 'none';
  const referrerPolicy = config.referrerPolicy === false ? null : config.referrerPolicy ?? 'strict-origin-when-cross-origin';
  const xXSSProtection = config.xXSSProtection === false ? null : config.xXSSProtection ?? '0';
  const coop = config.crossOriginOpenerPolicy === false ? null : config.crossOriginOpenerPolicy ?? 'same-origin';
  const coep = config.crossOriginEmbedderPolicy === false ? null : config.crossOriginEmbedderPolicy ?? 'require-corp';
  const corp = config.crossOriginResourcePolicy === false ? null : config.crossOriginResourcePolicy ?? 'same-origin';
  const permissionsPolicy = config.permissionsPolicy === false ? null : config.permissionsPolicy ?? defaultPermissionsPolicy();
  const dnsPrefetchControl = config.dnsPrefetchControl === false ? null : config.dnsPrefetchControl ?? 'off';

  return (req: Request, res: Response, next: NextFunction): void => {
    if (csp) res.setHeader('Content-Security-Policy', csp);
    if (hstsMaxAge > 0) {
      let hsts = `max-age=${hstsMaxAge}`;
      if (hstsIncludeSubdomains) hsts += '; includeSubDomains';
      if (hstsPreload) hsts += '; preload';
      res.setHeader('Strict-Transport-Security', hsts);
    }
    if (xFrameOptions) res.setHeader('X-Frame-Options', xFrameOptions);
    if (xContentTypeOptions) res.setHeader('X-Content-Type-Options', xContentTypeOptions);
    if (xPermittedCrossDomainPolicies) res.setHeader('X-Permitted-Cross-Domain-Policies', xPermittedCrossDomainPolicies);
    if (referrerPolicy) res.setHeader('Referrer-Policy', referrerPolicy);
    if (xXSSProtection) res.setHeader('X-XSS-Protection', xXSSProtection);
    if (coop) res.setHeader('Cross-Origin-Opener-Policy', coop);
    if (coep) res.setHeader('Cross-Origin-Embedder-Policy', coep);
    if (corp) res.setHeader('Cross-Origin-Resource-Policy', corp);
    if (permissionsPolicy) res.setHeader('Permissions-Policy', permissionsPolicy);
    if (dnsPrefetchControl) res.setHeader('X-DNS-Prefetch-Control', dnsPrefetchControl);

    res.setHeader('X-Content-Type-Options', xContentTypeOptions ?? 'nosniff');

    next();
  };
}

function defaultPermissionsPolicy(): string {
  return [
    'accelerometer=()',
    'camera=()',
    'display-capture=()',
    'document-domain=()',
    'encrypted-media=()',
    'fullscreen=()',
    'geolocation=()',
    'gyroscope=()',
    'magnetometer=()',
    'microphone=()',
    'midi=()',
    'payment=()',
    'picture-in-picture=()',
    'publickey-credentials-get=(self)',
    'screen-wake-lock=()',
    'sync-xhr=()',
    'usb=()',
    'web-share=()',
    'xr-spatial-tracking=()',
  ].join(', ');
}

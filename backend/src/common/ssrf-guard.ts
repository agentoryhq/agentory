/**
 * @file ssrf-guard.ts
 *
 * Anti-SSRF guard for user-controlled outbound HTTP calls
 * (custom `http` tool, `http`/`sse` MCP servers).
 *
 * Blocks internal/reserved destinations — in particular the EC2 metadata
 * endpoint (169.254.169.254), from which IAM credentials can be stolen — and
 * private/loopback/link-local addresses, from which internal services (DB,
 * Redis, the backend itself) can be reached bypassing authentication.
 *
 * Strategy: parse the URL, check the protocol (http/https only),
 * RESOLVE the hostname and check that NONE of the resolved IPs fall into
 * a reserved range (so a public hostname pointing to an internal IP is
 * blocked anyway).
 *
 * Known residual: DNS rebinding (the host resolves to a public IP at the check
 * and to a private one on the subsequent fetch). To fully close it, pinning
 * the resolved IP + fetch by-IP with a Host header would be needed — a future
 * evolution.
 */
import { ForbiddenException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** True if the IP (v4 or v6) belongs to a private/reserved range not publicly routable. */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0)   return true;                              // 0.0.0.0/8
    if (p[0] === 10)  return true;                              // 10.0.0.0/8
    if (p[0] === 127) return true;                              // loopback 127.0.0.0/8
    if (p[0] === 169 && p[1] === 254) return true;              // link-local 169.254.0.0/16 (metadata EC2)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;  // 172.16.0.0/12
    if (p[0] === 192 && p[1] === 168) return true;              // 192.168.0.0/16
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT 100.64.0.0/10
    return false;
  }
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v === '::1' || v === '::') return true;                   // loopback / unspecified
  if (v.startsWith('fe80')) return true;                        // link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return true;    // unique-local fc00::/7
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);       // IPv4-mapped
  if (mapped) return isPrivateIp(mapped[1]);
  return false;
}

/**
 * Throws ForbiddenException if the URL is not http/https or if the hostname resolves
 * (even only in part) to an internal/reserved address.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ForbiddenException(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ForbiddenException(`Protocol not allowed (only http/https): ${url.protocol}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  // Literal IP → direct check
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new ForbiddenException(`Internal destination not allowed: ${host}`);
    }
    return;
  }

  // Hostname → resolve and check ALL the IPs
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new ForbiddenException(`Host non risolvibile: ${host}`);
  }
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new ForbiddenException(`Host resolves to a disallowed internal address: ${host} → ${a.address}`);
    }
  }
}

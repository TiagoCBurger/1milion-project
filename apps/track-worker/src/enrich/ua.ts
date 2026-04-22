import { UAParser } from "ua-parser-js";

export interface UaData {
  browser?: string;
  browser_version?: string;
  os?: string;
  os_version?: string;
  device_type?: string;
}

export function parseUa(userAgent: string | null | undefined): UaData {
  if (!userAgent) return {};
  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();
  return {
    browser: browser.name,
    browser_version: browser.version,
    os: os.name,
    os_version: os.version,
    device_type: device.type ?? "desktop",
  };
}
